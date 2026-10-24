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
const keywords = JSON.parse(readFileSync(join(root, 'data/suchbegriffe.json'), 'utf8')).begriffe;
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
