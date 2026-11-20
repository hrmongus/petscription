#!/usr/bin/env python3
"""Pripraví fotku pre blog: oreže na správny pomer, zmenší, uloží ako WebP na správne miesto.

Použitie (z koreňa repozitára):
  python3 granula/blog/foto.py <vstup.jpg|png|heic…> hero   <slug>            → granula/img/blog/<slug>/hero.webp      (16:9, 1600×900)
  python3 granula/blog/foto.py <vstup>               text   <slug> <nazov>    → granula/img/blog/<slug>/<nazov>.webp   (3:2, 1600×1067)
  python3 granula/blog/foto.py <vstup>               autor  <meno-priezvisko> → granula/img/autori/<meno-priezvisko>.webp (1:1, 400×400)

Voliteľne --focus 0.5,0.4 (x,y od 0 do 1): kam posunúť orez (predvolene stred).
Vypíše cestu, ktorú treba dať do článku (hero:, ![…](cesta), author_photo:).
"""
import os
import re
import sys

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
KINDS = {"hero": (16, 9, 1600), "text": (3, 2, 1600), "autor": (1, 1, 400)}
MAX_KB = 300


def crop(im, rw, rh, fx, fy):
    w, h = im.size
    if w / h > rw / rh:
        nw = int(h * rw / rh)
        x = int(max(0, min(w - nw, fx * w - nw / 2)))
        return im.crop((x, 0, x + nw, h))
    nh = int(w * rh / rw)
    y = int(max(0, min(h - nh, fy * h - nh / 2)))
    return im.crop((0, y, w, y + nh))


def main(argv):
    focus = (0.5, 0.5)
    if "--focus" in argv:
        i = argv.index("--focus")
        focus = tuple(float(x) for x in argv[i + 1].split(","))
        del argv[i:i + 2]
    if len(argv) < 3 or argv[1] not in KINDS:
        sys.exit(__doc__)
    src, kind = argv[0], argv[1]
    if kind == "text" and len(argv) < 4:
        sys.exit("pri type text zadaj slug aj názov súboru")
    name = re.sub(r"[^a-z0-9-]+", "-", (argv[3] if kind == "text" else argv[2]).lower()).strip("-")
    if kind == "autor":
        rel = "img/autori/%s.webp" % name
    else:
        slug = re.sub(r"[^a-z0-9-]+", "-", argv[2].lower()).strip("-")
        rel = "img/blog/%s/%s.webp" % (slug, "hero" if kind == "hero" else name)
    rw, rh, width = KINDS[kind]
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    if im.width < width * 0.6:
        print("POZOR: fotka má len %d px na šírku, na webe môže byť rozmazaná (ideál %d px)." % (im.width, width))
    im = crop(im, rw, rh, *focus)
    if im.width > width:
        im = im.resize((width, round(width * rh / rw)), Image.LANCZOS)
    out = os.path.join(SITE, rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for q in (82, 76, 70, 64):
        im.save(out, "WEBP", quality=q, method=6)
        if os.path.getsize(out) <= MAX_KB * 1024:
            break
    print("%s  (%d×%d, %d KB)" % (rel, im.width, im.height, os.path.getsize(out) // 1024))


if __name__ == "__main__":
    main(sys.argv[1:])
