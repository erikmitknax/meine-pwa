"use strict";
const test = require("node:test");
const assert = require("node:assert");
const L = require("../logik.js");
const Q = require("../quelle.js");

const SA = new Date(2026, 9, 24); // Samstag 24.10.2026
const daten = Q.demo(SA);
const heute = L.heute(SA);
const w = (name, extra) => Object.assign({ id: name, name, menge: 10, normalpreis: null, minPct: null }, extra);

test("Prospektzeiträume: Samstag zeigt die nächste Woche, Kaufland wechselt donnerstags", () => {
  const von = id => daten.prospekte.find(p => p.laden === id).gueltigVon;
  assert.equal(von("lidl"), "2026-10-26");
  assert.equal(von("kaufland"), "2026-10-22");
  const mi = Q.demo(new Date(2026, 9, 21));
  assert.equal(mi.prospekte.find(p => p.laden === "lidl").gueltigVon, "2026-10-19");
  assert.equal(mi.prospekte.find(p => p.laden === "kaufland").gueltigVon, "2026-10-15");
});

test("Haferflocken: bester Treffer, Prozent, Kosten und Ersparnis für 10 Stück", () => {
  const r = L.treffer([w("Haferflocken")], daten.angebote, heute, null)[0];
  assert.equal(r.bester.angebot.laden, "lidl");
  assert.equal(r.bester.pct, 34);
  assert.equal(r.bester.kosten, 7.9);
  assert.equal(r.bester.ersparnis, 4);
  assert.ok(r.liste.length >= 5, "mehrere Märkte gefunden");
  assert.ok(!r.liste.some(x => /drink/i.test(x.angebot.artikel)), "Haferdrink ist keine Haferflocke");
});

test("Synonyme und Wortformen: Nudeln, Tomaten", () => {
  const e = L.treffer([w("Nudeln"), w("Tomaten")], daten.angebote, heute, null);
  assert.ok(e[0].liste.length >= 3);
  assert.ok(e[1].liste.length >= 3);
});

test("Unbekannter Artikel hat keinen Treffer", () => {
  assert.equal(L.treffer([w("Kaviar")], daten.angebote, heute, null)[0].bester, null);
});

test("Eigener üblicher Preis ersetzt den Prospekt-Normalpreis", () => {
  const b = L.treffer([w("Butter", { normalpreis: 2.49 })], daten.angebote, heute, ["lidl"])[0].bester;
  assert.equal(b.refQuelle, "eigener");
  assert.equal(b.pct, Math.round((1 - 1.59 / 2.49) * 100));
});

test("Limit pro Kunde begrenzt die Menge", () => {
  const b = L.treffer([w("Haferflocken", { menge: 20 })], daten.angebote, heute, ["lidl"])[0].bester;
  assert.equal(b.limit, 12);
  assert.equal(b.kaufbar, 12);
});

test("Läden lassen sich abwählen, abgelaufene Angebote fallen raus", () => {
  const ohneLidl = L.treffer([w("Haferflocken")], daten.angebote, heute, ["rewe", "aldi"])[0];
  assert.ok(ohneLidl.liste.every(x => ["rewe", "aldi"].includes(x.angebot.laden)));
  assert.equal(L.treffer([w("Haferflocken")], daten.angebote, "2027-01-01", null)[0].bester, null);
});

test("Meldungen: nur neue Treffer über der Schwelle, nie doppelt", () => {
  const erg = L.treffer([w("Haferflocken"), w("Kaviar")], daten.angebote, heute, null);
  const neu = L.neueMeldungen(erg, {}, 15);
  assert.equal(neu.length, 1);
  assert.equal(L.neueMeldungen(erg, { [neu[0].key]: 1 }, 15).length, 0);
  assert.equal(L.neueMeldungen(erg, {}, 50).length, 0, "Schwelle 50 % wird nicht erreicht");
  assert.equal(L.neueMeldungen(L.treffer([w("Haferflocken", { minPct: 10 })], daten.angebote, heute, null), {}, 50).length, 1, "Schwelle pro Artikel gilt vor Standard");
});

test("Grundpreis pro kg/l", () => {
  assert.deepEqual(L.grundpreis({ preis: 0.79, menge: { wert: 500, einheit: "g" } }), { preis: 1.58, einheit: "kg" });
  assert.equal(L.grundpreis({ preis: 1.19, menge: { wert: 1, einheit: "l" } }).einheit, "l");
});
