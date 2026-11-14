'use strict';
/* Tiny SMTP client (no packages). Port 465 = TLS from the start; other ports use STARTTLS when the server offers it.
   Configure with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env. Works with Gmail (use an "App password"), Brevo, Mailgun, etc. */
const net = require('net'), tls = require('tls');

function sendMail(cfg, to, subject, text, attachments) {
  return new Promise((resolve, reject) => {
    let sock, buf = '', step = 0, done = false, secured = false, exts = '';
    const timer = setTimeout(() => fail(new Error('SMTP timeout')), 20000);
    const fail = (e) => { if (done) return; done = true; clearTimeout(timer); try { sock && sock.destroy(); } catch (x) { /* ignore */ } reject(e); };
    const ok = () => { if (done) return; done = true; clearTimeout(timer); try { sock.end(); } catch (x) { /* ignore */ } resolve(); };
    const send = (l) => sock.write(l + '\r\n');
    const b64 = (s) => Buffer.from(s).toString('base64');
    const safe = (s) => String(s).replace(/[\r\n]+/g, ' ');
    const from = cfg.from || cfg.user, fromAddr = (/<([^>]+)>/.exec(from) || [null, from])[1];
    const wrap = (s) => s.replace(/(.{76})/g, '$1\r\n');
    const head = ['From: ' + safe(from), 'To: ' + safe(to), 'Subject: ' + safe(subject), 'Date: ' + new Date().toUTCString(), 'MIME-Version: 1.0'];
    let message;
    if (attachments && attachments.length) {
      const bd = '=_mcsc_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      const parts = ['--' + bd, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(text))];
      attachments.forEach((f) => { parts.push('--' + bd, 'Content-Type: ' + safe(f.type) + '; name="' + safe(f.filename) + '"', 'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="' + safe(f.filename) + '"', '', wrap(f.data.toString('base64'))); });
      parts.push('--' + bd + '--', '');
      message = head.concat(['Content-Type: multipart/mixed; boundary="' + bd + '"', '', parts.join('\r\n')]).join('\r\n');
    } else message = head.concat(['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(text))]).join('\r\n');
    const stages = [];
    function handle(code, lines) {
      const full = lines.join('\n');
      if (step === 0) { if (code !== 220) return fail(new Error('SMTP greeting ' + code)); step = 1; return send('EHLO mcsc.local'); }
      if (step === 1) {
        if (code !== 250) return fail(new Error('EHLO rejected'));
        exts = full.toUpperCase();
        if (!secured && /STARTTLS/.test(exts)) { step = 2; return send('STARTTLS'); }
        if (!secured && !/^(localhost|127\.0\.0\.1)$/.test(cfg.host)) return fail(new Error('Server does not offer encryption; refusing to send a password over plain text.'));
        return afterHello();
      }
      if (step === 2) {
        if (code !== 220) return fail(new Error('STARTTLS refused'));
        const plain = sock; buf = ''; plain.removeAllListeners('data'); plain.removeAllListeners('close'); plain.removeAllListeners('error');
        sock = tls.connect({ socket: plain, servername: cfg.host }, () => { secured = true; step = 1; send('EHLO mcsc.local'); });
        wire(sock); return;
      }
      if (step === 3) { if (code !== 334) return fail(new Error('AUTH rejected')); step = 4; return send(b64(cfg.user)); }
      if (step === 4) { if (code !== 334) return fail(new Error('AUTH rejected')); step = 5; return send(b64(cfg.pass)); }
      if (step === 5) { if (code !== 235) return fail(new Error('SMTP login failed')); return mailFrom(); }
      if (step === 6) { if (code !== 250) return fail(new Error('Auth/MAIL FROM rejected ' + code)); step = 7; return send('RCPT TO:<' + safe(to) + '>'); }
      if (step === 7) { if (code !== 250 && code !== 251) return fail(new Error('Recipient rejected ' + code)); step = 8; return send('DATA'); }
      if (step === 8) { if (code !== 354) return fail(new Error('DATA rejected')); step = 9; return send(message.replace(/^\./gm, '..') + '\r\n.'); }
      if (step === 9) { if (code !== 250) return fail(new Error('Message rejected ' + code)); step = 10; send('QUIT'); return ok(); }
    }
    function afterHello() { if (cfg.user && cfg.pass) { step = 3; return send('AUTH LOGIN'); } return mailFrom(true); }
    function mailFrom(skipAuth) { step = 6; send('MAIL FROM:<' + safe(fromAddr) + '>'); }
    function wire(s) {
      let lines = [];
      s.on('data', (d) => {
        buf += d.toString('utf8'); let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); lines.push(line);
          if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) { const c = Number(line.slice(0, 3)), l = lines; lines = []; handle(c, l); }
        }
      });
      s.on('error', fail); s.on('close', () => { if (!done && step < 10) fail(new Error('SMTP connection closed')); });
    }
    const port = Number(cfg.port) || 587;
    sock = port === 465 ? tls.connect({ host: cfg.host, port, servername: cfg.host }, () => { secured = true; }) : net.connect({ host: cfg.host, port });
    if (port === 465) secured = true;
    wire(sock);
  });
}
module.exports = { sendMail };
