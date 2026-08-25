#!/usr/bin/env python3
"""Regenerate the logo contact sheet. SVGs are inlined (not <img>) so the
webfonts actually apply — an <img>-referenced SVG cannot load external fonts."""
import pathlib
L = pathlib.Path(__file__).resolve().parent.parent / 'logo'
uid = [0]
def cell(label, name, w, cls=''):
    uid[0] += 1
    s = L.joinpath(name).read_text().split('?>')[-1]
    s = s.replace('<svg ', f'<svg style="width:{w}px;height:auto" ', 1)
    for a in ('200" height="200','560" height="120','320" height="240','120" height="120','64" height="64'):
        s = s.replace(f' width="{a}"', '')
    for i in ('ho-ring', 'ho-crescent', 'ho-m2'):
        s = s.replace(i, f'{i}-{uid[0]}')
    return f'<div class="cell {cls}"><h4>{label}</h4>{s}</div>'
html = f'''<!doctype html><html><head><meta charset="utf-8"><title>Howl &amp; Oats — logo contact sheet</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
 body{{background:#F4EBDC;color:#17150F;margin:0;padding:36px;display:grid;grid-template-columns:repeat(3,1fr);gap:28px;font-family:'Space Mono',monospace}}
 .cell{{background:#FBF8F2;border:1px solid #C9BBA4;padding:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:250px;gap:18px}}
 .cell h4{{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#5A5445;margin:0}}
 .dark{{background:#17150F;color:#F4EBDC;border-color:#3A352A}} .dark h4{{color:#B9AF9C}}
 .loden{{color:#37503F}} .ember{{color:#C25A2B}} .wide{{grid-column:span 2}}
</style></head><body>
{cell('roundel','roundel.svg',200)}
{cell('roundel / dark','roundel.svg',200,'dark')}
{cell('roundel @ 96px min','roundel.svg',96)}
{cell('wordmark','wordmark.svg',440,'wide')}
{cell('stacked','wordmark-stacked.svg',170)}
{cell('monogram','monogram.svg',104,'loden')}
{cell('moon mark','mark-moon.svg',86,'ember')}
{cell('moon mark @ 32px min','mark-moon.svg',32)}
</body></html>'''
(pathlib.Path(__file__).resolve().parent / 'contact-sheet.html').write_text(html)
print('wrote contact-sheet.html')
