/* Milestone Sports Club: browser client for the backend API (server.js).
   If the page is opened as a plain file, or the server is not reachable, MCSC.ready resolves to false and the site keeps working in demo mode. */
(function () {
  'use strict';
  var TK = 'mcsc.token', RK = 'mcsc.role', UK = 'mcsc.user';
  var S = { on: false, token: null, role: null, user: null, ver: 0, dirty: false, pushing: false, timer: null, pending: null, poll: null, cb: null };
  try { S.token = sessionStorage.getItem(TK); S.role = sessionStorage.getItem(RK); S.user = sessionStorage.getItem(UK); } catch (e) { /* storage blocked */ }

  function setSess(t, r, u) {
    S.token = t; S.role = r; S.user = u;
    try { if (t) { sessionStorage.setItem(TK, t); sessionStorage.setItem(RK, r || ''); sessionStorage.setItem(UK, u || ''); } else { sessionStorage.removeItem(TK); sessionStorage.removeItem(RK); sessionStorage.removeItem(UK); } } catch (e) { /* ignore */ }
  }
  function api(method, path, body, o) {
    o = o || {};
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, o.timeout || 20000);
    var h = { Accept: 'application/json' }; try{var di=localStorage.getItem('mcsc.did');if(!di){di=Array.from(crypto.getRandomValues(new Uint8Array(18)),function(x){return('0'+x.toString(16)).slice(-2)}).join('');localStorage.setItem('mcsc.did',di)}h['X-Device-Id']=di}catch(e){}
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (S.token && !o.anon) h.Authorization = 'Bearer ' + S.token;
    return fetch('/api' + path, { method: method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined, credentials: 'omit', cache: 'no-store', keepalive: !!o.keepalive })
      .then(function (r) {
        clearTimeout(to);
        return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* not json */ } return { ok: r.ok, status: r.status, data: j || {} }; });
      }, function () { clearTimeout(to); return { ok: false, status: 0, data: { error: 'Could not reach the server. Check your internet connection.' } }; });
  }
  function expire() {
    setSess(null);
    try { sessionStorage.removeItem('mcsc.auth'); } catch (e) { /* ignore */ }
    try { localStorage.removeItem('mcsc.db.v1'); } catch (e) { /* ignore */ }
    if (/admin|dashboard|site-editor|status|dba/.test(location.pathname) && !/admin\.html$/.test(location.pathname)) location.replace('admin.html');
  }
  function say(status, msg) { if (S.cb) { try { S.cb(status, msg); } catch (e) { /* ignore */ } } }
  function strip(d) { var c = {}; for (var k in d) c[k] = d[k]; c.settings = {}; for (var s in d.settings) if (s !== 'adminPass') c.settings[s] = d.settings[s]; return c; }

  var ready = location.protocol === 'file:' ? Promise.resolve(false) :
    api('GET', '/health', undefined, { timeout: 4000, anon: true }).then(function (r) { S.on = !!(r.ok && r.data && r.data.ok === true); return S.on; });

  function flush() {
    if (!S.pending || S.pushing || !S.token) return;
    var d = S.pending; S.pending = null; S.pushing = true; say('saving');
    api('PUT', '/state', { state: strip(d) }).then(function (r) {
      S.pushing = false;
      if (r.status === 401) { expire(); return; }
      if (r.ok) { S.ver = r.data.version || S.ver; S.dirty = !!S.pending; say('saved'); if (r.data.merged && S.poll) S.poll(true); }
      else { S.dirty = true; if (!S.pending) S.pending = d; say('error', r.data.error || 'Could not save to the server.'); }
      if (S.pending && r.ok) flush();
    });
  }
  function push(d, now) {
    if (!S.on || !S.token) return;
    S.pending = d; S.dirty = true; clearTimeout(S.timer);
    S.timer = setTimeout(flush, now ? 0 : 700);
  }

  /* ---- error tracking: send uncaught browser errors to the server (max 5 per page view) ---- */
  var sent = 0;
  function report(m, st) {
    if (!S.on || sent >= 5) return; m = String(m || ''); if (/^Script error\.?$/.test(m) || /ResizeObserver/.test(m)) return;
    sent++; api('POST', '/client-error', { message: m.slice(0, 500), stack: String(st || '').slice(0, 2000), url: location.pathname + location.hash.slice(0, 40) }, { anon: true, keepalive: true, timeout: 5000 });
  }
  addEventListener('error', function (e) { report(e.message, e.error && e.error.stack); });
  addEventListener('unhandledrejection', function (e) { var r = e.reason; report('Unhandled promise rejection: ' + (r && r.message || r), r && r.stack); });

  /* Intruder photo: the browser asks for camera permission when someone tries to sign in. If the sign-in fails, one photo goes to the server and is sent to everyone. If it succeeds the camera is switched off at once. */
  var cam = { p: null };
  cam.start = function () {
    cam.stop(); if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    cam.p = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }).catch(function () { return null; });
  };
  cam.stop = function () { var p = cam.p; cam.p = null; if (p) p.then(function (st) { if (st) st.getTracks().forEach(function (t) { t.stop(); }); }); };
  cam.shoot = function (token) {
    var p = cam.p; cam.p = null; if (!p || !token) { if (p) p.then(function (st) { if (st) st.getTracks().forEach(function (t) { t.stop(); }); }); return Promise.resolve(false); }
    return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(null); }, 20000); })]).then(function (st) {
      if (!st) return false;
      return new Promise(function (resolve) {
        var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = st;
        function done(ok) { st.getTracks().forEach(function (t) { t.stop(); }); v.srcObject = null; resolve(ok); }
        v.onloadedmetadata = function () { v.play().then(function () {
          setTimeout(function () {
            try {
              var w = v.videoWidth || 640, h = v.videoHeight || 480, k = Math.min(1, 640 / w), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
              c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
              api('POST', '/intruder-photo', { token: token, image: c.toDataURL('image/jpeg', 0.7) }, { anon: true }).then(function (r) { done(r.ok); }, function () { done(false); });
            } catch (e) { done(false); }
          }, 900);
        }, function () { done(false); }); };
        setTimeout(function () { done(false); }, 15000);
      });
    });
  };
  function loadPhoto(id, img) {
    fetch('/api/alerts/' + id + '/photo', { headers: { Authorization: 'Bearer ' + S.token }, cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) { img.src = URL.createObjectURL(b); }, function () { /* photo not ready */ });
  }

  /* Security alarm: signed-in people see a flashing red banner and hear a siren when anyone enters a wrong password. */
  var SEEN = 'mcsc.alarm.seen', alarmOn = false, bar = null, ac = null, open = 0;
  function siren() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ac = ac || new AC(); if (ac.state === 'suspended') ac.resume();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = 'square'; o.connect(g); g.connect(ac.destination); g.gain.value = 0.08;
      for (var i = 0; i < 12; i++) o.frequency.setValueAtTime(i % 2 ? 660 : 990, t + i * 0.5); o.start(t); o.stop(t + 6);
    } catch (e) { /* sound is optional */ }
    try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) { /* ignore */ }
  }
  function showAlarm(list) {
    if (!bar) {
      bar = document.createElement('div'); bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;padding:14px 16px;background:#c1121f;color:#fff;font:600 15px/1.4 system-ui,sans-serif;display:flex;gap:12px;align-items:center;justify-content:space-between;box-shadow:0 4px 20px rgba(0,0,0,.4)';
      var m = document.createElement('div'); m.id = 'mcsc-alarm-msg'; m.style.cssText = 'flex:1;min-width:0'; var b = document.createElement('button'); b.type = 'button'; b.textContent = 'STOP ALARM';
      b.style.cssText = 'padding:8px 14px;border:0;border-radius:8px;font-weight:700;cursor:pointer';
      /* only the Database Administrator or the Club President can stop it; for everyone else the alarm keeps ringing */
      if (S.role === 'dba' || S.role === 'president') b.onclick = function () { api('POST', '/alerts/ack', {}).then(function (r) { if (r.ok) { open = 0; bar.style.display = 'none'; } }); }; else b.style.display = 'none';
      var th = document.createElement('div'); th.id = 'mcsc-alarm-pics'; th.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      bar.appendChild(m); bar.appendChild(th); bar.appendChild(b); document.body.appendChild(bar);
      var on = true; setInterval(function () { if (bar.style.display !== 'none') { bar.style.background = on ? '#c1121f' : '#7a0b13'; on = !on; } }, 450);
    }
    var a = list[0];
    bar.firstChild.textContent = '\uD83D\uDEA8 SECURITY ALARM: ' + (a.kind === 'blocked_device' ? 'a BLOCKED device tried to sign in as ' : a.kind === 'device_pending' ? 'a NEW device is waiting for your approval, account ' : a.kind === 'ip_auto_blocked' ? 'network blocked automatically after wrong passwords for ' : 'someone entered a wrong password for ') + a.email + ' (network ' + (a.ip || 'unknown') + ', ' + String(a.at).replace('T', ' ').slice(0, 19) + ' UTC)' + (list.length > 1 ? ' \u2014 ' + list.length + ' attempts' : '') + (S.role === 'dba' || S.role === 'president' ? '. Press STOP ALARM when you have seen it.' : '. It keeps ringing until the Database Administrator or the Club President stops it.');
    bar.style.display = 'flex'; siren();
  }
  var shown = {};
  function showPhoto(a) {
    if (shown[a.id]) return; shown[a.id] = 1; if (!bar) showAlarm([a]);
    var img = document.createElement('img'); img.alt = 'Photo of the person who tried to enter'; img.style.cssText = 'height:96px;width:auto;border:3px solid #fff;border-radius:8px;background:#000;cursor:zoom-in';
    img.onclick = function () { window.open(img.src, '_blank', 'noopener'); }; document.getElementById('mcsc-alarm-pics').appendChild(img); loadPhoto(a.id, img); bar.style.display = 'flex';
  }
  function startAlarm() {
    if (alarmOn || !S.token || !/dashboard|site-editor|dba|status|president|secretary|treasurer/.test(location.pathname)) return; alarmOn = true;
    var primed = false, base = null; try { var v = sessionStorage.getItem(SEEN); if (v !== null) base = Number(v); } catch (e) { /* ignore */ }
    function tick() {
      if (!S.token) return;
      api('GET', '/alerts?since=' + (base === null ? 0 : Math.max(0, base - 20))).then(function (r) {
        if (!r.ok) return; var latest = r.data.latest || 0, all = r.data.alerts || [];
        var cut = base === null ? latest : base;
        if (!primed) { primed = true; all.forEach(function (a) { if (a.photo && a.id <= cut) shown[a.id] = 1; }); }
        if (base !== null) {
          var fresh = all.filter(function (a) { return a.id > base; }); if (fresh.length) showAlarm(fresh);
          all.forEach(function (a) { if (a.photo && !shown[a.id]) showPhoto(a); });
        }
        base = latest; try { sessionStorage.setItem(SEEN, String(base)); } catch (e) { /* ignore */ }
        /* still-open alarms (survive reloads and other pages) keep the banner up and the siren repeating until stopped */
        var op = r.data.open || []; open = op.length;
        if (op.length) { if (!bar || bar.style.display === 'none') showAlarm(op); op.forEach(function (a) { if (a.photo && !shown[a.id]) showPhoto(a); }); }
        else if (bar) bar.style.display = 'none';
      });
    }
    tick(); setInterval(tick, 5000);
    setInterval(function () { if (open && bar && bar.style.display !== 'none') siren(); }, 7000);
  }

  window.MCSC = {
    ready: ready,
    isOn: function () { return S.on; },
    token: function () { return S.token; },
    role: function () { return S.role; },
    user: function () { return S.user; },
    onSync: function (fn) { S.cb = fn; },
    login: function (u, p) { return api('POST', '/login', { email: u, password: p }, { anon: true }).then(function (r) { if (r.ok) setSess(r.data.token, r.data.role, r.data.email); return r; }); },
    logout: function () { var t = S.token; setSess(null); try { localStorage.removeItem('mcsc.db.v1'); } catch (e) { /* ignore */ } if (t) fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t }, keepalive: true }).catch(function () { }); },
    loadState: function () { return api('GET', '/state').then(function (r) { if (r.status === 401) { expire(); return null; } if (!r.ok) return null; S.ver = r.data.version || 0; return r.data; }); },
    push: push,
    startPolling: function (apply) {
      S.poll = function (force) {
        if (!S.token || S.dirty || S.pushing || (!force && document.visibilityState !== 'visible')) return;
        api('GET', '/state?v=' + S.ver).then(function (r) { if (r.status === 401) { expire(); return; } if (r.ok && r.data.state && !S.dirty) { S.ver = r.data.version; apply(r.data.state); } });
      };
      setInterval(function () { S.poll(false); }, 20000);
    },
    changePassword: function (oldPw, newPw) { return api('POST', '/password', { oldPassword: oldPw, newPassword: newPw }).then(function (r) { if (r.ok && r.data.token) setSess(r.data.token, S.role, S.user); return r; }); },
    contact: function (c) { return api('POST', '/contact', c, { anon: true }); },
    loadPublic: function () { return api('GET', '/public', undefined, { anon: true }).then(function (r) { return r.ok && r.data && !r.data.empty ? r.data : null; }); },
    cam: cam,
    loadPhoto: loadPhoto,
    api: api
  };
  ready.then(function (on) { if (on) startAlarm(); });
})();
