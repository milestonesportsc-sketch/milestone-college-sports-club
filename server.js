#!/usr/bin/env node
'use strict';
/*
 * Milestone Sports Club: backend server (zero npm dependencies, Node 22.5+).
 *
 *  - Serves the website (allow-listed files only) with ETag, gzip/brotli, range requests, cache headers
 *  - JSON API under /api: login, roles, members/payments/messages inbox, state sync, uploads, status, metrics
 *  - SQLite database (node:sqlite) in DATA_DIR, image storage in DATA_DIR/uploads
 *  - Security headers, rate limiting, scrypt password hashing, signed expiring tokens
 *  - JSON logs (stdout + DATA_DIR/logs), error tracking table, audit log, health + Prometheus metrics
 */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const zlib = require('zlib'), os = require('os'), { promisify } = require('util');
const { DatabaseSync } = require('node:sqlite');
const { sendMail } = require('./mailer');
const { normalizePhone, cleanText, maskEmail, sendSms } = require('./sms');
const tg = require('./telegram');
const scrypt = promisify(crypto.scrypt), brotli = promisify(zlib.brotliCompress), gzip = promisify(zlib.gzip);
const { createTreasury } = require('./treasury.js');
const APP_VERSION = (() => { try { return require('./package.json').version; } catch (e) { return '0.0.0'; } })();

