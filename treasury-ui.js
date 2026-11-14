/* Treasury page. All text is inserted with textContent (never innerHTML), so no stored value can run as script. */
(function () {
  'use strict';
  var TK = 'mcsc.token', RK = 'mcsc.role', token = '', role = '';
  try { token = sessionStorage.getItem(TK) || ''; role = sessionStorage.getItem(RK) || ''; } catch (e) { /* blocked */ }
  if (!token || ['president', 'secretary', 'treasurer', 'dba'].indexOf(role) < 0) { location.replace('admin.html'); return; }
  var HOME = { president: 'president.html', secretary: 'secretary.html', treasurer: 'treasurer.html', dba: 'dba.html' };
  var $ = function (id) { return document.getElementById(id); }, ov = null, busy = false;
  $('back').href = HOME[role]; $('app').hidden = false;
  var tm; function toast(t, bad) { var s = $('ts'); s.textContent = t; s.className = 'atoast on' + (bad ? ' bad' : ''); clearTimeout(tm); tm = setTimeout(function () { s.className = 'atoast'; }, 5000); }
  function key() { var a = new Uint8Array(16); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function api(m, p, body) {
    var h = { Accept: 'application/json', Authorization: 'Bearer ' + token }; if (body !== undefined) h['Content-Type'] = 'application/json';
    try { var d = localStorage.getItem('mcsc.did'); if (d) h['X-Device-Id'] = d; } catch (e) { /* ignore */ }
    return fetch('/api/treasury' + p, { method: m, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit' }).then(function (r) {
      return r.text().then(function (t) { var j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) { /* ignore */ } if (r.status === 401) { location.replace('admin.html'); } return { ok: r.ok, s: r.status, j: j }; });
    }, function () { return { ok: false, s: 0, j: { error: 'Could not reach the server.' } }; });
  }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag); for (var k in (attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'on') { for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]); } else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return e;
  }
  var tk = function (n) { return '৳' + Number(n || 0).toLocaleString('en-US'); };
  var when = function (s) { try { return new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: false }); } catch (e) { return s; } };
  var pw = function () { return $('pw').value; };
  function need() { if (!pw()) { toast('Type your password at the top first.', true); $('pw').focus(); return false; } return true; }
  function act(label, fn) { /* one press at a time; show the server's own message when refused */
    if (busy) return; busy = true;
    Promise.resolve(fn()).then(function (r) { busy = false; if (r) { if (r.ok) toast(label + ' done.'); else toast(r.j.error || ('Refused (' + r.s + ')'), true); } load(); }, function () { busy = false; toast('Something went wrong.', true); });
  }
  function table(t, head, rows, empty) {
    t.textContent = ''; var th = h('thead'), tr = h('tr'); head.forEach(function (x) { tr.appendChild(h('th', { text: x })); }); th.appendChild(tr); t.appendChild(th);
    var tb = h('tbody'); if (!rows.length) tb.appendChild(h('tr', {}, [h('td', { colspan: head.length, text: empty || 'Nothing yet.' })]));
    rows.forEach(function (r) { var x = h('tr'); r.forEach(function (c) { var td = h('td'); if (c && c.nodeType) td.appendChild(c); else td.textContent = c == null ? '' : String(c); x.appendChild(td); }); tb.appendChild(x); }); t.appendChild(tb);
  }
  var btn = function (text, fn, cls) { return h('button', { type: 'button', class: 'btn s ' + (cls || ''), text: text, on: { click: fn } }); };

  function drawOverview() {
    var o = ov; $('frz').hidden = !o.frozen; $('frzWhy').textContent = o.frozen ? ' Withdrawals and payouts are stopped. ' + o.freezeReason + ' (' + o.freezeBy + ', ' + when(o.freezeAt) + '). Lifting needs three approvals.' : '';
    var bal = $('bal'); bal.textContent = '';
    [['bKash ledger', o.balances.bkash, 'reserved by waiting requests ' + tk(o.reservedByRequests.bkash)], ['Nagad ledger', o.balances.nagad, 'reserved by waiting requests ' + tk(o.reservedByRequests.nagad)], ['Paid out today', o.spentToday, 'daily limit ' + tk(o.limits.daily)]].forEach(function (x) {
      bal.appendChild(h('div', { class: 'ast' }, [h('div', {}, [h('small', { text: x[0] }), h('b', { text: tk(x[1]) }), h('em', { text: x[2] })])]));
    });
    var rc = function (w) { var r = o.lastReconcile[w]; return r ? (r.ok ? 'OK' : 'MISMATCH') + ' · real ' + tk(r.gateway_balance) + ' vs ledger ' + tk(r.ledger_balance) + ' · ' + when(r.at) : 'never compared'; };
    var st = $('st'); st.textContent = '';
    [['Membership & fee payments', o.membershipOpen ? 'OPEN' : 'CLOSED (old records are kept)'], ['One-time limit', tk(o.limits.perTx)], ['Daily limit', tk(o.limits.daily)], ['Last real-wallet check: bKash', rc('bkash')], ['Last real-wallet check: Nagad', rc('nagad')],
      ['Payment gateway', o.gateway + (o.liveVerify ? ' (checks payments automatically)' : ' (payments are checked by two officials)') + (o.liveBalance ? ', live balance' : ', balance compared by hand')], ['Payments waiting / open requests', o.pendingPayments + ' / ' + o.openRequests]].forEach(function (x) { st.appendChild(h('div', {}, [h('b', { text: x[0] }), h('span', { text: x[1] })])); });
    $('bMem').textContent = o.membershipOpen ? 'Close membership & payments' : 'Open membership & payments';
    $('bMem').hidden = ['president', 'dba'].indexOf(role) < 0; $('bFreeze').hidden = o.frozen;
    var canAct = ['president', 'secretary', 'treasurer'].indexOf(role) >= 0; $('rcBox').hidden = !canAct || role === 'dba'; $('wdBox').hidden = !canAct;
  }
  function drawPayments(list) {
    table($('tPay'), ['When', 'Method', 'TrxID', 'Member', 'Fee', 'Status', ''], list.map(function (p) {
      var a = h('span'); if (p.status === 'pending' || p.status === 'confirmed1') {
        if (['treasurer', 'president', 'secretary'].indexOf(role) >= 0) {
          a.appendChild(btn(ov.liveVerify ? 'Check with gateway' : (p.status === 'pending' ? 'Check 1 (Treasurer)' : 'Check 2'), function () {
            if (!need()) return; var body = { password: pw() };
            if (!ov.liveVerify || p.status === 'confirmed1') { var v = prompt('Type the amount (৳) shown in the real ' + p.method + ' statement for ' + p.trx_id + ':'); if (v === null) return; body.amount = Number(v); }
            act('Payment check', function () { return api('POST', '/payments/' + p.id + '/verify', body); });
          }));
          a.appendChild(btn('Reject', function () { act('Reject', function () { return api('POST', '/payments/' + p.id + '/reject', { reason: 'not found in statement' }); }); }, 'g'));
        }
      }
      return [when(p.at), p.method, p.trx_id, p.name + ' (' + p.roll + ')', tk(p.amount), p.status + (p.source ? ' · ' + p.source : ''), a];
    }), 'No membership payments yet.');
  }
  function drawRequests(list) {
    table($('tReq'), ['#', 'What', 'Amount', 'Status', 'Approvals', ''], list.map(function (q) {
      var what = q.kind === 'withdrawal' ? q.wallet + ' → ' + q.payload.to + ' · ' + q.payload.purpose : q.kind === 'limits' ? 'Limits: one-time ' + tk(q.payload.perTx) + ', daily ' + tk(q.payload.daily) : 'Unfreeze: ' + q.payload.reason;
      var ap = ['president', 'secretary', 'treasurer'].map(function (r) { var x = q.approvals.filter(function (a) { return a.role === r; })[0]; return r + ': ' + (x ? (x.decision === 'approve' ? '✔' : '✖') : '…'); }).join('  ');
      var a = h('span'), mine = q.approvals.some(function (x) { return x.role === role; }), canVote = ['president', 'secretary', 'treasurer'].indexOf(role) >= 0;
      if (q.status === 'pending' && canVote && !mine) {
        a.appendChild(btn('Approve', function () { if (!need()) return; act('Approval', function () { return api('POST', '/requests/' + q.id + '/approve', { password: pw() }); }); }));
        a.appendChild(btn('Reject', function () { var r = prompt('Reason for rejecting:'); if (r === null) return; act('Reject', function () { return api('POST', '/requests/' + q.id + '/reject', { reason: r }); }); }, 'dng'));
      }
      if (q.status === 'approved' && q.kind === 'withdrawal' && (role === 'treasurer' || role === 'president')) {
        a.appendChild(btn(ov.liveBalance && ov.gateway !== 'manual' ? 'Pay now' : 'Record payout', function () {
          if (!need()) return; var body = { password: pw() };
          if (!(ov.liveBalance && ov.gateway !== 'manual')) { var r = prompt('Send ' + tk(q.amount) + ' to ' + q.payload.to + ' from the real ' + q.wallet + ' wallet, then type the wallet\'s transaction ID:'); if (r === null) return; body.gatewayRef = r; }
          act('Payout', function () { return api('POST', '/requests/' + q.id + '/execute', body); });
        }));
      }
      if (['pending', 'approved'].indexOf(q.status) >= 0 && q.requestedBy === ((function () { try { return sessionStorage.getItem('mcsc.user'); } catch (e) { return ''; } })())) a.appendChild(btn('Cancel', function () { act('Cancel', function () { return api('POST', '/requests/' + q.id + '/cancel', {}); }); }, 'g'));
      return [q.id, what + (q.gatewayRef ? ' · ref ' + q.gatewayRef : '') + (q.note ? ' · ' + q.note : ''), q.kind === 'withdrawal' ? tk(q.amount) : '', q.status, ap, a];
    }), 'No requests yet.');
  }
  function load() {
    Promise.all([api('GET', '/overview'), api('GET', '/payments'), api('GET', '/requests'), api('GET', '/ledger'), api('GET', '/audit?limit=100')]).then(function (r) {
      if (!r[0].ok) { toast(r[0].j.error || 'Could not load.', true); return; }
      ov = r[0].j; drawOverview(); drawPayments(r[1].j.payments || []); drawRequests(r[2].j.requests || []);
      table($('tLed'), ['#', 'When', 'Wallet', 'Type', 'Amount', 'For', 'By'], (r[3].j.ledger || []).map(function (x) { return [x.id, when(x.at), x.wallet, x.kind, tk(x.amount), x.ref_type + ' ' + (x.ref_id || ''), x.actor]; }), 'No money moved yet.');
      table($('tAud'), ['#', 'When', 'Who', 'Action', 'Detail'], (r[4].j.audit || []).map(function (x) { return [x.id, when(x.at), (x.actor || '') + (x.role ? ' (' + x.role + ')' : ''), x.action, x.detail]; }), 'No entries yet.');
    });
  }
  $('bFreeze').addEventListener('click', function () { var r = prompt('Why are you freezing all money out? (e.g. suspicious message)'); if (r === null) return; act('Freeze', function () { return api('POST', '/freeze', { reason: r || 'emergency freeze' }); }); });
  $('bMem').addEventListener('click', function () { if (!need()) return; var on = !ov.membershipOpen; if (!on && !confirm('Close membership? New admissions and fee payments stop. Old records stay.')) return; act('Membership switch', function () { return api('POST', '/membership', { enabled: on, password: pw() }); }); });
  $('bInt').addEventListener('click', function () { api('GET', '/integrity').then(function (r) { toast(r.j.ok ? 'Ledger and audit log are intact (' + r.j.ledgerRows + ' money rows, ' + r.j.auditRows + ' log rows).' : 'TAMPERING DETECTED at ' + r.j.where + '. The treasury was frozen.', !r.j.ok); load(); }); });
  $('bRc').addEventListener('click', function () { if (!need()) return; var b = $('rcB').value; if (b === '') { toast('Type the real balance.', true); return; }
    act('Comparison', function () { return api('POST', '/reconcile', { password: pw(), wallet: $('rcW').value, gatewayBalance: Number(b) }).then(function (r) { $('rcOut').textContent = r.ok ? r.j.note + ' (ledger ' + tk(r.j.ledgerBalance) + ', real ' + tk(r.j.gatewayBalance) + ')' : ''; return r; }); }); });
  $('bWd').addEventListener('click', function () { act('Request', function () { return api('POST', '/requests', { kind: 'withdrawal', wallet: $('wdW').value, amount: Number($('wdA').value), to: $('wdT').value.trim(), purpose: $('wdR').value, idempotencyKey: key() }).then(function (r) { if (r.ok) { $('wdA').value = ''; $('wdT').value = ''; $('wdR').value = ''; } return r; }); }); });
  $('bLim').addEventListener('click', function () { var a = prompt('New ONE-TIME limit (৳):', ov && ov.limits.perTx), b = a === null ? null : prompt('New DAILY limit (৳):', ov && ov.limits.daily); if (b === null) return;
    act('Limit request', function () { return api('POST', '/requests', { kind: 'limits', perTx: Number(a), daily: Number(b), idempotencyKey: key() }); }); });
  $('bUnf').addEventListener('click', function () { var r = prompt('Why is it safe to unfreeze?'); if (r === null) return; act('Unfreeze request', function () { return api('POST', '/requests', { kind: 'unfreeze', reason: r, idempotencyKey: key() }); }); });
  load(); setInterval(function () { if (!busy && document.visibilityState === 'visible') load(); }, 20000);
})();
