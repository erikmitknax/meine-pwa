"use strict";
/* Angebots-Radar – Oberfläche. Daten (Vorrat, Einstellungen) liegen im Browser (localStorage), kein Server nötig. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const { eur, mengeText } = Logik;

const K = { w: "ar-wuensche", s: "ar-settings", g: "ar-gesehen" };
const DEF = { theme: "auto", meldungen: true, minPct: 15, woche: true, laeden: null };
const VORSCHLAEGE = ["Haferflocken", "Nudeln", "Reis", "Kaffee", "Butter", "Olivenöl", "Eier", "Mehl"];

function lade(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
function speichere(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* voll/gesperrt */ } }

const S = {
  tab: "treffer",
  wuensche: lade(K.w, []),
  settings: Object.assign({}, DEF, lade(K.s, {})),
  gesehen: lade(K.g, {}),
  daten: null,
  erg: [],
  notif: "offen"
};

/* ---------- Hilfen ---------- */
const MIN = "−";
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function dat(iso) { const [y, m, d] = iso.split("-").map(Number); const x = new Date(y, m - 1, d); return WT[x.getDay()] + " " + String(d).padStart(2, "0") + "." + String(m).padStart(2, "0") + "."; }
function kw(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
const laden = id => (S.daten.laeden.find(l => l.id === id) || { id, name: id, farbe: "#888" });
const aktiveLaeden = () => S.settings.laeden || S.daten.laeden.map(l => l.id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const chip = id => { const l = laden(id); return `<span class="chip" style="--c:${l.farbe}"><i></i>${esc(l.name)}</span>`; };
const pctText = p => (p > 0 ? MIN + p + "%" : "±0%");
const stkKlasse = p => (p >= 15 ? "" : p > 0 ? "gelb" : "grau");
const gpText = b => (b.grund ? eur(b.grund.preis) + " / " + b.grund.einheit : "");

const ICO = {
  treffer: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
  vorrat: '<path d="M3 9h18l-2 11H5L3 9z"/><path d="M8 9l3-6M16 9l-3-6"/>',
  prospekte: '<path d="M4 4h12v16H4zM16 8h4v10a2 2 0 0 1-2 2h-2"/><path d="M7 8h6M7 12h6M7 16h4"/>',
  mehr: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  chev: '<path d="M9 5l7 7-7 7"/>'
};
const ico = (n, s = 24) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n]}</svg>`;

let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600);
}

/* ---------- Berechnung ---------- */
function berechne() {
  S.erg = Logik.treffer(S.wuensche, S.daten.angebote, Logik.heute(), aktiveLaeden());
}
function sichern() { speichere(K.w, S.wuensche); speichere(K.s, S.settings); speichere(K.g, S.gesehen); }

/* ---------- Kopf + Tabs ---------- */
function renderKopf() {
  const ort = S.daten.ort ? S.daten.ort.name : "";
  const p0 = S.daten.prospekte[0], wk = p0 ? kw(new Date(p0.gueltigVon + "T12:00:00")) : kw(new Date());
  $("#head").innerHTML = `<div class="kicker mono">${esc(ort)} · KW ${wk}</div><h1>Angebots-Radar</h1>` +
    (S.daten.quelle === "demo" ? `<span class="demo-tag mono">BEISPIELDATEN</span>` : "");
}
function renderTabs() {
  const treffer = S.erg.filter(r => r.bester && r.bester.pct > 0).length;
  const T = [["treffer", "Treffer"], ["vorrat", "Vorrat"], ["prospekte", "Prospekte"], ["mehr", "Mehr"]];
  $("#tabs").innerHTML = T.map(([k, n]) =>
    `<button data-act="tab" data-k="${k}" class="${S.tab === k ? "on" : ""}" ${S.tab === k ? 'aria-current="page"' : ""}>${ico(k)}<span>${n}</span>${k === "treffer" && treffer ? `<span class="dot">${treffer}</span>` : ""}</button>`).join("");
}
function render() {
  renderKopf(); renderTabs();
  const v = $("#view");
  const html = { treffer: viewTreffer, vorrat: viewVorrat, prospekte: viewProspekte, mehr: viewMehr }[S.tab]();
  v.innerHTML = html;
  if (S.tab === "prospekte") bindSuche();
}
function gehe(tab) { S.tab = tab; render(); $("#view").scrollTop = 0; }

/* ---------- Tab: Treffer ---------- */
function trefferKarte(r) {
  const b = r.bester, a = b.angebot, w = r.wunsch;
  const mehr = r.liste.slice(1, 4).map(x => `<button data-act="detail" data-w="${w.id}" data-a="${x.angebot.id}">
      ${chip(x.angebot.laden)}<span class="mono" style="font-weight:500">${eur(x.angebot.preis)}</span><span class="grow"></span>
      <span class="tag ${x.verdict.key}">${pctText(x.pct)}</span></button>`).join("");
  return `<article class="card hit tap" style="overflow:hidden" data-act="detail" data-w="${w.id}" data-a="${a.id}">
    <div class="top">
      <div class="stk ${stkKlasse(b.pct)}"><i></i><b>${b.pct > 0 ? MIN + b.pct + "%" : "±0"}</b></div>
      <div class="grow">
        <h2>${esc(w.name)}</h2>
        <div class="small muted">${esc(a.artikel)} · ${esc(mengeText(a.menge))}</div>
        <div class="row" style="margin-top:7px;gap:7px;flex-wrap:wrap">${chip(a.laden)}<span class="tag ${b.verdict.key}">${b.verdict.text}</span>${b.kommt ? `<span class="tag vorschau">ab ${dat(a.gueltigVon)}</span>` : ""}</div>
      </div>
    </div>
    <div class="row between" style="margin-top:14px;align-items:flex-end">
      <div><span class="preis">${eur(a.preis)}</span> ${b.ref ? `<span class="alt">${eur(b.ref)}</span>` : ""}</div>
      <div class="gp">${gpText(b)}</div>
    </div>
    <div class="foot small"><span>${b.kaufbar}× = <b class="mono">${eur(b.kosten)}</b></span><span>${b.ersparnis > 0 ? `spart <b class="mono">${eur(b.ersparnis)}</b>` : "keine Ersparnis"}</span></div>
    ${mehr ? `<div class="also">${mehr}</div>` : ""}
  </article>`;
}
function viewTreffer() {
  let h = "";
  if (S.settings.meldungen && S.notif === "offen") {
    h += `<button class="hinweis" data-act="notif-an"><span style="font-size:26px">🔔</span><span><b>Benachrichtigungen einschalten</b><span class="small">Dann meldet sich die App, sobald ein Angebot für deinen Vorrat auftaucht.</span></span></button>`;
  } else if (S.settings.meldungen && S.notif === "aus") {
    h += `<div class="hinweis"><span style="font-size:26px">🔕</span><span><b>Benachrichtigungen blockiert</b><span class="small">Erlaube sie in den Geräte-Einstellungen (Android: Apps → Angebots-Radar → Benachrichtigungen).</span></span></div>`;
  }
  if (!S.wuensche.length) {
    return h + `<div class="card leer"><div class="stk big gelb"><i></i><b>%</b></div><h2>Was kaufst du auf Vorrat?</h2>
      <p class="muted" style="margin:6px 0 16px">Leg im Tab „Vorrat“ fest, z. B. 10 × Haferflocken. Hier siehst du dann, wo es gerade im Angebot ist und wie viel du sparst.</p>
      <button class="btn" data-act="tab" data-k="vorrat">Vorrat anlegen</button></div>`;
  }
  const mit = S.erg.filter(r => r.bester).sort((a, b) => b.bester.pct - a.bester.pct);
  const ohne = S.erg.filter(r => !r.bester);
  const gespart = mit.reduce((s, r) => s + Math.max(0, r.bester.ersparnis), 0);
  if (mit.length) {
    h += `<div class="row between" style="margin:0 2px 14px"><span class="muted small">${mit.length} von ${S.wuensche.length} Artikeln im Angebot</span><span class="small">Ersparnis bis zu <b class="mono">${eur(gespart)}</b></span></div>`;
    h += mit.map(trefferKarte).join("");
  }
  if (ohne.length) {
    h += `<div class="sektion"><h2>Gerade nichts im Angebot</h2></div><div class="card pad" style="padding-block:6px">` +
      ohne.map(r => `<div class="zeile"><span class="grow"><b>${esc(r.wunsch.name)}</b></span><span class="mono muted small">${r.wunsch.menge}×</span></div>`).join("") + `</div>`;
  }
  return h;
}

/* ---------- Tab: Vorrat ---------- */
function viewVorrat() {
  let h = `<form class="addbar" data-form="add" autocomplete="off"><input name="n" placeholder="Was kaufst du auf Vorrat?" enterkeyhint="done" aria-label="Artikel"><button class="btn" type="submit">Hinzufügen</button></form>`;
  const vorh = new Set(S.wuensche.map(w => Logik.norm(w.name)));
  const vs = VORSCHLAEGE.filter(v => !vorh.has(Logik.norm(v)));
  if (vs.length) h += `<div class="vorschlaege">${vs.map(v => `<button data-act="vorschlag" data-n="${esc(v)}">+ ${esc(v)}</button>`).join("")}</div>`;
  if (!S.wuensche.length) return h + `<p class="muted" style="text-align:center;margin-top:28px">Noch nichts auf der Liste.<br>Tipp: Tippe auf einen Vorschlag oder schreib selbst etwas hin.</p>`;
  h += S.erg.map(r => {
    const w = r.wunsch, b = r.bester;
    const status = b ? `<span class="tag ${b.verdict.key}">${pctText(b.pct)} ${esc(laden(b.angebot.laden).name)}</span>` : `<span class="tag nix">kein Angebot</span>`;
    return `<div class="card wish" data-act="edit" data-w="${w.id}"><div class="mono menge">${w.menge}×</div><div class="grow"><b style="font-size:18px">${esc(w.name)}</b><div style="margin-top:5px">${status}</div></div>${ico("chev", 20)}</div>`;
  }).join("");
  return h;
}
function addWunsch(name) {
  name = String(name || "").trim().replace(/\s+/g, " ");
  if (!name) return false;
  if (S.wuensche.some(w => Logik.norm(w.name) === Logik.norm(name))) { toast("Steht schon auf der Liste"); return false; }
  S.wuensche.unshift({ id: uid(), name, menge: 10, normalpreis: null, minPct: null });
  sichern(); berechne(); render();
  toast(name + " hinzugefügt – Menge kannst du antippen");
  return true;
}
function editSheet(id) {
  const w = S.wuensche.find(x => x.id === id); if (!w) return;
  sheet(`<h2 style="margin-bottom:14px">Artikel bearbeiten</h2><form class="felder" data-form="edit" data-w="${w.id}" autocomplete="off">
    <label class="f">Name<input name="name" value="${esc(w.name)}" required></label>
    <div class="f" style="display:flex;flex-direction:column;gap:5px"><span style="font-weight:650;font-size:14px">Wie viele Packungen willst du kaufen?</span>
      <div class="stepper"><button type="button" data-step="-1" aria-label="weniger">${MIN}</button><input name="menge" type="number" inputmode="numeric" min="1" max="99" value="${w.menge}" class="mono" style="border:2px solid var(--bd);background:var(--paper);border-radius:12px;padding:10px 6px;outline:0"><button type="button" data-step="1" aria-label="mehr">+</button></div></div>
    <label class="f">Dein üblicher Preis pro Packung (optional)<input name="preis" inputmode="decimal" placeholder="z. B. 1,29" value="${w.normalpreis ? String(w.normalpreis).replace(".", ",") : ""}"><small>Damit rechnet die App deine Ersparnis. Ohne Angabe gilt der Normalpreis aus dem Prospekt.</small></label>
    <label class="f">Benachrichtigen ab Ersparnis von … %<input name="min" type="number" inputmode="numeric" min="1" max="90" placeholder="Standard: ${S.settings.minPct}" value="${w.minPct == null ? "" : w.minPct}"></label>
    <div class="row" style="gap:10px"><button type="button" class="btn gefahr" data-act="delwish" data-w="${w.id}">Löschen</button><button class="btn voll" type="submit">Speichern</button></div>
  </form>`, root => {
    $$("[data-step]", root).forEach(b => b.addEventListener("click", () => {
      const i = $("[name=menge]", root); i.value = Math.min(99, Math.max(1, (parseInt(i.value, 10) || 1) + Number(b.dataset.step)));
    }));
  });
}

/* ---------- Tab: Prospekte ---------- */
function zeileAngebot(a, extra) {
  const ist = S.wuensche.some(w => Logik.passt(w.name, a));
  const gp = Logik.grundpreis(a);
  const pct = a.normalpreis > 0 ? Math.round((1 - a.preis / a.normalpreis) * 100) : 0;
  return `<div class="zeile"><div class="grow"><b>${esc(a.artikel)}</b><div class="small muted">${esc(a.marke || "")} · ${esc(mengeText(a.menge))}${gp ? " · " + eur(gp.preis) + "/" + gp.einheit : ""}</div>
    <div class="row" style="gap:8px;margin-top:3px">${extra || ""}<span class="mono"><b>${eur(a.preis)}</b></span>${a.normalpreis ? `<span class="alt">${eur(a.normalpreis)}</span>` : ""}${pct > 0 ? `<span class="tag ${pct >= 30 ? "top" : pct >= 15 ? "gut" : ""}">${MIN}${pct}%</span>` : ""}</div></div>
    <button class="pl ${ist ? "ist" : ""}" data-act="plus" data-a="${a.id}" aria-label="${ist ? "Schon auf der Liste" : "Zur Vorratsliste"}">${ist ? "✓" : "+"}</button></div>`;
}
function viewProspekte() {
  let h = `<div class="addbar suche" style="padding-left:14px"><input data-suche placeholder="Alle Angebote durchsuchen …" aria-label="Suche"></div><div id="suchErg"></div><div id="laedenGrid">${gridLaeden()}</div>
    <p class="muted small" style="margin:14px 2px 0">Prospekte für ${esc(S.daten.ort ? S.daten.ort.name : "deinen Ort")}${S.daten.quelle === "demo" ? " – derzeit Beispieldaten, die echte Anbindung kommt als nächster Schritt." : "."}</p>`;
  return h;
}
function gridLaeden() {
  return `<div class="laeden">` + S.daten.laeden.map(l => {
    const p = S.daten.prospekte.find(x => x.laden === l.id);
    const n = S.daten.angebote.filter(a => a.laden === l.id).length;
    const aus = !aktiveLaeden().includes(l.id);
    return `<button class="card tap laden" style="--c:${l.farbe};${aus ? "opacity:.5" : ""}" data-act="laden" data-l="${l.id}"><div class="band"><span>${esc(l.name)}</span></div>
      <div class="inh"><div class="small"><b>${p ? dat(p.gueltigVon) + " – " + dat(p.gueltigBis) : "kein Prospekt"}</b></div><div class="small muted">${n} Angebote${aus ? " · ausgeblendet" : ""}</div></div></button>`;
  }).join("") + `</div>`;
}
function bindSuche() {
  const i = $("[data-suche]"); if (!i) return;
  i.addEventListener("input", () => {
    const q = Logik.norm(i.value), box = $("#suchErg"), grid = $("#laedenGrid");
    if (q.length < 2) { box.innerHTML = ""; grid.style.display = ""; return; }
    grid.style.display = "none";
    const hits = S.daten.angebote.filter(a => aktiveLaeden().includes(a.laden) && q.split(" ").every(t => Logik.norm(a.artikel + " " + (a.marke || "")).includes(t)))
      .sort((a, b) => a.preis - b.preis);
    box.innerHTML = `<div class="card pad" style="padding-block:6px">` + (hits.length ? hits.map(a => zeileAngebot(a, chip(a.laden))).join("") : `<p class="muted" style="text-align:center">Nichts gefunden.</p>`) + `</div>`;
  });
}
function ladenSheet(id) {
  const l = laden(id), p = S.daten.prospekte.find(x => x.laden === id);
  const liste = S.daten.angebote.filter(a => a.laden === id);
  sheet(`<div class="row between" style="margin-bottom:6px"><div><div class="kicker mono">${p ? "gültig " + dat(p.gueltigVon) + " – " + dat(p.gueltigBis) : ""}</div><h2>${esc(l.name)}</h2></div>${chip(id)}</div>
    ${p && p.url ? `<a class="btn gelb voll" style="display:block;text-align:center;text-decoration:none;margin:10px 0" href="${esc(p.url)}" target="_blank" rel="noopener">Prospekt öffnen</a>` :
      `<div class="card pad small muted" style="margin:10px 0;box-shadow:none;border-style:dashed">Das Prospekt-Original (Seiten/PDF) wird mit der echten Datenquelle verknüpft. Bis dahin siehst du hier die Angebote als Liste.</div>`}
    <div class="card pad" style="padding-block:6px;margin-bottom:0">${liste.map(a => zeileAngebot(a)).join("")}</div>`);
}

/* ---------- Tab: Mehr ---------- */
function sw(key, an, label, sub, aria) {
  return `<div class="opt"><div class="grow"><b>${label}</b>${sub ? `<div class="small muted">${sub}</div>` : ""}</div><button class="sw" role="switch" aria-checked="${an}" aria-label="${esc(aria || label)}" data-act="toggle" data-k="${key}"></button></div>`;
}
function viewMehr() {
  const q = S.daten.quelle === "demo" ? "Beispieldaten (noch keine echte Schnittstelle)" : "Live-Daten";
  const nstat = { an: "eingeschaltet", aus: "in den Geräte-Einstellungen blockiert", offen: "noch nicht erlaubt", "nicht-moeglich": "auf diesem Gerät nicht möglich" }[S.notif];
  return `<div class="sektion" style="margin-top:4px"><h2>Benachrichtigungen</h2></div><div class="card pad" style="padding-block:4px">
    ${sw("meldungen", S.settings.meldungen, "Bei neuem Treffer melden", "Status: " + nstat)}
    <div class="opt"><div class="grow"><b>Standard-Schwelle</b><div class="small muted">Melden ab dieser Ersparnis</div></div>
      <div class="stepper"><button data-act="minpct" data-d="-5" aria-label="weniger">${MIN}</button><span class="mono" style="min-width:52px;text-align:center;font-size:18px">${S.settings.minPct}%</span><button data-act="minpct" data-d="5" aria-label="mehr">+</button></div></div>
    ${Benachr.NATIVE ? sw("woche", S.settings.woche, "Wochenerinnerung", "Montag und Donnerstag 8:00 Uhr, wenn neue Prospekte starten") : ""}
    <div class="opt"><div class="grow small muted">Die App prüft beim Öffnen auf neue Treffer. Meldungen im Hintergrund (ohne dass du die App öffnest) folgen mit der echten Datenquelle.</div></div>
    <div class="row" style="gap:10px;padding:6px 0 10px">${S.notif !== "an" && S.notif !== "nicht-moeglich" ? `<button class="btn gelb" data-act="notif-an">Erlauben</button>` : ""}<button class="btn leise" data-act="test">Test-Meldung</button></div></div>
  <div class="sektion"><h2>Märkte in ${esc(S.daten.ort ? S.daten.ort.name : "deiner Nähe")}</h2></div><div class="card pad" style="padding-block:4px">
    ${S.daten.laeden.map(l => sw("laden:" + l.id, aktiveLaeden().includes(l.id), `<span class="chip" style="--c:${l.farbe};border:0;padding:0;background:none"><i></i>${esc(l.name)}</span>`, "", l.name)).join("")}</div>
  <div class="sektion"><h2>Darstellung</h2></div><div class="card pad"><div class="seg">${[["auto", "Automatisch"], ["light", "Hell"], ["dark", "Dunkel"]].map(([k, n]) => `<button data-act="theme" data-k="${k}" class="${(S.settings.theme === "auto" ? "auto" : S.settings.theme) === k ? "on" : ""}">${n}</button>`).join("")}</div></div>
  <div class="sektion"><h2>Daten</h2></div><div class="card pad small"><div><b>Quelle:</b> ${q}</div><div class="muted" style="margin-top:4px">Stand: ${new Date(S.daten.stand).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}</div>
    <div class="muted" style="margin-top:8px">Vorrat und Einstellungen bleiben nur auf diesem Gerät gespeichert.</div></div>`;
}
function wendeThemeAn() {
  const t = S.settings.theme;
  if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
}

/* ---------- Detail-Sheet ---------- */
function detailSheet(wid, aid) {
  const r = S.erg.find(x => x.wunsch.id === wid); if (!r) return;
  const b = r.liste.find(x => x.angebot.id === aid) || r.bester; if (!b) return;
  const a = b.angebot, p = S.daten.prospekte.find(x => x.id === a.prospektId);
  const andere = r.liste.filter(x => x !== b);
  sheet(`<div class="row" style="gap:14px;margin-bottom:12px"><div class="stk big ${stkKlasse(b.pct)}"><i></i><b>${b.pct > 0 ? MIN + b.pct + "%" : "±0"}</b></div>
      <div class="grow"><div class="kicker mono">${esc(r.wunsch.name)} · ${r.wunsch.menge}×</div><h2>${esc(a.artikel)}</h2><div class="small muted">${esc(a.marke || "")} · ${esc(mengeText(a.menge))}</div>
      <div class="row" style="gap:7px;margin-top:7px;flex-wrap:wrap">${chip(a.laden)}<span class="tag ${b.verdict.key}">${b.verdict.text}</span></div></div></div>
    <table class="tabelle"><tr><td>Angebotspreis</td><td>${eur(a.preis)}</td></tr>
      <tr><td>${b.refQuelle === "eigener" ? "Dein üblicher Preis" : "Normalpreis laut Prospekt"}</td><td>${b.ref ? eur(b.ref) : "–"}</td></tr>
      ${b.grund ? `<tr><td>Preis pro ${b.grund.einheit}</td><td>${eur(b.grund.preis)}</td></tr>` : ""}
      <tr><td>Menge</td><td>${b.kaufbar} Stück</td></tr>
      <tr><td>Kosten gesamt</td><td>${eur(b.kosten)}</td></tr>
      <tr class="sum"><td>Du sparst</td><td>${eur(b.ersparnis)}</td></tr></table>
    ${b.limit && r.wunsch.menge > b.limit ? `<div class="hinweis" style="box-shadow:none;margin:10px 0"><span style="font-size:22px">⚠️</span><span><b>Limit: max. ${b.limit} pro Kunde</b><span class="small">Du wolltest ${r.wunsch.menge} – für den Rest brauchst du einen anderen Markt oder einen zweiten Einkauf.</span></span></div>` : ""}
    <p class="small muted" style="margin:10px 0">Gültig ${dat(a.gueltigVon)} – ${dat(a.gueltigBis)}${a.seite ? " · Seite " + a.seite + " im Prospekt" : ""}${b.kommt ? " · <b>noch nicht gültig (Vorschau)</b>" : ""}</p>
    ${p && p.url ? `<a class="btn gelb voll" style="display:block;text-align:center;text-decoration:none;margin-bottom:12px" href="${esc(p.url)}" target="_blank" rel="noopener">Prospektseite öffnen</a>` : ""}
    ${andere.length ? `<div class="sektion"><h2>Auch im Angebot</h2></div><div class="card pad" style="padding-block:4px;box-shadow:none">${andere.map(x => `<div class="zeile tapzeile" data-act="detail" data-w="${wid}" data-a="${x.angebot.id}" style="cursor:pointer">${chip(x.angebot.laden)}<span class="grow mono"><b>${eur(x.angebot.preis)}</b></span><span class="tag ${x.verdict.key}">${pctText(x.pct)}</span></div>`).join("")}</div>` : ""}
    <button class="btn leise voll" style="margin-top:14px" data-act="close">Schließen</button>`);
}

/* ---------- Sheet-Mechanik ---------- */
let sheetOffen = false;
function sheet(html, mount) {
  const root = $("#sheetRoot");
  root.innerHTML = `<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true">${'<div class="grab"></div>'}${html}</div>`;
  requestAnimationFrame(() => root.classList.add("show"));
  if (!sheetOffen) { try { history.pushState({ sheet: 1 }, ""); } catch (e) { /* egal */ } sheetOffen = true; }
  if (mount) mount($(".sheet", root));
}
function schliesse(ausPop) {
  if (!sheetOffen) return;
  sheetOffen = false;
  const root = $("#sheetRoot"); root.classList.remove("show");
  setTimeout(() => { if (!sheetOffen) root.innerHTML = ""; }, 260);
  if (!ausPop && history.state && history.state.sheet) history.back();
}
window.addEventListener("popstate", () => { if (sheetOffen) schliesse(true); });

