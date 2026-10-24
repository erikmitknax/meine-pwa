// Holt die Wochenangebote und schreibt sie nach data/angebote.json. Läuft in der GitHub Action (Secret APIFY_TOKEN).
//  - Rewe + Edeka: Marktguru-Actor "trev0n/marktguru-gazetki-scraper" (nach Postleitzahl, Suche je Lebensmittel)
//  - Aldi Nord:   Actor "nerdrx/de-supermarket-offers" (Marktguru liefert Aldi nicht)
//  - Fällt der Marktguru-Actor aus, holt der zweite Actor auch Rewe und Edeka.
// Schutz vor Kosten: maxTotalChargeUsd begrenzt den Preis jedes Actor-Laufs hart.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromMarktguru, fromSupermarket, dedupe } from './normalize.mjs';
import { termsFor } from '../js/angebote-logik.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.APIFY_TOKEN;
if (!token) { console.error('APIFY_TOKEN fehlt (GitHub: Settings → Secrets → Actions).'); process.exit(1); }

const POSTAL = process.env.POSTAL_CODE || '21029';                  // Hamburg-Bergedorf
const MAX_USD_MG = process.env.MAX_USD_MARKTGURU || '0.35';
const MAX_USD_SM = process.env.MAX_USD_SUPERMARKT || '0.60';
const MG_MAX_ITEMS = Number(process.env.MG_MAX_ITEMS || 200);

const staticTerms = JSON.parse(readFileSync(join(root, 'data/suchbegriffe.json'), 'utf8')).begriffe;

/* ---- Persönliche Begriffe aus Firebase (Bestand + Merkliste); brauchen FIREBASE_EMAIL / FIREBASE_PASSWORD ---- */
async function personal() {
  const email = process.env.FIREBASE_EMAIL, password = process.env.FIREBASE_PASSWORD;
  const none = { names: [], variants: [] };
  if (!email || !password) { console.log('Persönliche Begriffe: übersprungen (Secrets FIREBASE_EMAIL/FIREBASE_PASSWORD fehlen)'); return none; }
  try {
    const { FIREBASE_CONFIG } = await import('../js/firebase-config.js');
    const { apiKey, projectId } = FIREBASE_CONFIG;
    const referer = 'https://erikmitknax.github.io/';
    const lr = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      { method: 'POST', headers: { 'content-type': 'application/json', referer }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const login = await lr.json();
    if (!lr.ok) throw new Error('Anmeldung: ' + (login.error && login.error.message));
    const names = [], variants = [];
    for (const col of ['sw_stock', 'sw_watch']) {
      let page = '';
      do {
        const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${login.localId}/${col}?pageSize=300${page ? '&pageToken=' + page : ''}`,
          { headers: { authorization: 'Bearer ' + login.idToken, referer } });
        const j = await r.json();
        if (!r.ok) throw new Error(col + ': ' + (j.error && j.error.message));
        for (const doc of j.documents || []) {
          const f = doc.fields || {};
          if (f.del && f.del.booleanValue) continue;
          const d = ((f.d || {}).mapValue || {}).fields || {};
          const str = (k) => (d[k] || {}).stringValue || '';
          const name = str('name');
          if (!name) continue;
          names.push(name, ...str('search').split(/[,;]/).map((x) => x.trim()).filter(Boolean));
          variants.push(...termsFor({ name, search: str('search'), exclude: '' }).terms);
        }
        page = j.nextPageToken || '';
      } while (page);
    }
    console.log(`Persönliche Begriffe: ${names.length}`);
    return { names, variants };
  } catch (e) {
    console.warn('Persönliche Begriffe nicht geladen – feste Wortliste wird verwendet:', e.message);
    return none;
  }
}

const uniq = (list) => {
  const seen = new Set();
  return list.filter((t) => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};

async function runActor(actor, input, maxUsd) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&maxTotalChargeUsd=${maxUsd}&clean=true`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`${actor}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`${actor}: unerwartete Antwort`);
  return rows;
}

const { names, variants } = await personal();
const havePersonal = names.length > 0;

/* ---- 1) Marktguru: Rewe + Edeka für die Postleitzahl ---- */
let offers = [];
let mgChains = new Set();
try {
  const searchTerms = uniq(havePersonal ? names : staticTerms).slice(0, 80);
  const rows = await runActor('trev0n~marktguru-gazetki-scraper', {
    country: 'DE', postalCode: POSTAL, retailers: ['REWE', 'Edeka'], searchTerms,
    outputType: 'offers', validity: 'current', maxItems: MG_MAX_ITEMS, compact: false,
  }, MAX_USD_MG);
  const got = rows.map(fromMarktguru).filter(Boolean).filter((o) => o.chain === 'rewe' || o.chain === 'edeka');
  offers.push(...got);
  mgChains = new Set(got.map((o) => o.chain));
  console.log(`Marktguru: ${got.length} Angebote (${[...mgChains].join(', ') || 'keine'}), ${searchTerms.length} Suchbegriffe`);
} catch (e) {
  console.warn('Marktguru fehlgeschlagen:', e.message);
}

/* ---- 2) Aldi Nord (+ Rewe/Edeka, falls Marktguru sie nicht geliefert hat) ---- */
const chains = ['aldi-nord', ...['rewe', 'edeka'].filter((c) => !mgChains.has(c))];
try {
  const keywords = uniq([...staticTerms, ...variants]);
  const rows = await runActor('nerdrx~de-supermarket-offers', { chains, keywords, maxItems: 600, maxPerChain: 250 }, MAX_USD_SM);
  const got = rows.map(fromSupermarket).filter(Boolean);
  offers.push(...got);
  console.log(`Supermarkt-Actor (${chains.join(', ')}): ${got.length} Angebote`);
} catch (e) {
  console.warn('Supermarkt-Actor fehlgeschlagen:', e.message);
}

offers = dedupe(offers);
if (!offers.length) { console.error('Keine Angebote erhalten – alte Datei bleibt bestehen.'); process.exit(1); }

const counts = {};
for (const o of offers) counts[o.chain] = (counts[o.chain] || 0) + 1;
writeFileSync(join(root, 'data/angebote.json'), JSON.stringify({ updated: new Date().toISOString(), postal: POSTAL, counts, offers }) + '\n');
console.log(`${offers.length} Angebote gespeichert`, counts);
