#!/usr/bin/env node
/*
 * Porovná URL správanie dvoch nasadení (predvolene produkcia vs. lokálny `next start`):
 * status, cieľ presmerovania, X-Robots-Tag a pri 200 aj obsah (sha256).
 *   node scripts/check-urls.mjs [BASE_A] [BASE_B]
 *   node scripts/check-urls.mjs --save snap.json [BASE]        → uloží odpovede BASE (napr. produkcie pred nasadením)
 *   node scripts/check-urls.mjs --against snap.json [BASE]     → porovná BASE s uloženým záznamom
 * Zoznam URL: každý súbor v public/granula/ (stránky aj ich čisté adresy, priečinky s lomkou aj bez) + okrajové prípady.
 * Pri zmenených súboroch (zámerne upravených) vypíše rozdiel obsahu; status a presmerovanie sa musia zhodovať vždy.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args.splice(i, 2)[1]; };
const SAVE = flag('--save');
const AGAINST = flag('--against');
const A = args[0] || 'https://www.granula.sk';
const B = args[1] || 'http://localhost:3000';
const root = path.join(process.cwd(), 'public', 'granula');

const urls = new Set(['/', '/index', '/index.html', '/index.html?a=1', '/podpora?x=1', '/blog?x=1', '/suroviny', '/SUROVINY',
  '/granula', '/granula/', '/granula/podpora', '/granula/podpora.html', '/granula/granula.css', '/granula/robots.txt',
  '/blog', '/blog/', '/blog/index', '/blog/index.html', '/blog/nahlad', '/blog/nahlad/', '/admin-blog', '/admin-blog/',
  '/admin-blog/index.html', '/podpora/', '/nic', '/nic/', '/img', '/img/', '/robots.txt', '/sitemap.xml',
  // dnes verejné interné súbory, po migrácii majú byť 404 (presun do content/blog/)
  '/blog/CLAUDE.md', '/blog/build.py', '/blog/HANDOVER.md', '/blog/_src/_template.md']);
const walk = (rel) => {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { walk(r); if (fs.existsSync(path.join(root, r, 'index.html'))) { urls.add(`/${r}`); urls.add(`/${r}/`); } continue; }
    urls.add('/' + r.split('/').map(encodeURIComponent).join('/'));
    if (r.endsWith('.html') && !r.endsWith('index.html')) urls.add('/' + r.slice(0, -5));
  }
};
walk('');

async function probe(base, u) {
  const res = await fetch(base + u, { redirect: 'manual' });
  const buf = Buffer.from(await res.arrayBuffer());
  const loc = res.headers.get('location');
  return {
    status: res.status,
    location: loc ? loc.replace(/^https?:\/\/[^/]+/, '') : '',
    robots: res.headers.get('x-robots-tag') || '',
    hash: res.status === 200 ? crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12) : '',
  };
}

const list = [...urls].sort();
if (SAVE) {
  const snap = {};
  for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(async (u) => { snap[u] = await probe(A, u); }));
  fs.writeFileSync(SAVE, JSON.stringify({ base: A, at: new Date().toISOString(), urls: snap }, null, 1));
  console.log(`uložené: ${list.length} URL z ${A} → ${SAVE}`);
  process.exit(0);
}
const saved = AGAINST ? JSON.parse(fs.readFileSync(AGAINST, 'utf8')).urls : null;
let bad = 0, content = 0, robots = 0;
for (let i = 0; i < list.length; i += 8) {
  await Promise.all(list.slice(i, i + 8).map(async (u) => {
    const [a, b] = saved ? [saved[u] ?? { status: 'chýba v zázname', location: '', robots: '', hash: '' }, await probe(A, u)] : await Promise.all([probe(A, u), probe(B, u)]);
    if (a.status !== b.status || a.location !== b.location) {
      bad++; console.log(`ROZDIEL  ${u}\n   A ${a.status} ${a.location}\n   B ${b.status} ${b.location}`);
    } else if (a.hash !== b.hash) {
      content++; console.log(`OBSAH    ${u}  (${a.status})`);
    } else if (a.robots !== b.robots) {
      robots++; console.log(`ROBOTS   ${u}  A="${a.robots}" B="${b.robots}"`);
    }
  }));
}
console.log(`\n${list.length} URL · status/presmerovanie rozdielne: ${bad} · obsah rozdielny: ${content} · X-Robots-Tag rozdielny: ${robots}`);
process.exit(bad ? 1 : 0);
