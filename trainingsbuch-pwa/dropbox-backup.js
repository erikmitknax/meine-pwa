/* Dropbox-Backup für die PWAs (ohne Server, Anmeldung per OAuth2 PKCE).
   Diese Fassung gehört zum Trainingsbuch (mit Wiederherstellen). Die Kopie in kippen-pwa ist noch die ältere ohne.
   Ablauf: App Key eintragen -> "Mit Dropbox verbinden" -> Dropbox fragt einmal um Erlaubnis ->
   die App lädt ihre Dateien nach Dropbox/Apps/<App-Name>/ und überschreibt dort immer die letzte Version.
   Wiederherstellen (optional): config.restoreFile + config.onRestoreText. Dafür braucht die Dropbox-App zusätzlich die
   Berechtigung files.content.read. Automatisches Sichern startet erst, wenn dieses Gerät einmal bewusst gesichert oder
   wiederhergestellt hat (Schutz davor, eine vorhandene Sicherung mit einem leeren Stand zu überschreiben). */
(function () {
  'use strict';
  var cfg = null, st = {}, busy = false, msg = '', timer = null;

  function load() { try { return JSON.parse(localStorage.getItem(cfg.storeKey) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(cfg.storeKey, JSON.stringify(st)); } catch (e) { /* ignore */ } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function redirect() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function update() { if (cfg && cfg.onUpdate) { try { cfg.onUpdate(); } catch (e) { /* ignore */ } } }
  function setMsg(m) { msg = m || ''; update(); }

  function b64url(bytes) {
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  async function sha256(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))); }
  function qs(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h) + ':' + s.length; }
  async function digest(s) {
    try { var d = await sha256(s), h = 's2:'; for (var i = 0; i < d.length; i++) h += (d[i] < 16 ? '0' : '') + d[i].toString(16); return h; }
    catch (e) { return hash(s); }
  }

  async function connect() {
    var el = document.getElementById('dbx-key');
    var key = ((el && el.value) || st.appKey || '').trim();
    if (!key) { setMsg('Bitte zuerst den App Key von Dropbox eintragen.'); return; }
    if (!(window.crypto && crypto.subtle)) { setMsg('Dieser Browser unterstützt die sichere Anmeldung nicht.'); return; }
    var ver = rand(48), state = rand(16);
    st.appKey = key; st.pending = { ver: ver, state: state }; save();
    var challenge = b64url(await sha256(ver));
    location.href = 'https://www.dropbox.com/oauth2/authorize?' + qs({
      client_id: key, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256',
      token_access_type: 'offline', redirect_uri: redirect(), state: state
    });
  }

  async function tokenRequest(params) {
    var r = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs(params)
    });
    var j = null; try { j = await r.json(); } catch (e) { /* ignore */ }
    if (!r.ok || !j || !j.access_token) { var err = new Error((j && (j.error_description || j.error)) || ('HTTP ' + r.status)); err.code = j && j.error; throw err; }
    return j;
  }

  async function handleRedirect() {
    var p = new URLSearchParams(location.search);
    if (!p.get('state') || !st.pending || p.get('state') !== st.pending.state) return false;
    var code = p.get('code'), error = p.get('error_description') || p.get('error');
    var ver = st.pending.ver; st.pending = null; save();
    try { history.replaceState(null, '', redirect()); } catch (e) { /* ignore */ }
    if (!code) { msg = 'Dropbox hat die Verbindung nicht erlaubt' + (error ? ' (' + error + ')' : '') + '.'; return true; }
    try {
      var j = await tokenRequest({ grant_type: 'authorization_code', code: code, code_verifier: ver, client_id: st.appKey, redirect_uri: redirect() });
      st.access = j.access_token; st.exp = Date.now() + (j.expires_in || 14400) * 1000 - 60000;
      if (j.refresh_token) st.refresh = j.refresh_token;
      if (st.auto == null) st.auto = true;
      st.hash = null; save(); msg = 'Mit Dropbox verbunden.';
    } catch (e) { msg = 'Anmeldung fehlgeschlagen: ' + e.message; }
    return true;
  }

  async function getAccess() {
    if (st.access && Date.now() < st.exp) return st.access;
    try {
      var j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: st.refresh, client_id: st.appKey });
      st.access = j.access_token; st.exp = Date.now() + (j.expires_in || 14400) * 1000 - 60000; save();
      return st.access;
    } catch (e) {
      if (e.code === 'invalid_grant') { st.refresh = null; st.access = null; save(); e.message = 'Verbindung abgelaufen, bitte neu verbinden.'; }
      throw e;
    }
  }

  async function put(name, text, retried) {
    var tok = await getAccess();
    var r = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + tok,
        'Dropbox-API-Arg': JSON.stringify({ path: '/' + name, mode: 'overwrite', autorename: false, mute: true }),
        'Content-Type': 'application/octet-stream'
      },
      body: new Blob([text], { type: 'application/octet-stream' })
    });
    if (r.status === 401 && !retried) { st.access = null; save(); return put(name, text, true); }
    if (!r.ok) { var t = ''; try { t = await r.text(); } catch (e) { /* ignore */ } throw new Error('Dropbox ' + r.status + (t ? ': ' + t.slice(0, 120) : '')); }
  }

  async function download(name, retried) {
    var tok = await getAccess();
    var r = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Dropbox-API-Arg': JSON.stringify({ path: '/' + name }) }
    });
    var t = '';
    if (!r.ok) { try { t = await r.text(); } catch (e) { /* ignore */ } }
    if (r.status === 401 && !retried && !/missing_scope/.test(t)) { st.access = null; save(); return download(name, true); }
    if (!r.ok) {
      if (/missing_scope/.test(t)) throw new Error('Deine Dropbox-App darf noch nicht lesen. Öffne den Dropbox App Console, aktiviere unter „Permissions“ files.content.read, speichere und tippe dann hier auf „Trennen“ und „Mit Dropbox verbinden“.');
      if (/not_found/.test(t)) throw new Error('In deiner Dropbox liegt noch keine Sicherung (' + name + ').');
      throw new Error('Dropbox ' + r.status + (t ? ': ' + t.slice(0, 120) : ''));
    }
    return r.text();
  }

  async function restore() {
    if (!cfg || !st.refresh || busy || !cfg.restoreFile || !cfg.onRestoreText) return;
    if (navigator.onLine === false) { setMsg('Du bist offline. Zum Wiederherstellen brauchst du Internet.'); return; }
    busy = true; msg = 'Lade Sicherung …'; update();
    var text = null;
    try { text = await download(cfg.restoreFile); msg = ''; }
    catch (e) { msg = 'Wiederherstellen fehlgeschlagen: ' + e.message; }
    busy = false; update();
    if (text != null) { try { cfg.onRestoreText(text); } catch (e) { msg = 'Wiederherstellen fehlgeschlagen: ' + e.message; update(); } }
  }

  function markSynced() { st.armed = true; st.hash = null; save(); update(); }

  async function backup(manual) {
    if (!cfg || !st.refresh || busy) return;
    if (!manual && !(st.armed || st.last)) return;
    if (!cfg.hasData()) { if (manual) setMsg('Noch keine Daten zum Sichern. Ein leeres Backup überschreibt nichts.'); return; }
    var files = cfg.files();
    var h = await digest(files.map(function (f) { return f.name + '\u0001' + f.text; }).join('\u0002'));
    if (!manual && h === st.hash) return;
    if (navigator.onLine === false) { if (manual) setMsg('Du bist offline. Das Backup wird nachgeholt, sobald du wieder online bist.'); return; }
    busy = true; msg = 'Sichere …'; update();
    try {
      for (var i = 0; i < files.length; i++) await put(files[i].name, files[i].text);
      st.hash = h; st.last = Date.now(); msg = manual ? 'Backup in Dropbox gespeichert.' : '';
    } catch (e) { msg = 'Backup fehlgeschlagen: ' + e.message; }
    busy = false; save(); update();
  }

  async function copyRedirect() {
    try { await navigator.clipboard.writeText(redirect()); setMsg('Adresse kopiert. Jetzt in der Dropbox App Console einfügen.'); }
    catch (e) { setMsg('Kopieren geht hier nicht. Halte die Adresse gedrückt und kopiere sie von Hand.'); }
  }

  function disconnect() {
    st.access = null; st.refresh = null; st.exp = 0; st.hash = null; st.last = null; st.armed = false; save();
    msg = 'Verbindung getrennt. Die Dateien in Dropbox bleiben erhalten.'; update();
  }

  function fmt(ts) { try { return new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return String(ts); } }

  function html(btnClass) {
    var c = btnClass ? ' class="' + esc(btnClass) + '"' : '';
    var h = '<div class="dbx-box"><strong>Dropbox-Backup</strong>';
    if (st.refresh) {
      h += '<div class="dbx-small">Verbunden. ' + (st.last ? 'Letztes Backup: ' + esc(fmt(st.last)) + '.' : 'Noch kein Backup gemacht.') + '</div>';
      h += '<div class="dbx-small">Dateien: ' + cfg.files().map(function (f) { return esc(f.name); }).join(', ') + ' (werden bei jedem Backup überschrieben)</div>';
      h += '<label class="dbx-small" style="display:block;margin-top:8px"><input type="checkbox" data-dbx-auto' + (st.auto !== false ? ' checked' : '') + '> Automatisch sichern (beim Öffnen und beim Verlassen der App, wenn sich etwas geändert hat)</label>';
      if (!(st.armed || st.last)) h += '<div class="dbx-small" style="margin-top:8px"><b>Automatisches Sichern ist noch pausiert.</b> Es startet, sobald du einmal „Jetzt sichern“ oder „Aus Dropbox wiederherstellen“ benutzt hast. So überschreibt ein neues Gerät nicht versehentlich eine vorhandene Sicherung.</div>';
      h += '<div class="dbx-row"><button type="button"' + c + ' data-dbx="backup"' + (busy ? ' disabled' : '') + '>Jetzt sichern</button>' +
        (cfg.onRestoreText ? '<button type="button"' + c + ' data-dbx="restore"' + (busy ? ' disabled' : '') + '>Aus Dropbox wiederherstellen</button>' : '') +
        '<button type="button"' + c + ' data-dbx="disconnect">Trennen</button></div>';
    } else {
      h += '<div class="dbx-small">Speichert deine Daten als Datei in deiner Dropbox und überschreibt dort immer das letzte Backup.</div>';
      h += '<input type="text" id="dbx-key" placeholder="Dropbox App Key" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(st.appKey || '') + '">';
      h += '<div class="dbx-small" style="margin-top:10px"><b>Einmal einrichten:</b> Öffne dropbox.com/developers/apps, wähle deine App und trage unter <i>Settings → OAuth 2 → Redirect URIs</i> genau diese Adresse ein, dann <i>Add</i> tippen. Sie muss exakt stimmen, auch der Schrägstrich am Ende:</div>';
      h += '<div class="dbx-small" style="margin-top:6px;user-select:all"><code>' + esc(redirect()) + '</code></div>';
      h += '<div class="dbx-small" style="margin-top:6px">Zum Wiederherstellen aus Dropbox zusätzlich unter <i>Permissions</i> die Berechtigung <code>files.content.read</code> aktivieren und <i>Submit</i> tippen.</div>';
      h += '<div class="dbx-row"><button type="button"' + c + ' data-dbx="copy">Adresse kopieren</button><button type="button"' + c + ' data-dbx="connect">Mit Dropbox verbinden</button></div>';
    }
    if (msg) h += '<div class="dbx-small" style="margin-top:8px"><b>' + esc(msg) + '</b></div>';
    return h + '</div>';
  }

  function injectStyle() {
    if (document.getElementById('dbx-style')) return;
    var s = document.createElement('style'); s.id = 'dbx-style';
    s.textContent = '.dbx-box{margin-top:14px;padding:12px;border:1px solid rgba(128,128,128,.35);border-radius:10px}' +
      '.dbx-box input[type=text]{width:100%;box-sizing:border-box;padding:10px;font:inherit;border:1px solid rgba(128,128,128,.5);border-radius:8px;background:transparent;color:inherit;margin:8px 0 4px}' +
      '.dbx-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.dbx-small{font-size:13px;opacity:.85;word-break:break-all;margin-top:4px}';
    document.head.appendChild(s);
  }

  async function init(config) {
    cfg = config; cfg.storeKey = 'dbx-' + cfg.app; st = load(); injectStyle();
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-dbx]'); if (!b) return;
      var a = b.getAttribute('data-dbx');
      if (a === 'connect') connect(); else if (a === 'backup') backup(true); else if (a === 'restore') restore(); else if (a === 'copy') copyRedirect(); else if (a === 'disconnect') disconnect();
    });
    document.addEventListener('change', function (e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-dbx-auto')) { st.auto = !!e.target.checked; save(); if (st.auto) backup(false); }
    });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && st.auto !== false) backup(false); });
    window.addEventListener('online', function () { if (st.auto !== false) backup(false); });
    if (await handleRedirect()) { if (cfg.onRedirect) { try { cfg.onRedirect(); } catch (e) { /* ignore */ } } update(); }
    update();
    if (st.refresh && st.auto !== false) {
      setTimeout(function () { backup(false); }, 2000);
      timer = setInterval(function () { backup(false); }, 5 * 60 * 1000);
    }
  }

  window.DropboxBackup = { init: init, html: html, backup: function () { return backup(true); }, restore: restore, markSynced: markSynced, state: function () { return st; } };
})();
