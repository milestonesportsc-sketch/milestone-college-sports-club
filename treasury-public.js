/* Membership payment form for the public website. Shown only when the server says membership is open.
   The member pays by bKash or Nagad, then sends the transaction ID. The club checks it against the real wallet statement:
   nothing here proves a payment, so the page says "received", never "paid". */
(function () {
  'use strict';
  var box = document.getElementById('tp'); if (!box || location.protocol === 'file:') return;
  function h(tag, attrs, kids) { var e = document.createElement(tag); for (var k in (attrs || {})) { if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); } (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return e; }
  function lab(t, el) { return h('label', { style: 'display:block;text-align:left;margin:10px 0 0;font-weight:600' }, [t, el]); }
  fetch('/api/treasury/public', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) {
    box.hidden = false; box.textContent = '';
    if (!c.open) { box.appendChild(h('p', { text: 'Membership and fee payment are closed right now. Please check back later or ask the General Secretary.' })); return; }
    var name = h('input', { maxlength: 80, autocomplete: 'name', required: '' }), roll = h('input', { maxlength: 40, required: '' }), phone = h('input', { inputmode: 'numeric', maxlength: 11, autocomplete: 'tel', required: '' }), sport = h('input', { maxlength: 40 }), trx = h('input', { maxlength: 20, autocapitalize: 'characters', required: '' });
    var method = h('select', {}, [h('option', { value: 'bkash', text: 'bKash' }), h('option', { value: 'nagad', text: 'Nagad' })]);
    var info = h('p', { style: 'margin:0 0 6px' }), msg = h('p', { role: 'status', style: 'margin:10px 0 0;font-weight:600' });
    function note() { info.textContent = 'Send ৳' + c.fee + ' by ' + method.options[method.selectedIndex].text + ' to ' + (c[method.value] || '(number not set)') + ', then enter the transaction ID from the payment SMS.'; }
    method.addEventListener('change', note); note();
    var go = h('button', { type: 'submit', class: 'btn', text: 'Send my membership request', style: 'margin-top:14px' });
    var f = h('form', { novalidate: '' }, [h('h3', { text: 'Join the club' }), info, lab('Payment method', method), lab('Full name', name), lab('Class / roll', roll), lab('Mobile number (01XXXXXXXXX)', phone), lab('Sport you want to join', sport), lab('Transaction ID (TrxID)', trx), go, msg]);
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); go.disabled = true; msg.textContent = 'Sending…';
      fetch('/api/treasury/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.value, roll: roll.value, phone: phone.value, sport: sport.value, method: method.value, trxId: trx.value }) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (r) { go.disabled = false; msg.textContent = r.ok ? r.j.message : (r.j.error || 'Could not send. Please try again.'); if (r.ok) f.reset(); note(); }, function () { go.disabled = false; msg.textContent = 'Could not reach the server.'; });
    });
    box.appendChild(f);
  }).catch(function () { /* offline preview: the form simply stays hidden */ });
})();
