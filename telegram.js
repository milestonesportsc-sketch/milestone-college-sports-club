'use strict';
/* Telegram bot alerts (no packages): the only way to put the intruder's PHOTO straight on a phone, because SMS cannot carry pictures.
   Create a bot with @BotFather, paste its token in dba.html > Security, then send /start to the bot from each phone. */
const http = require('http'), https = require('https'), crypto = require('crypto');

const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/, CHAT_RE = /^-?\d{4,20}$/;
/* API address can be changed for tests (plain http only for this machine). */
function base() { const b = process.env.TELEGRAM_API_BASE; return b && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(b) ? b : 'https://api.telegram.org'; }
const scrub = (m) => String(m || '').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[token]').replace(/https?:\/\/\S+/g, '[url]').slice(0, 140);

function request(token, method, body, headers) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(base() + '/bot' + token + '/' + method); } catch (e) { return reject(new Error('Bad Telegram address')); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'POST', headers: Object.assign({ 'Content-Length': Buffer.byteLength(body) }, headers), timeout: 15000 }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c));
      res.on('end', () => { let j = {}; try { j = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (e) { /* ignore */ } if (j.ok) resolve(j.result); else reject(new Error('Telegram: ' + scrub(j.description || ('HTTP ' + res.statusCode)))); });
    });
    req.on('timeout', () => req.destroy(new Error('Telegram timeout')));
    req.on('error', (e) => reject(new Error(scrub(e.message))));
    req.end(body);
  });
}
const call = (token, method, obj) => request(token, method, JSON.stringify(obj || {}), { 'Content-Type': 'application/json' });
const sendMessage = (token, chat, text) => call(token, 'sendMessage', { chat_id: chat, text: String(text).slice(0, 3500), disable_web_page_preview: true });
function sendPhoto(token, chat, jpeg, caption) {
  const bd = '----msc' + crypto.randomBytes(12).toString('hex'), field = (n, v) => Buffer.from('--' + bd + '\r\nContent-Disposition: form-data; name="' + n + '"\r\n\r\n' + v + '\r\n');
  const body = Buffer.concat([field('chat_id', chat), field('caption', String(caption).slice(0, 900)),
    Buffer.from('--' + bd + '\r\nContent-Disposition: form-data; name="photo"; filename="intruder.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'), jpeg, Buffer.from('\r\n--' + bd + '--\r\n')]);
  return request(token, 'sendPhoto', body, { 'Content-Type': 'multipart/form-data; boundary=' + bd });
}
const getMe = (token) => call(token, 'getMe');
/* chats that have written to the bot: lets the administrator find each phone's chat id without typing numbers by hand */
async function findChats(token) {
  const up = await call(token, 'getUpdates', { limit: 100, timeout: 0 }), seen = new Map();
  (up || []).forEach((u) => { const c = (u.message || u.edited_message || {}).chat; if (c && c.type === 'private') seen.set(String(c.id), [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || 'Telegram user'); });
  return Array.from(seen, ([id, name]) => ({ id, name }));
}
module.exports = { TOKEN_RE, CHAT_RE, sendMessage, sendPhoto, getMe, findChats, scrub };