/* ---------- Ereignisse ---------- */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case "tab": if (sheetOffen) schliesse(); gehe(d.k); break;
    case "close": schliesse(); break;
    case "detail": detailSheet(d.w, d.a); break;
    case "vorschlag": addWunsch(d.n); break;
    case "edit": editSheet(d.w); break;
    case "delwish": {
      const w = S.wuensche.find(x => x.id === d.w);
      S.wuensche = S.wuensche.filter(x => x.id !== d.w); sichern(); berechne(); schliesse(); render(); toast((w ? w.name : "Artikel") + " gelöscht");
      break;
    }
    case "plus": {
      const a = S.daten.angebote.find(x => x.id === d.a); if (!a) break;
      const name = a.artikel.split(" ")[0];
      if (S.wuensche.some(w => Logik.passt(w.name, a))) { toast("Schon auf deiner Liste"); break; }
      S.wuensche.unshift({ id: uid(), name, menge: 10, normalpreis: null, minPct: null });
      sichern(); berechne(); renderTabs();
      el.classList.add("ist"); el.textContent = "✓"; toast(name + " zur Vorratsliste hinzugefügt");
      break;
    }
    case "laden": ladenSheet(d.l); break;
    case "toggle": {
      if (d.k.startsWith("laden:")) {
        const id = d.k.slice(6), akt = aktiveLaeden();
        S.settings.laeden = akt.includes(id) ? akt.filter(x => x !== id) : akt.concat(id);
        if (!S.settings.laeden.length) { S.settings.laeden = akt; toast("Mindestens ein Markt muss aktiv bleiben"); }
      } else {
        S.settings[d.k] = !S.settings[d.k];
        if (d.k === "meldungen" && S.settings.meldungen) await erlaubnisHolen();
        if (d.k === "woche" || d.k === "meldungen") await Benachr.wochenErinnerung(S.settings.meldungen && S.settings.woche);
      }
      sichern(); berechne(); render();
      break;
    }
    case "minpct": S.settings.minPct = Math.min(80, Math.max(5, S.settings.minPct + Number(d.d))); sichern(); render(); break;
    case "theme": S.settings.theme = d.k; sichern(); wendeThemeAn(); render(); break;
    case "notif-an": await erlaubnisHolen(); render(); break;
    case "test": {
      const ok = await Benachr.zeigen("Angebots-Radar", "So sieht eine Meldung aus: Haferflocken " + MIN + "34 % bei LIDL.", { tab: "treffer" });
      toast(ok ? "Test-Meldung gesendet" : "Keine Erlaubnis für Benachrichtigungen");
      break;
    }
  }
});
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault();
  if (f.dataset.form === "add") { const i = $("[name=n]", f); if (addWunsch(i.value)) i.value = ""; }
  if (f.dataset.form === "edit") {
    const w = S.wuensche.find(x => x.id === f.dataset.w); if (!w) return;
    const nm = $("[name=name]", f).value.trim(); if (!nm) return;
    w.name = nm;
    w.menge = Math.min(99, Math.max(1, parseInt($("[name=menge]", f).value, 10) || 1));
    const pr = parseFloat(String($("[name=preis]", f).value).replace(",", "."));
    w.normalpreis = pr > 0 ? Math.round(pr * 100) / 100 : null;
    const mn = parseInt($("[name=min]", f).value, 10);
    w.minPct = mn > 0 ? Math.min(90, mn) : null;
    sichern(); berechne(); schliesse(); render(); toast("Gespeichert");
  }
});

