"use strict";
/* Angebots-Radar – Rechenkern ohne Oberfläche (läuft im Browser und in Node, daher testbar).
 *
 * Datenformat der Angebote (das muss die spätere Datenquelle liefern, siehe README.md):
 *   { id, laden, artikel, marke, menge:{wert,einheit}, preis, normalpreis,
 *     limitProKunde, gueltigVon:"YYYY-MM-DD", gueltigBis:"YYYY-MM-DD", seite, prospektId }
 * Datenformat eines Wunsches (Vorrats-Artikel):
 *   { id, name, menge, normalpreis|null, minPct|null }
 */
(function (root) {
  const SYN = {
    nudeln: ["spaghetti", "penne", "fusilli", "pasta", "makkaroni", "tagliatelle"],
    klopapier: ["toilettenpapier"],
    hafermilch: ["haferdrink"],
    haferdrink: ["hafermilch"],
    sahne: ["schlagsahne"],
    "h milch": ["haltbare milch"],
    huhn: ["haehnchen", "hahnchen", "geflügel"],
    zahnpasta: ["zahncreme"]
  };

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  const UNITS = new Set(["g", "kg", "ml", "l", "stk", "stueck", "x", "pack", "packung", "packungen"]);

  function tokens(s) {
    return norm(s).split(" ").filter(t => t.length >= 3 && !/^\d+$/.test(t) && !UNITS.has(t));
  }
  /* kleine Verkürzung, damit "Tomaten" auch "Tomate" findet (nur bei längeren Wörtern) */
  function stem(t) { return t.length >= 6 ? t.replace(/(en|n|e|s)$/, "") : t; }

  function haystack(a) { return norm([a.artikel, a.marke, a.kategorie].filter(Boolean).join(" ")); }

  /* Passt der Wunsch zum Angebot? Alle Suchwörter müssen (auch als Wortteil) vorkommen. */
  function passt(wunschName, angebot) {
    const hay = haystack(angebot);
    const toks = tokens(wunschName);
    if (!toks.length) return false;
    const key = norm(wunschName);
    const alt = SYN[key] || [];
    if (alt.some(x => hay.includes(norm(x)))) return true;
    return toks.every(t => {
      if (hay.includes(stem(t))) return true;
      return (SYN[t] || []).some(x => hay.includes(norm(x)));
    });
  }

  /* Preis pro kg / l / Stück, damit verschieden große Packungen vergleichbar sind */
  function grundpreis(a) {
    const m = a && a.menge;
    if (!m || !(m.wert > 0) || !(a.preis >= 0)) return null;
    const u = String(m.einheit).toLowerCase();
    if (u === "g") return { preis: a.preis / (m.wert / 1000), einheit: "kg" };
    if (u === "kg") return { preis: a.preis / m.wert, einheit: "kg" };
    if (u === "ml") return { preis: a.preis / (m.wert / 1000), einheit: "l" };
    if (u === "l") return { preis: a.preis / m.wert, einheit: "l" };
    if (u === "stk") return { preis: a.preis / m.wert, einheit: "Stück" };
    return null;
  }

  function mengeText(m) {
    if (!m) return "";
    const w = String(m.wert).replace(".", ",");
    return m.einheit === "Stk" ? w + " Stück" : w + " " + m.einheit;
  }

  function verdict(pct) {
    if (pct >= 30) return { key: "top", text: "Top-Angebot" };
    if (pct >= 15) return { key: "gut", text: "Gutes Angebot" };
    if (pct > 0) return { key: "ok", text: "Geht so" };
    return { key: "nix", text: "Kein Preisvorteil" };
  }

  function heute(d) {
    d = d || new Date();
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* Bewertung eines Angebots für einen Wunsch */
  function bewerte(wunsch, a, jetzt) {
    const ref = wunsch.normalpreis > 0 ? wunsch.normalpreis : (a.normalpreis > 0 ? a.normalpreis : null);
    const refQuelle = wunsch.normalpreis > 0 ? "eigener" : (ref ? "prospekt" : null);
    const pct = ref ? Math.round((1 - a.preis / ref) * 100) : 0;
    const wunschMenge = Math.max(1, Math.round(wunsch.menge || 1));
    const limit = a.limitProKunde > 0 ? a.limitProKunde : null;
    const kaufbar = limit ? Math.min(wunschMenge, limit) : wunschMenge;
    return {
      angebot: a, pct, ref, refQuelle,
      verdict: verdict(pct),
      grund: grundpreis(a),
      menge: wunschMenge, kaufbar, limit,
      kosten: round2(a.preis * kaufbar),
      ersparnis: ref ? round2((ref - a.preis) * kaufbar) : 0,
      kommt: a.gueltigVon > (jetzt || heute())
    };
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  /* Alle Treffer pro Wunsch, bester zuerst */
  function treffer(wuensche, angebote, jetzt, aktiveLaeden) {
    jetzt = jetzt || heute();
    return wuensche.map(w => {
      const liste = angebote
        .filter(a => a.gueltigBis >= jetzt && (!aktiveLaeden || aktiveLaeden.includes(a.laden)) && passt(w.name, a))
        .map(a => bewerte(w, a, jetzt))
        .sort((x, y) => (y.pct - x.pct) || (x.angebot.preis - y.angebot.preis));
      return { wunsch: w, liste, bester: liste[0] || null };
    });
  }

  /* Welche Treffer sind neu und gut genug für eine Benachrichtigung? */
  function neueMeldungen(ergebnis, gesehen, standardMin) {
    const out = [];
    for (const r of ergebnis) {
      const b = r.bester;
      if (!b) continue;
      const min = r.wunsch.minPct != null ? r.wunsch.minPct : standardMin;
      if (b.pct < min || b.pct <= 0) continue;
      const key = b.angebot.id + "@" + b.angebot.gueltigBis;
      if (gesehen && gesehen[key]) continue;
      out.push({ key, wunsch: r.wunsch, treffer: b });
    }
    return out;
  }

  function eur(n) {
    return (Math.round(n * 100) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  }

  function meldungsText(neu) {
    const teil = neu.slice(0, 3).map(n => n.wunsch.name + " −" + n.treffer.pct + " % bei " + (n.treffer.angebot.ladenName || n.treffer.angebot.laden));
    const mehr = neu.length > 3 ? " … +" + (neu.length - 3) + " weitere" : "";
    return {
      titel: neu.length === 1 ? "Angebot für deinen Vorrat" : neu.length + " Angebote für deinen Vorrat",
      text: teil.join(" · ") + mehr
    };
  }

  const api = { norm, tokens, passt, grundpreis, mengeText, verdict, heute, bewerte, treffer, neueMeldungen, eur, meldungsText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Logik = api;
})(typeof window !== "undefined" ? window : globalThis);
