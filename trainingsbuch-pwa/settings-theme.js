/* Einstellungen: Farben, Logo, Pausensignal. Wird im <head> geladen, damit das Design sofort stimmt. */
(function () {
  'use strict';
  var KEY = 'tb_settings';

  var THEMES = [
    { id: 'gold', name: 'Gold', bg: '#0A0A09', surface: '#141311', fg: '#F6F4EF', accent: '#C9A44C', surface2: '#1D1B18', line: '#2C2924', muted: '#958E81' },
    { id: 'ozean', name: 'Ozean', bg: '#07101A', surface: '#0E1A26', fg: '#EEF4FA', accent: '#3BA6E8' },
    { id: 'wald', name: 'Wald', bg: '#08110C', surface: '#0F1C14', fg: '#EEF5EF', accent: '#4CC38A' },
    { id: 'glut', name: 'Glut', bg: '#120A09', surface: '#1E1210', fg: '#FAF0EE', accent: '#F05A3C' },
    { id: 'violett', name: 'Violett', bg: '#0D0A14', surface: '#171223', fg: '#F3F0FA', accent: '#A77BF3' },
    { id: 'graphit', name: 'Graphit', bg: '#0B0B0C', surface: '#17171A', fg: '#F2F2F3', accent: '#E6E6E9' },
    { id: 'hell', name: 'Hell', bg: '#F4F2EE', surface: '#FFFFFF', fg: '#1A1916', accent: '#9C7A26' },
    { id: 'eis', name: 'Eis', bg: '#EEF3F8', surface: '#FFFFFF', fg: '#10202F', accent: '#1F6FC5' }
  ];

  var LOGOS = [
    { id: 'none', name: 'Kein Logo', svg: '' },
    { id: 'hantel', name: 'Hantel', svg: '<path d="M1.5 10h2v4h-2zM4.5 6.5h3v11h-3zM16.5 6.5h3v11h-3zM20.5 10h2v4h-2zM7.5 11h9v2h-9z"/>' },
    { id: 'kettle', name: 'Kettlebell', svg: '<circle cx="12" cy="15.2" r="6.3"/><path d="M8.3 10.2V7a3 3 0 0 1 3-3h1.4a3 3 0 0 1 3 3v3.2" fill="none" stroke="currentColor" stroke-width="2.2"/>' },
    { id: 'blitz', name: 'Blitz', svg: '<path d="M13.5 1.5 4 14h6.5l-1.5 8.5L19 9.5h-6.5z"/>' },
    { id: 'flamme', name: 'Flamme', svg: '<path d="M12 1.5c.8 4.2 6 5.8 6 12.2a6 6 0 0 1-12 0c0-3 1.4-4.9 3-6 .2 2.2 1.1 3.5 2.4 4C10.9 8.8 10.6 5 12 1.5z"/>' },
    { id: 'herz', name: 'Herz', svg: '<path d="M12 21.2S3.2 15.6 3.2 9.4a4.9 4.9 0 0 1 8.8-3 4.9 4.9 0 0 1 8.8 3c0 6.2-8.8 11.8-8.8 11.8z"/>' },
    { id: 'krone', name: 'Krone', svg: '<path d="M3 7.5 7.5 12 12 5l4.5 7L21 7.5 19.2 18H4.8zM4.8 19.5h14.4V21H4.8z"/>' },
    { id: 'tb', name: 'Monogramm', svg: '<text x="12" y="17.2" text-anchor="middle" font-size="13.5" font-weight="700" font-family="Barlow Condensed,Arial Narrow,sans-serif" letter-spacing=".5">TB</text>' }
  ];

  var VIBS = [
    { id: 'aus', name: 'Aus', pat: null },
    { id: 'kurz', name: 'Kurz', pat: [600] },
    { id: 'lang', name: 'Lang', pat: [1200, 150, 1200, 150, 1200, 150, 1200] },
    { id: 'dauer', name: 'Dauer 6 s', pat: [6000] },
    { id: 'puls', name: 'Puls', pat: [250, 150, 250, 150, 250, 150, 250, 150, 250, 150, 250, 150, 250, 150, 250] },
    { id: 'herz', name: 'Herzschlag', pat: [180, 120, 500, 600, 180, 120, 500, 600, 180, 120, 500] },
    { id: 'sos', name: 'SOS', pat: [150, 100, 150, 100, 150, 300, 500, 100, 500, 100, 500, 300, 150, 100, 150, 100, 150] }
  ];

  var SOUNDS = [
    { id: 'still', name: 'Lautlos' },
    { id: 'piep', name: 'Piep' },
    { id: 'glocke', name: 'Glocke' },
    { id: 'gong', name: 'Gong' },
    { id: 'fanfare', name: 'Fanfare' }
  ];

  var DEFAULTS = { theme: 'gold', colors: null, logo: 'hantel', logoData: null, vib: 'lang', snd: 'still' };

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    var out = {}; for (var k in DEFAULTS) out[k] = (s[k] === undefined ? DEFAULTS[k] : s[k]);
    return out;
  }
  var cur = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { return false; } return true; }

  /* ---- Farben ---- */
  function hex2rgb(h) { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgb2hex(a) { return '#' + a.map(function (v) { v = Math.round(Math.max(0, Math.min(255, v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase(); }
  function mix(a, b, t) { var x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map(function (v, i) { return v + (y[i] - v) * t; })); }
  function lum(h) { var c = hex2rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function rgba(h, a) { var c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function themeById(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return THEMES[0]; }
  function baseColors() {
    var t = themeById(cur.theme), c = cur.colors || {};
    return { accent: c.accent || t.accent, bg: c.bg || t.bg, surface: c.surface || t.surface, fg: c.fg || t.fg };
  }
  function palette() {
    var t = themeById(cur.theme), c = baseColors(), exact = !cur.colors;
    return {
      bg: c.bg, surface: c.surface, fg: c.fg, gold: c.accent,
      'surface-2': exact && t.surface2 ? t.surface2 : mix(c.surface, c.fg, 0.05),
      line: exact && t.line ? t.line : mix(c.surface, c.fg, 0.13),
      muted: exact && t.muted ? t.muted : mix(c.bg, c.fg, 0.56),
      'gold-soft': rgba(c.accent, 0.14),
      'on-accent': lum(c.accent) > 0.4 ? '#0A0A09' : '#FFFFFF'
    };
  }
  function applyColors() {
    var p = palette(), st = document.documentElement.style;
    for (var k in p) st.setProperty('--' + k, p[k]);
    st.colorScheme = lum(p.bg) > 0.5 ? 'light' : 'dark';
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', p.bg);
  }

  /* ---- Logo ---- */
  function logoById(id) { for (var i = 0; i < LOGOS.length; i++) if (LOGOS[i].id === id) return LOGOS[i]; return null; }
  function logoSvg(id, size) {
    var l = logoById(id); if (!l || !l.svg) return '';
    return '<svg viewBox="0 0 24 24" width="' + (size || 28) + '" height="' + (size || 28) + '" fill="currentColor" aria-hidden="true">' + l.svg + '</svg>';
  }
  function logoHTML(size) {
    if (cur.logo === 'custom' && cur.logoData) return '<img src="' + cur.logoData + '" width="' + (size || 28) + '" height="' + (size || 28) + '" alt="" style="border-radius:7px;object-fit:cover">';
    return logoSvg(cur.logo, size);
  }
  function faviconHref() {
    if (cur.logo === 'custom' && cur.logoData) return cur.logoData;
    var l = logoById(cur.logo); if (!l || !l.svg) return null;
    var p = palette();
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="' + p.bg + '"/><g transform="translate(3 3) scale(.75)" fill="' + p.gold + '" color="' + p.gold + '">' + l.svg + '</g></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
  function applyLogo() {
    var el = document.getElementById('brandLogo');
    if (el) { var h = logoHTML(28); el.innerHTML = h; el.hidden = !h; }
    var href = faviconHref(), link = document.querySelector('link[rel="icon"]');
    if (link) link.setAttribute('href', href || 'icon-192.png');
  }

  function apply() { applyColors(); applyLogo(); }
  function set(patch) {
    for (var k in patch) cur[k] = patch[k];
    var ok = save(); apply(); return ok;
  }

  /* Eigenes Bild auf 256x256 zuschneiden */
  function readLogoFile(file, cb) {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
        var x = c.getContext('2d'), m = Math.min(img.width, img.height);
        x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        cb(null, c.toDataURL('image/png'));
      };
      img.onerror = function () { cb(new Error('Bild konnte nicht gelesen werden.')); };
      img.src = r.result;
    };
    r.onerror = function () { cb(new Error('Datei konnte nicht gelesen werden.')); };
    r.readAsDataURL(file);
  }

  /* ---- Töne (nur solange die App offen ist) ---- */
  var AC = null;
  function audioUnlock() { try { var C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = AC || new C(); if (AC.state === 'suspended') AC.resume(); } catch (e) { /* ignore */ } }
  function tone(f, start, dur, type, vol) {
    var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + start;
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.4, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  var SYNTH = {
    piep: function () { for (var i = 0; i < 3; i++) tone(1046, i * 0.28, 0.16, 'square', 0.16); },
    glocke: function () { [0, 0.5].forEach(function (s) { tone(1318, s, 1.2, 'sine', 0.35); tone(1975, s, 0.8, 'sine', 0.12); }); },
    gong: function () { tone(196, 0, 2.8, 'sine', 0.55); tone(294, 0, 2.1, 'sine', 0.25); tone(392, 0, 1.5, 'sine', 0.12); },
    fanfare: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.14, i === 3 ? 0.65 : 0.16, 'triangle', 0.3); }); }
  };
  function playSound(id) { if (!SYNTH[id]) return; audioUnlock(); if (!AC) return; try { SYNTH[id](); } catch (e) { /* ignore */ } }
  function vibPattern(id) { for (var i = 0; i < VIBS.length; i++) if (VIBS[i].id === (id || cur.vib)) return VIBS[i].pat; return null; }

  applyColors();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyLogo); else applyLogo();

  window.TBSettings = {
    THEMES: THEMES, LOGOS: LOGOS, VIBS: VIBS, SOUNDS: SOUNDS,
    get: function () { return cur; }, set: set, apply: apply,
    baseColors: baseColors, logoSvg: logoSvg, logoHTML: logoHTML, readLogoFile: readLogoFile,
    audioUnlock: audioUnlock, playSound: playSound, vibPattern: vibPattern,
    reset: function (keys) { keys.forEach(function (k) { cur[k] = DEFAULTS[k]; }); save(); apply(); }
  };
})();
