"use strict";
/* Angebots-Radar – Datenquelle (die einzige Stelle, die später gegen echte Daten getauscht wird).
 *
 * Vertrag: Quelle.laden() liefert ein Objekt
 *   { quelle:"demo"|"json", stand:ISO-Zeit, ort:{name,plz},
 *     laeden:[{id,name,farbe}],
 *     prospekte:[{id,laden,titel,gueltigVon,gueltigBis,url|null}],
 *     angebote:[{id,laden,artikel,marke,kategorie,menge:{wert,einheit},preis,normalpreis,
 *                limitProKunde|null,gueltigVon,gueltigBis,seite,prospektId}] }
 * Heute: Beispieldaten, die sich selbst auf die aktuelle Woche datieren.
 * Später: QUELLE_URL auf eine angebote.json setzen (gleiches Format) – die App merkt keinen Unterschied.
 */
const Quelle = (() => {
  const QUELLE_URL = null; // z. B. "./angebote.json" oder die URL eines eigenen Dienstes

  const ORT = { name: "Hamburg-Bergedorf", plz: "21029" };
  /* start: Wochentag, an dem der Prospekt wechselt (1 = Montag … 4 = Donnerstag) */
  const LAEDEN = [
    { id: "aldi", name: "ALDI Nord", farbe: "#2D5E9E", start: 1 },
    { id: "rewe", name: "REWE", farbe: "#B3261E", start: 1 },
    { id: "penny", name: "PENNY", farbe: "#C2410C", start: 1 },
    { id: "lidl", name: "LIDL", farbe: "#8A6D00", start: 1 },
    { id: "edeka", name: "EDEKA", farbe: "#17776F", start: 1 },
    { id: "kaufland", name: "KAUFLAND", farbe: "#6B3FA0", start: 4 }
  ];

  /* [artikel, marke, wert, einheit, preis, normalpreis, limit, seite] */
  const DEMO = {
    aldi: [
      ["Haferflocken zart", "Eigenmarke", 500, "g", 0.99, 1.29, null, 3],
      ["Spaghetti", "Eigenmarke", 500, "g", 0.89, 1.19, null, 3],
      ["Kaffee gemahlen", "Röstfein", 500, "g", 4.99, 6.99, 4, 5],
      ["Olivenöl nativ extra", "Eigenmarke", 750, "ml", 4.99, 6.49, null, 6],
      ["Passierte Tomaten", "Eigenmarke", 500, "g", 0.69, 0.89, null, 4],
      ["H-Milch 3,5 %", "Eigenmarke", 1, "l", 0.99, 1.15, null, 7]
    ],
    rewe: [
      ["Haferflocken kernig Bio", "Bio", 500, "g", 1.49, 1.99, null, 4],
      ["Butter mild gesäuert", "Markenbutter", 250, "g", 1.79, 2.39, null, 2],
      ["Eier Freilandhaltung", "Freiland", 10, "Stk", 2.49, 3.29, null, 5],
      ["Basmati Reis", "Markenreis", 1, "kg", 2.49, 3.49, null, 8],
      ["Früchte-Müsli", "Markenmüsli", 750, "g", 2.99, 3.99, null, 9],
      ["Linsen rot", "Eigenmarke", 500, "g", 1.69, 1.99, null, 8]
    ],
    penny: [
      ["Haferflocken zart", "Eigenmarke", 500, "g", 1.09, 1.39, null, 2],
      ["Penne Nudeln", "Eigenmarke", 500, "g", 0.79, 1.09, null, 2],
      ["Haferdrink natur", "Eigenmarke", 1, "l", 1.19, 1.69, null, 6],
      ["Vollmilch-Schokolade", "Eigenmarke", 100, "g", 0.69, 0.95, 10, 7],
      ["Kaffeebohnen", "Röstmeister", 1, "kg", 7.99, 11.49, 2, 4],
      ["Passierte Tomaten", "Eigenmarke", 500, "g", 0.75, 0.89, null, 3]
    ],
    lidl: [
      ["Haferflocken zart", "Eigenmarke", 500, "g", 0.79, 1.19, 12, 3],
      ["Butter", "Eigenmarke", 250, "g", 1.59, 2.29, 6, 2],
      ["Spaghetti", "Eigenmarke", 500, "g", 0.79, 1.09, null, 4],
      ["Weizenmehl Type 405", "Eigenmarke", 1, "kg", 0.89, 1.19, null, 8],
      ["Zucker", "Eigenmarke", 1, "kg", 0.99, 1.39, null, 8],
      ["Orangensaft", "Eigenmarke", 1, "l", 1.29, 1.79, null, 9],
      ["Passierte Tomaten", "Eigenmarke", 500, "g", 0.59, 0.79, null, 5]
    ],
    edeka: [
      ["Haferflocken Großpackung", "Markenhafer", 1, "kg", 2.29, 2.79, null, 5],
      ["Kaffee Bohnen", "Markenkaffee", 500, "g", 5.49, 7.99, 3, 3],
      ["Olivenöl", "Markenöl", 500, "ml", 4.49, 5.99, null, 6],
      ["Joghurt 1,5 %", "Eigenmarke", 500, "g", 0.99, 1.29, null, 7],
      ["Langkornreis", "Eigenmarke", 1, "kg", 1.99, 2.49, null, 9],
      ["Eier Bodenhaltung", "Bodenhaltung", 10, "Stk", 2.29, 2.99, null, 4]
    ],
    kaufland: [
      ["Haferflocken zart", "Eigenmarke", 500, "g", 0.89, 1.15, null, 4],
      ["Fusilli Nudeln", "Eigenmarke", 500, "g", 0.85, 1.15, null, 3],
      ["Butter", "Eigenmarke", 250, "g", 1.69, 2.19, null, 2],
      ["Thunfisch in Wasser", "Eigenmarke", 195, "g", 1.19, 1.69, 8, 6],
      ["Cornflakes", "Eigenmarke", 500, "g", 1.49, 2.19, null, 7],
      ["Frischmilch 3,8 %", "Eigenmarke", 1, "l", 1.09, 1.39, null, 5]
    ]
  };

  const p2 = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  const addTage = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; };

  /* Prospektwoche: Mo–Sa, am Wochenende zeigen wir schon die nächste Woche (Vorschau).
     Kaufland wechselt donnerstags (Do–Mi). */
  function zeitraum(laden, jetzt) {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
    const dow = d.getDay(); // 0 So … 6 Sa
    if (laden.start === 4) {
      const zurueck = (dow + 7 - 4) % 7; // Tage seit letztem Donnerstag
      const von = addTage(d, -zurueck);
      return [iso(von), iso(addTage(von, 6))];
    }
    const ab = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow; // nächster bzw. letzter Montag
    const von = addTage(d, ab);
    return [iso(von), iso(addTage(von, 5))];
  }

  function demo(jetzt) {
    const prospekte = [], angebote = [];
    for (const l of LAEDEN) {
      const [von, bis] = zeitraum(l, jetzt);
      const pid = l.id + "-" + von;
      prospekte.push({ id: pid, laden: l.id, titel: l.name + " – Angebote", gueltigVon: von, gueltigBis: bis, url: null });
      DEMO[l.id].forEach((r, i) => {
        angebote.push({
          id: pid + "-" + i, laden: l.id, ladenName: l.name, artikel: r[0], marke: r[1], kategorie: "Lebensmittel",
          menge: { wert: r[2], einheit: r[3] }, preis: r[4], normalpreis: r[5], limitProKunde: r[6],
          gueltigVon: von, gueltigBis: bis, seite: r[7], prospektId: pid
        });
      });
    }
    return { quelle: "demo", stand: jetzt.toISOString(), ort: ORT, laeden: LAEDEN.map(l => ({ id: l.id, name: l.name, farbe: l.farbe })), prospekte, angebote };
  }

  async function laden(jetzt) {
    jetzt = jetzt || new Date();
    if (QUELLE_URL) {
      try {
        const res = await fetch(QUELLE_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = await res.json();
        const namen = Object.fromEntries((d.laeden || []).map(l => [l.id, l.name]));
        (d.angebote || []).forEach(a => { a.ladenName = a.ladenName || namen[a.laden] || a.laden; });
        d.quelle = d.quelle || "json";
        return d;
      } catch (e) { /* offline oder Fehler: auf Beispieldaten zurückfallen, damit die App nutzbar bleibt */ }
    }
    return demo(jetzt);
  }

  return { laden, demo, LAEDEN, ORT };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Quelle;