/* ---------- Benachrichtigungen ---------- */
async function erlaubnisHolen() {
  const ok = await Benachr.fragen();
  S.notif = await Benachr.status();
  if (ok) { await Benachr.wochenErinnerung(S.settings.meldungen && S.settings.woche); toast("Benachrichtigungen sind an"); await pruefeNeue(); }
  return ok;
}
async function pruefeNeue() {
  if (!S.settings.meldungen || S.notif !== "an") return;
  const neu = Logik.neueMeldungen(S.erg, S.gesehen, S.settings.minPct);
  if (!neu.length) return;
  const m = Logik.meldungsText(neu);
  if (await Benachr.zeigen(m.titel, m.text, { tab: "treffer" })) {
    neu.forEach(n => { S.gesehen[n.key] = Date.now(); });
    const grenze = Date.now() - 60 * 864e5;
    Object.keys(S.gesehen).forEach(k => { if (S.gesehen[k] < grenze) delete S.gesehen[k]; });
    sichern();
  }
}

/* ---------- Start ---------- */
async function start() {
  wendeThemeAn();
  S.daten = await Quelle.laden();
  berechne();
  S.notif = await Benachr.status();
  render();
  Benachr.beiKlick(extra => { gehe(extra.tab || "treffer"); });
  await pruefeNeue();
  if (S.settings.meldungen && S.settings.woche) Benachr.wochenErinnerung(true);
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    S.daten = await Quelle.laden(); berechne(); S.notif = await Benachr.status(); render(); pruefeNeue();
  });
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => { /* ohne SW weiter */ });
}
start();
