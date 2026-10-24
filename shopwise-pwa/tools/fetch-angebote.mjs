// Holt die Wochenangebote (Aldi Nord, Rewe, Edeka) über den Apify-Actor "nerdrx/de-supermarket-offers"
// und schreibt sie nach data/angebote.json. Läuft in der GitHub Action (Secret APIFY_TOKEN).
// Schutz vor Kosten: maxTotalChargeUsd begrenzt den Preis pro Lauf hart.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.APIFY_TOKEN;
if (!token) { console.error('APIFY_TOKEN fehlt (GitHub: Settings → Secrets → Actions).'); process.exit(1); }

const CHAINS = (process.env.CHAINS || 'aldi-nord,rewe,edeka').split(',');
const MAX_USD = process.env.MAX_USD || '1.00';
import { termsFor } from '../js/angebote-logik.js';

// Grundliste (häufige Lebensmittel) + persönliche Begriffe aus deinem Bestand und deiner Merkliste.
// Persönliche Begriffe kommen aus Firebase und brauchen die Secrets FIREBASE_EMAIL / FIREBASE_PASSWORD
// (dein Shopwise-Konto). Fehlen sie oder klappt der Abruf nicht, gilt nur die Grundliste.
const keywords = JSON.parse(readFileSync(join(root, 'data/suchbegriffe.json'), 'utf8')).begriffe;

async function personalTerms() {
  const email = process.env.FIREBASE_EMAIL, password = process.env.FIREBASE_PASSWORD;
  if (!email || !password) { console.log('Persönliche Begriffe: übersprungen (Secrets FIREBASE_EMAIL/FIREBASE_PASSWORD fehlen)'); return []; }
  try {
    const cfg = await import('../js/firebase-config.js');
    const { apiKey, projectId } = cfg.FIREBASE_CONFIG;
    const headers = { 'content-type': 'application/json', referer: 'https://erikmitknax.github.io/' };
    const lr = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      { method: 'POST', headers, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const login = await lr.json();
    if (!lr.ok) throw new Error('Anmeldung: ' + (login.error && login.error.message));
    const out = [];
    for (const col of ['sw_stock', 'sw_watch']) {
      let token = '';
      do {
        const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${login.localId}/${col}?pageSize=300${token ? '&pageToken=' + token : ''}`,
          { headers: { authorization: 'Bearer ' + login.idToken, referer: headers.referer } });
        const j = await r.json();
        if (!r.ok) throw new Error(col + ': ' + (j.error && j.error.message));
        for (const doc of j.documents || []) {
          const f = doc.fields || {};
          if (f.del && f.del.booleanValue) continue;
          const d = ((f.d || {}).mapValue || {}).fields || {};
          const str = (k) => (d[k] || {}).stringValue || '';
          if (str('name')) out.push(...termsFor({ name: str('name'), search: str('search'), exclude: '' }).terms);
        }
        token = j.nextPageToken || '';
      } while (token);
    }
    console.log(`Persönliche Begriffe: ${out.length}`);
    return out;
  } catch (e) {
    console.warn('Persönliche Begriffe nicht geladen – nur Grundliste:', e.message);
    return [];
  }
}
const extra = await personalTerms();
const seen = new Set(keywords.map((k) => k.toLowerCase()));
for (const t of extra) if (!seen.has(t)) { seen.add(t); keywords.push(t); }
const input = { chains: CHAINS, keywords, maxItems: 600, maxPerChain: 250 };

const url = `https://api.apify.com/v2/acts/nerdrx~de-supermarket-offers/run-sync-get-dataset-items?token=${token}&maxTotalChargeUsd=${MAX_USD}&clean=true`;
const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
if (!res.ok) { console.error('Apify-Fehler', res.status, (await res.text()).slice(0, 300)); process.exit(1); }
const rows = await res.json();
if (!Array.isArray(rows) || !rows.length) { console.error('Keine Angebote erhalten – alte Datei bleibt bestehen.'); process.exit(1); }

const num = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : null);
const offers = rows.filter((r) => r && r.title && num(r.price) !== null).map((r) => ({
  id: String(r.id), chain: r.chain, title: String(r.title).trim(), brand: r.brand || null,
  price: num(r.price), priceOld: num(r.priceOld), discount: num(r.discountPercent),
  unit: r.unit || null, perUnit: r.pricePerUnit || null, from: r.validFrom || null, to: r.validTo || null,
  category: r.category || null, store: r.storeId || null,
}));
const counts = {};
for (const o of offers) counts[o.chain] = (counts[o.chain] || 0) + 1;
const out = { updated: new Date().toISOString(), counts, offers };
writeFileSync(join(root, 'data/angebote.json'), JSON.stringify(out) + '\n');
console.log(`${offers.length} Angebote gespeichert`, counts);
