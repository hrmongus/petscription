#!/usr/bin/env python3
"""Granula blog — build a kontrola GEO.

Spustenie (z koreňa repozitára):  python3 granula/blog/build.py
Voliteľne:  --check  len skontroluje, nič nezapíše (exit 1 pri chybách v publikovaných článkoch)

Vstup:  granula/blog/_src/*.md   (súbory začínajúce „_“ sa ignorujú, napr. _template.md)
Výstup:
  granula/blog/index.html                 zoznam publikovaných článkov
  granula/blog/<slug>/index.html          publikovaný článok (statické HTML, bez JS)
  granula/blog/nahlad/<slug>/index.html   náhľad každého článku (noindex), aj konceptov
  granula/blog/posts.js                   dáta pre /granula/admin-blog/ (kontrola, sekcie)
  granula/sitemap.xml, robots.txt (koreň repozitára)

Bez závislostí: len štandardná knižnica Pythonu 3.
Pravidlá kontroly vychádzajú z granula/blog/GEO-TEMPLATE.md.
"""
import datetime as dt
import html
import json
import os
import re
import shutil
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.dirname(HERE)                  # granula/
REPO = os.path.dirname(SITE_DIR)
SRC = os.path.join(HERE, "_src")

# Verejná adresa webu (bez lomky na konci). Zmeniť, keď bude doména nasmerovaná inak.
BASE_URL = "https://www.granula.sk"  # web je v granula/, Vercel ho servíruje z koreňa (vercel.json)
SITE_NAME = "Granula!"
BLOG_TITLE = "Blog"
BLOG_LEAD = "Výživa, kŕmenie a zdravie psov. Konkrétne čísla, zdroje a odpovede bez omáčky."

# ---------------------------------------------------------------- frontmatter

def parse_frontmatter(text):
    """Podmnožina YAML: `kľúč: hodnota`, `kľúč: >` (zložený text) a zoznamy `  - položka`."""
    if not text.startswith("---"):
        raise ValueError("chýba frontmatter (súbor musí začínať riadkom ---)")
    end = text.find("\n---", 3)
    if end == -1:
        raise ValueError("frontmatter nie je uzavretý riadkom ---")
    head, body = text[3:end].strip("\n"), text[end + 4:].lstrip("\n")
    meta, key, mode = {}, None, None
    for raw in head.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", raw)
        if m and not raw.startswith((" ", "\t")):
            key, val = m.group(1), m.group(2).strip()
            if val in (">", "|"):
                meta[key], mode = "", "fold"
            elif val == "":
                meta[key], mode = [], "list"
            else:
                meta[key], mode = unquote(val), None
            continue
        s = raw.strip()
        if mode == "list" and s.startswith("- "):
            meta[key].append(unquote(s[2:].strip()))
        elif mode == "fold":
            meta[key] = (meta[key] + " " + s).strip()
        else:
            raise ValueError("nerozumiem riadku vo frontmatteri: " + raw)
    return meta, body


def unquote(v):
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    if v.lower() in ("true", "false"):
        return v.lower() == "true"
    return v

# ---------------------------------------------------------------- markdown

def slugify(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def typo(s):
    """Nezalomiteľná medzera pred % a € (pravidlo dizajn systému)."""
    return re.sub(r"(\d) (%|€)", "\\1\u00a0\\2", s)


FN = {"order": []}   # poznámky pod čiarou aktuálneho článku (id v poradí výskytu)


def fn_ref(m):
    fid = m.group(1)
    if fid not in FN["order"]:
        FN["order"].append(fid)
    n = FN["order"].index(fid) + 1
    return '<sup class="bl-fn"><a href="#fn-%s" id="fnref-%s" aria-label="Poznámka %d">%d</a></sup>' % (slugify(fid), slugify(fid), n, n)


def split_footnotes(body):
    """Riadky `[^id]: text` vyberie z tela; vráti (telo, {id: text})."""
    notes, keep = {}, []
    for ln in body.split("\n"):
        m = re.match(r"^\[\^([^\]]+)\]:\s*(.+)$", ln.strip())
        if m:
            notes[m.group(1)] = m.group(2).strip()
        else:
            keep.append(ln)
    return "\n".join(keep), notes


DEGREES = re.compile(r"(?<![\w>])(MVDr\.|MUDr\.|RNDr\.|PharmDr\.|PaedDr\.|PhDr\.|JUDr\.|Ing\.|Mgr\.|Bc\.|PhD\.|CSc\.|DrSc\.|doc\.|prof\.)")


def keep_case(s):
    """Akademické tituly si v nadpisoch s verzálkami zachovajú písmená (MVDr., nie MVDR.)."""
    return DEGREES.sub(r'<span class="nc">\1</span>', s)


def inline(s):
    s = html.escape(typo(s), quote=False)
    s = keep_case(s)
    s = re.sub(r"\[\^([^\]]+)\]", fn_ref, s)
    s = re.sub(r"==(.+?)==", r'<mark class="bl-hl">\1</mark>', s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?![\*\w])", r"<em>\1</em>", s)

    def link(m):
        text, url = m.group(1), m.group(2).replace('"', "%22")
        ext = url.startswith("http")
        return '<a href="%s"%s>%s</a>' % (url, ' target="_blank" rel="noopener"' if ext else "", text)
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, s)
    return s


def md_blocks(md):
    """Rozdelí markdown na bloky: (typ, dáta)."""
    lines = md.replace("\r\n", "\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        m = re.match(r"^(#{2,4})\s+(.*)$", ln)
        if m:
            out.append(("h%d" % len(m.group(1)), m.group(2).strip()))
            i += 1
            continue
        if re.match(r"^#\s", ln):
            out.append(("h1", ln[2:].strip()))
            i += 1
            continue
        if re.match(r"^(-{3,}|\*{3,})$", ln.strip()):
            out.append(("hr", None))
            i += 1
            continue
        if ln.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append(lines[i].strip())
                i += 1
            cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
            if len(cells) >= 2 and all(re.match(r"^:?-{2,}:?$", c) for c in cells[1]):
                out.append(("table", (cells[0], cells[2:])))
            else:
                out.append(("p", " ".join(rows)))
            continue
        if re.match(r"^\d+[.)]\s", ln):
            items = []
            while i < len(lines) and (re.match(r"^\d+[.)]\s", lines[i]) or (lines[i].startswith("   ") and items)):
                if re.match(r"^\d+[.)]\s", lines[i]):
                    items.append(re.sub(r"^\d+[.)]\s+", "", lines[i]))
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            out.append(("ol", items))
            continue
        if re.match(r"^[-*]\s", ln):
            items = []
            while i < len(lines) and (re.match(r"^[-*]\s", lines[i]) or (lines[i].startswith("  ") and items and lines[i].strip())):
                if re.match(r"^[-*]\s", lines[i]):
                    items.append(lines[i][2:].strip())
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            out.append(("ul", items))
            continue
        m = IMG.match(ln.strip())
        if m:
            out.append(("img", {"alt": m.group(1).strip(), "src": m.group(2).strip(), "caption": (m.group(3) or "").strip()}))
            i += 1
            continue
        m = re.match(r"^:::\s*(graf|ponuka)\s*$", ln.strip())
        if m:
            kind, fields, rows = m.group(1), {}, []
            i += 1
            while i < len(lines) and lines[i].strip() != ":::":
                t = lines[i].strip()
                i += 1
                if not t:
                    continue
                f = re.match(r"^([a-zžščťďňľáéíóúýô_]+):\s*(.*)$", t)
                if f and "|" not in t:
                    fields[f.group(1)] = f.group(2).strip()
                elif "|" in t:
                    label, val = [x.strip() for x in t.rsplit("|", 1)]
                    rows.append((label, val))
            i += 1
            fields["rows"] = rows
            out.append((kind, fields))
            continue
        if ln.startswith("^ "):
            buf = [ln[2:].strip()]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,4}\s|\||>|[-*]\s|\d+[.)]\s|-{3,}$|:::|!\[|\^ )", lines[i]):
                buf.append(lines[i].strip())
                i += 1
            out.append(("note", " ".join(buf)))
            continue
        if ln.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i][1:].strip())
                i += 1
            out.append(("quote", " ".join(buf)))
            continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{1,4}\s|\||>|[-*]\s|\d+[.)]\s|-{3,}$|:::|!\[|\^ )", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        out.append(("p", " ".join(buf)))
    return out


