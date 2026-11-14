'use strict';
/* SMS security alerts (no packages). The site calls an SMS gateway over HTTPS with a URL template from .env:
     SMS_URL=https://your-gateway.example/api?key=YOUR_KEY&to={to}&text={msg}
   {to} becomes the phone number (880XXXXXXXXXX) and {msg} the URL-encoded message. The API key lives only in .env. */
const http = require('http'), https = require('https');

/* Bangladesh mobile numbers: 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX (operator digit 3-9). Returns 8801XXXXXXXXX or null. */
function normalizePhone(v) {
  const m = /^(?:\+?880|0)?(1[3-9]\d{8})$/.exec(String(v || '').replace(/[\s()-]/g, ''));
  return m ? '880' + m[1] : null;
}
/* Messages are plain text on one line, so nothing in them can change the gateway request. */
function cleanText(t, max) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 160); }
function maskEmail(e) { const s = String(e || '?'), i = s.indexOf('@'); return i > 1 ? s[0] + '***' + s.slice(i) : (s.length > 2 ? s[0] + '***' : '***'); }
function buildUrl(tpl, phone, text) {
  return String(tpl).replace(/\{to\}/g, () => encodeURIComponent(phone)).replace(/\{msg\}/g, () => encodeURIComponent(text));
}
/* Only https gateways (plain http is accepted for the local machine, for tests). */
function allowedUrl(u) {
  let x; try { x = new URL(u); } catch (e) { return false; }
  return x.protocol === 'https:' || (x.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname));
}
function sendSms(cfg, text) {
  return new Promise((resolve, reject) => {
    if (!cfg || !cfg.phone || !cfg.url) return reject(new Error('SMS is not configured'));
    const url = buildUrl(cfg.url, cfg.phone, cleanText(text));
    if (!allowedUrl(url)) return reject(new Error('SMS_URL must be an https:// address'));
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { timeout: 10000 }, (res) => {
      res.resume(); // the body is not needed; the address (with the key) is never put in errors or logs
      res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300 ? resolve({ status: res.statusCode }) : reject(new Error('SMS gateway answered ' + res.statusCode))));
    });
    req.on('timeout', () => req.destroy(new Error('SMS gateway timeout')));
    req.on('error', (e) => reject(new Error(String(e.message || e).replace(/https?:\/\/\S+/g, '[url]').slice(0, 120))));
  });
}
module.exports = { normalizePhone, cleanText, maskEmail, buildUrl, allowedUrl, sendSms };
