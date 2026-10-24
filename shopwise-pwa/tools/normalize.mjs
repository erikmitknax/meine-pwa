// Vereinheitlicht Angebote verschiedener Apify-Actors auf das Format von data/angebote.json.
const num = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// "2026-10-24T21:59:00.000Z" (UTC) → "2026-10-24" nach deutscher Zeit
const day = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
};

// Marktguru-Actor (trev0n/marktguru-gazetki-scraper) → gemeinsames Format
export function fromMarktguru(r) {
  const price = num(r.price);
  if (!r || !r.title || price === null) return null;
  const chain = String(r.retailer || '').toLowerCase().replace(/\s+/g, '-').replace('süd', 'sued');
  const u = String(r.unit || '').toLowerCase();
  const unitPrice = num(r.unitPrice);
  // Grundpreis als Text im Format, das die App versteht ("5.16 €/kg"); sonst nur der Gesamtpreis
  const perUnit = unitPrice !== null && u ? `${unitPrice} €/${u}` : null;
  return {
    id: 'mg-' + String(r.offerId ?? `${chain}-${r.title}-${price}`), chain,
    title: String(r.title).trim(), brand: r.brand || null,
    price, priceOld: num(r.regularPrice), discount: num(r.discountPercent),
    unit: null, perUnit, from: day(r.validFrom), to: day(r.validTo),
    category: r.category || null, store: r.postalCode || null,
  };
}

// Actor nerdrx/de-supermarket-offers → gemeinsames Format
export function fromSupermarket(r) {
  const price = num(r.price);
  if (!r || !r.title || price === null) return null;
  return {
    id: String(r.id), chain: r.chain, title: String(r.title).trim(), brand: r.brand || null,
    price, priceOld: num(r.priceOld), discount: num(r.discountPercent),
    unit: r.unit || null, perUnit: r.pricePerUnit || null, from: r.validFrom || null, to: r.validTo || null,
    category: r.category || null, store: r.storeId || null,
  };
}

// Gleiche Angebote (Kette, Titel, Größe/Grundpreis, Preis) nur einmal behalten
export function dedupe(list) {
  const seen = new Set();
  return list.filter((o) => {
    const k = [o.chain, o.title.toLowerCase(), o.unit || o.perUnit || '', o.price].join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