/* ------------------------------------------------------------------ config */
function loadEnvFile(file) {
  try {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((l) => {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* no .env file: fine */ }
}
function buildConfig(o) {
  o = o || {}; const env = process.env;
  const hops = o.trustProxy !== undefined ? Number(o.trustProxy) : (env.TRUST_PROXY ? Number(env.TRUST_PROXY) || 0 : 0);
  return {
    root: o.root || __dirname,
    dataDir: o.dataDir || env.DATA_DIR || path.join(__dirname, 'data'),
    port: o.port !== undefined ? o.port : (Number(env.PORT) || 8080),
    host: o.host || env.HOST || '0.0.0.0',
    secret: o.secret || env.SECRET || null,
    trustProxy: hops,
    adminEmail: String(o.adminEmail || env.ADMIN_EMAIL || 'dba@milestone.local').trim().toLowerCase(),
    adminPassword: o.adminPassword || env.ADMIN_PASSWORD || null,
    metricsToken: o.metricsToken || env.METRICS_TOKEN || null,
    silent: !!o.silent, noAutoBackup: !!o.silent || env.AUTO_BACKUP === '0',
    forceHttps: o.forceHttps !== undefined ? !!o.forceHttps : env.FORCE_HTTPS !== '0',
    tokenHours: Number(env.TOKEN_HOURS) || 8,
    defaultFee: Number(env.DEFAULT_FEE) || 350,
    treasuryGateway: o.treasuryGateway || null,
    publicUrl: String(o.publicUrl || env.PUBLIC_URL || '').replace(/\/+$/, ''),
    /* SMS alerts: ALERT_PHONE + SMS_URL in .env (see .env.example). ALERT_ON_LOGIN = all | dba | off. */
    sms: (() => { const x = o.sms || {}, raw = x.phone || env.ALERT_PHONE || '01340340744'; if (!raw) return null; const phone = normalizePhone(raw); if (!phone) return null;
      return { phone, url: String(x.url || env.SMS_URL || ''), onLogin: String(x.onLogin || env.ALERT_ON_LOGIN || 'all').toLowerCase(), max: Number(x.max) || Number(env.SMS_MAX_PER_10MIN) || 8 }; })(),
    smtp: (o.smtp || env.SMTP_HOST) ? Object.assign({ host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM }, o.smtp || {}) : null
  };
}

/* ----------------------------------------------------------------- helpers */
class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; } }
const b64u = (b) => Buffer.from(b).toString('base64url');
const rid = (n) => crypto.randomBytes(n || 4).toString('hex');
const now = () => new Date().toISOString();
const bdTime = (d) => new Date(d || Date.now()).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) + ' (Bangladesh time)';
const clean = (s, max, keepNewlines) => {
  if (typeof s !== 'string') return '';
  s = s.replace(keepNewlines ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, '').replace(/[<>]/g, '').trim();
  return s.slice(0, max);
};
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex');
}
async function verifyPassword(pw, stored) {
  const p = String(stored).split('$'); if (p[0] !== 'scrypt' || p.length !== 3) return false;
  const h = await scrypt(pw, Buffer.from(p[1], 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(p[2], 'hex'); return want.length === h.length && crypto.timingSafeEqual(want, h);
}
const ROLES = ['dba', 'president', 'secretary', 'treasurer', 'coordinator', 'editor'];
const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,120}\.[a-z0-9-]{2,24}$/;
const COMMON = new Set(['admin123456', 'password1234', '123456789012', 'milestone1234', 'admin123', 'password', 'password1', '12345678', '123456789', 'qwertyui', 'milestone', 'milestone123', 'admin1234']);
function weakPassword(pw, user) {
  if (typeof pw !== 'string' || pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (COMMON.has(pw.toLowerCase()) || pw.toLowerCase() === String(user || '').toLowerCase() || pw.toLowerCase() === String(user || '').split('@')[0].toLowerCase()) return 'That password is too easy to guess. Choose another.';
  return '';
}

/* ------------------------------------------------------------ rate limiter */
/* Rate limiter kept in the SQLite database, not in memory, so every worker process (WEB_CONCURRENCY > 1) and every
   server started on the same data folder shares ONE counter. Each hit is a single atomic upsert. */
function makeLimiter(db) {
  const hitQ = db.prepare(`INSERT INTO ratelimits(k,n,reset) VALUES(?,1,?)
    ON CONFLICT(k) DO UPDATE SET n = CASE WHEN reset <= ? THEN 1 ELSE n + 1 END, reset = CASE WHEN reset <= ? THEN ? ELSE reset END
    RETURNING n, reset`);
  const peekQ = db.prepare('SELECT n, reset FROM ratelimits WHERE k=?'), delQ = db.prepare('DELETE FROM ratelimits WHERE k=?'), gcQ = db.prepare('DELETE FROM ratelimits WHERE reset <= ?');
  const t = setInterval(() => { try { gcQ.run(Date.now()); } catch (e) { /* db closed */ } }, 60000); t.unref();
  return {
    hit(key, max, windowMs) {
      const n = Date.now(), e = hitQ.get(key, n + windowMs, n, n, n + windowMs);
      return { ok: e.n <= max, retry: Math.max(1, Math.ceil((e.reset - n) / 1000)) };
    },
    peek(key, max) { const e = peekQ.get(key), n = Date.now(); if (!e || e.reset <= n) return { ok: true, retry: 0 }; return { ok: e.n < max, retry: Math.ceil((e.reset - n) / 1000) }; },
    clear(key) { delQ.run(key); }
  };
}

/* ------------------------------------------------------------------ logger */
function makeLogger(cfg) {
  const dir = path.join(cfg.dataDir, 'logs'); fs.mkdirSync(dir, { recursive: true });
  const files = {};
  function open(name) {
    const f = path.join(dir, name + '.log'); let size = 0; try { size = fs.statSync(f).size; } catch (e) { /* new */ }
    files[name] = { f, size, fd: fs.openSync(f, 'a') };
  }
  function write(name, obj) {
    const line = JSON.stringify(obj) + '\n';
    if (!cfg.silent) (name === 'error' ? process.stderr : process.stdout).write(line);
    if (cfg.silent && name !== 'error') return;
    try {
      if (!files[name]) open(name);
      const F = files[name];
      if (F.size > 5 * 1024 * 1024) { fs.closeSync(F.fd); try { fs.renameSync(F.f, F.f + '.1'); } catch (e) { /* ignore */ } open(name); }
      const b = Buffer.from(line); fs.writeSync(files[name].fd, b); files[name].size += b.length;
    } catch (e) { /* logging must never crash the app */ }
  }
  return {
    info: (o) => write('app', Object.assign({ t: now(), level: 'info' }, o)),
    error: (o) => write('error', Object.assign({ t: now(), level: 'error' }, o)),
    close() { Object.values(files).forEach((F) => { try { fs.closeSync(F.fd); } catch (e) { /* ignore */ } }); }
  };
}

/* ---------------------------------------------------------------- database */
/* Older versions had users(username, role in admin/editor). Rebuild the table once: username -> email, admin -> dba. */
function migrateUsers(db) {
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  if (!cols.length || cols.includes('email')) return;
  db.exec('BEGIN');
  try {
    db.exec(`CREATE TABLE users_new(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '', pass TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('dba','president','secretary','treasurer','coordinator','editor')), active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0,
      token_ver INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, last_login TEXT);
      INSERT INTO users_new(id,email,name,pass,role,token_ver,created)
        SELECT id, CASE WHEN instr(username,'@')>0 THEN lower(username) ELSE lower(username)||'@milestone.local' END, username, pass,
               CASE role WHEN 'admin' THEN 'dba' ELSE 'editor' END, token_ver+1, created FROM users;
      DROP TABLE users; ALTER TABLE users_new RENAME TO users;`);
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; }
}
/* Databases created before the General Secretary, Treasurer and Event & Sports Coordinator roles existed have a CHECK that only allows three roles. Rebuild once. */
function migrateRoles(db) {
  const r = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!r || r.sql.indexOf("'coordinator'") >= 0) return;
  db.exec('BEGIN');
  try {
    db.exec(`CREATE TABLE users_new(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '', pass TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('dba','president','secretary','treasurer','coordinator','editor')), active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0,
      token_ver INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, last_login TEXT);
      INSERT INTO users_new(id,email,name,pass,role,active,must_change,token_ver,created,last_login) SELECT id,email,name,pass,role,active,must_change,token_ver,created,last_login FROM users;
      DROP TABLE users; ALTER TABLE users_new RENAME TO users;`);
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; }
}
/* Databases made by older versions may miss columns that the current code reads. Add them (never delete anything), so the server starts
   and sign-in works on an old database. ratelimits holds only temporary counters, so a wrong-shaped one is simply recreated. */
function ensureColumns(db) {
  /* every statement is a fixed literal: no SQL is ever built from text */
  const ADD = [
    ['users', 'name', "ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''"],
    ['users', 'active', 'ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1'],
    ['users', 'must_change', 'ALTER TABLE users ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0'],
    ['users', 'token_ver', 'ALTER TABLE users ADD COLUMN token_ver INTEGER NOT NULL DEFAULT 0'],
    ['users', 'last_login', 'ALTER TABLE users ADD COLUMN last_login TEXT'],
    ['users', 'department', "ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''"],
    ['kv', 'version', 'ALTER TABLE kv ADD COLUMN version INTEGER NOT NULL DEFAULT 1'],
    ['kv', 'updated', 'ALTER TABLE kv ADD COLUMN updated TEXT'],
    ['inbox', 'kind', "ALTER TABLE inbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'contact'"],
    ['inbox', 'body', "ALTER TABLE inbox ADD COLUMN body TEXT NOT NULL DEFAULT '{}'"],
    ['inbox', 'created', "ALTER TABLE inbox ADD COLUMN created TEXT NOT NULL DEFAULT ''"],
    ['audit', 'at', "ALTER TABLE audit ADD COLUMN at TEXT NOT NULL DEFAULT ''"],
    ['audit', 'actor', 'ALTER TABLE audit ADD COLUMN actor TEXT'],
    ['audit', 'action', "ALTER TABLE audit ADD COLUMN action TEXT NOT NULL DEFAULT ''"],
    ['audit', 'detail', 'ALTER TABLE audit ADD COLUMN detail TEXT'],
    ['audit', 'ip', 'ALTER TABLE audit ADD COLUMN ip TEXT'],
    ['errors', 'at', "ALTER TABLE errors ADD COLUMN at TEXT NOT NULL DEFAULT ''"],
    ['errors', 'source', "ALTER TABLE errors ADD COLUMN source TEXT NOT NULL DEFAULT ''"],
    ['errors', 'message', 'ALTER TABLE errors ADD COLUMN message TEXT'],
    ['errors', 'stack', 'ALTER TABLE errors ADD COLUMN stack TEXT'],
    ['errors', 'url', 'ALTER TABLE errors ADD COLUMN url TEXT'],
    ['errors', 'ua', 'ALTER TABLE errors ADD COLUMN ua TEXT'],
    ['errors', 'count', 'ALTER TABLE errors ADD COLUMN count INTEGER NOT NULL DEFAULT 1'],
    ['alerts', 'at', "ALTER TABLE alerts ADD COLUMN at TEXT NOT NULL DEFAULT ''"],
    ['alerts', 'kind', "ALTER TABLE alerts ADD COLUMN kind TEXT NOT NULL DEFAULT ''"],
    ['alerts', 'email', 'ALTER TABLE alerts ADD COLUMN email TEXT'],
    ['alerts', 'ip', 'ALTER TABLE alerts ADD COLUMN ip TEXT'],
    ['alerts', 'detail', 'ALTER TABLE alerts ADD COLUMN detail TEXT'],
    ['alerts', 'photo', 'ALTER TABLE alerts ADD COLUMN photo INTEGER NOT NULL DEFAULT 0'],
    ['alerts', 'acked_by', 'ALTER TABLE alerts ADD COLUMN acked_by TEXT'],
    ['alerts', 'acked_at', 'ALTER TABLE alerts ADD COLUMN acked_at TEXT'],
    ['blocked_ips', 'at', "ALTER TABLE blocked_ips ADD COLUMN at TEXT NOT NULL DEFAULT ''"],
    ['blocked_ips', 'by', 'ALTER TABLE blocked_ips ADD COLUMN by TEXT'],
    ['blocked_ips', 'reason', 'ALTER TABLE blocked_ips ADD COLUMN reason TEXT'],
    ['resets', 'user_id', 'ALTER TABLE resets ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0'],
    ['resets', 'hash', "ALTER TABLE resets ADD COLUMN hash TEXT NOT NULL DEFAULT ''"],
    ['resets', 'expires', 'ALTER TABLE resets ADD COLUMN expires INTEGER NOT NULL DEFAULT 0'],
    ['resets', 'used', 'ALTER TABLE resets ADD COLUMN used INTEGER NOT NULL DEFAULT 0']
  ];
  const info = db.prepare('SELECT name FROM pragma_table_info(?)');
  const have = (t) => info.all(t).map((c) => c.name);
  const rl = have('ratelimits');
  if (rl.length && !(rl.includes('k') && rl.includes('n') && rl.includes('reset'))) db.exec('DROP TABLE ratelimits; CREATE TABLE ratelimits(k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL);');
  const cache = {};
  ADD.forEach((x) => { const cols = cache[x[0]] || (cache[x[0]] = have(x[0])); if (cols.length && !cols.includes(x[1])) db.exec(x[2]); });
}
function openDb(cfg) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(cfg.dataDir, 'mcsc.db'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;');
  migrateUsers(db);
  migrateRoles(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '', pass TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('dba','president','secretary','treasurer','coordinator','editor')), active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0,
      token_ver INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, last_login TEXT);
    CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated TEXT);
    CREATE TABLE IF NOT EXISTS inbox(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT, action TEXT NOT NULL, detail TEXT, ip TEXT);
    CREATE TABLE IF NOT EXISTS errors(id INTEGER PRIMARY KEY, at TEXT NOT NULL, source TEXT NOT NULL, message TEXT, stack TEXT, url TEXT, ua TEXT, count INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, email TEXT, ip TEXT, detail TEXT, photo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS blocked_devices(did TEXT PRIMARY KEY, at TEXT NOT NULL, by TEXT, reason TEXT, label TEXT, ip TEXT);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, did TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL, dev TEXT NOT NULL, label TEXT, ip TEXT, created TEXT NOT NULL, last_seen TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, new_dev INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS blocked_ips(ip TEXT PRIMARY KEY, at TEXT NOT NULL, by TEXT, reason TEXT);
    CREATE TABLE IF NOT EXISTS trusted_devices(user_id INTEGER NOT NULL, did TEXT NOT NULL, at TEXT NOT NULL, by TEXT, PRIMARY KEY(user_id,did));
    CREATE TABLE IF NOT EXISTS pending_devices(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, email TEXT, did TEXT NOT NULL, label TEXT, ip TEXT, at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', UNIQUE(user_id,did));
    CREATE TABLE IF NOT EXISTS ratelimits(k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS resets(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, hash TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
  `);
  try { db.exec("ALTER TABLE sessions ADD COLUMN did TEXT NOT NULL DEFAULT ''"); } catch (e) { /* already there */ }
  try { db.exec("ALTER TABLE alerts ADD COLUMN did TEXT NOT NULL DEFAULT ''"); } catch (e) { /* already there */ }
  ensureColumns(db);
  if (!db.prepare('PRAGMA table_info(alerts)').all().some((c) => c.name === 'photo')) db.exec('ALTER TABLE alerts ADD COLUMN photo INTEGER NOT NULL DEFAULT 0');
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'department')) db.exec("ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT ''");
  return db;
}

/* --------------------------------------------------------------- constants */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json' };
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.txt', '.svg', '.webmanifest']);
const ROOT_FILES = new Set(['index.html', 'admin.html', 'dashboard.html', 'president.html', 'secretary.html', 'treasurer.html', 'treasury.html', 'treasury-ui.js', 'treasury-public.js', 'site-editor.html', 'status.html', 'security.html', 'dba.html', 'style.css', 'script.js', 'arena.js', 'api-client.js', 'sabiha-config.js', 'robots.txt', 'favicon.ico', 'manifest.webmanifest']);
const ASSET_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.ico', '.mp4', '.webm', '.mp3', '.m4a', '.ogg', '.wav', '.woff2', '.js', '.css']);
const VOICE_EXTS = new Set(['.mp3', '.m4a', '.ogg', '.wav']);
const COLLECTIONS = ['members', 'events', 'payments', 'budget', 'gallery', 'messages', 'team', 'notes'];
/* Who may WRITE what. Everyone signed in may read the public settings; lists a role does not own are never sent to it.
   dba manages accounts, backups and the server, not the club's day-to-day content. */
const WEB = ['clubName', 'theme', 'banner', 'phone', 'email', 'address', 'themeChosen'], PAY = ['fee', 'bkash', 'nagad', 'rocket'];
const PERM = {
  /* President: the whole club and the whole website. */
  president: { lists: ['members', 'events', 'payments', 'budget', 'messages', 'team', 'gallery', 'notes'], settings: PAY.concat(WEB, ['teamSeeded', 'teachersSeeded']) },
  /* General Secretary: members, leadership team, messages, and the website text, photo gallery and announcements. */
  secretary: { lists: ['members', 'messages', 'team', 'gallery', 'notes'], settings: WEB },
  /* Treasurer: payments, tour budget, fee and payment numbers (shown on the website), and announcements about money. */
  treasurer: { lists: ['payments', 'budget', 'notes'], settings: PAY },
  coordinator: { lists: ['events'], settings: [] },
  editor: { lists: ['gallery', 'notes'], settings: WEB },
  /* the Database Administrator is the owner login: accounts and backups, plus every club dashboard and the whole website */
  dba: { lists: ['members', 'events', 'payments', 'budget', 'messages', 'team', 'gallery', 'notes'], settings: PAY.concat(WEB, ['teamSeeded', 'teachersSeeded']) }
};
/* Public API: only these fields of team/gallery items ever leave the server (anything else an admin types stays private). */
const PUB_TEAM = ['id', 'group', 'name', 'role', 'photo', 'phone', 'order'], PUB_GALLERY = ['id', 'title', 'caption', 'src', 'date', 'cat'];
const pick = (o, keys) => { const r = {}; if (o && typeof o === 'object') keys.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; }); return r; };
const THEMES = ['white', 'classic', 'rose', 'green'];
const ROLE_NAME = { dba: 'Database Administrator', president: 'Club President', secretary: 'General Secretary', treasurer: 'Treasurer', coordinator: 'Event & Sports Coordinator', editor: 'Editor' };
/* Only these two exact files may load from the CDN (used when vendor/three.min.js is not present), not the whole jsDelivr network. */
const THREE_CDN = ['https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'];
const CSP_REST = "style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; " +
  "font-src 'self' data:; connect-src 'self' data: blob:; object-src 'none'; script-src-attr 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/* ---------------------------------------------------------------- the app */
function createApp(options) {
  const cfg = buildConfig(options);
  const log = makeLogger(cfg), db = openDb(cfg), rl = makeLimiter(db);
  const uploadsDir = path.join(cfg.dataDir, 'uploads'); fs.mkdirSync(uploadsDir, { recursive: true });
  const intruderDir = path.join(cfg.dataDir, 'intruders'); fs.mkdirSync(intruderDir, { recursive: true });
  const started = Date.now();
  const M = { req: {}, durSum: 0, durN: 0, errors: 0, rateLimited: 0, loginOk: 0, loginFail: 0, contacts: 0, clientErrors: 0 };

  /* secret for signing tokens */
  let secret = cfg.secret;
  if (!secret) {
    const r = db.prepare("SELECT v FROM meta WHERE k='secret'").get();
    if (r) secret = r.v; else { secret = crypto.randomBytes(32).toString('hex'); db.prepare("INSERT OR IGNORE INTO meta(k,v) VALUES('secret',?)").run(secret); secret = db.prepare("SELECT v FROM meta WHERE k='secret'").get().v; }
  }

  const Q = {
    user: db.prepare('SELECT * FROM users WHERE email=?'),
    userId: db.prepare('SELECT * FROM users WHERE id=?'),
    getKV: db.prepare('SELECT v,version FROM kv WHERE k=?'),
    setKV: db.prepare('INSERT INTO kv(k,v,version,updated) VALUES(?,?,1,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,version=version+1,updated=excluded.updated'),
    verKV: db.prepare('SELECT version FROM kv WHERE k=?'),
    inboxAll: db.prepare('SELECT id,kind,body FROM inbox ORDER BY id'),
    inboxAdd: db.prepare('INSERT INTO inbox(kind,body,created) VALUES(?,?,?)'),
    inboxDel: db.prepare('DELETE FROM inbox WHERE id=?'),
    blocked: db.prepare('SELECT ip FROM blocked_ips WHERE ip=?'),
    audit: db.prepare('INSERT INTO audit(at,actor,action,detail,ip) VALUES(?,?,?,?,?)')
  };
  const audit = (actor, action, detail, ip) => { try { Q.audit.run(now(), actor || null, action, detail ? String(detail).slice(0, 300) : null, ip || null); } catch (e) { /* ignore */ } };

  /* Security alarm: every wrong password is recorded and shown to everyone who is signed in (alarm), and emailed to every active account (at most one email per person per minute). */
  const lastMail = new Map(), lastPhotoMail = new Map();
  const photoFile = (id) => path.join(intruderDir, Number(id) + '.jpg');
  /* Email settings can be typed once in Central Security Management (stored encrypted); .env SMTP_* still works as a fallback. */
  const mailState = { lastError: '', lastOk: '' };
  const encKey = () => crypto.createHash('sha256').update('smtp-key:' + secret).digest();
  function encryptText(t) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', encKey(), iv), ct = Buffer.concat([c.update(t, 'utf8'), c.final()]); return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.'); }
  function decryptText(t) { const x = String(t).split('.').map((v) => Buffer.from(v, 'base64url')), d = crypto.createDecipheriv('aes-256-gcm', encKey(), x[0]); d.setAuthTag(x[1]); return Buffer.concat([d.update(x[2]), d.final()]).toString('utf8'); }
  function smtpStored() { const r = db.prepare("SELECT v FROM meta WHERE k='smtp'").get(); if (!r) return null; try { const x = JSON.parse(decryptText(r.v)); return x && x.host ? x : null; } catch (e) { return null; } }
  function getSmtp() { const x = smtpStored(); return x ? { host: x.host, port: x.port, user: x.user, pass: x.pass, from: x.from || x.user } : cfg.smtp; }
  function recipients() { const set = new Set(db.prepare('SELECT email FROM users WHERE active=1').all().map((r) => r.email)); const x = smtpStored(); ((x && x.alertTo) || []).forEach((e) => set.add(e)); return Array.from(set); }
  const didOf = (req) => { const v = String(req.headers['x-device-id'] || ''); return /^[A-Za-z0-9_-]{16,48}$/.test(v) ? v : ''; };
  function mailAll(map, gap, subject, text, attachments) {
    const sm = getSmtp(); if (!sm) return;
    recipients().forEach((to) => {
      const last = map.get(to) || 0; if (Date.now() - last < gap) return; map.set(to, Date.now());
      sendMail(sm, to, subject, text, attachments).then(() => { mailState.lastOk = now(); mailState.lastError = ''; }).catch((e) => { mailState.lastError = String(e.message || e).slice(0, 160); log.error({ msg: 'alert email failed', err: e.message }); });
    });
  }
  /* SMS to the alert phone. At most `max` messages per 10 minutes (a flood of wrong passwords must not run up the SMS bill) and one per kind every 20 s. */
  const smsState = { lastOk: '', lastError: '', sent: 0, held: 0 }, smsTimes = [], smsKind = new Map();
  /* ---- who gets the alarm: up to 3 security numbers (SMS) and, optionally, a Telegram chat per number (the only way to send the photo) ---- */
  const MAX_SLOTS = 3, local = (p) => (p ? '0' + String(p).slice(3) : '');
  function phoneSlots() {
    let sl = null; const r = db.prepare("SELECT v FROM meta WHERE k='alert_phones'").get();
    if (r) { try { sl = JSON.parse(r.v); } catch (e) { sl = null; } }
    if (!Array.isArray(sl)) sl = [{ label: 'Security number 1', phone: cfg.sms ? cfg.sms.phone : '', telegram: '' }];
    while (sl.length < MAX_SLOTS) sl.push({ label: 'Security number ' + (sl.length + 1), phone: '', telegram: '' });
    return sl.slice(0, MAX_SLOTS).map((x, i) => ({ label: String(x.label || 'Security number ' + (i + 1)), phone: normalizePhone(x.phone) || '', telegram: tg.CHAT_RE.test(String(x.telegram || '')) ? String(x.telegram) : '' }));
  }
  const alertNumbers = () => Array.from(new Set(phoneSlots().map((x) => x.phone).filter(Boolean)));
  const tgState = { lastOk: '', lastError: '' };
  function tgToken() { const r = db.prepare("SELECT v FROM meta WHERE k='telegram'").get(); if (r) { try { const x = JSON.parse(decryptText(r.v)); if (x && x.token) return x.token; } catch (e) { /* ignore */ } } return tg.TOKEN_RE.test(process.env.TELEGRAM_BOT_TOKEN || '') ? process.env.TELEGRAM_BOT_TOKEN : ''; }
  const tgChats = () => Array.from(new Set(phoneSlots().map((x) => x.telegram).filter(Boolean).concat(String(process.env.TELEGRAM_CHAT_IDS || '').split(/[\s,]+/).filter((c) => tg.CHAT_RE.test(c)))));
  const tgReady = () => !!(tgToken() && tgChats().length);
  const tgOk = () => { tgState.lastOk = now(); tgState.lastError = ''; }, tgBad = (e) => { tgState.lastError = String(e.message || e).slice(0, 140); log.error({ msg: 'telegram alert failed', err: tgState.lastError }); };
  function tgText(text) { const t = tgToken(); if (t) tgChats().forEach((c) => tg.sendMessage(t, c, text).then(tgOk).catch(tgBad)); }
  function tgPhoto(buf, caption) { const t = tgToken(); if (t) tgChats().forEach((c) => tg.sendPhoto(t, c, buf, caption).then(tgOk).catch(tgBad)); }
  /* send one text to every security number (SMS) and every Telegram chat */
  function sendAll(text) {
    const s = cfg.sms;
    if (s && s.url) alertNumbers().forEach((ph) => sendSms(Object.assign({}, s, { phone: ph }), cleanText(text)).then(() => { smsState.lastOk = now(); smsState.lastError = ''; smsState.sent++; }).catch((e) => { smsState.lastError = String(e.message || e).slice(0, 120); log.error({ msg: 'alert sms failed', err: smsState.lastError }); }));
    tgText(String(text));
  }
  /* At most `max` messages per 10 minutes (a flood of wrong passwords must not run up the SMS bill) and one per kind every 20 s. */
  function smsAlert(kind, text, smsOnly) {
    const s = cfg.sms, canSms = !!(s && s.url && alertNumbers().length), canTg = !smsOnly && tgReady(); if (!canSms && !canTg) return;
    const t = Date.now(); while (smsTimes.length && t - smsTimes[0] > 600e3) smsTimes.shift();
    if (t - (smsKind.get(kind) || 0) < 20e3) return;
    if (smsTimes.length >= ((s && s.max) || 8)) { smsState.held++; return; }
    smsKind.set(kind, t); smsTimes.push(t);
    const more = smsState.held ? ' (+' + smsState.held + ' more held back)' : ''; smsState.held = 0;
    if (smsOnly) { if (canSms) alertNumbers().forEach((ph) => sendSms(Object.assign({}, s, { phone: ph }), cleanText(text + more)).then(() => { smsState.lastOk = now(); smsState.lastError = ''; smsState.sent++; }).catch((e) => { smsState.lastError = String(e.message || e).slice(0, 120); })); } else sendAll(cleanText(text + more));
  }
  /* The alarm keeps going until the Database Administrator or the Club President stops it: the security number gets a reminder text every 3 minutes
     (up to 40 reminders, they do not use the normal 10-minute limit) while any alarm is still open, and every signed-in page keeps ringing. */
  const openAlerts = () => db.prepare('SELECT id,at,kind,email,ip,detail,photo FROM alerts WHERE acked_at IS NULL AND kind IN (\'wrong_password\',\'unknown_account\',\'lockout\',\'ip_auto_blocked\',\'blocked_device\',\'device_pending\') ORDER BY id DESC LIMIT 100').all();
  let reminders = 0;
  const remind = () => {
    try {
      const o = openAlerts();
      if (!o.length) { reminders = 0; return; }
      if (reminders >= 40) return; reminders++;
      const photos = o.filter((a) => a.photo).length;
      sendAll('MSC ALARM STILL RINGING: ' + o.length + ' unacknowledged security alert(s)' + (photos ? ', ' + photos + ' with intruder photo' : '') + '. Latest: ' + o[0].kind.replace(/_/g, ' ') + ' for ' + maskEmail(o[0].email) + ' from ' + (o[0].ip || 'unknown') + '. DBA or President: open ' + (cfg.publicUrl || 'the site') + '/dba.html and press STOP ALARM.');
    } catch (e) { /* ignore */ }
  };
  setInterval(remind, 180e3).unref();
  function securityAlert(kind, email, ip, detail, dv) {
    let id = 0;
    try {
      id = Number(db.prepare('INSERT INTO alerts(at,kind,email,ip,detail,did) VALUES(?,?,?,?,?,?)').run(now(), kind, email || '?', ip || '', detail ? String(detail).slice(0, 200) : '', dv || '').lastInsertRowid);
      db.prepare('SELECT id FROM alerts WHERE id <= (SELECT MAX(id) FROM alerts) - 500 AND photo=1').all().forEach((r) => { try { fs.unlinkSync(photoFile(r.id)); } catch (e) { /* ignore */ } });
      db.exec('DELETE FROM alerts WHERE id <= (SELECT MAX(id) FROM alerts) - 500');
      mailAll(lastMail, 60e3, '[SECURITY ALERT] Someone is trying to enter the Milestone Sports Club website',
        'SECURITY ALERT\n\nSomeone tried to sign in to the account ' + (email || '?') + ' and failed' + (detail ? ' (' + detail + ')' : '') + '.\nWhen: ' + bdTime() + '\nInternet address (IP): ' + (ip || 'unknown') + '\n\nIf the person allowed the camera, their photo follows in a second email.\nIf this was you, you can ignore this message. If not, someone else may be trying to get in: tell the Database Administrator and change your password.');
      smsAlert(kind, 'MSC SECURITY ALERT: ' + String(kind).replace(/_/g, ' ') + ' for ' + maskEmail(email) + ' from ' + (ip || 'unknown') + ' at ' + bdTime() + (detail ? ' - ' + detail : ''));
    } catch (e) { /* the alarm must never break login */ }
    return id;
  }
  /* a one-time permission slip, given only to the person whose sign-in just failed, to upload one photo for that alarm */
  const photoToken = (id) => { const exp = Date.now() + 3 * 60e3, p = id + '.' + exp; return p + '.' + crypto.createHmac('sha256', secret).update('photo:' + p).digest('base64url'); };
  function readPhotoToken(t) {
    const x = String(t || '').split('.'); if (x.length !== 3 || !/^\d{1,9}$/.test(x[0]) || !/^\d{10,15}$/.test(x[1]) || Number(x[1]) < Date.now()) return 0;
    const want = crypto.createHmac('sha256', secret).update('photo:' + x[0] + '.' + x[1]).digest('base64url');
    return want.length === x[2].length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(x[2])) ? Number(x[0]) : 0;
  }

  function recordError(source, message, stack, url, ua) {
    M.errors++;
    try {
      message = String(message || '').slice(0, 500); url = String(url || '').slice(0, 200);
      const ex = db.prepare('SELECT id FROM errors WHERE source=? AND message=? AND url=? ORDER BY id DESC LIMIT 1').get(source, message, url);
      if (ex) db.prepare('UPDATE errors SET count=count+1, at=? WHERE id=?').run(now(), ex.id);
      else {
        db.prepare('INSERT INTO errors(at,source,message,stack,url,ua) VALUES(?,?,?,?,?,?)').run(now(), source, message, String(stack || '').slice(0, 3000), url, String(ua || '').slice(0, 200));
        db.exec('DELETE FROM errors WHERE id <= (SELECT MAX(id) FROM errors) - 500');
      }
    } catch (e) { /* ignore */ }
  }

  /* first run: create the Database Administrator account */
  (async () => {
    try {
      const n = db.prepare('SELECT COUNT(*) c FROM users').get().c; if (n > 0) return;
      let pw = cfg.adminPassword, generated = false;
      if (!pw || weakPassword(pw, cfg.adminEmail)) { pw = crypto.randomBytes(9).toString('base64url'); generated = true; }
      const r = db.prepare("INSERT OR IGNORE INTO users(email,name,pass,role,must_change,created) VALUES(?,?,?,'dba',?,?)").run(cfg.adminEmail, ROLE_NAME.dba, await hashPassword(pw), generated ? 1 : 0, now());
      if (r.changes && generated && !cfg.silent) {
        process.stdout.write('\n==================================================================\n  FIRST RUN: Database Administrator account created\n  Email:    ' + cfg.adminEmail + '\n  Password: ' + pw + '\n  Save it now. It is shown only once. You must change it at first sign-in.\n  (Next time set ADMIN_EMAIL and ADMIN_PASSWORD in .env to choose your own.)\n==================================================================\n\n');
      } else if (r.changes) log.info({ msg: 'dba account created from ADMIN_EMAIL/ADMIN_PASSWORD', user: cfg.adminEmail });
      if (r.changes) audit('system', 'dba_created', cfg.adminEmail, null);
    } catch (e) { log.error({ msg: 'dba bootstrap failed', err: e.message }); }
  })();
  const ready = (async () => { /* resolves once bootstrap is done (used by tests) */ for (let i = 0; i < 100; i++) { if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return; await new Promise((r) => setTimeout(r, 20)); } })();

  /* ------------------------------------------------------------ auth */
  /* ---- Central Security Management: every sign-in is one "session" row (device, browser, network, time). The DBA can see and remove any of them. ---- */
  function deviceLabel(ua) {
    ua = String(ua || '');
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : /Windows/.test(ua) ? 'Windows PC' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux PC' : 'Unknown device';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Brave/.test(ua) ? 'Brave' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
    return os + ' \u00b7 ' + br;
  }
  const lastSeenAt = new Map(), deviceMail = new Map();
  /* ---- Device approval mode: when ON, a person who signs in from a device never used before is NOT let in. The correct password only
     files a request; the Database Administrator approves or denies it in Security Center. The Database Administrator's own account and
     a person's very first device are exempt (so nobody can lock the whole club out). ---- */
  const approvalOn = () => { const r = db.prepare("SELECT v FROM meta WHERE k='device_approval'").get(); return r ? r.v === '1' : process.env.DEVICE_APPROVAL === '1'; };
  const deviceKey = (u, req) => { const d = didOf(req); if (d) return d; const ua = String(req.headers['user-agent'] || '').slice(0, 300); return 'ua-' + crypto.createHash('sha256').update(deviceLabel(ua) + '|' + ua).digest('hex').slice(0, 20); };
  function deviceAllowed(u, req) {
    if (!approvalOn() || u.role === 'dba') return true;
    const key = deviceKey(u, req);
    if (db.prepare('SELECT 1 x FROM trusted_devices WHERE user_id=? AND did=?').get(u.id, key)) return true;
    if (db.prepare('SELECT 1 x FROM sessions WHERE user_id=? AND did=? LIMIT 1').get(u.id, didOf(req) || '\u0000')) return true; /* a device already in use before the mode was switched on */
    if (!db.prepare('SELECT 1 x FROM sessions WHERE user_id=? LIMIT 1').get(u.id) && !db.prepare('SELECT 1 x FROM trusted_devices WHERE user_id=? LIMIT 1').get(u.id)) return true; /* first device ever */
    return false;
  }
  const pendingMail = new Map();
  function requestDeviceApproval(u, req, ip) {
    const key = deviceKey(u, req), label = deviceLabel(String(req.headers['user-agent'] || ''));
    const old = db.prepare('SELECT id,status FROM pending_devices WHERE user_id=? AND did=?').get(u.id, key);
    if (old && old.status === 'denied') { audit(u.email, 'login_denied_device', label, ip); throw new HttpError(403, 'The administrator did not allow this device.'); }
    if (old) db.prepare('UPDATE pending_devices SET ip=?, at=? WHERE id=?').run(ip || '', now(), old.id);
    else {
      db.prepare('INSERT INTO pending_devices(user_id,email,did,label,ip,at) VALUES(?,?,?,?,?,?)').run(u.id, u.email, key, label, ip || '', now());
      securityAlert('device_pending', u.email, ip, 'new device waiting for approval: ' + label, key);
      mailAll(pendingMail, 60e3, '[APPROVAL NEEDED] A new device wants to sign in to Milestone Sports Club',
        'A NEW DEVICE IS WAITING FOR YOUR APPROVAL\n\n' + u.email + ' typed the correct password on a device we have not seen before. They were NOT let in yet.\nDevice: ' + label + '\nInternet address (IP): ' + (ip || 'unknown') + '\nWhen: ' + bdTime() + '\n\nDatabase Administrator: open Security Center > Devices waiting for approval, then press Approve (if this is the owner) or Deny.');
    }
    audit(u.email, 'login_pending_device', label, ip);
    throw new HttpError(403, 'New device. Your password is correct, but this device must be approved by the administrator first. Ask them to approve it, then sign in again.', { pending: true });
  }
  function newSession(u, req, ip) {
    const ua = String(req.headers['user-agent'] || '').slice(0, 300), label = deviceLabel(ua), did = didOf(req);
    const dev = crypto.createHash('sha256').update(label + '|' + ua).digest('hex').slice(0, 16);
    const known = did ? db.prepare('SELECT 1 x FROM sessions WHERE user_id=? AND did=? LIMIT 1').get(u.id, did) : db.prepare("SELECT 1 x FROM sessions WHERE user_id=? AND dev=? AND did='' LIMIT 1").get(u.id, dev);
    const hadAny = db.prepare('SELECT 1 x FROM sessions WHERE user_id=? LIMIT 1').get(u.id);
    const isNew = hadAny && !known ? 1 : 0;
    const id = crypto.randomBytes(12).toString('base64url');
    db.prepare("DELETE FROM sessions WHERE created < ?").run(new Date(Date.now() - 90 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z'));
    db.prepare('INSERT INTO sessions(id,did,user_id,dev,label,ip,created,last_seen,new_dev) VALUES(?,?,?,?,?,?,?,?,?)').run(id, did, u.id, dev, label, ip || '', now(), now(), isNew);
    if (isNew) {
      audit(u.email, 'new_device_login', label, ip);
      mailAll(deviceMail, 60e3, '[SECURITY NOTICE] New device signed in to Milestone Sports Club',
        'NEW DEVICE SIGN-IN\n\nThe account ' + u.email + ' just signed in from a device not seen before.\nDevice: ' + label + '\nInternet address (IP): ' + (ip || 'unknown') + '\nWhen: ' + bdTime() + '\n\nIf this was the account owner, ignore this message. If not, the Database Administrator can remove this device now: Security Center > Signed-in devices > Remove.');
    }
    return id;
  }
  const sessionLive = (sid, uid) => { const r = db.prepare('SELECT revoked,created,user_id FROM sessions WHERE id=?').get(sid); return !!r && !r.revoked && r.user_id === uid; };
  function makeToken(u, sid) {
    const exp = Date.now() + cfg.tokenHours * 3600e3;
    const p = b64u(JSON.stringify({ i: u.id, tv: u.token_ver, s: sid, exp }));
    return { token: p + '.' + crypto.createHmac('sha256', secret).update(p).digest('base64url'), expiresAt: exp };
  }
  function readToken(req) {
    const h = req.headers.authorization || ''; const m = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(h); if (!m) return null;
    const [p, sig] = m[1].split('.'); if (!p || !sig) return null;
    const want = crypto.createHmac('sha256', secret).update(p).digest('base64url');
    if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
    let d; try { d = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch (e) { return null; }
    if (!d || d.exp < Date.now()) return null;
    /* role, active flag and token version are always read from the database, never trusted from the token */
    const u = Q.userId.get(d.i); if (!u || !u.active || u.token_ver !== d.tv) return null;
    if (!d.s || !sessionLive(d.s, u.id)) return null; /* a removed device is signed out at its very next request */
    u.sid = d.s;
    if (Date.now() - (lastSeenAt.get(d.s) || 0) > 30e3) { lastSeenAt.set(d.s, Date.now()); try { db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(now(), d.s); } catch (e) { /* ignore */ } }
    return u;
  }
  function needUser(req, roles, allowMustChange) {
    const u = readToken(req); if (!u) throw new HttpError(401, 'Please sign in again.');
    if (u.must_change && !allowMustChange) throw new HttpError(403, 'You must choose a new password first.', { mustChange: true });
    if (roles && roles.indexOf(u.role) < 0) throw new HttpError(403, 'You do not have permission to do that.');
    return u;
  }
  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active, mustChange: !!u.must_change, created: u.created, lastLogin: u.last_login, department: u.department || '' });

  /* ----------------------------------------------------- state storage */
  function drainInbox(state) {
    const rows = Q.inboxAll.all(); if (!rows.length) return 0;
    rows.forEach((r) => {
      let b; try { b = JSON.parse(r.body); } catch (e) { Q.inboxDel.run(r.id); return; }
      if (r.kind === 'contact') state.messages.push(b);
      if (r.kind === 'join' && b && typeof b === 'object') state.members.push(b);
      Q.inboxDel.run(r.id);
    });
    return rows.length;
  }
  function validState(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return 'State must be an object.';
    for (const k of COLLECTIONS) { if (!Array.isArray(s[k])) return 'Missing list: ' + k; if (s[k].length > 20000) return 'Too many items in ' + k; }
    if (!s.settings || typeof s.settings !== 'object' || Array.isArray(s.settings)) return 'Missing settings.';
    return '';
  }
  const SETTING_TYPES = { fee: 'number', themeChosen: 'boolean', teamSeeded: 'boolean', teachersSeeded: 'boolean' };
  /* what a role is allowed to see: only its own lists; settings are the public ones */
  function viewFor(role, s) {
    const P = PERM[role] || { lists: [] }, out = {};
    for (const k of COLLECTIONS) out[k] = P.lists.indexOf(k) >= 0 && Array.isArray(s[k]) ? s[k] : [];
    out.settings = Object.assign({}, s.settings); delete out.settings.adminPass;
    return out;
  }
  /* write only the slices the role owns; everything else is kept exactly as stored */
  function mergeFor(role, old, inc) {
    const P = PERM[role], out = Object.assign({}, old || {}); out.settings = Object.assign({}, (old && old.settings) || {});
    for (const k of COLLECTIONS) if (!Array.isArray(out[k])) out[k] = [];
    for (const k of P.lists) out[k] = inc[k];
    for (const k of P.settings) {
      if (!(k in inc.settings)) continue; const v = inc.settings[k], want = SETTING_TYPES[k] || 'string';
      if (k === 'theme' && THEMES.indexOf(v) < 0) continue;
      if (typeof v !== want || (want === 'string' && v.length > 300) || (want === 'number' && !(v >= 0 && v <= 1e7))) continue;
      out.settings[k] = want === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '') : v;
    }
    delete out.settings.adminPass; return out;
  }
  const IMG = { png: [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'png'], jpeg: [Buffer.from([0xff, 0xd8, 0xff]), 'jpg'], webp: [Buffer.from('RIFF'), 'webp'], gif: [Buffer.from('GIF8'), 'gif'] };
  function storeImages(state) {
    const items = [];
    (state.gallery || []).forEach((g) => items.push([g, 'src']));
    (state.team || []).forEach((g) => items.push([g, 'photo']));
    items.forEach(([g, key]) => {
      if (!g || typeof g !== 'object') return;
      const src = typeof g[key] === 'string' ? g[key] : '';
      const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(src);
      if (m) {
        const buf = Buffer.from(m[2], 'base64'); const spec = IMG[m[1]];
        if (buf.length > 4 * 1024 * 1024) throw new HttpError(413, 'A photo is larger than 4 MB.');
        if (!buf.subarray(0, spec[0].length).equals(spec[0])) throw new HttpError(400, 'A photo file is not a real ' + m[1].toUpperCase() + ' image.');
        const name = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32) + '.' + spec[1];
        const f = path.join(uploadsDir, name); if (!fs.existsSync(f)) fs.writeFileSync(f, buf);
        g[key] = '/uploads/' + name;
      } else if (src !== '' && !/^(\/uploads\/[a-f0-9]{32}\.(png|jpg|webp|gif)|assets\/[\w./-]+|https:\/\/[^\s"'<>]+)$/.test(src)) g[key] = '';
    });
  }

  const backupDir = path.join(cfg.dataDir, 'backups'), BK_RE = /^mcsc-[A-Za-z0-9-]{1,80}\.db$/;
  const listBackups = () => { try { fs.mkdirSync(backupDir, { recursive: true }); return fs.readdirSync(backupDir).filter((f) => BK_RE.test(f)).map((f) => { const st = fs.statSync(path.join(backupDir, f)); return { name: f, sizeKB: Math.max(1, Math.round(st.size / 1024)), created: st.birthtime.toISOString() }; }).sort((a, b) => b.name < a.name ? -1 : 1); } catch (e) { return []; } };
  function makeBackup(tag) {
    fs.mkdirSync(backupDir, { recursive: true });
    const name = 'mcsc-' + (tag ? tag + '-' : '') + now().replace(/[:.]/g, '-') + '-' + rid(2) + '.db', file = path.join(backupDir, name);
    db.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'");
    listBackups().slice(30).forEach((x) => { try { fs.unlinkSync(path.join(backupDir, x.name)); } catch (e) { /* ignore */ } });
    return name;
  }

  /* Automatic backup: one copy of the database a day (kept with the manual ones, newest 30), on the same persistent disk.
     Download them from Accounts & server > Backups, or use the host's disk snapshots, so a copy also lives OFF the disk. */
  if (!cfg.noAutoBackup) {
    const dayMs = 24 * 3600e3, auto = () => { try { const last = listBackups().find((b) => /^mcsc-auto-/.test(b.name)); if (!last || Date.now() - Date.parse(last.created) > dayMs - 60e3) makeBackup('auto'); } catch (e) { log.error({ msg: 'auto backup failed', err: e.message }); } };
    setTimeout(auto, 60e3).unref(); setInterval(auto, 3600e3).unref();
  }

  /* --------------------------------------------------------- the API */
  const json = (res, status, obj, headers) => {
    const b = Buffer.from(JSON.stringify(obj));
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' }, headers || {}));
    res.end(b);
  };
  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const ct = String(req.headers['content-type'] || '');
      if (!/^application\/json/i.test(ct)) return reject(new HttpError(415, 'Content-Type must be application/json.'));
      const len = Number(req.headers['content-length'] || 0); if (len > limit) return reject(new HttpError(413, 'Request too large.'));
      let n = 0, over = false; const chunks = [];
      req.on('data', (c) => { n += c.length; if (n > limit) { over = true; } else chunks.push(c); });
      req.on('end', () => {
        if (over) return reject(new HttpError(413, 'Request too large.'));
        let parsed; try { parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch (e) { return reject(new HttpError(400, 'Invalid JSON.')); }
        /* every endpoint needs a JSON object; null, numbers, strings and arrays used to crash the handler (HTTP 500) */
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return reject(new HttpError(400, 'Request body must be a JSON object.'));
        resolve(parsed);
      });
      req.on('error', reject);
    });
  }
  function limit(ip, name, max, windowMs, msg) {
    const r = rl.hit(name + ':' + ip, max, windowMs);
    if (!r.ok) { M.rateLimited++; throw new HttpError(429, msg || 'Too many requests. Please wait and try again.', { retryAfter: r.retry }); }
  }

  /* Treasury: ledger, three-person approvals, limits, freeze (treasury.js) */
  const treasury = createTreasury({ db, json, readBody, limit, needUser, HttpError, verifyPassword, now, clean, rl, cfg, audit,
    alert: (kind, email, ip, detail) => securityAlert(kind, email, ip, detail),
    notify: (roles, subject, text) => { const sm = getSmtp(); if (!sm) return; db.prepare('SELECT email,role FROM users WHERE active=1').all().filter((x) => roles.indexOf(x.role) >= 0).forEach((x) => sendMail(sm, x.email, subject, text).catch((e) => log.error({ msg: 'treasury email failed', err: e.message }))); } });

  async function api(req, res, url, ip) {
    const p = url.pathname.replace(/\/+$/, ''), m = req.method;
    limit(ip, 'api', 300, 60e3);
    if (p === '/api/treasury' || p.startsWith('/api/treasury/')) return treasury.handle(req, res, url, ip, p, m);

    if (p === '/api/health' && (m === 'GET' || m === 'HEAD')) {
      db.prepare('SELECT 1').get();
      return json(res, 200, { ok: true, version: APP_VERSION, uptimeSec: Math.round((Date.now() - started) / 1000) });
    }
    if (p === '/api/public' && m === 'GET') {
      const r = Q.getKV.get('state'); if (!r) return json(res, 200, { empty: true }, { 'Cache-Control': 'public, max-age=15' });
      const etag = 'W/"pub-' + r.version + '"';
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'public, max-age=15' }); return res.end(); }
      const s = JSON.parse(r.v), pub = Object.assign({}, s.settings); delete pub.adminPass;
      return json(res, 200, { settings: pub, events: (s.events || []).filter((e) => e.published), notes: (s.notes || []).filter((n) => n.published), team: (s.team || []).map((t) => pick(t, PUB_TEAM)), gallery: (s.gallery || []).map((g) => pick(g, PUB_GALLERY)), version: r.version },
        { 'Cache-Control': 'public, max-age=15, s-maxage=30', ETag: etag });
    }
    if (p === '/api/contact' && m === 'POST') {
      limit(ip, 'contact', 6, 3600e3, 'Too many messages from this network. Please try again later.');
      const b = await readBody(req, 8 * 1024);
      const name = clean(b.name, 80), contact = clean(b.contact, 120), text = clean(b.text, 2000, true);
      if (!name || !text) throw new HttpError(400, 'Please enter your name and message.');
      Q.inboxAdd.run('contact', JSON.stringify({ id: 'c' + rid(5), name, contact, text, date: now().slice(0, 16).replace('T', ' '), read: false }), now());
      M.contacts++; audit('public', 'contact_message', name, ip);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/client-error' && m === 'POST') {
      limit(ip, 'cerr', 20, 60e3);
      const b = await readBody(req, 8 * 1024); M.clientErrors++;
      recordError('browser', clean(b.message, 500), clean(b.stack, 3000, true), clean(b.url, 200), req.headers['user-agent']);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/login' && m === 'POST') {
      limit(ip, 'login', 20, 15 * 60e3, 'Too many sign-in attempts. Please wait 15 minutes.');
      const b = await readBody(req, 2 * 1024);
      const email = clean(typeof b.email === 'string' ? b.email : b.username, 120).toLowerCase(), password = typeof b.password === 'string' ? b.password.slice(0, 200) : '';
      if (Q.blocked.get(ip)) { audit(email || '?', 'login_blocked_ip', null, ip); throw new HttpError(403, 'Access denied from this network.'); }
      const dvc = didOf(req);
      if (dvc && db.prepare('SELECT 1 x FROM blocked_devices WHERE did=?').get(dvc)) { audit(email || '?', 'login_blocked_device', null, ip); securityAlert('blocked_device', email, ip, 'a blocked device tried to sign in', dvc); throw new HttpError(403, 'Access denied from this device.'); }
      const lockKey = 'lock:' + email + ':' + ip, acctKey = 'acct:' + email;
      const pk = rl.peek(lockKey, 5); if (!pk.ok) { M.rateLimited++; const lid = securityAlert('lockout', email, ip, 'locked after repeated wrong passwords', didOf(req)); throw new HttpError(429, 'Too many wrong passwords. Try again in ' + Math.ceil(pk.retry / 60) + ' minutes.', { retryAfter: pk.retry, alertId: lid, photoToken: lid ? photoToken(lid) : '' }); }
      /* one account is also protected against guessing spread over many networks */
      const ak = rl.peek(acctKey, 15); if (!ak.ok) { M.rateLimited++; throw new HttpError(429, 'This account is temporarily locked after many wrong passwords. Try again in ' + Math.ceil(ak.retry / 60) + ' minutes.', { retryAfter: ak.retry }); }
      const u = Q.user.get(email);
      const ok = await verifyPassword(password, u ? u.pass : 'scrypt$00$00');
      if (!u || !ok || !u.active) { rl.hit(lockKey, 5, 15 * 60e3); rl.hit(acctKey, 15, 15 * 60e3); M.loginFail++; if (process.env.AUTO_IP_BLOCK !== '0' && !rl.peek(lockKey, 5).ok && ip && !/^(127\.|::1$|::ffff:127\.)/.test(ip) && !Q.blocked.get(ip)) { db.prepare('INSERT OR REPLACE INTO blocked_ips(ip,at,by,reason) VALUES(?,?,?,?)').run(ip, now(), 'system', 'auto: 5 wrong passwords in a row'); audit('system', 'ip_auto_block', ip, ip); if (dvc && !db.prepare('SELECT 1 x FROM blocked_devices WHERE did=?').get(dvc)) { db.prepare('INSERT OR REPLACE INTO blocked_devices(did,at,by,reason,label,ip) VALUES(?,?,?,?,?,?)').run(dvc, now(), 'system', 'auto: 5 wrong passwords in a row', deviceLabel(String(req.headers['user-agent'] || '')), ip); audit('system', 'device_auto_block', dvc.slice(0, 8), ip); } securityAlert('ip_auto_blocked', email, ip, 'network address ' + ip + ' was blocked automatically after 5 wrong passwords', didOf(req)); } const aid = securityAlert(u ? 'wrong_password' : 'unknown_account', email, ip, u && ok && !u.active ? 'disabled account' : (u ? 'wrong password' : 'unknown email'), didOf(req)); audit(email || '?', 'login_fail', u && ok && !u.active ? 'account disabled' : null, ip); throw new HttpError(401, 'Wrong email or password.', { alertId: aid, photoToken: aid ? photoToken(aid) : '' }); }
      rl.clear(lockKey); rl.clear(acctKey);
      if (!deviceAllowed(u, req)) requestDeviceApproval(u, req, ip);
      M.loginOk++; audit(u.email, 'login_ok', u.role, ip);
      if (cfg.sms && (cfg.sms.onLogin === 'all' || (cfg.sms.onLogin === 'dba' && u.role === 'dba'))) smsAlert('login:' + u.email, 'MSC: ' + maskEmail(u.email) + ' (' + u.role + ') signed in from ' + (ip || 'unknown') + ' at ' + bdTime());
      db.prepare('UPDATE users SET last_login=? WHERE id=?').run(now(), u.id);
      const t = makeToken(u, newSession(u, req, ip)); return json(res, 200, { token: t.token, expiresAt: t.expiresAt, role: u.role, email: u.email, name: u.name, mustChange: !!u.must_change });
    }

    /* ---- forgot password: a one-time link, valid 30 minutes. The answer is always the same, so nobody can find out which emails have accounts. ---- */
    if (p === '/api/forgot' && m === 'POST') {
      limit(ip, 'forgot', 6, 15 * 60e3, 'Too many requests. Please wait 15 minutes.');
      const b = await readBody(req, 2 * 1024);
      const email = clean(typeof b.email === 'string' ? b.email : '', 120).toLowerCase();
      const generic = { ok: true, message: 'If that email has an account, a password reset link has been sent. It works for 30 minutes.' };
      if (!EMAIL_RE.test(email)) return json(res, 200, generic);
      const acct = rl.hit('forgot-acct:' + email, 3, 60 * 60e3); if (!acct.ok) return json(res, 200, generic);
      const u = Q.user.get(email);
      if (u && u.active) {
        const token = crypto.randomBytes(32).toString('base64url'), h = crypto.createHash('sha256').update(token).digest('hex');
        db.prepare('DELETE FROM resets WHERE user_id=? OR expires<?').run(u.id, Date.now());
        db.prepare('INSERT INTO resets(user_id,hash,expires) VALUES(?,?,?)').run(u.id, h, Date.now() + 30 * 60e3);
        const link = (cfg.publicUrl || 'http://localhost:' + (cfg.port || 8080)) + '/admin.html#reset=' + token;
        audit(u.email, 'reset_requested', getSmtp() ? 'email' : 'link in server log', ip);
        if (getSmtp()) {
          sendMail(getSmtp(), u.email, 'Reset your Milestone Sports Club password', 'Hello ' + (u.name || '') + ',\n\nSomeone asked to reset the password for this account. To choose a new password open this link within 30 minutes:\n\n' + link + '\n\nIf you did not ask for this, ignore this email; your password stays the same.')
            .catch((e) => log.error({ msg: 'reset email failed', err: e.message }));
        } else if (!cfg.silent) {
          process.stdout.write('\n[PASSWORD RESET] No email server is set up (SMTP_* in .env), so the link is shown here for ' + u.email + ':\n  ' + link + '\n\n');
        }
      }
      return json(res, 200, generic);
    }
    if (p === '/api/reset' && m === 'POST') {
      limit(ip, 'reset', 10, 15 * 60e3);
      const b = await readBody(req, 2 * 1024);
      const token = typeof b.token === 'string' ? b.token.slice(0, 100) : '';
      const h = crypto.createHash('sha256').update(token).digest('hex');
      const row = db.prepare('SELECT * FROM resets WHERE hash=? AND used=0 AND expires>?').get(h, Date.now());
      const u = row && Q.userId.get(row.user_id);
      if (!row || !u || !u.active) throw new HttpError(400, 'This reset link is not valid or has expired. Ask for a new one.');
      const w = weakPassword(b.newPassword, u.email); if (w) throw new HttpError(400, w);
      db.prepare('UPDATE users SET pass=?, must_change=0, token_ver=token_ver+1 WHERE id=?').run(await hashPassword(b.newPassword), u.id);
      db.prepare('DELETE FROM resets WHERE user_id=?').run(u.id); db.prepare('UPDATE sessions SET revoked=1 WHERE user_id=?').run(u.id);
      rl.clear('lock:' + u.email + ':' + ip); rl.clear('acct:' + u.email);
      audit(u.email, 'password_reset', 'by email link', ip);
      return json(res, 200, { ok: true });
    }

    /* ---- everything below needs a signed-in user ---- */
    if (p === '/api/me' && m === 'GET') { const u = needUser(req, null, true); return json(res, 200, publicUser(u)); }
    if (p === '/api/logout' && m === 'POST') {
      const u = needUser(req, null, true); db.prepare('UPDATE sessions SET revoked=1 WHERE id=?').run(u.sid); audit(u.email, 'logout', null, ip); return json(res, 200, { ok: true });
    }
    if (p === '/api/password' && m === 'POST') {
      const u = needUser(req, null, true); const b = await readBody(req, 2 * 1024);
      limit(ip, 'pw', 10, 15 * 60e3);
      if (!(await verifyPassword(String(b.oldPassword || ''), u.pass))) throw new HttpError(403, 'Current password is wrong.');
      const w = weakPassword(b.newPassword, u.email); if (w) throw new HttpError(400, w);
      if (b.newPassword === b.oldPassword) throw new HttpError(400, 'The new password must be different from the current one.');
      db.prepare('UPDATE users SET pass=?, must_change=0, token_ver=token_ver+1 WHERE id=?').run(await hashPassword(b.newPassword), u.id);
      audit(u.email, 'password_change', null, ip);
      db.prepare('UPDATE sessions SET revoked=1 WHERE user_id=? AND id<>?').run(u.id, u.sid); const fresh = Q.userId.get(u.id), t = makeToken(fresh, u.sid); return json(res, 200, { ok: true, token: t.token, expiresAt: t.expiresAt });
    }

    /* ---- club data: President and Editor only, each sees and writes only their own slices ---- */
    if (p === '/api/state' && m === 'GET') {
      const u = needUser(req, ['president', 'secretary', 'treasurer', 'coordinator', 'editor', 'dba']);
      db.exec('BEGIN IMMEDIATE');
      try {
        const r = Q.getKV.get('state'); if (!r) { db.exec('COMMIT'); return json(res, 200, { state: null, version: 0 }); }
        let v = r.version; const known = Number(url.searchParams.get('v') || -1);
        const s = JSON.parse(r.v); const n = drainInbox(s);
        if (n) { Q.setKV.run('state', JSON.stringify(s), now()); v = Q.verKV.get('state').version; }
        db.exec('COMMIT');
        if (v === known) return json(res, 200, { unchanged: true, version: v });
        return json(res, 200, { state: viewFor(u.role, s), version: v });
      } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; }
    }
    if (p === '/api/state' && m === 'PUT') {
      const u = needUser(req, ['president', 'secretary', 'treasurer', 'coordinator', 'editor', 'dba']); limit(ip, 'put', 120, 60e3);
      const b = await readBody(req, 30 * 1024 * 1024); const inc = b.state; const bad = validState(inc); if (bad) throw new HttpError(400, bad);
      db.exec('BEGIN IMMEDIATE');
      try {
        const cur = Q.getKV.get('state'), old = cur ? JSON.parse(cur.v) : null;
        const s = mergeFor(u.role, old, inc);
        storeImages(s);
        const merged = drainInbox(s);
        Q.setKV.run('state', JSON.stringify(s), now()); const v = Q.verKV.get('state').version;
        db.exec('COMMIT');
        audit(u.email, 'state_update', u.role + ': ' + PERM[u.role].lists.map((k) => k + ' ' + s[k].length).join(', '), ip);
        return json(res, 200, { ok: true, version: v, merged: merged > 0 });
      } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; }
    }

    /* ---- security alarm feed: every signed-in person (any role) sees it ---- */
    if (p === '/api/alerts' && m === 'GET') {
      needUser(req, null, true);
      const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
      const latest = (db.prepare('SELECT MAX(id) m FROM alerts').get().m) || 0;
      return json(res, 200, { latest, open: openAlerts(), alerts: db.prepare('SELECT id,at,kind,email,ip,detail,photo,did,acked_by,acked_at FROM alerts WHERE id>? ORDER BY id DESC LIMIT 100').all(since) });
    }
    /* only the Database Administrator or the Club President can stop the alarm */
    if (p === '/api/alerts/ack' && m === 'POST') {
      const u = needUser(req, ['dba', 'president']);
      const r = db.prepare('UPDATE alerts SET acked_by=?, acked_at=? WHERE acked_at IS NULL').run(u.email, now());
      reminders = 0; audit(u.email, 'alarm_stopped', r.changes + ' alert(s)', ip);
      smsAlert('ack', 'MSC: the security alarm was seen and stopped by ' + maskEmail(u.email) + ' (' + u.role + ') at ' + bdTime() + '.');
      return json(res, 200, { ok: true, stopped: r.changes });
    }

    /* intruder photo: only with the one-time slip from the failed sign-in, JPEG only, one photo per alarm */
    if (p === '/api/intruder-photo' && m === 'POST') {
      limit(ip, 'photo', 10, 15 * 60e3, 'Too many requests.');
      const b = await readBody(req, 600 * 1024), id = readPhotoToken(b.token);
      if (!id) throw new HttpError(403, 'Not allowed.');
      const row = db.prepare('SELECT id,email,ip,at,photo FROM alerts WHERE id=?').get(id); if (!row || row.photo) throw new HttpError(409, 'Photo already saved.');
      const mm = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image || '')); if (!mm) throw new HttpError(400, 'A JPEG photo is needed.');
      const buf = Buffer.from(mm[1], 'base64'); if (buf.length < 500 || buf.length > 400 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new HttpError(400, 'That is not a valid JPEG photo.');
      fs.writeFileSync(photoFile(id), buf); db.prepare('UPDATE alerts SET photo=1 WHERE id=?').run(id); audit('public', 'intruder_photo', 'alarm #' + id, ip);
      smsAlert('photo', 'MSC SECURITY ALERT: a PHOTO of the person who tried to enter as ' + maskEmail(row.email) + ' (from ' + (row.ip || 'unknown') + ') was captured' + (tgReady() ? ' and sent to your Telegram' : ' and emailed to all admins') + '. A text message cannot carry a picture: open ' + (cfg.publicUrl || 'the site') + '/dba.html to see it.', true);
      tgPhoto(buf, 'SECURITY ALERT: person who tried to enter as ' + row.email + '\nNetwork: ' + (row.ip || 'unknown') + '\nTime: ' + bdTime() + '\nDBA or President: open dba.html and press STOP ALARM.');
      mailAll(lastPhotoMail, 15e3, '[SECURITY ALERT] PHOTO of the person who tried to enter (' + row.email + ')',
        'SECURITY ALERT: PHOTO ATTACHED\n\nThis is the person who just entered a wrong email or password for ' + row.email + '.\nTime: ' + row.at + '\nInternet address (IP): ' + row.ip + '\n\nIf you do not know this person, tell the Database Administrator at once.', [{ filename: 'intruder-' + id + '.jpg', type: 'image/jpeg', data: buf }]);
      return json(res, 200, { ok: true });
    }
    const pm = /^\/api\/alerts\/(\d{1,9})\/photo$/.exec(p);
    if (pm && m === 'GET') {
      needUser(req, null, true); const f = photoFile(pm[1]);
      if (!db.prepare('SELECT 1 FROM alerts WHERE id=? AND photo=1').get(Number(pm[1])) || !fs.existsSync(f)) throw new HttpError(404, 'No photo.');
      const buf = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'private, no-store' }); return res.end(buf);
    }
    if (p === '/api/blocked' && m === 'GET') { needUser(req, ['dba']); return json(res, 200, { blocked: db.prepare('SELECT ip,at,by,reason FROM blocked_ips ORDER BY at DESC').all() }); }
    if (p === '/api/blocked' && m === 'POST') {
      const u = needUser(req, ['dba']), b = await readBody(req, 1024), bip = clean(b.ip, 45);
      if (!/^[0-9a-fA-F:.]{3,45}$/.test(bip)) throw new HttpError(400, 'Enter a valid network (IP) address.');
      if (bip === ip) throw new HttpError(400, 'You cannot block the network you are using right now.');
      db.prepare('INSERT OR REPLACE INTO blocked_ips(ip,at,by,reason) VALUES(?,?,?,?)').run(bip, now(), u.email, clean(b.reason, 120)); audit(u.email, 'ip_block', bip, ip); return json(res, 200, { ok: true });
    }
    const bm2 = /^\/api\/blocked\/([0-9a-fA-F:.]{3,45})$/.exec(p);
    if (bm2 && m === 'DELETE') { const u = needUser(req, ['dba']); db.prepare('DELETE FROM blocked_ips WHERE ip=?').run(bm2[1]); audit(u.email, 'ip_unblock', bm2[1], ip); return json(res, 200, { ok: true }); }

    /* ---- Central Security Management: signed-in devices (DBA sees every one and can remove any) ---- */
    if (p === '/api/sessions' && m === 'GET') {
      const me = needUser(req, ['dba']), minC = new Date(Date.now() - cfg.tokenHours * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
      if (url.searchParams.get('history') === '1') {
        const h = db.prepare('SELECT s.id,s.did,s.label,s.ip,s.created,s.last_seen,s.new_dev,s.revoked,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.created DESC LIMIT 200').all();
        return json(res, 200, { history: h.map((r) => ({ id: r.id, did: r.did, label: r.label, ip: r.ip, created: r.created, last_seen: r.last_seen, new_dev: !!r.new_dev, email: r.email, role: r.role, status: r.revoked ? 'Removed / signed out' : (r.created < minC ? 'Expired' : 'Active') })) });
      }
      const rows = db.prepare('SELECT s.id,s.did,s.label,s.ip,s.created,s.last_seen,s.new_dev,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.revoked=0 AND s.created>=? AND u.active=1 ORDER BY s.last_seen DESC LIMIT 300').all(minC);
      return json(res, 200, { sessions: rows.map((r) => Object.assign({}, r, { current: r.id === me.sid, new_dev: !!r.new_dev })) });
    }
    if (p === '/api/sessions/revoke-others' && m === 'POST') {
      const me = needUser(req, ['dba']); const r = db.prepare('UPDATE sessions SET revoked=1 WHERE revoked=0 AND id<>?').run(me.sid);
      audit(me.email, 'sessions_revoke_all', String(r.changes), ip); return json(res, 200, { ok: true, removed: r.changes });
    }
    const sb = /^\/api\/sessions\/([A-Za-z0-9_\-]{8,40})\/block$/.exec(p);
    if (sb && m === 'POST') {
      const me = needUser(req, ['dba']), b = await readBody(req, 1024); const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(sb[1]);
      if (!row) throw new HttpError(404, 'That device is not signed in any more.');
      if (row.id === me.sid) throw new HttpError(400, 'You cannot block the device you are using right now.');
      if (row.did) db.prepare('UPDATE sessions SET revoked=1 WHERE id=? OR did=?').run(row.id, row.did); else db.prepare('UPDATE sessions SET revoked=1 WHERE id=?').run(row.id);
      if (row.did) db.prepare('INSERT OR REPLACE INTO blocked_devices(did,at,by,reason,label,ip) VALUES(?,?,?,?,?,?)').run(row.did, now(), me.email, 'removed from Signed-in devices', row.label, row.ip);
      let ipb = false;
      if (b.blockIp === true && row.ip && row.ip !== ip) { db.prepare('INSERT OR REPLACE INTO blocked_ips(ip,at,by,reason) VALUES(?,?,?,?)').run(row.ip, now(), me.email, 'removed from Signed-in devices'); ipb = true; }
      audit(me.email, 'device_blocked', (row.label || '') + ' / ' + (row.ip || '') + (ipb ? ' / network blocked' : ''), ip);
      return json(res, 200, { ok: true, deviceBlocked: !!row.did, ipBlocked: ipb });
    }
    if (p === '/api/blocked-devices' && m === 'GET') { needUser(req, ['dba']); return json(res, 200, { devices: db.prepare('SELECT did,at,by,reason,label,ip FROM blocked_devices ORDER BY at DESC LIMIT 200').all() }); }
    if (p === '/api/blocked-devices' && m === 'POST') {
      const me = needUser(req, ['dba']), b = await readBody(req, 1024), dv = String(b.did || '');
      if (!/^[A-Za-z0-9_-]{16,48}$/.test(dv)) throw new HttpError(400, 'No device id for this alarm (an older alarm, or a browser that hides it). Block its network instead.');
      if (dv === didOf(req)) throw new HttpError(400, 'You cannot block the device you are using right now.');
      db.prepare('INSERT OR REPLACE INTO blocked_devices(did,at,by,reason,label,ip) VALUES(?,?,?,?,?,?)').run(dv, now(), me.email, clean(b.reason, 120), clean(b.label, 80), clean(b.ip, 45));
      db.prepare('UPDATE sessions SET revoked=1 WHERE did=?').run(dv); audit(me.email, 'device_blocked', dv.slice(0, 8), ip); return json(res, 200, { ok: true });
    }
    const bd = /^\/api\/blocked-devices\/([A-Za-z0-9_-]{16,48})$/.exec(p);
    if (bd && m === 'DELETE') { const me = needUser(req, ['dba']); db.prepare('DELETE FROM blocked_devices WHERE did=?').run(bd[1]); audit(me.email, 'device_allowed', bd[1].slice(0, 8), ip); return json(res, 200, { ok: true }); }
    /* ---- Device approval mode (DBA): switch on/off, list requests, approve or deny ---- */
    if (p === '/api/device-approval' && m === 'GET') {
      needUser(req, ['dba']);
      return json(res, 200, { enabled: approvalOn(), pending: db.prepare('SELECT id,email,label,ip,at,status FROM pending_devices ORDER BY (status=\'pending\') DESC, at DESC LIMIT 100').all(), trusted: db.prepare('SELECT COUNT(*) c FROM trusted_devices').get().c });
    }
    if (p === '/api/device-approval' && m === 'PUT') {
      const me = needUser(req, ['dba']), b = await readBody(req, 512);
      db.prepare("INSERT INTO meta(k,v) VALUES('device_approval',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(b.enabled === true ? '1' : '0');
      audit(me.email, b.enabled === true ? 'device_approval_on' : 'device_approval_off', null, ip); return json(res, 200, { ok: true, enabled: b.enabled === true });
    }
    const pd = /^\/api\/pending-devices\/(\d{1,9})\/(approve|deny)$/.exec(p);
    if (pd && m === 'POST') {
      const me = needUser(req, ['dba']), row = db.prepare('SELECT * FROM pending_devices WHERE id=?').get(Number(pd[1]));
      if (!row) throw new HttpError(404, 'That request is not there any more.');
      if (pd[2] === 'approve') {
        db.prepare('INSERT OR REPLACE INTO trusted_devices(user_id,did,at,by) VALUES(?,?,?,?)').run(row.user_id, row.did, now(), me.email);
        db.prepare('DELETE FROM pending_devices WHERE id=?').run(row.id); audit(me.email, 'device_approved', row.email + ' / ' + row.label, ip);
      } else { db.prepare("UPDATE pending_devices SET status='denied' WHERE id=?").run(row.id); audit(me.email, 'device_denied', row.email + ' / ' + row.label, ip); }
      return json(res, 200, { ok: true });
    }
    const pdd = /^\/api\/pending-devices\/(\d{1,9})$/.exec(p);
    if (pdd && m === 'DELETE') { const me = needUser(req, ['dba']); db.prepare('DELETE FROM pending_devices WHERE id=?').run(Number(pdd[1])); audit(me.email, 'device_request_cleared', pdd[1], ip); return json(res, 200, { ok: true }); }
    if (p === '/api/unlock' && m === 'POST') {
      const me = needUser(req, ['dba']), b = await readBody(req, 1024), em = clean(b.email, 120).toLowerCase();
      if (!EMAIL_RE.test(em)) throw new HttpError(400, 'Enter a valid email address.');
      const pre = 'lock:' + em + ':'; db.prepare('DELETE FROM ratelimits WHERE k=? OR substr(k,1,?)=?').run('acct:' + em, pre.length, pre);
      audit(me.email, 'account_unlocked', em, ip); return json(res, 200, { ok: true });
    }
    /* ---- alarm phones: up to 3 security numbers (SMS) + Telegram bot for the photo ---- */
    if (p === '/api/alert-phones' && m === 'GET') {
      needUser(req, ['dba', 'president']); const sl = phoneSlots();
      return json(res, 200, { max: MAX_SLOTS, slots: sl.map((x) => ({ label: x.label, phone: local(x.phone), telegram: x.telegram })), smsGateway: !!(cfg.sms && cfg.sms.url), sms: { sent: smsState.sent, lastOk: smsState.lastOk, lastError: smsState.lastError },
        telegram: { hasToken: !!tgToken(), chats: tgChats().length, lastOk: tgState.lastOk, lastError: tgState.lastError }, reminders: 'every 3 minutes until stopped' });
    }
    if (p === '/api/alert-phones' && m === 'PUT') {
      const me = needUser(req, ['dba']), b = await readBody(req, 4 * 1024), seen = new Set();
      if (!Array.isArray(b.slots) || b.slots.length > MAX_SLOTS) throw new HttpError(400, 'Send up to ' + MAX_SLOTS + ' numbers.');
      const slots = b.slots.map((x, i) => {
        x = x || {}; const raw = clean(x.phone, 20), ph = raw ? normalizePhone(raw) : '', tgc = clean(x.telegram, 24).replace(/\s+/g, '');
        if (raw && !ph) throw new HttpError(400, 'Number ' + (i + 1) + ' is not a valid Bangladesh mobile number (example 01340340744).');
        if (ph && seen.has(ph)) throw new HttpError(400, 'Number ' + (i + 1) + ' is entered twice.'); if (ph) seen.add(ph);
        if (tgc && !tg.CHAT_RE.test(tgc)) throw new HttpError(400, 'Telegram chat ID ' + (i + 1) + ' must be digits only (use "Find chat IDs").');
        return { label: clean(x.label, 40) || 'Security number ' + (i + 1), phone: ph, telegram: tgc };
      });
      db.prepare("INSERT INTO meta(k,v) VALUES('alert_phones',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(JSON.stringify(slots));
      audit(me.email, 'alert_phones_saved', slots.filter((x) => x.phone).length + ' number(s)', ip); return json(res, 200, { ok: true });
    }
    if (p === '/api/telegram' && m === 'PUT') {
      const me = needUser(req, ['dba']); limit(ip, 'tgset', 10, 15 * 60e3); const b = await readBody(req, 1024), token = clean(b.token, 80).replace(/\s+/g, '');
      if (!tg.TOKEN_RE.test(token)) throw new HttpError(400, 'That is not a Telegram bot token (it looks like 123456789:AA...). Get it from @BotFather.');
      let bot; try { bot = await tg.getMe(token); } catch (e) { throw new HttpError(400, 'Telegram did not accept this token: ' + e.message); }
      db.prepare("INSERT INTO meta(k,v) VALUES('telegram',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(encryptText(JSON.stringify({ token })));
      audit(me.email, 'telegram_saved', bot && bot.username, ip); return json(res, 200, { ok: true, bot: bot && bot.username });
    }
    if (p === '/api/telegram' && m === 'DELETE') { const me = needUser(req, ['dba']); db.prepare("DELETE FROM meta WHERE k='telegram'").run(); audit(me.email, 'telegram_cleared', null, ip); return json(res, 200, { ok: true }); }
    if (p === '/api/telegram/find' && m === 'POST') {
      needUser(req, ['dba']); limit(ip, 'tgfind', 20, 15 * 60e3); const t = tgToken(); if (!t) throw new HttpError(400, 'Save the bot token first.');
      try { return json(res, 200, { ok: true, chats: await tg.findChats(t) }); } catch (e) { throw new HttpError(502, e.message); }
    }
    if (p === '/api/alert-test' && m === 'POST') {
      const me = needUser(req, ['dba']); limit(ip, 'alerttest', 6, 15 * 60e3);
      const text = 'MSC TEST: the security alarm reaches this phone. Sent by ' + maskEmail(me.email) + ' at ' + bdTime() + '. No action needed.', out = { sms: [], telegram: [] }, s = cfg.sms;
      if (s && s.url) for (const ph of alertNumbers()) { try { await sendSms(Object.assign({}, s, { phone: ph }), cleanText(text)); out.sms.push({ phone: local(ph), ok: true }); } catch (e) { out.sms.push({ phone: local(ph), ok: false, error: String(e.message || e).slice(0, 100) }); } }
      const t = tgToken(); if (t) for (const c of tgChats()) { try { await tg.sendMessage(t, c, text); out.telegram.push({ chat: c, ok: true }); tgOk(); } catch (e) { out.telegram.push({ chat: c, ok: false, error: e.message }); tgBad(e); } }
      out.smsGateway = !!(s && s.url); out.telegramReady = !!t; audit(me.email, 'alert_test', out.sms.length + ' sms, ' + out.telegram.length + ' telegram', ip); return json(res, 200, Object.assign({ ok: true }, out));
    }
    /* ---- alert email settings: typed once here, stored encrypted, then every alarm and photo is emailed automatically ---- */
    if (p === '/api/mail-settings' && m === 'GET') {
      needUser(req, ['dba']); const x = smtpStored(), e = cfg.smtp;
      return json(res, 200, { source: x ? 'saved here' : (e ? '.env file' : 'none'), host: x ? x.host : (e ? e.host : ''), port: x ? x.port : (e ? Number(e.port) || 587 : 465), user: x ? x.user : (e ? e.user : ''), from: x ? x.from : (e ? e.from || '' : ''), alertTo: x ? x.alertTo || [] : [], hasPass: !!(x ? x.pass : (e && e.pass)), lastError: mailState.lastError, lastOk: mailState.lastOk });
    }
    if (p === '/api/mail-settings' && m === 'PUT') {
      const me = needUser(req, ['dba']), b = await readBody(req, 4 * 1024), old = smtpStored();
      const host = clean(b.host, 100).toLowerCase(), port = Number(b.port) || 0, user = clean(b.user, 120), from = clean(b.from, 120);
      if (!/^[a-z0-9.-]{3,100}$/.test(host)) throw new HttpError(400, 'Enter the mail server name, e.g. smtp.gmail.com.');
      if (port < 1 || port > 65535) throw new HttpError(400, 'Enter a valid port, e.g. 465.');
      if (!EMAIL_RE.test(user.toLowerCase())) throw new HttpError(400, 'Enter the sender email address.');
      const pass = typeof b.pass === 'string' && b.pass ? b.pass.replace(/\s+/g, '').slice(0, 200) : (old ? old.pass : (cfg.smtp && cfg.smtp.pass) || '');
      if (!pass) throw new HttpError(400, 'Enter the email app password.');
      const alertTo = String(b.alertTo || '').split(/[\s,;]+/).map((v) => v.trim().toLowerCase()).filter(Boolean).slice(0, 8);
      if (alertTo.some((v) => !EMAIL_RE.test(v))) throw new HttpError(400, 'One of the alert email addresses is not valid.');
      db.prepare("INSERT INTO meta(k,v) VALUES('smtp',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(encryptText(JSON.stringify({ host, port, user, pass, from, alertTo })));
      mailState.lastError = ''; audit(me.email, 'mail_settings_saved', host, ip); return json(res, 200, { ok: true });
    }
    if (p === '/api/mail-settings' && m === 'DELETE') { const me = needUser(req, ['dba']); db.prepare("DELETE FROM meta WHERE k='smtp'").run(); audit(me.email, 'mail_settings_cleared', null, ip); return json(res, 200, { ok: true }); }
    if (p === '/api/mail-test' && m === 'POST') {
      const me = needUser(req, ['dba']); limit(ip, 'mailtest', 10, 15 * 60e3); const sm = getSmtp();
      if (!sm) throw new HttpError(400, 'Save the email settings first.');
      const to = recipients(), results = await Promise.allSettled(to.map((t) => sendMail(sm, t, '[TEST] Milestone Sports Club security email works', 'This is a test. Security alarms, new-device notices and intruder photos will be emailed to this address automatically.\nSent by ' + me.email + ' at ' + now())));
      const bad = results.map((r, i) => r.status === 'rejected' ? to[i] + ': ' + String(r.reason && r.reason.message || r.reason).slice(0, 120) : null).filter(Boolean), okN = results.length - bad.length;
      if (okN) { mailState.lastOk = now(); mailState.lastError = bad[0] || ''; } else mailState.lastError = bad[0] || '';
      audit(me.email, 'mail_test', okN + ' sent, ' + bad.length + ' failed', ip); return json(res, 200, { ok: okN > 0, sent: okN, failed: bad });
    }

    const sm = /^\/api\/sessions\/([A-Za-z0-9_\-]{8,40})$/.exec(p);
    if (sm && m === 'DELETE') {
      const me = needUser(req, ['dba']); const row = db.prepare('SELECT s.id,s.label,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?').get(sm[1]);
      if (!row) throw new HttpError(404, 'That device is not signed in any more.');
      db.prepare('UPDATE sessions SET revoked=1 WHERE id=?').run(row.id); audit(me.email, 'session_removed', row.email + ' / ' + row.label, ip); return json(res, 200, { ok: true });
    }

    /* ---- Database Administrator: accounts ---- */
    if (p === '/api/users' && m === 'GET') {
      needUser(req, ['dba']); return json(res, 200, { users: db.prepare('SELECT * FROM users ORDER BY id').all().map(publicUser) });
    }
    if (p === '/api/users' && m === 'POST') {
      const u = needUser(req, ['dba']); const b = await readBody(req, 2 * 1024);
      const email = clean(b.email, 120).toLowerCase(), name = clean(b.name, 80), role = String(b.role || ''), dept = clean(b.department, 60);
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
      if (ROLES.indexOf(role) < 0) throw new HttpError(400, 'Role must be one of: ' + ROLES.join(', ') + '.');
      if (!name) throw new HttpError(400, 'Please enter the person\'s name.');
      const w = weakPassword(b.password, email); if (w) throw new HttpError(400, w);
      if (Q.user.get(email)) throw new HttpError(409, 'That email already has an account.');
      const r = db.prepare('INSERT INTO users(email,name,pass,role,must_change,created,department) VALUES(?,?,?,?,1,?,?)').run(email, name, await hashPassword(b.password), role, now(), dept);
      audit(u.email, 'user_create', email + ' (' + role + ')', ip); return json(res, 200, { ok: true, user: publicUser(Q.userId.get(Number(r.lastInsertRowid))) });
    }
    const um = /^\/api\/users\/(\d{1,9})$/.exec(p);
    if (um && (m === 'PATCH' || m === 'DELETE')) {
      const u = needUser(req, ['dba']); const t = Q.userId.get(Number(um[1])); if (!t) throw new HttpError(404, 'No such user.');
      if (m === 'DELETE') {
        if (t.id === u.id) throw new HttpError(400, 'You cannot delete your own account.');
        db.prepare('DELETE FROM users WHERE id=?').run(t.id); audit(u.email, 'user_delete', t.email, ip); return json(res, 200, { ok: true });
      }
      const b = await readBody(req, 2 * 1024), changes = [];
      let dept = t.department || '', name = t.name, role = t.role, active = t.active, pass = t.pass, must = t.must_change, bump = false;
      if (b.name !== undefined) { name = clean(b.name, 80); if (!name) throw new HttpError(400, 'Name cannot be empty.'); changes.push('name'); }
      if (b.department !== undefined) { dept = clean(b.department, 60); changes.push('department'); }
      if (b.role !== undefined && b.role !== t.role) {
        if (ROLES.indexOf(b.role) < 0) throw new HttpError(400, 'Role must be one of: ' + ROLES.join(', ') + '.');
        if (t.id === u.id) throw new HttpError(400, 'You cannot change your own role.');
        role = b.role; bump = true; changes.push('role ' + t.role + '>' + role);
      }
      if (b.active !== undefined && !!b.active !== !!t.active) {
        if (t.id === u.id) throw new HttpError(400, 'You cannot disable your own account.');
        active = b.active ? 1 : 0; bump = true; changes.push(active ? 'enabled' : 'disabled');
      }
      if (b.password !== undefined) {
        const w = weakPassword(b.password, t.email); if (w) throw new HttpError(400, w);
        pass = await hashPassword(b.password); must = 1; bump = true; changes.push('password reset');
      }
      db.prepare('UPDATE users SET name=?, role=?, active=?, pass=?, must_change=?, token_ver=token_ver+?, department=? WHERE id=?').run(name, role, active, pass, must, bump ? 1 : 0, dept, t.id);
      audit(u.email, 'user_update', t.email + ': ' + changes.join(', '), ip); return json(res, 200, { ok: true, user: publicUser(Q.userId.get(t.id)) });
    }

    /* ---- Database Administrator: backups, database tools, audit, server ---- */
    if (p === '/api/backups' && m === 'GET') { needUser(req, ['dba']); return json(res, 200, { backups: listBackups() }); }
    if (p === '/api/backups' && m === 'POST') {
      const u = needUser(req, ['dba']); limit(ip, 'backup', 20, 3600e3);
      const name = makeBackup(''); audit(u.email, 'backup_create', name, ip); return json(res, 200, { ok: true, name });
    }
    const bm = /^\/api\/backups\/([A-Za-z0-9-]+\.db)(\/download|\/restore)?$/.exec(p);
    if (bm && BK_RE.test(bm[1])) {
      const u = needUser(req, ['dba']), file = path.join(backupDir, bm[1]);
      if (!fs.existsSync(file)) throw new HttpError(404, 'No such backup.');
      if (bm[2] === '/download' && m === 'GET') {
        audit(u.email, 'backup_download', bm[1], ip); const st = fs.statSync(file);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Content-Disposition': 'attachment; filename="' + bm[1] + '"', 'Cache-Control': 'no-store' });
        return fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      }
      if (!bm[2] && m === 'DELETE') { fs.unlinkSync(file); audit(u.email, 'backup_delete', bm[1], ip); return json(res, 200, { ok: true }); }
      if (bm[2] === '/restore' && m === 'POST') {
        /* restores the CLUB DATA only (members, events, photos list...). Accounts and passwords are never touched. */
        const b = await readBody(req, 1024); if (b.confirm !== 'RESTORE') throw new HttpError(400, 'Confirmation missing.');
        let row; const bdb = new DatabaseSync(file);
        try { row = bdb.prepare("SELECT v FROM kv WHERE k='state'").get(); } catch (e) { row = null; } finally { bdb.close(); }
        if (!row) throw new HttpError(400, 'That backup contains no club data.');
        let st; try { st = JSON.parse(row.v); } catch (e) { throw new HttpError(400, 'That backup is damaged.'); }
        const bad = validState(st); if (bad) throw new HttpError(400, 'That backup is damaged: ' + bad);
        const safety = makeBackup('before-restore');
        Q.setKV.run('state', JSON.stringify(st), now());
        audit(u.email, 'backup_restore', bm[1] + ' (safety copy ' + safety + ')', ip); return json(res, 200, { ok: true, safetyBackup: safety });
      }
    }
    if (p === '/api/db/info' && m === 'GET') {
      needUser(req, ['dba']);
      const size = (f) => { try { return Math.round(fs.statSync(f).size / 1024); } catch (e) { return 0; } };
      const f = path.join(cfg.dataDir, 'mcsc.db'); let kb = 0; try { kb = fs.readdirSync(path.join(cfg.dataDir, 'uploads')).reduce((a, n) => a + size(path.join(cfg.dataDir, 'uploads', n)), 0); } catch (e) { /* ignore */ }
      const st = (() => { const r = Q.getKV.get('state'); return r ? JSON.parse(r.v) : null; })();
      return json(res, 200, {
        file: 'mcsc.db', dbKB: size(f), walKB: size(f + '-wal'), uploadsKB: kb, integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
        tables: ['users', 'kv', 'inbox', 'audit', 'errors'].map((t) => ({ name: t, rows: db.prepare('SELECT COUNT(*) c FROM ' + t).get().c })),
        club: st ? COLLECTIONS.map((k) => ({ name: k, rows: Array.isArray(st[k]) ? st[k].length : 0 })) : [],
        stateVersion: (Q.verKV.get('state') || { version: 0 }).version
      });
    }
    if (p === '/api/db/optimize' && m === 'POST') {
      const u = needUser(req, ['dba']); limit(ip, 'opt', 6, 3600e3);
      db.exec('PRAGMA wal_checkpoint(TRUNCATE); ANALYZE; VACUUM'); audit(u.email, 'db_optimize', null, ip); return json(res, 200, { ok: true });
    }
    if (p === '/api/db/export' && m === 'GET') {
      const u = needUser(req, ['dba']); const r = Q.getKV.get('state');
      const b = Buffer.from(JSON.stringify({ exportedAt: now(), version: r ? r.version : 0, state: r ? JSON.parse(r.v) : null }, null, 2));
      audit(u.email, 'db_export', null, ip);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length, 'Content-Disposition': 'attachment; filename="mcsc-club-data.json"', 'Cache-Control': 'no-store' }); return res.end(b);
    }
    if (p === '/api/audit' && m === 'GET') {
      needUser(req, ['dba']); const lim = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100)), who = clean(url.searchParams.get('actor') || '', 120).toLowerCase();
      const rows = who ? db.prepare('SELECT at,actor,action,detail,ip FROM audit WHERE actor=? ORDER BY id DESC LIMIT ?').all(who, lim) : db.prepare('SELECT at,actor,action,detail,ip FROM audit ORDER BY id DESC LIMIT ?').all(lim);
      return json(res, 200, { audit: rows });
    }
    if (p === '/api/status' && m === 'GET') {
      needUser(req, ['dba']);
      let dbKB = 0; try { dbKB = Math.round(fs.statSync(path.join(cfg.dataDir, 'mcsc.db')).size / 1024); } catch (e) { /* ignore */ }
      return json(res, 200, {
        ok: true, smsAlerts: !!(cfg.sms && cfg.sms.url && alertNumbers().length), smsNumbers: alertNumbers().length, telegramAlerts: tgReady(), emailAlerts: !!getSmtp(), mailError: mailState.lastError, mailOk: mailState.lastOk, version: APP_VERSION, node: process.version, uptimeSec: Math.round((Date.now() - started) / 1000), pid: process.pid,
        memoryMB: Math.round(process.memoryUsage().rss / 1048576), dbKB, loadAvg: os.loadavg()[0],
        counters: { requests: M.req, errors: M.errors, rateLimited: M.rateLimited, loginOk: M.loginOk, loginFail: M.loginFail, contacts: M.contacts, clientErrors: M.clientErrors,
          avgMs: M.durN ? Math.round((M.durSum / M.durN) * 10) / 10 : 0 },
        pendingInbox: db.prepare('SELECT COUNT(*) c FROM inbox').get().c,
        errors: db.prepare('SELECT at,source,message,url,count FROM errors ORDER BY at DESC LIMIT 25').all(),
        audit: db.prepare('SELECT at,actor,action,detail,ip FROM audit ORDER BY id DESC LIMIT 40').all()
      });
    }
    if (p === '/api/metrics' && m === 'GET') {
      const auth = String(req.headers.authorization || ''); const tokenOk = cfg.metricsToken && auth === 'Bearer ' + cfg.metricsToken;
      if (!tokenOk) needUser(req, ['dba']);
      const L = ['# HELP mcsc_http_requests_total HTTP requests by status class', '# TYPE mcsc_http_requests_total counter'];
      Object.keys(M.req).forEach((k) => L.push('mcsc_http_requests_total{status="' + k + '"} ' + M.req[k]));
      L.push('# TYPE mcsc_errors_total counter', 'mcsc_errors_total ' + M.errors, '# TYPE mcsc_rate_limited_total counter', 'mcsc_rate_limited_total ' + M.rateLimited,
        '# TYPE mcsc_logins_total counter', 'mcsc_logins_total{result="ok"} ' + M.loginOk, 'mcsc_logins_total{result="fail"} ' + M.loginFail,
        '# TYPE mcsc_request_duration_ms_sum counter', 'mcsc_request_duration_ms_sum ' + M.durSum.toFixed(1), 'mcsc_request_duration_ms_count ' + M.durN,
        '# TYPE mcsc_uptime_seconds gauge', 'mcsc_uptime_seconds ' + Math.round((Date.now() - started) / 1000),
        '# TYPE mcsc_memory_rss_bytes gauge', 'mcsc_memory_rss_bytes ' + process.memoryUsage().rss, '');
      const b = Buffer.from(L.join('\n')); res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4', 'Content-Length': b.length, 'Cache-Control': 'no-store' }); return res.end(b);
    }
    throw new HttpError(404, 'Not found.');
  }

  /* ------------------------------------------------- static file server */
  const zcache = new Map(); let zbytes = 0;
  function resolveStatic(pathname) {
    let p; try { p = decodeURIComponent(pathname); } catch (e) { return null; }
    if (p.indexOf('\0') >= 0 || p.indexOf('\\') >= 0) return null;
    if (p === '/') p = '/index.html';
    const parts = p.split('/').filter(Boolean); if (!parts.length || parts.some((x) => x.charAt(0) === '.')) return null;
    const ext = path.extname(parts[parts.length - 1]).toLowerCase();
    if (parts.length === 1) return ROOT_FILES.has(parts[0]) ? { file: path.join(cfg.root, parts[0]), kind: 'root' } : null;
    if (parts.length === 2 && parts[0] === 'assets' && ASSET_EXTS.has(ext)) return { file: path.join(cfg.root, 'assets', parts[1]), kind: 'asset' };
    if (parts.length === 2 && parts[0] === 'photos' && ASSET_EXTS.has(ext)) return { file: path.join(cfg.root, 'photos', parts[1]), kind: 'asset' };
    if (parts.length === 2 && parts[0] === 'vendor' && ext === '.js') return { file: path.join(cfg.root, 'vendor', parts[1]), kind: 'asset' };
    if (parts.length === 2 && parts[0] === 'voice' && VOICE_EXTS.has(ext)) return { file: path.join(cfg.root, 'voice', parts[1]), kind: 'asset' };
    if (parts.length === 2 && parts[0] === 'sabiha' && parts[1] === 'sabiha-voice.js') return { file: path.join(cfg.root, 'sabiha', 'sabiha-voice.js'), kind: 'asset' };
    if (parts.length === 2 && parts[0] === 'uploads' && /^[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(parts[1])) return { file: path.join(uploadsDir, parts[1]), kind: 'upload' };
    return null;
  }
  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    const r = resolveStatic(pathname); if (!r) throw new HttpError(404, 'Not found.');
    let st; try { st = await fs.promises.stat(r.file); } catch (e) { throw new HttpError(404, 'Not found.'); }
    if (!st.isFile()) throw new HttpError(404, 'Not found.');
    const ext = path.extname(r.file).toLowerCase();
    const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    const cache = r.kind === 'upload' ? 'public, max-age=31536000, immutable' : r.kind === 'asset' ? 'public, max-age=86400' : ext === '.html' ? 'no-cache' : 'public, max-age=300';
    const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag, 'Last-Modified': st.mtime.toUTCString(), 'Cache-Control': cache, 'Accept-Ranges': 'bytes', Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); return res.end(); }
    const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (rg && (rg[1] || rg[2])) {
      const start = rg[1] === '' ? Math.max(st.size - Number(rg[2]), 0) : Number(rg[1]);
      const end = rg[1] === '' || rg[2] === '' ? st.size - 1 : Math.min(Number(rg[2]), st.size - 1);
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, Object.assign(h, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size, 'Content-Length': end - start + 1 }));
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(r.file, { start, end }).on('error', () => res.destroy()).pipe(res);
    }
    const ae = String(req.headers['accept-encoding'] || '');
    const enc = COMPRESSIBLE.has(ext) && st.size > 1024 ? (/\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : '') : '';
    if (enc) {
      const key = r.file + '|' + etag + '|' + enc; let buf = zcache.get(key);
      if (!buf) {
        const raw = await fs.promises.readFile(r.file);
        buf = enc === 'br' ? await brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : await gzip(raw, { level: 6 });
        if (zbytes + buf.length > 64 * 1048576) { zcache.clear(); zbytes = 0; }
        zcache.set(key, buf); zbytes += buf.length;
      }
      res.writeHead(200, Object.assign(h, { 'Content-Encoding': enc, 'Content-Length': buf.length }));
      return req.method === 'HEAD' ? res.end() : res.end(buf);
    }
    res.writeHead(200, Object.assign(h, { 'Content-Length': st.size }));
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(r.file).on('error', () => res.destroy()).pipe(res);
  }

  /* ---------------------------------------------------------- the server */
  function clientIp(req) {
    if (cfg.trustProxy > 0) {
      const x = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (x.length) return x[Math.max(0, x.length - cfg.trustProxy)];
    }
    return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  }
  /* Inline <script> blocks are allowed only when their exact SHA-256 hash is listed, so an injected script cannot run
     (no 'unsafe-inline' for scripts). Hashes are read from our own HTML files and refreshed when a file changes. */
  const hashCache = new Map();
  function inlineHashes(file, kind) {
    kind = kind || 'script';
    let st; try { st = fs.statSync(file); } catch (e) { return []; }
    const ck = kind + ':' + file, c = hashCache.get(ck); if (c && c.m === st.mtimeMs) return c.h;
    const t = fs.readFileSync(file, 'utf8'), out = []; let i = 0;
    while ((i = t.indexOf('<' + kind, i)) >= 0) {
      const gt = t.indexOf('>', i); if (gt < 0) break; const tag = t.slice(i, gt + 1), end = t.indexOf('</' + kind + '>', gt);
      if (end < 0) break;
      if (kind === 'style' || (!/\ssrc\s*=/i.test(tag) && !/type\s*=\s*["'](?!module|text\/javascript|application\/javascript)/i.test(tag))) out.push("'sha256-" + crypto.createHash('sha256').update(t.slice(gt + 1, end)).digest('base64') + "'");
      i = end + kind.length + 3;
    }
    hashCache.set(ck, { m: st.mtimeMs, h: out }); return out;
  }
  function cspFor(req) {
    let p = '/'; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { /* ignore */ }
    if (p === '/') p = '/index.html';
    const name = p.slice(1), isPage = ROOT_FILES.has(name) && name.endsWith('.html'), hashes = isPage ? inlineHashes(path.join(cfg.root, name)) : [], styleHashes = isPage ? inlineHashes(path.join(cfg.root, name), 'style') : [];
    return "default-src 'self'; script-src 'self' " + hashes.join(' ') + ' ' + THREE_CDN.join(' ') + '; style-src-elem \'self\' ' + styleHashes.join(' ') + '; ' + CSP_REST;
  }
  function securityHeaders(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), payment=(), microphone=(self)');
    const https = req.socket.encrypted || (cfg.trustProxy > 0 && req.headers['x-forwarded-proto'] === 'https');
    res.setHeader('Content-Security-Policy', cspFor(req) + (https ? '; upgrade-insecure-requests' : ''));
    if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const server = http.createServer(async (req, res) => {
    const t0 = process.hrtime.bigint(), id = rid(6), ip = clientIp(req);
    res.setHeader('X-Request-Id', id); securityHeaders(req, res);
    let pathname = '/'; let isHealth = false;
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6, cls = Math.floor(res.statusCode / 100) + 'xx';
      M.req[cls] = (M.req[cls] || 0) + 1; M.durSum += ms; M.durN++;
      if (!isHealth) log.info({ id, m: req.method, p: pathname, s: res.statusCode, ms: Math.round(ms * 10) / 10, ip });
    });
    try {
      const url = new URL(req.url, 'http://x'); pathname = url.pathname; isHealth = pathname === '/api/health';
      if (cfg.forceHttps && cfg.trustProxy > 0 && req.headers['x-forwarded-proto'] === 'http' && !isHealth && (req.method === 'GET' || req.method === 'HEAD') && req.headers.host) {
        res.writeHead(301, { Location: 'https://' + String(req.headers.host).replace(/[^A-Za-z0-9.:\-\[\]]/g, '') + req.url, 'Cache-Control': 'no-store' }); return res.end();
      }
      if (pathname === '/admin') { res.writeHead(302, { Location: '/admin.html' }); return res.end(); }
      if (pathname.startsWith('/api/') || pathname === '/api') await api(req, res, url, ip);
      else await serveStatic(req, res, pathname);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof HttpError) {
        const hd = e.extra.retryAfter ? { 'Retry-After': String(e.extra.retryAfter) } : {};
        if (/^\/api(\/|$)/.test(pathname)) return json(res, e.status, e.extra.mustChange ? { error: e.message, mustChange: true } : e.extra.pending ? { error: e.message, pending: true } : e.extra.photoToken ? { error: e.message, alertId: e.extra.alertId, photoToken: e.extra.photoToken } : { error: e.message }, hd);
        const b = Buffer.from(e.status === 404 ? 'Not found' : e.message); res.writeHead(e.status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': b.length }, hd)); return res.end(b);
      }
      recordError('server', e && e.message, e && e.stack, req.method + ' ' + pathname, req.headers['user-agent']);
      log.error({ id, msg: 'unhandled error', err: e && e.message, stack: e && e.stack, p: pathname });
      return json(res, 500, { error: 'Something went wrong on the server.', requestId: id });
    }
  });
  server.requestTimeout = 120000; server.headersTimeout = 20000; server.keepAliveTimeout = 65000; server.maxHeadersCount = 60;

  return {
    server, db, cfg, ready,
    listen() { return new Promise((resolve) => server.listen(cfg.port, cfg.host, () => resolve(server.address().port))); },
    close() { return new Promise((resolve) => server.close(() => { try { db.close(); } catch (e) { /* ignore */ } log.close(); resolve(); })); }
  };
}

/* ------------------------------------------------------------------ start */
if (require.main === module) {
  loadEnvFile(path.join(__dirname, '.env'));
  const cluster = require('cluster'); const workers = Number(process.env.WEB_CONCURRENCY) || 1;
  if (workers > 1 && cluster.isPrimary) {
    console.log('Starting ' + workers + ' workers');
    for (let i = 0; i < workers; i++) cluster.fork();
    cluster.on('exit', (w) => { console.error('worker ' + w.process.pid + ' exited, restarting'); setTimeout(() => cluster.fork(), 1000); });
  } else {
    const app = createApp();
    process.on('uncaughtException', (e) => { console.error(JSON.stringify({ t: now(), level: 'fatal', msg: e.message, stack: e.stack })); try { app.db.prepare("INSERT INTO errors(at,source,message,stack) VALUES(?,?,?,?)").run(now(), 'server', 'uncaughtException: ' + e.message, String(e.stack).slice(0, 3000)); } catch (x) { /* ignore */ } process.exit(1); });
    process.on('unhandledRejection', (e) => { console.error(JSON.stringify({ t: now(), level: 'error', msg: 'unhandledRejection', err: String(e && e.message || e) })); });
    let closing = false; const bye = () => { if (closing) return; closing = true; app.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 8000).unref(); };
    process.on('SIGTERM', bye); process.on('SIGINT', bye);
    app.listen().then((port) => {
      console.log('Milestone Sports Club is running (v' + APP_VERSION + ', pid ' + process.pid + ').');
      console.log('  On this computer:  http://localhost:' + port);
      Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).forEach((i) => console.log('  On your phone (same Wi-Fi):  http://' + i.address + ':' + port));
      console.log('  Sign in (all roles): http://localhost:' + port + '/admin.html');
    });
  }
}
module.exports = { createApp, hashPassword, verifyPassword, weakPassword, ROLES, EMAIL_RE };
