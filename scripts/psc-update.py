#!/usr/bin/env python3
"""Vygeneruje public/granula/psc.js (platné slovenské PSČ na kontrolu adresy pred platbou).

Použitie:  python3 -I scripts/psc-update.py <priečinok s XLSX> <dátum zoznamu YYYY-MM-DD> [súbor s PSČ výdajných miest]

1. Na https://www.posta.sk/psc stiahni „Poštové smerovacie čísla na stiahnutie“ (ZIP: OBCE.xlsx, ULICE.xlsx, POBoxy.xlsx)
   a rozbaľ do prázdneho priečinka.
2. Voliteľne PSČ výdajných miest dopravcov z FHB (GET /delivery-point pre zasielkovna_sk, sps_pudo, dpd_sk), jedno na riadok.

Platné PSČ = obce + ulice + pošty (územné aj špecifické) + PSČ výdajných miest. 71 obcí má v OBCE.xlsx namiesto PSČ
„viď detail SČ“ (PSČ podľa súpisného čísla, v ZIP-e chýba): pri nich sa PSČ prijme podľa názvu obce (DETAIL).
Cieľ: odmietnuť preklep alebo neexistujúce PSČ, nie platnú adresu. Potrebuje openpyxl.
"""
import re, sys, json, pathlib, unicodedata
import openpyxl

src = pathlib.Path(sys.argv[1])
stamp = sys.argv[2]
points = pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else None

def norm(s):
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

codes, detail = set(), set()
def add(v):
    for m in re.findall(r'\d{3}\s?\d{2}', str(v or '')):
        codes.add(m.replace(' ', ''))
for f, col in [('OBCE.xlsx', 'PSC'), ('ULICE.xlsx', 'PSC'), ('POBoxy.xlsx', 'PSČ pre P.O.BOXy')]:
    rows = openpyxl.load_workbook(src / f, read_only=True).active.iter_rows(values_only=True)
    head = next(rows)
    i = head.index(col)
    for r in rows:
        if f == 'OBCE.xlsx' and any(x and 'detail' in str(x) for x in r):
            detail.add(norm(r[1]))
        add(r[i])
n_posta = len(codes)
if points:
    for line in points.read_text().split():
        if re.fullmatch(r'\d{5}', line): codes.add(line)
c = sorted(codes)
if n_posta < 1000:
    sys.exit(f'Podozrivo málo PSČ ({n_posta}), súbor nezapisujem.')

js = '''/* Granula — platné slovenské PSČ na kontrolu adresy pred platbou (FHB v produkcii neznáme PSČ odmietne, 24. 11. 2026).
   Zdroj: Slovenská pošta „Poštové smerovacie čísla na stiahnutie“ (obce, ulice, pošty; stav %s) + PSČ výdajných miest
   dopravcov z FHB. DETAIL = obce, ktorých PSČ závisí od súpisného čísla (v zozname pošty chýba): pri nich sa PSČ prijme.
   Používa dotazník (window.GranulaPSC) aj server (lib/psc.ts). Vygenerované: scripts/psc-update.py. Needitovať ručne. */
(function () {
  "use strict";
  var LIST = "%s";
  var DETAIL = %s;
  var SET = null;
  function norm(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  /** PSČ existuje (alebo obec má PSČ podľa súpisného čísla); city je voliteľné */
  function valid(zip, city) {
    var z = String(zip == null ? "" : zip).replace(/\\s+/g, "");
    if (!/^\\d{5}$/.test(z)) return false;
    if (!SET) { SET = {}; LIST.split(" ").forEach(function (c) { SET[c] = 1; }); }
    return SET[z] === 1 || (city != null && DETAIL.indexOf(norm(city)) !== -1);
  }
  var api = { valid: valid, count: %d };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.GranulaPSC = api;
})();
''' % (stamp, ' '.join(c), json.dumps(sorted(detail), ensure_ascii=False), len(c))
out = pathlib.Path(__file__).resolve().parent.parent / 'public/granula/psc.js'
out.write_text(js)
print(f'{n_posta} PSČ pošty + výdajné miesta = {len(c)} PSČ, {len(detail)} obcí podľa súpisného čísla → {out}')
