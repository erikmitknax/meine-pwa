// Version hochzählen: node bump-version.mjs patch|minor|major|1.2.3
// Schreibt die neue Nummer in sw.js und js/version.js.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = {
  sw: new URL('./sw.js', import.meta.url),
  ver: new URL('./js/version.js', import.meta.url),
};

const current = readFileSync(files.ver, 'utf8').match(/APP_VERSION = '(\d+\.\d+\.\d+)'/)?.[1];
if (!current) throw new Error('APP_VERSION in js/version.js nicht gefunden');

const arg = process.argv[2] || 'patch';
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [maj, min, pat] = current.split('.').map(Number);
  next = { major: `${maj + 1}.0.0`, minor: `${maj}.${min + 1}.0`, patch: `${maj}.${min}.${pat + 1}` }[arg];
  if (!next) throw new Error('Argument: patch | minor | major | x.y.z');
}

writeFileSync(files.ver, readFileSync(files.ver, 'utf8').replace(current, next));
writeFileSync(files.sw, readFileSync(files.sw, 'utf8').replace(`VERSION = '${current}'`, `VERSION = '${next}'`));
console.log(`Version ${current} -> ${next}`);

// Schutz vor Veröffentlichungsfehlern:
// 1) Jede Datei aus der ASSETS-Liste in sw.js muss existieren (sonst scheitert die Installation).
// 2) GitHub Pages (Jekyll) liefert Dateien/Ordner mit "_" am Anfang NICHT aus.
const root = new URL('./', import.meta.url).pathname;
const sw = readFileSync(files.sw, 'utf8');
const missing = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter((f) => f && !existsSync(join(root, f)));
if (missing.length) console.error('WARNUNG: in sw.js eingetragen, aber nicht vorhanden:', missing.join(', '));
const bad = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    if (name.startsWith('_')) bad.push(full.slice(root.length));
    if (statSync(full).isDirectory()) walk(full);
  }
})(root);
if (bad.length) console.error('WARNUNG: Name beginnt mit "_" – GitHub Pages liefert das nicht aus:', bad.join(', '));
