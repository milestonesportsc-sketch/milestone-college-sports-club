'use strict';
/* Milestone Sports Club: Treasury (membership fees in, money out only with three approvals).
 *
 * What this module does, and what it does NOT do:
 *  - It keeps an append-only, hash-chained LEDGER per wallet (bkash / nagad). The balance is always computed from the ledger.
 *  - Money comes in only when a member payment is VERIFIED: automatically by the payment gateway adapter, or by two different
 *    officials (Treasurer, then President or General Secretary) who both type the amount they see in the real wallet statement.
 *  - Money goes out only through a request that the President, the General Secretary AND the Treasurer have each approved
 *    (each one re-types their password). Nobody can change a request after it is made (it is sealed with a hash).
 *  - Before every payout the server re-checks: freeze flag, the three approvals, ledger integrity, ledger balance, per-payment
 *    and daily limit, and the REAL wallet balance (live from the gateway adapter, or from a recent reconciliation).
 *  - Every step is written to an append-only audit table, in the same database transaction as the step itself:
 *    if the audit row cannot be written, the step does not happen.
 *  - It does NOT hold bKash / Nagad credentials and cannot send money by itself. With the default "manual" adapter, the Treasurer
 *    sends the money from the real wallet after all checks pass and enters the wallet's transaction ID. A real gateway adapter can be
 *    plugged in (see GATEWAY below and DEPLOY.md).
 *
 * GATEWAY adapter (optional; pass createApp({ treasuryGateway })):
 *   { name, async verifyPayment({method, trxId}) -> {found, status:'completed', amount} | null,
 *     async balance(wallet) -> integer taka | null,
 *     async payout({wallet, to, amount, ref}) -> {ref} }
 */
const crypto = require('crypto');

const WALLETS = ['bkash', 'nagad'];
const APPROVER_ROLES = ['president', 'secretary', 'treasurer'];
const VIEW_ROLES = ['president', 'secretary', 'treasurer', 'dba'];
const DAY_OFFSET = 6 * 3600e3; /* Bangladesh day (UTC+6) */
const REQUEST_LIFE_MS = 72 * 3600e3;
const MAX_AMOUNT = 10000000;
const DEFAULTS = { per_tx_limit: '20000', daily_limit: '50000', reconcile_max_age_h: '24', auto_freeze: '1', membership_open: '1', frozen: '0' };

const bdTime = () => new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) + ' (Bangladesh time)';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isMoney = (n) => Number.isSafeInteger(n) && n > 0 && n <= MAX_AMOUNT;
const canon = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));

