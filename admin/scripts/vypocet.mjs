/*
 * Kontrola výpočtu (/vypocet): pred dev/build vloží do admin/lib/vypocet.generated.ts
 *   - admin/vypocet/admin-vypocet.html (stránka, presunutá z verejného webu),
 *   - public/granula/engine.js a radar.js (jediný zdroj výpočtu, ten istý ako dotazník a server).
 * Vygenerovaný súbor je v .gitignore; route handlery ho servírujú iba prihlásenému adminovi.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const admin = path.join(import.meta.dirname, '..');
const root = path.join(admin, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const out = `// VYGENEROVANÉ admin/scripts/vypocet.mjs – needitovať\nexport const html = ${JSON.stringify(read('admin/vypocet/admin-vypocet.html'))};\nexport const engineJs = ${JSON.stringify(read('public/granula/engine.js'))};\nexport const radarJs = ${JSON.stringify(read('public/granula/radar.js'))};\n`;
writeFileSync(path.join(admin, 'lib', 'vypocet.generated.ts'), out);
console.log('vypocet.generated.ts OK');