IMG = re.compile(r'^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$')
PLACEHOLDER = ("placeholder", "zastupny")


def is_placeholder(src):
    return not src or src.lower() in PLACEHOLDER


def num(v):
    try:
        return float(str(v).replace("\u00a0", "").replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def fmt_num(v):
    x = num(v)
    if x is None:
        return v
    s = ("%d" % x) if x == int(x) else ("%.1f" % x).replace(".", ",")
    return re.sub(r"(\d)(?=(\d{3})+(?!\d))", "\\1\u00a0", s) if len(s.split(",")[0]) > 4 else s


def figure_html(d, pre, cls=""):
    """Obrázok alebo zástupný rámik (placeholder) s popisom, čo má byť na fotke."""
    cap = '<figcaption>%s</figcaption>' % inline(d["caption"]) if d.get("caption") else ""
    if is_placeholder(d["src"]):
        inner = '<div class="bl-ph" role="img" aria-label="%s"><span class="bl-ph-t">Zástupný obrázok</span><span>%s</span></div>' % (
            html.escape(d["alt"]), inline(d["alt"] or "doplň popis"))
    else:
        inner = '<div class="bl-img"><img src="%s%s" alt="%s" loading="lazy" decoding="async"></div>' % (pre, html.escape(d["src"]), html.escape(d["alt"]))
    return '<figure class="bl-fig %s">%s%s</figure>' % (cls, inner, cap)


def chart_html(d):
    """Vodorovný stĺpcový graf ako tabuľka (statické HTML, čitateľné pre AI aj čítačky)."""
    rows = [(l, v, num(v)) for l, v in d.get("rows", [])]
    mx = max([x for _, _, x in rows if x is not None] or [1]) or 1
    unit = d.get("jednotka", "")
    hl = {x.strip() for x in d.get("zvyraznit", "").split(",") if x.strip()}
    trs = "".join('<tr%s><th scope="row">%s</th><td><span class="bl-bar" style="--w:%.1f%%"></span><span class="bl-val">%s%s</span></td></tr>' % (
        ' class="hl"' if l in hl else "", inline(l), (x or 0) / mx * 100, typo(fmt_num(v)), ("\u00a0" + html.escape(unit)) if unit else "") for l, v, x in rows)
    src = '<p class="bl-chart-src">Zdroj: %s</p>' % inline(d["zdroj"]) if d.get("zdroj") else ""
    note = '<p class="bl-chart-note">%s</p>' % inline(d["popis"]) if d.get("popis") else ""
    return ('<figure class="bl-chart"><figcaption>%s</figcaption><table><thead><tr><th scope="col">%s</th><th scope="col">%s</th></tr></thead><tbody>%s</tbody></table>%s%s</figure>'
            % (inline(d.get("nazov", "")), html.escape(d.get("os", "Položka")), html.escape(d.get("hodnota", unit or "Hodnota")), trs, note, src))


OFFER_BAGS = ["hovadzie-morka-jahna-s-ryzou", "morka-hus-kacica-s-tekvicou", "jahna-s-batatmi-cucoriedkami"]


def offer_html(d, pre, end=False):
    """Ponuka k téme článku. Mimo textu sekcie (nepočíta sa do slov ani citácií)."""
    link = d.get("odkaz") or "granule-na-mieru.html"
    href = link if re.match(r"^(https?:|#)", link) else pre + link
    img = d.get("obrazok", "")
    if img and not is_placeholder(img):
        pic = '<div class="bl-offer-img"><img src="%s%s" alt="" loading="lazy"></div>' % (pre, html.escape(img))
    else:  # predvolený vizuál: vejár vreciek, nesľubuje konkrétnu receptúru
        pic = '<div class="bl-offer-img bl-offer-bags" aria-hidden="true">%s</div>' % "".join(
            '<img class="b%d" src="%simg/produkty/%s.webp" alt="" loading="lazy">' % (i, pre, f) for i, f in enumerate(OFFER_BAGS))
    tag = "section" if end else "aside"
    return ('<%s class="bl-offer%s%s" aria-label="Ponuka Granula"><div class="bl-offer-in"><span class="bl-offer-k">%s</span><p class="bl-offer-h">%s</p><p>%s</p>'
            '<div><a class="btn btn-o" href="%s">%s</a></div></div>%s</%s>'
            % (tag, " bl-offer-end" if end else "", " has-img" if pic else "", html.escape(d.get("stitok") or "Granule na mieru"),
               inline(d.get("nadpis", "")), inline(d.get("text", "")), html.escape(href), html.escape(d.get("tlacidlo") or "Nájdi granule pre svojho psa"), pic, tag))


def render_blocks(blocks, pre=""):
    h = []
    for t, d in blocks:
        if t in ("h2", "h3", "h4"):
            h.append('<%s id="%s">%s</%s>' % (t, slugify(d), inline(d), t))
        elif t == "p":
            h.append("<p>%s</p>" % inline(d))
        elif t == "ul":
            h.append("<ul>%s</ul>" % "".join("<li>%s</li>" % inline(x) for x in d))
        elif t == "ol":
            h.append("<ol>%s</ol>" % "".join("<li>%s</li>" % inline(x) for x in d))
        elif t == "quote":
            h.append("<blockquote><p>%s</p></blockquote>" % inline(d))
        elif t == "table":
            head, rows = d
            th = "".join('<th scope="col">%s</th>' % inline(c) for c in head)
            labels = [html.escape(plain(c), quote=True) for c in head]
            trs = "".join("<tr>%s</tr>" % "".join(
                ('<th scope="row">%s</th>' % inline(c)) if j == 0 else
                ('<td data-label="%s">%s</td>' % (labels[j] if j < len(labels) else "", inline(c))) for j, c in enumerate(r)) for r in rows)
            cls = "tbl tbl-cards" if len(head) >= 3 else "tbl"
            h.append('<div class="%s"><table><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (cls, th, trs))
        elif t == "hr":
            h.append("<hr>")
        elif t == "note":
            h.append('<p class="bl-note">%s</p>' % inline(d))
        elif t == "img":
            h.append(figure_html(d, pre))
        elif t == "graf":
            h.append(chart_html(d))
        elif t == "ponuka":
            h.append(offer_html(d, pre))
    return "\n".join(h)


def plain(s):
    s = re.sub(r"\[\^[^\]]+\]", "", s).replace("==", "")
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    return re.sub(r"[*`_>#|]", "", s)


def words(s):
    return len(re.findall(r"[\w%€–-]+", plain(s)))


def sentences(s):
    s = plain(s)
    return [x.strip() for x in re.split(r"(?<=[.!?…])\s+(?=[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ„\"0-9])", s) if x.strip()]


NUM = re.compile(r"\d")

# ---------------------------------------------------------------- sekcie a kontrola

def kind_of(title):
    t = title.lower()
    if t.startswith("čo je") or t.startswith("čo sú"):
        return "definition"
    if t.startswith("časté otázky") or t == "faq":
        return "faq"
    if t.startswith("zhrnutie"):
        return "summary"
    if t.startswith("zdroje"):
        return "sources"
    return "main"


def sections(blocks):
    secs, cur = [], None
    for t, d in blocks:
        if t == "h2":
            cur = {"title": d, "kind": kind_of(d), "blocks": []}
            secs.append(cur)
        elif cur is not None:
            cur["blocks"].append((t, d))
    for s in secs:
        text = []
        for t, d in s["blocks"]:
            if t in ("p", "quote", "h3", "h4"):
                text.append(d)
            elif t in ("ul", "ol"):
                text.extend(d)
            elif t == "table":
                text.extend(" ".join(r) for r in [d[0]] + d[1])
        s["text"] = " ".join(text)
        s["words"] = words(s["text"])
        s["numbers"] = len(re.findall(r"\d+(?:[,.]\d+)?", s["text"]))
        s["fnrefs"] = len(re.findall(r"\[\^[^\]]+\]", json.dumps(s["blocks"], ensure_ascii=False)))
        s["question"] = s["title"].rstrip().endswith("?")
        first = next((d for t, d in s["blocks"] if t == "p"), "")
        s["first_bold"] = first.startswith("**")
        s["has_table"] = any(t == "table" for t, _ in s["blocks"])
        s["has_ol"] = any(t == "ol" for t, _ in s["blocks"])
        s["images"] = sum(1 for t, _ in s["blocks"] if t == "img")
        s["charts"] = sum(1 for t, _ in s["blocks"] if t == "graf")
        s["offers"] = sum(1 for t, _ in s["blocks"] if t == "ponuka")
        s["first"] = first
    return secs


BACKREFS = [r"\bako sme (už )?(spomenuli|uviedli|písali)", r"\bspomínan", r"\bvyššie\b", r"\bnižšie\b",
            r"\bv predchádzajúc", r"\bako už vieme\b", r"\bpozri (vyššie|nižšie)"]
PRONOUN_START = re.compile(r"^(Toto|To|Tento|Táto|Tieto|Ten|Tá)\s", re.U)
RETIRED = ["bez obilnín", "mäso zo slovenska", "hovädzie zo slovenska", "recept od mvdr", "superprémiov", "holistick", "recept na mieru", "receptúra na mieru", "receptúru na mieru"]
INTERNAL_NAMES = re.compile(r"\b(puppy|energy|senior recept)\b", re.I)
VY_FORM = [r"\bvášho\b", r"\bvášmu\b", r"\bváš\b", r"\bvaša\b", r"\bvaše\b", r"\bbudete\b", r"\bmáte\b", r"\bviete\b", r"\bnájdete\b"]
EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF]")


def blocks_of(secs):
    return [b for s in secs for b in s["blocks"]]


def lint(meta, secs, body):
    R = []

    def add(rid, level, ok, msg, details=None):
        if rid in (meta.get("lint_ignore") or []):
            level = "info"
            msg += " (vypnuté cez lint_ignore)"
        R.append({"id": rid, "level": level, "ok": bool(ok), "msg": msg, "details": details or []})

    title = meta.get("title", "")
    add("title", "error", bool(title), "Titulok je vyplnený")
    add("title-length", "warn", 0 < len(title) <= 70, "Titulok má najviac 70 znakov (má %d)" % len(title))
    years = re.findall(r"\b20\d\d\b", title)
    upd = str(meta.get("updated", ""))
    add("title-year", "warn", not years or upd.startswith(years[0]),
        "Rok v titulku len pri téme, ktorá sa mení, a len ak sedí s dátumom aktualizácie",
        ["titulok: %s, aktualizované: %s" % (years[0], upd)] if years else [])
    desc = meta.get("description", "")
    add("description", "warn", 120 <= len(desc) <= 160, "Meta popis má 120–160 znakov (má %d)" % len(desc))
    au, bio = str(meta.get("author", "")), str(meta.get("author_bio", ""))
    add("author", "error", au and bio and not has_placeholder(au + " " + bio), "Skutočný autor a jedna veta, prečo mu veriť (author, author_bio, bez zástupného textu)")
    photo = str(meta.get("author_photo", ""))
    add("author-photo", "error", photo and not is_placeholder(photo) and os.path.isfile(os.path.join(SITE_DIR, photo)),
        "Fotka autora (author_photo, súbor v granula/img/autori/)", [photo] if photo and not is_placeholder(photo) else [])

    def date(v):
        try:
            return dt.date.fromisoformat(str(v))
        except ValueError:
            return None
    pub, upd_d = date(meta.get("published", "")), date(meta.get("updated", ""))
    add("dates", "error", pub and upd_d and upd_d >= pub, "Dátumy published a updated (RRRR-MM-DD), updated ≥ published")
    log = meta.get("changelog") or []
    add("changelog", "warn", bool(log) and str(log[0]).startswith(str(meta.get("updated", "?"))),
        "Viditeľný changelog: prvý záznam má dátum aktualizácie", [str(x) for x in log[:3]])

    tldr = meta.get("tldr", "")
    tw = words(tldr)
    add("tldr", "error", 35 <= tw <= 70, "Krátka odpoveď (tldr) má 40–60 slov (má %d)" % tw)
    add("tldr-range", "warn", 40 <= tw <= 60, "Krátka odpoveď presne v rozsahu 40–60 slov (má %d)" % tw)
    add("tldr-intro", "error", not re.search(r"v tomto článku|dozviete sa|dozvieš sa|v článku sa", tldr, re.I),
        "Krátka odpoveď začína priamou odpoveďou, nie úvodom („v tomto článku…“)")
    kp = meta.get("key_points") or []
    add("key-points", "error", len(kp) >= 3, "Aspoň 3 kľúčové body (má %d)" % len(kp))
    nums = len(re.findall(r"\d+(?:[,.]\d+)?", tldr + " " + " ".join(kp)))
    add("tldr-numbers", "warn", nums >= 3, "Krátka odpoveď a kľúčové body obsahujú aspoň 3 čísla (majú %d)" % nums)

    main = [s for s in secs if s["kind"] == "main"]
    content = [s for s in secs if s["kind"] in ("main", "definition")]
    defin = [s for s in secs if s["kind"] == "definition"]
    add("definition", "warn", bool(defin) and " je " in plain(defin[0]["first"]),
        "Sekcia „Čo je …?“ s definíciou vo forme „X je Y, ktoré Z“")
    add("sections", "warn", 3 <= len(main) <= 8, "3–6 hlavných sekcií (má %d)" % len(main))
    q = [s for s in content if s["question"]]
    add("h2-questions", "warn", content and len(q) >= len(content) / 2,
        "Aspoň polovica nadpisov H2 sú otázky (%d z %d)" % (len(q), len(content)),
        [s["title"] for s in content if not s["question"]])
    bad_len = ["%s: %d slov" % (s["title"], s["words"]) for s in main if not (80 <= s["words"] <= 450)]
    add("section-length", "warn", not bad_len, "Hlavné sekcie majú 80–400 slov (kratšie je lepšie, viď STYL.md)", bad_len)
    no_bold = [s["title"] for s in content if not s["first_bold"]]
    add("first-sentence", "warn", not no_bold, "Každá sekcia začína tučnou prvou vetou = odpoveď na nadpis", no_bold)
    no_num = [s["title"] for s in main if s["numbers"] == 0 and s["fnrefs"] == 0]
    add("section-numbers", "warn", not no_num, "Každá hlavná sekcia má aspoň 1 číslo alebo poznámku so zdrojom", no_num)

    refs = []
    for s in secs:
        for pat in BACKREFS:
            for m in re.finditer(pat, s["text"], re.I):
                refs.append("%s: „…%s…“" % (s["title"], s["text"][max(0, m.start() - 25):m.end() + 25]))
        for t, d in s["blocks"]:
            if t == "p" and PRONOUN_START.match(plain(d).strip()):
                refs.append("%s: odsek začína „%s“" % (s["title"], plain(d).strip()[:40]))
    add("standalone", "warn", not refs, "Sekcie obstoja samy (žiadne „vyššie“, „ako sme spomenuli“, odsek začínajúci „Toto/To“)", refs[:8])

    hero = str(meta.get("hero", ""))
    add("hero", "warn", bool(hero), "Obrázok v hlavičke článku (hero, hero_alt)")
    imgs = [d for t, d in blocks_of(secs) if t == "img"]
    n_charts = sum(s["charts"] for s in secs)
    want = max(2, (len(main) + 1) // 2)
    add("images", "warn", len(imgs) + n_charts >= want,
        "Obrázky v texte: aspoň %d obrázky alebo grafy (1 na 2 hlavné sekcie), má %d" % (want, len(imgs) + n_charts))
    add("chart", "warn", n_charts >= 1, "Aspoň 1 graf (blok ::: graf), keď článok porovnáva čísla")
    every = [("hero", hero, meta.get("hero_alt", ""))] + [("obrázok", d["src"], d["alt"]) for d in imgs]
    no_alt = ["%s: %s" % (k, src) for k, src, alt in every if src and not str(alt).strip()]
    add("img-alt", "error", not no_alt, "Každý obrázok má popis (alt)", no_alt)
    ph = ["%s: %s" % (k, alt) for k, src, alt in every if src and is_placeholder(src)]
    add("img-placeholder", "error", not ph, "Zástupné obrázky sú nahradené skutočnými (pred publikovaním)", ph[:6])
    missing = [src for k, src, alt in every if src and not is_placeholder(src) and not os.path.isfile(os.path.join(SITE_DIR, src))]
    missing += [d.get("obrazok") for t, d in blocks_of(secs) if t == "ponuka" and d.get("obrazok") and not is_placeholder(d["obrazok"])
                and not os.path.isfile(os.path.join(SITE_DIR, d["obrazok"]))]
    add("img-files", "error", not missing, "Súbory obrázkov existujú (cesta od granula/, napr. img/blog/<slug>/…)", missing)
    offers = [(s["kind"], d) for s in secs for t, d in s["blocks"] if t == "ponuka"]
    mid = [d for k, d in offers if k in ("main", "definition")]
    add("offer-mid", "warn", len(mid) >= 1, "Ponuka uprostred článku, ktorá sedí k téme (blok ::: ponuka)")
    bad_offer = [d.get("nadpis", "?") for k, d in offers if not (d.get("nadpis") and d.get("text"))]
    add("offer-fields", "warn", not bad_offer, "Ponuka má nadpis a text", bad_offer)
    bad_link = [d.get("nadpis", "?") for k, d in offers if (d.get("odkaz") or "granule-na-mieru.html") != "granule-na-mieru.html"]
    if meta.get("cta_link") and meta["cta_link"] != "granule-na-mieru.html":
        bad_link.append("záverečná ponuka (cta_link)")
    add("offer-link", "warn", not bad_link, "Ponuka vedie na dotazník (granule-na-mieru.html), nie na konkrétny produkt", bad_link)
    add("offer-count", "warn", len(offers) <= 2, "Najviac 2 ponuky v texte (má %d), inak to pôsobí ako reklama" % len(offers))
    add("table", "info", any(s["has_table"] for s in secs), "Porovnávacia tabuľka (odporúčané pri „X vs Y“)")
    add("steps", "info", any(s["has_ol"] for s in secs), "Postup krok za krokom (číslovaný zoznam)")
    own = [s for s in secs if re.search(r"naše dáta|naša skúsenos|z našej praxe|čo ukázali", s["title"], re.I)]
    add("own-data", "info", bool(own), "Vlastné dáta alebo skúsenosť (najväčší diferenciátor)")

    faq = [s for s in secs if s["kind"] == "faq"]
    if faq:
        qs = [d for t, d in faq[0]["blocks"] if t == "p" and re.match(r"^\*\*[^*]+\?\*\*", d)]
        long_a = [plain(d)[:50] for d in qs if len(sentences(re.sub(r"^\*\*[^*]+\*\*", "", d))) > 3]
        add("faq", "warn", 3 <= len(qs) <= 6 and not long_a,
            "Časté otázky: 3–6 otázok v tvare **Otázka?** odpoveď, odpoveď najviac 3 vety (má %d)" % len(qs), long_a)
    else:
        add("faq", "warn", False, "Sekcia „Časté otázky“ (3–6 krátkych otázok)")
    summ = [s for s in secs if s["kind"] == "summary"]
    add("summary", "warn", bool(summ) and any(t == "ul" for t, _ in summ[0]["blocks"]),
        "Sekcia „Zhrnutie“ ako zoznam (hlavný záver, kedy áno/nie, ďalší krok)")

    src = meta.get("sources") or []
    with_url = [x for x in src if re.search(r"https?://", x)]
    add("sources", "error", len(with_url) >= 3, "Aspoň 3 zdroje s URL (má %d)" % len(with_url))
    add("sources-format", "warn", len(with_url) == len(src), "Každý zdroj v tvare „Názov – vydavateľ, rok | https://…“",
        [x for x in src if x not in with_url])

    first_third = body[: max(1, len(body) // 3)]
    add("first-third", "info", len(re.findall(r"\d", first_third)) >= 5, "Kľúčové fakty (čísla) sú v prvej tretine textu")
    atomic = [x for x in sentences(" ".join(s["text"] for s in secs)) if 6 <= len(x.split()) <= 20 and NUM.search(x)]
    add("atomic", "info", len(atomic) >= 5, "Atomické fakty: vety so 6–20 slovami a číslom (má %d)" % len(atomic))
    all_text = (title + " " + tldr + " " + " ".join(kp) + " " + body + " " + " ".join(str(meta.get(k, "")) for k in ("cta_title", "cta_text"))).lower()
    add("self-promo", "warn", not (re.match(r"^(najlepš|top \d)", title.lower()) and "granul" in body.lower()),
        "„Najlepšie X“ len s transparentnou metodikou a bez Granuly na prvom mieste")
    retired = [w for w in RETIRED if w in all_text]
    add("claims", "warn", not retired, "Žiadne vyradené tvrdenia a superlatívy z dizajn systému", retired)
    names = sorted({m.group(0) for m in INTERNAL_NAMES.finditer(body + " " + tldr + " " + " ".join(kp))})
    add("recipe-names", "warn", not names, "Receptúry podľa mäsa (napr. „Jeleň & králik“), nie interné názvy Puppy/Energy", names)
    vy = sorted({m.group(0) for p in VY_FORM for m in re.finditer(p, all_text)})
    add("ty-form", "warn", not vy, "Tykanie („tvoj pes“), nie vykanie", vy)
    add("emoji", "warn", not EMOJI.search(all_text), "Bez emoji")
    total = words(tldr) + sum(s["words"] for s in secs)
    add("length", "info", True, "Dĺžka článku: %d slov (dĺžka nerozhoduje, hustota áno)" % total)
    return R, total

# ---------------------------------------------------------------- HTML šablóny

def site_parts():
    s = open(os.path.join(SITE_DIR, "index.html"), encoding="utf-8").read()
    grab = lambda a, b: s[s.index(a): s.index(b, s.index(a)) + len(b)]
    return grab('<div class="topbar">', "</div>"), grab('<header class="site-head">', "</header>"), grab('<footer class="foot">', "</footer>")


def relink(fragment, pre):
    def fix(m):
        attr, url = m.group(1), m.group(2)
        if re.match(r"^(https?:|mailto:|tel:|data:)", url):
            return m.group(0)
        if url.startswith("#"):
            url = "index.html" + url if url != "#" else "#"
            if url == "#":
                return m.group(0)
        return '%s="%s%s"' % (attr, pre, url)
    return re.sub(r'(href|src)="([^"]*)"', fix, fragment)


def page(*, pre, title, description, canonical, body, noindex=False, jsonld=None, current_blog=True, image=None):
    topbar, header, footer = site_parts()
    header = relink(header, pre)
    if current_blog:
        header = header.replace('href="%sblog/">Blog</a>' % pre, 'href="%sblog/" aria-current="page">Blog</a>' % pre)
    head_ld = '<script type="application/ld+json">%s</script>\n' % json.dumps(jsonld, ensure_ascii=False) if jsonld else ""
    robots = '<meta name="robots" content="noindex, nofollow">\n' if noindex else ""
    embed = ('<script>if(/[?&]embed\\b/.test(location.search))document.documentElement.className+=" embed"</script>\n' if noindex else "")
    og_img = '\n<meta property="og:image" content="%s/%s">' % (BASE_URL, html.escape(image)) if image and not is_placeholder(image) else ""
    return f"""<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{html.escape(description)}">
{robots}{embed}<link rel="canonical" href="{canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:url" content="{canonical}">{og_img}
<link rel="icon" href="{pre}favicon.ico" sizes="any">
<link rel="icon" href="{pre}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;0,800;0,900;1,900&display=swap">
<link rel="stylesheet" href="{pre}granula.css">
<link rel="stylesheet" href="{pre}blog/blog.css">
{head_ld}</head>
<body>
{relink(topbar, pre)}
{header}
<main>
{body}
</main>
{relink(footer, pre)}
<script type="text/plain" data-cookie-category="marketing" async src="https://static.klaviyo.com/onsite/js/Yf7K2A/klaviyo.js?company_id=Yf7K2A"></script>
<script src="{pre}cookies.js"></script>
</body>
</html>
"""


SK_MONTHS = ["januára", "februára", "marca", "apríla", "mája", "júna", "júla", "augusta", "septembra", "októbra", "novembra", "decembra"]


def sk_date(v):
    try:
        d = dt.date.fromisoformat(str(v))
    except ValueError:
        return str(v)
    return "%d.\u00a0%s %d" % (d.day, SK_MONTHS[d.month - 1], d.year)


def num_date(v):
    try:
        d = dt.date.fromisoformat(str(v))
    except ValueError:
        return str(v)
    return "%d.\u00a0%d.\u00a0%d" % (d.day, d.month, d.year)


def source_html(x):
    m = re.match(r"^(.*?)\s*\|\s*(https?://\S+)\s*$", x)
    if m:
        return '%s – <a href="%s" target="_blank" rel="noopener">%s</a>' % (inline(m.group(1)), html.escape(m.group(2)), html.escape(re.sub(r"^https?://(www\.)?", "", m.group(2))[:60]))
    return inline(x)


def article_html(post, pre, preview):
    m = post["meta"]
    read_min = max(1, round(post["words"] / 200))
    banner = ""
    if preview:
        st = {"draft": "Koncept", "published": "Publikované", "blocked": "Zablokované kontrolou"}[post["status"]]
        banner = ('<div class="bl-preview" role="note"><b>Náhľad · %s</b> Táto stránka nie je verejná ani indexovaná. '
                  '<a href="%sadmin-blog/#%s">Späť do redakcie</a></div>' % (st, pre, post["slug"]))
    kp = "".join("<li>%s</li>" % inline(x) for x in m.get("key_points") or [])
    src = m.get("sources") or []
    src_html = ('<section class="bl-sources" aria-labelledby="zdroje"><h2 id="zdroje">Zdroje</h2><ol>%s</ol></section>'
                % "".join("<li>%s</li>" % source_html(x) for x in src)) if src else ""
    body_blocks = [b for b in post["blocks"] if not (b[0] == "h2" and kind_of(b[1]) == "sources")]
    FN["order"] = []
    body_html = render_blocks(body_blocks, pre)
    notes = post.get("notes") or {}
    fn_html = ""
    if FN["order"]:
        fn_html = ('<section class="bl-notes" aria-labelledby="poznamky"><h2 id="poznamky">Poznámky</h2><ol>%s</ol></section>'
                   % "".join('<li id="fn-%s">%s <a href="#fnref-%s" aria-label="Späť do textu">↩</a></li>' % (slugify(f), inline(notes.get(f, "")), slugify(f))
                             for f in list(FN["order"])))
    photo = str(m.get("author_photo", ""))
    if photo and not is_placeholder(photo):
        avatar = '<img class="bl-av" src="%s%s" alt="%s" width="64" height="64">' % (pre, html.escape(photo), html.escape(m.get("author", "")))
    else:
        ini = "".join(w[0] for w in re.findall(r"[^\W\d_]+", re.sub(r"^\w+\.\s*", "", str(m.get("author", ""))))[:2]).upper() or "?"
        avatar = '<span class="bl-av bl-av-ph" role="img" aria-label="Zástupná fotka autora">%s</span>' % html.escape(ini)
    pub_d, upd_d = str(m.get("published", "")), str(m.get("updated", ""))
    dates_html = '<time datetime="%s">%s</time>' % (pub_d, num_date(pub_d))
    if upd_d and upd_d != pub_d:
        dates_html += ' · Aktualizované <time datetime="%s">%s</time>' % (upd_d, num_date(upd_d))
    author_name = inline(m.get("author", ""))
    if m.get("author_id"):
        author_name = '<a class="bl-author" href="%sblog/autori/%s/">%s</a>' % (pre, m["author_id"], author_name)
    hero_html = ""
    if m.get("hero"):
        hero_html = figure_html({"src": str(m["hero"]), "alt": m.get("hero_alt", ""), "caption": m.get("hero_caption", "")}, pre, "bl-hero")
    end = {"stitok": "Granule na mieru", "nadpis": m.get("cta_title") or "Granule na mieru pre tvojho psa",
           "text": m.get("cta_text") or "Povedz nám o ňom za dve minúty. Granule aj dávku na gramy vyberieme my.",
           "tlacidlo": m.get("cta_button") or "Nájdi granule pre svojho psa", "odkaz": m.get("cta_link") or "granule-na-mieru.html",
           "obrazok": m.get("cta_image", "")}
    return f"""{banner}<article class="bl-article">
  <div class="wrap bl-col">
    <nav class="bl-crumbs" aria-label="Omrvinky"><a href="{pre}index.html">Granula</a> / <a href="{pre}blog/">Blog</a></nav>
    <header class="bl-head">
      <p class="bl-date">{dates_html} · {read_min}&nbsp;min čítania</p>
      <h1>{inline(m["title"])}</h1>
      <div class="bl-byline">{avatar}<p class="bl-meta"><b>{author_name}</b><br><span class="bl-bio">{inline(m.get("author_bio", ""))}</span></p></div>
    </header>
    {hero_html}
    <section class="bl-tldr" aria-labelledby="sumar">
      <h2 id="sumar" class="bl-tldr-t">Sumár</h2>
      <p>{inline(m.get("tldr", ""))}</p>
      <h3 class="bl-tldr-t">Kľúčové body</h3>
      <ul>{kp}</ul>
    </section>
    <div class="bl-body">
{body_html}
    </div>
    {offer_html(end, pre, end=True)}
    {fn_html}
    {src_html}
  </div>
</article>"""


def author_page(a, posts):
    pre = "../../../"
    aid, name = a["id"], a.get("name", a["id"])
    photo = str(a.get("photo", ""))
    if photo and not is_placeholder(photo):
        av = '<img class="bl-av bl-av-lg" src="%s%s" alt="%s" width="160" height="160">' % (pre, html.escape(photo), html.escape(name))
    else:
        ini = "".join(w[0] for w in re.findall(r"[^\W\d_]+", re.sub(r"^\w+\.\s*", "", name))[:2]).upper() or "?"
        av = '<span class="bl-av bl-av-lg bl-av-ph" role="img" aria-label="Fotka autora">%s</span>' % html.escape(ini)
    intro = render_blocks(md_blocks(a.get("intro", "")), pre)
    web = ('<p class="bl-author-web"><a href="%s" target="_blank" rel="noopener">%s</a></p>' % (html.escape(a["web"]), html.escape(a.get("web_label") or a["web"]))) if a.get("web") else ""
    items = "".join('<li class="bl-card"><a href="%sblog/%s/"><span class="bl-card-date">Aktualizované %s</span><h2>%s</h2></a></li>'
                    % (pre, p["slug"], sk_date(p["meta"].get("updated", "")), inline(p["meta"]["title"])) for p in posts)
    lst = '<h2 class="bl-author-h">Články</h2><ul class="bl-list">%s</ul>' % items if items else '<p class="bl-empty">Články pripravujeme.</p>'
    body = f"""<section class="sec bl-index">
  <div class="wrap">
    <nav class="bl-crumbs" aria-label="Omrvinky"><a href="{pre}index.html">Granula</a> / <a href="{pre}blog/">Blog</a> / Autori</nav>
    <div class="bl-author-head">{av}<div><div class="eyebrow">Autor</div><h1 class="h2">{keep_case(html.escape(name))}</h1><div class="bl-body">{intro}</div>{web}</div></div>
    {lst}
  </div>
</section>"""
    url = "%s/blog/autori/%s/" % (BASE_URL, aid)
    ld = dict({"@context": "https://schema.org", "@type": "Person", "name": name, "description": plain(a.get("bio", "")), "url": url},
              **({"sameAs": [a["web"]]} if a.get("web") else {}))
    return page(pre=pre, title="%s — Granula" % name, description=plain(a.get("bio", ""))[:160], canonical=url, body=body,
                jsonld=ld, noindex=not posts)


def index_html(posts):
    pre = "../"
    cards = []
    for p in posts:
        m = p["meta"]
        excerpt = plain(m.get("tldr", ""))
        excerpt = excerpt if len(excerpt) <= 190 else excerpt[:185].rsplit(" ", 1)[0] + "…"
        hero = str(m.get("hero", ""))
        thumb = ('<span class="bl-card-img"><img src="%s%s" alt="" loading="lazy"></span>' % (pre, html.escape(hero))) if hero and not is_placeholder(hero) else ""
        cards.append(f"""<li class="bl-card"><a href="{p["slug"]}/">{thumb}
  <span class="bl-card-date">Aktualizované {sk_date(m.get("updated", ""))}</span>
  <h2>{inline(m["title"])}</h2>
  <p>{html.escape(excerpt)}</p>
  <span class="bl-card-more">Čítať · {max(1, round(p["words"] / 200))}&nbsp;min →</span>
</a></li>""")
    lst = '<ul class="bl-list">%s</ul>' % "\n".join(cards) if cards else '<p class="bl-empty">Prvé články pripravujeme.</p>'
    body = f"""<section class="sec bl-index">
  <div class="wrap">
    <div class="head">
      <div class="eyebrow">Blog</div>
      <h1 class="h2">Čo jesť, <span class="ac">koľko a prečo.</span></h1>
      <p class="lead">{BLOG_LEAD}</p>
    </div>
    {lst}
  </div>
</section>"""
    ld = {"@context": "https://schema.org", "@type": "Blog", "name": "%s — %s" % (SITE_NAME, BLOG_TITLE), "url": BASE_URL + "/blog/"}
    return page(pre=pre, title="Blog — Granula", description=BLOG_LEAD, canonical=BASE_URL + "/blog/", body=body, jsonld=ld)

# ---------------------------------------------------------------- blog na úvodnej stránke

HOME_START, HOME_END = "<!-- blog-home:start (generuje blog/build.py) -->", "<!-- blog-home:end -->"


def home_section(posts, limit=8):
    """Sekcia s náhľadmi publikovaných článkov na granula/index.html. Bez článkov je skrytá."""
    cards = []
    for p in posts[:limit]:
        m = p["meta"]
        excerpt = plain(m.get("tldr", ""))
        excerpt = excerpt if len(excerpt) <= 150 else excerpt[:145].rsplit(" ", 1)[0] + "…"
        hero = str(m.get("hero", ""))
        img = ('<img src="%s" alt="" loading="lazy">' % html.escape(hero)) if hero and not is_placeholder(hero) else '<span class="hb-noimg" aria-hidden="true"></span>'
        cards.append('<li class="hb-card"><a href="blog/%s/"><span class="hb-img">%s</span><span class="hb-body">'
                     '<span class="hb-date">%s · %d&nbsp;min</span><span class="hb-title">%s</span><span class="hb-ex">%s</span></span></a></li>'
                     % (p["slug"], img, sk_date(m.get("updated", "")), max(1, round(p["words"] / 200)), inline(m["title"]), html.escape(excerpt)))
    cards.append('<li class="hb-card hb-all"><a href="blog/"><span class="hb-all-n">%d</span><span class="hb-title">Všetky články</span>'
                 '<span class="hb-ex">Výživa, kŕmenie a zdravie psov s číslami a zdrojmi.</span><span class="hb-more">Otvoriť blog →</span></a></li>' % len(posts))
    hidden = "" if posts else " hidden"
    return f"""{HOME_START}
<section id="blog" class="sec hb bt" data-carousel{hidden}>
  <div class="wrap">
    <div class="hb-head">
      <div class="head">
        <div class="eyebrow">Blog</div>
        <h2 class="h2">Čo jesť, <span class="ac">koľko a prečo.</span></h2>
      </div>
      <div class="hb-acts">
        <a class="link-under" href="blog/">Všetky články →</a>
        <div class="ig-arrows">
          <button type="button" class="ig-arw" aria-label="Predchádzajúce články" data-carousel-prev>←</button>
          <button type="button" class="ig-arw dark" aria-label="Ďalšie články" data-carousel-next>→</button>
        </div>
      </div>
    </div>
    <ul class="hb-row" data-carousel-row tabindex="0" aria-label="Najnovšie články">
      {"".join(cards)}
    </ul>
  </div>
</section>
{HOME_END}"""


def write_home(posts):
    path = os.path.join(SITE_DIR, "index.html")
    s = open(path, encoding="utf-8").read()
    if HOME_START not in s or HOME_END not in s:
        print("PROBLÉM granula/index.html nemá značky %s … %s, sekcia blogu sa nevložila" % (HOME_START, HOME_END))
        return
    a, b = s.index(HOME_START), s.index(HOME_END) + len(HOME_END)
    new = s[:a] + home_section(posts) + s[b:]
    if new != s:
        write(path, new)

# ---------------------------------------------------------------- build

AUTHORS_DIR = os.path.join(HERE, "_autori")
AUTH = {}


def load_authors():
    """Register autorov: granula/blog/_autori/<id>.md (name, bio, photo, web, web_label + predstavenie v tele)."""
    authors, problems = {}, []
    if not os.path.isdir(AUTHORS_DIR):
        return authors, problems
    for fn in sorted(os.listdir(AUTHORS_DIR)):
        if not fn.endswith(".md"):
            continue
        try:
            meta, body = parse_frontmatter(open(os.path.join(AUTHORS_DIR, fn), encoding="utf-8").read())
        except ValueError as e:
            problems.append("autor %s: %s" % (fn, e))
            continue
        aid = fn[:-3]
        meta["id"], meta["intro"] = aid, body.strip()
        authors[aid] = meta
    return authors, problems


def has_placeholder(t):
    """Zástupný text v [hranatých zátvorkách]; markdown odkaz [text](url) sa nepočíta."""
    return bool(re.search(r"\[[^\]]*\](?!\()", t))


def apply_author(meta, authors):
    """`author: <id>` z registra doplní meno, vetu, fotku a web (polia v článku majú prednosť)."""
    aid = str(meta.get("author", "")).strip()
    a = authors.get(aid)
    if not a:
        return
    meta["author_id"] = aid
    meta["author"] = a.get("name", aid)
    if not meta.get("author_bio") or has_placeholder(str(meta.get("author_bio"))):
        meta["author_bio"] = a.get("bio", "")
    if not meta.get("author_photo") or is_placeholder(str(meta.get("author_photo"))):
        meta["author_photo"] = a.get("photo", "placeholder")
    meta["author_web"] = a.get("web", "")


def load_posts():
    posts, problems = [], []
    AUTH.update(load_authors()[0])
    if not os.path.isdir(SRC):
        return posts, problems
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith(".md") or fn.startswith("_"):
            continue
        path = os.path.join(SRC, fn)
        try:
            meta, body = parse_frontmatter(open(path, encoding="utf-8").read())
        except ValueError as e:
            problems.append("%s: %s" % (fn, e))
            continue
        slug = meta.get("slug") or fn[:-3]
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", slug):
            problems.append("%s: slug „%s“ smie mať len malé písmená bez diakritiky, číslice a pomlčky" % (fn, slug))
            continue
        if meta.get("status") == "namet":
            posts.append({"file": "granula/blog/_src/" + fn, "slug": slug, "meta": meta, "blocks": [], "sections": [],
                          "lint": [], "words": 0, "status": "namet", "wanted": "namet"})
            continue
        apply_author(meta, AUTH)
        if re.match(r"^[a-z0-9]+(-[a-z0-9]+)+$", str(meta.get("author", ""))) and "author_id" not in meta:
            problems.append("%s: autor „%s“ nie je v registri granula/blog/_autori/" % (fn, meta["author"]))
        body, notes = split_footnotes(body)
        blocks = md_blocks(body)
        secs = sections(blocks)
        results, total = lint(meta, secs, body)
        missing_fn = sorted(set(re.findall(r"\[\^([^\]]+)\]", body)) - set(notes))
        results.append({"id": "footnotes", "level": "error", "ok": not missing_fn,
                        "msg": "Každá poznámka [^id] v texte má definíciu „[^id]: text“", "details": missing_fn})
        errors = [r for r in results if r["level"] == "error" and not r["ok"]]
        want = meta.get("status", "draft")
        status = "published" if want == "published" and not errors else ("blocked" if want == "published" else "draft")
        posts.append({"file": "granula/blog/_src/" + fn, "slug": slug, "meta": meta, "blocks": blocks, "sections": secs, "notes": notes,
                      "lint": results, "words": total, "status": status, "wanted": want})
    slugs = [p["slug"] for p in posts]
    for s in set(slugs):
        if slugs.count(s) > 1:
            problems.append("slug „%s“ je použitý viackrát" % s)
    return posts, problems


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


PDF_JS = r"""
const { chromium } = require('playwright');
const jobs = JSON.parse(process.argv[1]);
(async () => {
  const b = await chromium.launch();
  for (const j of jobs) {
    const p = await b.newPage();
    await p.goto(j.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await p.evaluate(() => { document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager'); document.querySelectorAll('.cookie-bar').forEach(e => e.remove()); document.querySelectorAll('details').forEach(d => d.open = true); });
    await p.waitForTimeout(400);
    await p.pdf({ path: j.out, format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;font-family:sans-serif">' + j.label + ' · <span class="pageNumber"></span>/<span class="totalPages"></span></div>' });
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
"""


def export_pdfs(posts, skip=False):
    """PDF náhľadu každého článku na review (napr. na iPade). Prerenderuje len zmenené články (hash HTML + CSS).
    Potrebuje Node + Playwright; bez nich ostanú existujúce PDF a build pokračuje."""
    import hashlib, subprocess
    out_dir = os.path.join(HERE, "nahlad-pdf")
    os.makedirs(out_dir, exist_ok=True)
    idx_path = os.path.join(out_dir, "hashes.json")
    try:
        old = json.load(open(idx_path, encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    css = "".join(open(os.path.join(d, f), encoding="utf-8").read() for d, f in ((HERE, "blog.css"), (SITE_DIR, "granula.css")))
    new, jobs = {}, []
    for p in posts:
        html_path = os.path.join(HERE, "nahlad", p["slug"], "index.html")
        h = hashlib.sha256((open(html_path, encoding="utf-8").read() + css).encode()).hexdigest()[:16]
        new[p["slug"]] = h
        pdf = os.path.join(out_dir, p["slug"] + ".pdf")
        if old.get(p["slug"]) != h or not os.path.isfile(pdf):
            label = "Granula blog · náhľad · %s · %s" % (p["slug"], p["meta"].get("updated", ""))
            jobs.append({"url": "file://" + html_path, "out": pdf, "label": html.escape(label)})
    for f in os.listdir(out_dir):
        if f.endswith(".pdf") and f[:-4] not in new:
            os.remove(os.path.join(out_dir, f))
    stale = False
    if jobs and not skip:
        try:
            subprocess.run(["node", "-e", PDF_JS, json.dumps(jobs)], check=True, timeout=600)
            print("PDF náhľady: %d prerenderované" % len(jobs))
        except (OSError, subprocess.SubprocessError) as e:
            print("PDF náhľady sa nevygenerovali (%s); existujúce ostávajú." % e)
            stale = True
    else:
        stale = bool(jobs)
        if jobs:
            print("PDF náhľady preskočené (--no-pdf), %d zastaraných" % len(jobs))
    if jobs and (skip or stale):
        for j in jobs:  # starý hash = pri ďalšom builde sa PDF prerenderuje
            slug = os.path.basename(j["out"])[:-4]
            new[slug] = old.get(slug, "")
    write(idx_path, json.dumps(new, indent=1, sort_keys=True) + "\n")
    return {s for s in new if os.path.isfile(os.path.join(out_dir, s + ".pdf"))}


def jsonld(post, url):
    m = post["meta"]
    return {"@context": "https://schema.org", "@type": "BlogPosting", "headline": m["title"], "description": m.get("description", ""),
            "datePublished": str(m.get("published", "")), "dateModified": str(m.get("updated", "")),
            "author": dict({"@type": "Person", "name": m.get("author", ""), "description": plain(m.get("author_bio", ""))},
                           **({"url": "%s/blog/autori/%s/" % (BASE_URL, m["author_id"])} if m.get("author_id") else {}),
                           **({"sameAs": [m["author_web"]]} if m.get("author_web") else {}),
                           **({"image": "%s/%s" % (BASE_URL, m["author_photo"])} if m.get("author_photo") and not is_placeholder(str(m["author_photo"])) else {})),
            **({"image": "%s/%s" % (BASE_URL, m["hero"])} if m.get("hero") and not is_placeholder(str(m["hero"])) else {}),
            "publisher": {"@type": "Organization", "name": "Spark Link, s. r. o. (Granula!)", "url": BASE_URL + "/"},
            "mainEntityOfPage": url, "inLanguage": "sk"}


def build(check_only=False):
    posts, problems = load_posts()
    pub = sorted([p for p in posts if p["status"] == "published"], key=lambda p: str(p["meta"].get("updated", "")), reverse=True)

    ideas = [p for p in posts if p["status"] == "namet"]
    if ideas:
        print("NÁMETY       %d (%s)" % (len(ideas), ", ".join("%s: %d" % (k, sum(1 for p in ideas if p["meta"].get("priority") == k)) for k in ("P1", "P2", "P3"))))
    for p in posts:
        if p["status"] == "namet":
            continue
        e = [r for r in p["lint"] if r["level"] == "error" and not r["ok"]]
        w = [r for r in p["lint"] if r["level"] == "warn" and not r["ok"]]
        print("%-12s %-40s %d chýb, %d upozornení" % (p["status"].upper(), p["slug"], len(e), len(w)))
        for r in e:
            print("   CHYBA  %s: %s" % (r["id"], r["msg"]))
        for r in w:
            print("   pozor  %s: %s%s" % (r["id"], r["msg"], (" → " + "; ".join(r["details"][:3])) if r["details"] else ""))
    for x in problems:
        print("PROBLÉM", x)
    if check_only:
        return 1 if problems or any(p["status"] == "blocked" for p in posts) else 0

    # vyčistiť staré výstupy (článkové priečinky a náhľady), ponechať zdroje a statické súbory
    keep = {"_src", "build.py", "blog.css", "CLAUDE.md", "GEO-TEMPLATE.md", "README.md", "TEMY.md", "STYL.md", "NAVOD.md", "foto.py", "_autori", "nahlad-pdf"}
    for name in os.listdir(HERE):
        full = os.path.join(HERE, name)
        if name in keep:
            continue
        if os.path.isdir(full):
            shutil.rmtree(full)
        elif name in ("index.html", "posts.js"):
            os.remove(full)

    for p in posts:
        if p["status"] == "namet":
            continue
        url = "%s/blog/%s/" % (BASE_URL, p["slug"])
        m = p["meta"]
        title = "%s — Granula" % m["title"]
        write(os.path.join(HERE, "nahlad", p["slug"], "index.html"),
              page(pre="../../../", title="Náhľad: " + title, description=m.get("description", ""), canonical=url,
                   body=article_html(p, "../../../", True), noindex=True))
        if p["status"] == "published":
            write(os.path.join(HERE, p["slug"], "index.html"),
                  page(pre="../../", title=title, description=m.get("description", ""), canonical=url,
                       body=article_html(p, "../../", False), jsonld=jsonld(p, url), image=str(m.get("hero", ""))))
    write(os.path.join(HERE, "index.html"), index_html(pub))
    for aid, a in AUTH.items():
        mine = [p for p in pub if p["meta"].get("author_id") == aid]
        write(os.path.join(HERE, "autori", aid, "index.html"), author_page(a, mine))
    pdfs = export_pdfs([p for p in posts if p["status"] != "namet"], skip="--no-pdf" in sys.argv)
    write_home(pub)

    authors_m = [{"id": aid, "name": a.get("name", aid), "bio": plain(a.get("bio", "")), "web": a.get("web", ""),
                  "photo": str(a.get("photo", "")), "photoOk": bool(a.get("photo")) and not is_placeholder(str(a.get("photo"))),
                  "page": "../blog/autori/%s/index.html" % aid,
                  "articles": [p["slug"] for p in posts if p["meta"].get("author_id") == aid]} for aid, a in AUTH.items()]
    manifest = {"authors": authors_m, "built": dt.datetime.now().strftime("%Y-%m-%d %H:%M"), "base": BASE_URL, "problems": problems, "posts": [{
        "slug": p["slug"], "file": p["file"], "title": p["meta"].get("title", ""), "status": p["status"], "wanted": p["wanted"],
        "example": bool(p["meta"].get("example")), "published": str(p["meta"].get("published", "")), "updated": str(p["meta"].get("updated", "")),
        "author": p["meta"].get("author", ""), "authorId": p["meta"].get("author_id", ""), "authorPhoto": str(p["meta"].get("author_photo", "")), "hero": str(p["meta"].get("hero", "")), "words": p["words"], "description": p["meta"].get("description", ""),
        "id": p["meta"].get("id", ""), "category": p["meta"].get("category", ""), "priority": p["meta"].get("priority", ""),
        "brief": p["meta"].get("brief", ""), "angle": p["meta"].get("angle", ""),
        "preview": "../blog/nahlad/%s/index.html" % p["slug"] if p["status"] != "namet" else None,
        "pdf": ("../blog/nahlad-pdf/%s.pdf" % p["slug"]) if p["slug"] in pdfs else None, "live": "../blog/%s/index.html" % p["slug"] if p["status"] == "published" else None,
        "lint": p["lint"],
        "sections": [{"title": s["title"], "kind": s["kind"], "words": s["words"], "numbers": s["numbers"], "question": s["question"],
                      "firstBold": s["first_bold"], "table": s["has_table"], "steps": s["has_ol"],
                      "images": s["images"], "charts": s["charts"], "offers": s["offers"]} for s in p["sections"]],
    } for p in posts]}
    write(os.path.join(HERE, "posts.js"), "/* vygenerované build.py — needitovať */\nwindow.GRANULA_POSTS = %s;\n" % json.dumps(manifest, ensure_ascii=False, indent=1))

    # statické stránky bez lastmod (dátum buildu by klamal); blog podľa najnovšieho článku, články podľa `updated`
    last = str(pub[0]["meta"].get("updated", "")) if pub else ""
    urls = [(BASE_URL + "/", ""), (BASE_URL + "/granule-na-mieru", ""), (BASE_URL + "/podpora", ""), (BASE_URL + "/garancia", ""), (BASE_URL + "/blog/", last)]
    urls += [("%s/blog/%s/" % (BASE_URL, p["slug"]), str(p["meta"].get("updated", ""))) for p in pub]
    urls += [("%s/blog/autori/%s/" % (BASE_URL, aid), "") for aid in AUTH if any(p["meta"].get("author_id") == aid for p in pub)]
    write(os.path.join(SITE_DIR, "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n'
          % "".join("  <url><loc>%s</loc>%s</url>\n" % (html.escape(u), "<lastmod>%s</lastmod>" % d if d else "") for u, d in urls))
    bots = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "Google-Extended", "Bingbot", "Googlebot"]
    path = BASE_URL.split("://", 1)[1].split("/", 1)[1] if BASE_URL.count("/") > 2 else ""
    pfx = "/" + path if path else ""
    dis = ["%s/admin-blog/" % pfx, "%s/blog/nahlad/" % pfx, "%s/blog/nahlad-pdf/" % pfx, "%s/admin-vypocet" % pfx]
    robots = "# vygenerované granula/blog/build.py\n# AI vyhľadávače sú výslovne povolené (GEO); súkromné stránky zakázané všetkým.\n\n"
    robots += "".join("User-agent: %s\n" % b for b in bots) + "".join("Disallow: %s\n" % d for d in dis) + "Allow: /\n\n"
    robots += "User-agent: *\n" + "".join("Disallow: %s\n" % d for d in dis) + "Allow: /\n\nSitemap: %s/sitemap.xml\n" % BASE_URL
    write(os.path.join(REPO, "robots.txt"), robots)
    print("\nHotovo: %d článkov (%d publikovaných), %d námetov. Redakcia: granula/admin-blog/" % (len(posts) - len(ideas), len(pub), len(ideas)))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(build(check_only="--check" in sys.argv))