function setup(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS t_settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS t_payments(id INTEGER PRIMARY KEY, at TEXT NOT NULL, method TEXT NOT NULL CHECK(method IN ('bkash','nagad')), trx_id TEXT NOT NULL,
      amount INTEGER NOT NULL, name TEXT, phone TEXT, roll TEXT, sport TEXT, ip TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed1','verified','rejected')),
      source TEXT, c1_by TEXT, c1_at TEXT, c1_amount INTEGER, c2_by TEXT, c2_at TEXT, ledger_id INTEGER, UNIQUE(method, trx_id));
    CREATE TABLE IF NOT EXISTS t_ledger(id INTEGER PRIMARY KEY, at TEXT NOT NULL, wallet TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('credit','debit')),
      amount INTEGER NOT NULL CHECK(amount > 0), ref_type TEXT, ref_id TEXT, actor TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS t_requests(id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('withdrawal','unfreeze','limits')), payload TEXT NOT NULL,
      hash TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, wallet TEXT, recipient TEXT, status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','approved','executing','executed','rejected','cancelled','expired','failed')), requested_by TEXT NOT NULL, requested_role TEXT NOT NULL,
      idem TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL, executed_at TEXT, executed_by TEXT, gateway_ref TEXT, note TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS t_requests_ref ON t_requests(gateway_ref) WHERE gateway_ref IS NOT NULL;
    CREATE TABLE IF NOT EXISTS t_approvals(id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL, email TEXT NOT NULL, at TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('approve','reject')), req_hash TEXT NOT NULL, UNIQUE(request_id, role), UNIQUE(request_id, user_id));
    CREATE TABLE IF NOT EXISTS t_reconcile(id INTEGER PRIMARY KEY, at TEXT NOT NULL, wallet TEXT NOT NULL, ledger_balance INTEGER NOT NULL, gateway_balance INTEGER NOT NULL,
      diff INTEGER NOT NULL, ok INTEGER NOT NULL, by_user TEXT);
    CREATE TABLE IF NOT EXISTS t_audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT, role TEXT, action TEXT NOT NULL, detail TEXT, ip TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS t_ledger_nu BEFORE UPDATE ON t_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS t_ledger_nd BEFORE DELETE ON t_ledger BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS t_audit_nu BEFORE UPDATE ON t_audit BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS t_audit_nd BEFORE DELETE ON t_audit BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS t_appr_nu BEFORE UPDATE ON t_approvals BEGIN SELECT RAISE(ABORT, 'approvals are final'); END;
    CREATE TRIGGER IF NOT EXISTS t_appr_nd BEFORE DELETE ON t_approvals BEGIN SELECT RAISE(ABORT, 'approvals are final'); END;
    CREATE TRIGGER IF NOT EXISTS t_req_seal BEFORE UPDATE OF payload, hash, amount, wallet, recipient, kind ON t_requests BEGIN SELECT RAISE(ABORT, 'a sealed request cannot be changed'); END;
    CREATE TRIGGER IF NOT EXISTS t_req_nd BEFORE DELETE ON t_requests BEGIN SELECT RAISE(ABORT, 'requests are kept forever'); END;
  `);
}

function createTreasury(ctx) {
  const { db, json, readBody, limit, needUser, HttpError, verifyPassword, now, clean, rl, cfg } = ctx;
  setup(db);
  const adapter = cfg.treasuryGateway || { name: 'manual' };
  let depth = 0;
  const tx = (fn) => {
    if (depth > 0) return fn();
    db.exec('BEGIN IMMEDIATE'); depth++;
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* ignore */ } throw e; } finally { depth--; }
  };

  /* ------------------------------------------------------------ settings */
  const getS = (k) => { const r = db.prepare('SELECT v FROM t_settings WHERE k=?').get(k); return r ? r.v : DEFAULTS[k]; };
  const setS = (k, v) => db.prepare('INSERT INTO t_settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));
  const isFrozen = () => getS('frozen') === '1';
  const limits = () => ({ perTx: Number(getS('per_tx_limit')), daily: Number(getS('daily_limit')) });

  /* ----------------------------------------------- audit and ledger (chained) */
  function tAudit(actor, role, action, detail, ip) {
    tx(() => {
      const last = db.prepare('SELECT hash FROM t_audit ORDER BY id DESC LIMIT 1').get(), prev = last ? last.hash : 'GENESIS', at = now(), d = String(detail || '').slice(0, 500);
      const hash = sha(prev + '|' + JSON.stringify([at, actor || '', role || '', action, d, ip || '']));
      db.prepare('INSERT INTO t_audit(at,actor,role,action,detail,ip,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?)').run(at, actor || null, role || null, action, d, ip || null, prev, hash);
    });
    try { ctx.audit(actor, 'treasury_' + action, detail, ip); } catch (e) { /* main log is a copy; the chained table is the record */ }
  }
  function ledgerAdd(wallet, kind, amount, refType, refId, actor) {
    const last = db.prepare('SELECT hash FROM t_ledger ORDER BY id DESC LIMIT 1').get(), prev = last ? last.hash : 'GENESIS', at = now();
    const hash = sha(prev + '|' + JSON.stringify([at, wallet, kind, amount, refType || '', String(refId || ''), actor || '']));
    return Number(db.prepare('INSERT INTO t_ledger(at,wallet,kind,amount,ref_type,ref_id,actor,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?,?)').run(at, wallet, kind, amount, refType || null, String(refId || ''), actor || null, prev, hash).lastInsertRowid);
  }
  const balance = (wallet) => { const r = db.prepare("SELECT COALESCE(SUM(CASE kind WHEN 'credit' THEN amount ELSE -amount END),0) b FROM t_ledger WHERE wallet=?").get(wallet); return r.b; };
  const reserved = (wallet, exceptId) => db.prepare("SELECT COALESCE(SUM(amount),0) s FROM t_requests WHERE kind='withdrawal' AND wallet=? AND status IN ('pending','approved') AND id<>?").get(wallet, exceptId || 0).s;
  function dayStart() { const s = new Date(Date.now() + DAY_OFFSET).toISOString().slice(0, 10); return new Date(Date.parse(s + 'T00:00:00Z') - DAY_OFFSET).toISOString(); }
  const spentToday = () => db.prepare("SELECT COALESCE(SUM(amount),0) s FROM t_ledger WHERE kind='debit' AND ref_type='withdrawal' AND at>=? AND ref_id NOT IN (SELECT ref_id FROM t_ledger WHERE ref_type='reversal')").get(dayStart()).s;

  function chainCheck() {
    let prev = 'GENESIS', n = 0;
    for (const r of db.prepare('SELECT * FROM t_ledger ORDER BY id').all()) {
      const h = sha(prev + '|' + JSON.stringify([r.at, r.wallet, r.kind, r.amount, r.ref_type || '', String(r.ref_id || ''), r.actor || '']));
      if (r.prev_hash !== prev || r.hash !== h) return { ok: false, where: 'ledger #' + r.id, ledgerRows: n };
      prev = r.hash; n++;
    }
    let pa = 'GENESIS', na = 0;
    for (const r of db.prepare('SELECT * FROM t_audit ORDER BY id').all()) {
      const h = sha(pa + '|' + JSON.stringify([r.at, r.actor || '', r.role || '', r.action, r.detail || '', r.ip || '']));
      if (r.prev_hash !== pa || r.hash !== h) return { ok: false, where: 'audit #' + r.id, ledgerRows: n, auditRows: na };
      pa = r.hash; na++;
    }
    return { ok: true, ledgerRows: n, auditRows: na };
  }

  /* ------------------------------------------------------------- freeze */
  function freeze(actor, role, reason, ip) {
    tx(() => { setS('frozen', '1'); setS('freeze_reason', String(reason || '').slice(0, 300)); setS('freeze_by', actor || 'system'); setS('freeze_at', now()); tAudit(actor || 'system', role || 'system', 'freeze', reason, ip); });
    try { ctx.alert('treasury_frozen', actor || 'system', ip, 'TREASURY FROZEN: ' + reason); } catch (e) { /* ignore */ }
    ctx.notify(['president', 'secretary', 'treasurer', 'dba'], '[TREASURY FROZEN] Milestone Sports Club', 'The club treasury has been frozen. No money can be sent out until it is unfrozen.\n\nWhy: ' + reason + '\nWho: ' + (actor || 'the system') + '\nWhen: ' + bdTime() + '\n\nOpen Treasury to look into it. To unfreeze, the President, the General Secretary and the Treasurer must all approve.');
  }
  const autoFreeze = (reason) => { if (getS('auto_freeze') === '1' && !isFrozen()) freeze('system', 'system', reason, null); };

  /* ---------------------------------------------------------- helpers */
  function recheckPassword(u, pw, ip) {
    const key = 'tpw:' + u.id, st = rl.peek(key, 5);
    if (!st.ok) throw new HttpError(429, 'Too many wrong passwords. Wait 15 minutes.');
    return verifyPassword(typeof pw === 'string' ? pw : '', u.pass).then((ok) => {
      if (!ok) { rl.hit(key, 5, 15 * 60e3); tAudit(u.email, u.role, 'bad_password', 'password re-entry failed', ip); throw new HttpError(403, 'Wrong password.'); }
      rl.clear(key);
    });
  }
  const cleanRequest = (r) => r && ({ id: r.id, at: r.at, kind: r.kind, payload: JSON.parse(r.payload), amount: r.amount, wallet: r.wallet, status: r.status, requestedBy: r.requested_by, requestedRole: r.requested_role, expires: new Date(r.expires).toISOString(), executedAt: r.executed_at, executedBy: r.executed_by, gatewayRef: r.gateway_ref, note: r.note,
    approvals: db.prepare('SELECT role,email,at,decision FROM t_approvals WHERE request_id=? ORDER BY id').all(r.id) });
  function expireOld() { db.prepare("UPDATE t_requests SET status='expired' WHERE status IN ('pending','approved') AND expires<?").run(Date.now()); }
  const getReq = (id) => db.prepare('SELECT * FROM t_requests WHERE id=?').get(id);
  const feeNow = () => { try { const r = db.prepare("SELECT v FROM kv WHERE k='state'").get(); const s = r && JSON.parse(r.v).settings; if (s && Number(s.fee) > 0) return Math.round(Number(s.fee)); } catch (e) { /* fall through */ } return cfg.defaultFee; };
  const siteNumbers = () => { try { const r = db.prepare("SELECT v FROM kv WHERE k='state'").get(); const s = r && JSON.parse(r.v).settings || {}; return { bkash: String(s.bkash || ''), nagad: String(s.nagad || '') }; } catch (e) { return { bkash: '', nagad: '' }; } };

  /* ------------------------------------------------------ public routes */
  async function publicPay(req, res, ip) {
    limit(ip, 'tpay', 8, 3600e3, 'Too many submissions from this network. Try again later.');
    const b = await readBody(req, 8 * 1024);
    if (getS('membership_open') !== '1') throw new HttpError(403, 'Membership and fee payment are closed right now.');
    const name = clean(b.name, 80), roll = clean(b.roll, 40), phone = clean(b.phone, 20), sport = clean(b.sport, 40), method = String(b.method || '').toLowerCase(), trx = String(b.trxId || '').toUpperCase().trim();
    if (!name || !roll) throw new HttpError(400, 'Please enter your name and class/roll.');
    if (!/^01[3-9]\d{8}$/.test(phone)) throw new HttpError(400, 'Enter a valid 11-digit Bangladeshi mobile number.');
    if (WALLETS.indexOf(method) < 0) throw new HttpError(400, 'Choose bKash or Nagad.');
    if (!/^[A-Z0-9]{8,20}$/.test(trx)) throw new HttpError(400, 'Enter the transaction ID from your payment SMS (letters and numbers only).');
    const fee = feeNow();
    try {
      tx(() => {
        const id = Number(db.prepare('INSERT INTO t_payments(at,method,trx_id,amount,name,phone,roll,sport,ip) VALUES(?,?,?,?,?,?,?,?,?)').run(now(), method, trx, fee, name, phone, roll, sport, ip || null).lastInsertRowid);
        db.prepare('INSERT INTO inbox(kind,body,created) VALUES(?,?,?)').run('join', JSON.stringify({ id: 'w' + id + '-' + crypto.randomBytes(3).toString('hex'), name, roll, phone, sport, status: 'Pending', joined: now().slice(0, 10), source: 'website', trx }), now());
        tAudit('public', 'member', 'payment_submitted', method + ' ' + trx + ' ' + fee + ' by ' + name, ip);
      });
    } catch (e) { if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, 'This transaction ID has already been submitted.'); throw e; }
    return json(res, 200, { ok: true, message: 'Received. The club will check it against the real ' + method + ' statement. Your membership starts after that check.' });
  }

  /* -------------------------------------------------------------- views */
  function overview() {
    expireOld();
    const lim = limits(), rec = {};
    WALLETS.forEach((w) => { rec[w] = db.prepare('SELECT at,ledger_balance,gateway_balance,diff,ok FROM t_reconcile WHERE wallet=? ORDER BY id DESC LIMIT 1').get(w) || null; });
    return { frozen: isFrozen(), freezeReason: isFrozen() ? getS('freeze_reason') : '', freezeBy: isFrozen() ? getS('freeze_by') : '', freezeAt: isFrozen() ? getS('freeze_at') : '',
      membershipOpen: getS('membership_open') === '1', limits: lim, spentToday: spentToday(), reconcileMaxAgeHours: Number(getS('reconcile_max_age_h')), autoFreeze: getS('auto_freeze') === '1',
      gateway: adapter.name || 'manual', liveBalance: typeof adapter.balance === 'function', liveVerify: typeof adapter.verifyPayment === 'function',
      balances: { bkash: balance('bkash'), nagad: balance('nagad'), total: balance('bkash') + balance('nagad') }, reservedByRequests: { bkash: reserved('bkash'), nagad: reserved('nagad') },
      pendingPayments: db.prepare("SELECT COUNT(*) c FROM t_payments WHERE status IN ('pending','confirmed1')").get().c,
      openRequests: db.prepare("SELECT COUNT(*) c FROM t_requests WHERE status IN ('pending','approved','executing')").get().c, lastReconcile: rec, approverRoles: APPROVER_ROLES };
  }

  /* ----------------------------------------------- incoming payments */
  async function verifyPayment(u, id, b, ip) {
    if (['treasurer', 'president', 'secretary'].indexOf(u.role) < 0) throw new HttpError(403, 'You do not have permission to do that.');
    await recheckPassword(u, b.password, ip);
    const p0 = db.prepare('SELECT * FROM t_payments WHERE id=?').get(id); if (!p0) throw new HttpError(404, 'No such payment.');
    if (p0.status === 'verified' || p0.status === 'rejected') throw new HttpError(409, 'This payment is already ' + p0.status + '.');
    if (typeof adapter.verifyPayment === 'function' && p0.status === 'pending') {
      let g; try { g = await adapter.verifyPayment({ method: p0.method, trxId: p0.trx_id }); } catch (e) { throw new HttpError(502, 'The payment gateway could not be reached. Try again.'); }
      if (g && g.found) {
        if (g.status !== 'completed' || !isMoney(g.amount)) throw new HttpError(409, 'The gateway says this transaction is not a completed payment.');
        return tx(() => {
          const p = db.prepare('SELECT * FROM t_payments WHERE id=?').get(id); if (p.status !== 'pending') throw new HttpError(409, 'This payment changed meanwhile.');
          const lid = ledgerAdd(p.method, 'credit', g.amount, 'payment', p.id, 'gateway');
          db.prepare("UPDATE t_payments SET status='verified', source='gateway', amount=?, ledger_id=?, c2_by=?, c2_at=? WHERE id=?").run(g.amount, lid, u.email, now(), id);
          tAudit(u.email, u.role, 'payment_verified_gateway', p.method + ' ' + p.trx_id + ' ' + g.amount, ip); return { status: 'verified', amount: g.amount };
        });
      }
      throw new HttpError(404, 'The gateway has no completed transaction with that ID. Do not accept it.');
    }
    /* manual: two different officials must each type the amount from the real statement */
    const amount = Number(b.amount); if (!isMoney(amount)) throw new HttpError(400, 'Type the amount shown in the real ' + p0.method + ' statement.');
    const r2 = tx(() => {
      const p = db.prepare('SELECT * FROM t_payments WHERE id=?').get(id);
      if (p.status === 'pending') {
        if (u.role !== 'treasurer') throw new HttpError(403, 'The Treasurer does the first check. The President or General Secretary does the second.');
        db.prepare("UPDATE t_payments SET status='confirmed1', c1_by=?, c1_at=?, c1_amount=? WHERE id=?").run(u.email, now(), amount, id);
        tAudit(u.email, u.role, 'payment_check_1', p.method + ' ' + p.trx_id + ' ' + amount, ip); return { status: 'confirmed1' };
      }
      if (u.role === 'treasurer' || u.email === p.c1_by) throw new HttpError(403, 'The second check must come from the President or General Secretary.');
      if (amount !== p.c1_amount) { tAudit(u.email, u.role, 'payment_amount_mismatch', p.method + ' ' + p.trx_id + ' first ' + p.c1_amount + ' second ' + amount, ip); return { mismatch: true }; }
      const lid = ledgerAdd(p.method, 'credit', amount, 'payment', p.id, u.email);
      db.prepare("UPDATE t_payments SET status='verified', source='manual', amount=?, ledger_id=?, c2_by=?, c2_at=? WHERE id=?").run(amount, lid, u.email, now(), id);
      tAudit(u.email, u.role, 'payment_verified_manual', p.method + ' ' + p.trx_id + ' ' + amount + ' (1st ' + p.c1_by + ')', ip); return { status: 'verified', amount };
    });
    if (r2.mismatch) throw new HttpError(409, 'The two officials typed different amounts. Check the real statement again.');
    return r2;
  }

  /* -------------------------------------------------- reconciliation */
  async function reconcile(u, b, ip) {
    if (['treasurer', 'president', 'secretary'].indexOf(u.role) < 0) throw new HttpError(403, 'You do not have permission to do that.');
    await recheckPassword(u, b.password, ip);
    const wallet = String(b.wallet || ''); if (WALLETS.indexOf(wallet) < 0) throw new HttpError(400, 'Choose bKash or Nagad.');
    let gb = Number(b.gatewayBalance);
    if (typeof adapter.balance === 'function') { try { const live = await adapter.balance(wallet); if (Number.isSafeInteger(live)) gb = live; } catch (e) { throw new HttpError(502, 'The payment gateway could not be reached.'); } }
    if (!Number.isSafeInteger(gb) || gb < 0 || gb > 1e9) throw new HttpError(400, 'Type the real wallet balance (whole taka).');
    const out = tx(() => {
      const lb = balance(wallet), diff = gb - lb, ok = diff >= 0 ? 1 : 0;
      db.prepare('INSERT INTO t_reconcile(at,wallet,ledger_balance,gateway_balance,diff,ok,by_user) VALUES(?,?,?,?,?,?,?)').run(now(), wallet, lb, gb, diff, ok, u.email);
      tAudit(u.email, u.role, ok ? 'reconcile_ok' : 'reconcile_MISMATCH', wallet + ' ledger ' + lb + ' real ' + gb + ' diff ' + diff, ip);
      return { wallet, ledgerBalance: lb, gatewayBalance: gb, diff, ok: !!ok, note: diff > 0 ? 'The real wallet holds ' + diff + ' more than the ledger: payments not recorded yet.' : diff < 0 ? 'MONEY IS MISSING: the ledger says more than the real wallet holds.' : 'Matches.' };
    });
    if (!out.ok) autoFreeze('Reconciliation mismatch on ' + wallet + ': ledger ' + out.ledgerBalance + ', real wallet ' + out.gatewayBalance);
    return out;
  }

  /* ------------------------------------------------------- requests */
  async function createRequest(u, b, ip) {
    if (APPROVER_ROLES.indexOf(u.role) < 0) throw new HttpError(403, 'Only the President, General Secretary or Treasurer can start this.');
    limit(ip, 'treq', 20, 3600e3);
    const idem = String(b.idempotencyKey || ''); if (!/^[A-Za-z0-9_-]{16,64}$/.test(idem)) throw new HttpError(400, 'idempotencyKey (16-64 letters/numbers) is required.');
    const old = db.prepare('SELECT * FROM t_requests WHERE idem=?').get(idem); if (old) return { duplicate: true, request: cleanRequest(old) };
    const kind = String(b.kind || 'withdrawal'); let payload, amount = 0, wallet = null, recipient = null;
    if (kind === 'withdrawal') {
      wallet = String(b.wallet || ''); amount = Number(b.amount); recipient = String(b.to || '').trim(); const purpose = clean(b.purpose, 200);
      if (WALLETS.indexOf(wallet) < 0) throw new HttpError(400, 'Choose bKash or Nagad.');
      if (!isMoney(amount)) throw new HttpError(400, 'Amount must be a whole number of taka, more than 0.');
      if (!/^01[3-9]\d{8}$/.test(recipient)) throw new HttpError(400, 'Recipient must be an 11-digit mobile number.');
      if (purpose.length < 5) throw new HttpError(400, 'Write the reason for this payment (at least 5 letters).');
      payload = { wallet, amount, to: recipient, purpose };
    } else if (kind === 'unfreeze') {
      if (!isFrozen()) throw new HttpError(409, 'The treasury is not frozen.');
      const reason = clean(b.reason, 200); if (reason.length < 5) throw new HttpError(400, 'Write why it is safe to unfreeze.');
      payload = { reason };
    } else if (kind === 'limits') {
      const perTx = Number(b.perTx), daily = Number(b.daily);
      if (!isMoney(perTx) || !isMoney(daily) || perTx > daily) throw new HttpError(400, 'Limits must be whole taka and the one-time limit cannot be more than the daily limit.');
      payload = { perTx, daily }; amount = 0;
    } else throw new HttpError(400, 'Unknown request type.');
    const out = tx(() => {
      expireOld();
      if (kind === 'withdrawal') {
        if (isFrozen()) throw new HttpError(423, 'The treasury is frozen. No new payment requests.');
        if (amount > limits().perTx) throw new HttpError(409, 'This is more than the one-time limit (৳' + limits().perTx + ').');
        if (amount > balance(wallet) - reserved(wallet)) throw new HttpError(409, 'Not enough balance in the ' + wallet + ' ledger (after payments already waiting).');
        const dup = db.prepare("SELECT id FROM t_requests WHERE kind='withdrawal' AND wallet=? AND recipient=? AND amount=? AND status NOT IN ('rejected','cancelled','expired','failed') AND at>?").get(wallet, recipient, amount, new Date(Date.now() - 24 * 3600e3).toISOString());
        if (dup) throw new HttpError(409, 'The same amount to the same number was already requested in the last 24 hours (request #' + dup.id + '). Possible double payment.');
      } else if (db.prepare("SELECT id FROM t_requests WHERE kind=? AND status='pending'").get(kind)) throw new HttpError(409, 'A request of this type is already waiting.');
      const hash = sha(canon(Object.assign({ kind }, payload)) + '|' + idem);
      const id = Number(db.prepare('INSERT INTO t_requests(at,kind,payload,hash,amount,wallet,recipient,requested_by,requested_role,idem,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(now(), kind, JSON.stringify(payload), hash, amount, wallet, recipient, u.email, u.role, idem, Date.now() + REQUEST_LIFE_MS).lastInsertRowid);
      tAudit(u.email, u.role, 'request_created', '#' + id + ' ' + kind + ' ' + JSON.stringify(payload), ip); return id;
    });
    ctx.notify(APPROVER_ROLES, '[APPROVAL NEEDED] Treasury request #' + out, u.email + ' made a ' + ({ withdrawal: 'payment', unfreeze: 'unfreeze', limits: 'limit change' }[kind]) + ' request.\n\n' + Object.keys(payload).map((k) => k + ': ' + payload[k]).join('\n') + '\n\nOpen Treasury to approve or reject it. Nothing happens until the President, the General Secretary and the Treasurer have all approved.');
    return { request: cleanRequest(getReq(out)) };
  }

  async function decide(u, id, approve, b, ip) {
    if (APPROVER_ROLES.indexOf(u.role) < 0) throw new HttpError(403, 'Only the President, General Secretary or Treasurer can decide.');
    if (approve) await recheckPassword(u, b.password, ip);
    const res = tx(() => {
      expireOld();
      const q = getReq(id); if (!q) throw new HttpError(404, 'No such request.');
      if (q.status !== 'pending') throw new HttpError(409, 'This request is ' + q.status + '.');
      if (db.prepare('SELECT 1 x FROM t_approvals WHERE request_id=? AND (role=? OR user_id=?)').get(id, u.role, u.id)) throw new HttpError(409, 'You already decided on this request.');
      if (approve && q.kind !== 'unfreeze' && isFrozen()) throw new HttpError(423, 'The treasury is frozen.');
      db.prepare('INSERT INTO t_approvals(request_id,user_id,role,email,at,decision,req_hash) VALUES(?,?,?,?,?,?,?)').run(id, u.id, u.role, u.email, now(), approve ? 'approve' : 'reject', q.hash);
      if (!approve) {
        db.prepare("UPDATE t_requests SET status='rejected', note=? WHERE id=?").run(clean(b.reason, 200) || 'rejected', id);
        tAudit(u.email, u.role, 'request_rejected', '#' + id + ' ' + (clean(b.reason, 200) || ''), ip); return 'rejected';
      }
      tAudit(u.email, u.role, 'request_approved', '#' + id + ' by ' + u.role, ip);
      const n = db.prepare("SELECT COUNT(*) c FROM t_approvals WHERE request_id=? AND decision='approve'").get(id).c;
      if (n < 3) return 'pending';
      const pl = JSON.parse(q.payload);
      if (q.kind === 'withdrawal') {
        if (q.amount > balance(q.wallet) - reserved(q.wallet, id)) throw new HttpError(409, 'Not enough balance any more for this payment.');
        db.prepare("UPDATE t_requests SET status='approved' WHERE id=?").run(id); tAudit('system', 'system', 'request_fully_approved', '#' + id + ' waiting for payout', ip); return 'approved';
      }
      if (q.kind === 'unfreeze') { setS('frozen', '0'); db.prepare("UPDATE t_requests SET status='executed', executed_at=?, executed_by='3-approvals' WHERE id=?").run(now(), id); tAudit('system', 'system', 'unfrozen', '#' + id + ' ' + pl.reason, ip); return 'executed'; }
      setS('per_tx_limit', pl.perTx); setS('daily_limit', pl.daily); db.prepare("UPDATE t_requests SET status='executed', executed_at=?, executed_by='3-approvals' WHERE id=?").run(now(), id);
      tAudit('system', 'system', 'limits_changed', '#' + id + ' one-time ' + pl.perTx + ', daily ' + pl.daily, ip); return 'executed';
    });
    return { status: res, request: cleanRequest(getReq(id)) };
  }

  async function execute(u, id, b, ip) {
    if (['treasurer', 'president'].indexOf(u.role) < 0) throw new HttpError(403, 'Only the Treasurer or the President records the payout.');
    await recheckPassword(u, b.password, ip);
    const q0 = getReq(id); if (!q0 || q0.kind !== 'withdrawal') throw new HttpError(404, 'No such payment request.');
    let live = null;
    if (typeof adapter.balance === 'function') { try { live = await adapter.balance(q0.wallet); } catch (e) { throw new HttpError(502, 'The payment gateway could not be reached, so the real balance could not be checked. Nothing was paid.'); } if (!Number.isSafeInteger(live)) live = null; }
    const auto = typeof adapter.payout === 'function';
    let ref = String(b.gatewayRef || '').toUpperCase().trim();
    if (!auto && !/^[A-Z0-9]{6,30}$/.test(ref)) throw new HttpError(400, 'After sending the money from the real wallet, type that wallet\'s transaction ID.');
    const out = tx(() => {
      expireOld();
      const q = getReq(id);
      const stop = (status, msg, frz) => ({ stop: { status, msg, frz } });
      if (q.status !== 'approved') return stop(409, q.status === 'executed' || q.status === 'executing' ? 'This payment was already made. It cannot be made twice.' : 'This request is ' + q.status + ', not approved.');
      if (isFrozen()) return stop(423, 'The treasury is frozen. Nothing was paid.');
      if (sha(canon(Object.assign({ kind: q.kind }, JSON.parse(q.payload))) + '|' + q.idem) !== q.hash) return stop(409, 'The request does not match its seal. Nothing was paid.', 'Request #' + id + ' does not match its sealed hash');
      const ap = db.prepare("SELECT a.*, u.active, u.role urole FROM t_approvals a LEFT JOIN users u ON u.id=a.user_id WHERE a.request_id=? AND a.decision='approve'").all(id);
      const okRoles = new Set(ap.filter((a) => a.req_hash === q.hash && a.active === 1 && a.urole === a.role).map((a) => a.role));
      if (APPROVER_ROLES.some((r) => !okRoles.has(r))) return stop(409, 'The three approvals are no longer all valid (an approver was disabled or changed role). Ask for a new request.');
      const ch = chainCheck(); if (!ch.ok) return stop(409, 'The ledger failed its integrity check. Nothing was paid.', 'Integrity check failed at ' + ch.where);
      const bal = balance(q.wallet); if (q.amount > bal) return stop(409, 'The ' + q.wallet + ' ledger holds ৳' + bal + ', less than ৳' + q.amount + '.');
      const lim = limits(); if (q.amount > lim.perTx) return stop(409, 'More than the one-time limit (৳' + lim.perTx + ').');
      const spent = spentToday(); if (spent + q.amount > lim.daily) return stop(409, 'This would pass the daily limit (৳' + lim.daily + '; already paid today ৳' + spent + ').');
      if (live !== null) {
        if (live < q.amount) return stop(409, 'The REAL ' + q.wallet + ' wallet holds only ৳' + live + '. Nothing was paid.', 'Real ' + q.wallet + ' balance ' + live + ' is lower than the payout ' + q.amount);
        if (live < bal) return stop(409, 'The real wallet (৳' + live + ') holds less than the ledger (৳' + bal + '). Nothing was paid.', 'Real ' + q.wallet + ' balance ' + live + ' is lower than ledger ' + bal);
      } else {
        const rc = db.prepare('SELECT * FROM t_reconcile WHERE wallet=? ORDER BY id DESC LIMIT 1').get(q.wallet), maxAge = Number(getS('reconcile_max_age_h')) * 3600e3;
        if (!rc || !rc.ok || Date.now() - Date.parse(rc.at) > maxAge) return stop(409, 'Compare the real ' + q.wallet + ' wallet balance first (Reconcile). The last comparison is missing, failed or older than ' + getS('reconcile_max_age_h') + ' hours.');
        const out2 = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM t_ledger WHERE wallet=? AND kind='debit' AND at>?").get(q.wallet, rc.at).s;
        if (rc.gateway_balance - out2 < q.amount) return stop(409, 'After the last real balance check (৳' + rc.gateway_balance + ') and payouts since (৳' + out2 + '), the wallet is not known to hold ৳' + q.amount + '. Reconcile again.');
      }
      if (!auto && db.prepare('SELECT 1 x FROM t_requests WHERE gateway_ref=?').get(ref)) return stop(409, 'That wallet transaction ID is already attached to another payout.');
      const lid = ledgerAdd(q.wallet, 'debit', q.amount, 'withdrawal', q.id, u.email);
      db.prepare('UPDATE t_requests SET status=?, executed_at=?, executed_by=?, gateway_ref=? WHERE id=?').run(auto ? 'executing' : 'executed', now(), u.email, auto ? null : ref, id);
      tAudit(u.email, u.role, auto ? 'payout_started' : 'payout_recorded', '#' + id + ' ' + q.wallet + ' ' + q.amount + ' to ' + q.recipient + (auto ? '' : ' ref ' + ref) + ' ledger #' + lid, ip);
      return { q };
    });
    if (out.stop) {
      tAudit(u.email, u.role, 'payout_blocked', '#' + id + ': ' + out.stop.msg, ip);
      if (out.stop.frz) autoFreeze(out.stop.frz);
      throw new HttpError(out.stop.status, out.stop.msg, { blocked: true });
    }
    const q = out.q;
    if (auto) {
      try {
        const r = await adapter.payout({ wallet: q.wallet, to: q.recipient, amount: q.amount, ref: 'MCSC-' + q.id });
        tx(() => { db.prepare("UPDATE t_requests SET status='executed', gateway_ref=? WHERE id=?").run(String(r && r.ref || 'MCSC-' + q.id).toUpperCase(), id); tAudit(u.email, u.role, 'payout_done', '#' + id + ' ref ' + (r && r.ref), ip); });
      } catch (e) {
        tx(() => { ledgerAdd(q.wallet, 'credit', q.amount, 'reversal', q.id, 'system'); db.prepare("UPDATE t_requests SET status='failed', note=? WHERE id=?").run(String(e.message || 'payout failed').slice(0, 150), id); tAudit(u.email, u.role, 'payout_failed_reversed', '#' + id + ' ' + String(e.message).slice(0, 150), ip); });
        throw new HttpError(502, 'The gateway refused the payout. The ledger was restored. Check the wallet before trying again.');
      }
    }
    return { ok: true, request: cleanRequest(getReq(id)) };
  }

  /* -------------------------------------------------------------- router */
  async function handle(req, res, url, ip, p, m) {
    const sub = p.slice('/api/treasury'.length) || '/';
    if (sub === '/public' && m === 'GET') { const n = siteNumbers(); return json(res, 200, { open: getS('membership_open') === '1', fee: feeNow(), methods: ['bkash', 'nagad'], bkash: n.bkash, nagad: n.nagad }); }
    if (sub === '/pay' && m === 'POST') return publicPay(req, res, ip);
    const u = needUser(req, VIEW_ROLES); limit(ip, 'treasury', 120, 60e3);
    if (sub === '/overview' && m === 'GET') return json(res, 200, overview());
    if (sub === '/payments' && m === 'GET') return json(res, 200, { payments: db.prepare('SELECT id,at,method,trx_id,amount,name,phone,roll,sport,status,source,c1_by,c2_by FROM t_payments ORDER BY id DESC LIMIT 300').all() });
    if (sub === '/ledger' && m === 'GET') return json(res, 200, { ledger: db.prepare('SELECT id,at,wallet,kind,amount,ref_type,ref_id,actor FROM t_ledger ORDER BY id DESC LIMIT 300').all() });
    if (sub === '/audit' && m === 'GET') return json(res, 200, { audit: db.prepare('SELECT id,at,actor,role,action,detail,ip FROM t_audit ORDER BY id DESC LIMIT ?').all(Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))) });
    if (sub === '/integrity' && m === 'GET') { const r = chainCheck(); if (!r.ok) autoFreeze('Integrity check failed at ' + r.where); return json(res, 200, r); }
    if (sub === '/requests' && m === 'GET') { expireOld(); return json(res, 200, { requests: db.prepare('SELECT * FROM t_requests ORDER BY id DESC LIMIT 100').all().map(cleanRequest) }); }
    if (m !== 'POST') throw new HttpError(404, 'Not found');
    const b = await readBody(req, 8 * 1024);
    if (sub === '/requests') return json(res, 200, Object.assign({ ok: true }, await createRequest(u, b, ip)));
    let x;
    if ((x = /^\/requests\/(\d{1,9})\/(approve|reject|execute|cancel)$/.exec(sub))) {
      const id = Number(x[1]);
      if (x[2] === 'approve') return json(res, 200, Object.assign({ ok: true }, await decide(u, id, true, b, ip)));
      if (x[2] === 'reject') return json(res, 200, Object.assign({ ok: true }, await decide(u, id, false, b, ip)));
      if (x[2] === 'execute') return json(res, 200, await execute(u, id, b, ip));
      tx(() => { const q = getReq(id); if (!q) throw new HttpError(404, 'No such request.'); if (q.requested_by !== u.email) throw new HttpError(403, 'Only the person who made the request can cancel it.'); if (['pending', 'approved'].indexOf(q.status) < 0) throw new HttpError(409, 'This request is ' + q.status + '.'); db.prepare("UPDATE t_requests SET status='cancelled' WHERE id=?").run(id); tAudit(u.email, u.role, 'request_cancelled', '#' + id, ip); });
      return json(res, 200, { ok: true });
    }
    if ((x = /^\/payments\/(\d{1,9})\/(verify|reject)$/.exec(sub))) {
      if (x[2] === 'verify') return json(res, 200, Object.assign({ ok: true }, await verifyPayment(u, Number(x[1]), b, ip)));
      if (['treasurer', 'president', 'secretary'].indexOf(u.role) < 0) throw new HttpError(403, 'You do not have permission to do that.');
      tx(() => { const r = db.prepare("UPDATE t_payments SET status='rejected' WHERE id=? AND status IN ('pending','confirmed1')").run(Number(x[1])); if (!r.changes) throw new HttpError(409, 'This payment cannot be rejected.'); tAudit(u.email, u.role, 'payment_rejected', '#' + x[1] + ' ' + clean(b.reason, 150), ip); });
      return json(res, 200, { ok: true });
    }
    if (sub === '/reconcile') return json(res, 200, Object.assign({ ok: true }, await reconcile(u, b, ip)));
    if (sub === '/freeze') {
      if (!isFrozen()) freeze(u.email, u.role, clean(b.reason, 200) || 'frozen by ' + u.role, ip);
      return json(res, 200, { ok: true, frozen: true });
    }
    if (sub === '/membership') {
      if (['president', 'dba'].indexOf(u.role) < 0) throw new HttpError(403, 'Only the President or the Database Administrator can switch membership on or off.');
      if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false.');
      await recheckPassword(u, b.password, ip);
      tx(() => { setS('membership_open', b.enabled ? '1' : '0'); tAudit(u.email, u.role, b.enabled ? 'membership_on' : 'membership_off', 'new admissions and fee payments ' + (b.enabled ? 'open' : 'closed') + '; old records untouched', ip); });
      return json(res, 200, { ok: true, membershipOpen: b.enabled });
    }
    throw new HttpError(404, 'Not found');
  }

  return { handle, freeze, overview, chainCheck };
}

module.exports = { createTreasury, WALLETS, APPROVER_ROLES };
