#!/usr/bin/env python3
"""Generate StudentPlan v2 design prototypes (design artifacts only, not production code).

Usage: python3 build.py <path-to-lucide-static@0.460.0/icons>
Figures mirror src/lib/engine (demo-journey.test.ts) and are computed here in integer pence.
Money uses the engine's formatMoney: "£35", "£25.84", "£3,900" (no ".00").
"""
import datetime as dt
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("LUCIDE_ICONS", "")
D = dt.date
TODAY = D(2026, 11, 10)
END = D(2027, 1, 31)
RENDERS = []


def icon(name, cls="i"):
    with open(os.path.join(ICONS, name + ".svg")) as f:
        svg = f.read()
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S).strip()
    svg = re.sub(r'class="[^"]*"', f'class="{cls}" aria-hidden="true"', svg, count=1)
    svg = re.sub(r'\s(width|height)="24"', "", svg)
    return re.sub(r"\s+", " ", svg)


def m(p, sign=False):
    """Engine formatMoney; sign=True prefixes a real minus or plus."""
    neg, a = p < 0, abs(p)
    s = f"£{a // 100:,}" + ("" if a % 100 == 0 else f".{a % 100:02d}")
    if sign:
        return ("−" if neg else "+") + s
    return ("−" if neg else "") + s


def esc(s):
    return html.escape(s, quote=True)


def dl(d, year=False):
    s = f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"
    return s + (f" {d.year}" if year else "")


# ------------------------------------------------------------------ fixture model (engine mirror)
CATS = [("groceries", "Groceries", "shopping-basket"), ("transport", "Transport", "bus"),
        ("eating", "Eating out", "utensils"), ("shopping", "Shopping", "shopping-bag")]
AFTER_S1 = {"s1", "bubble", "dinner_pv", "dinner", "concert_pv", "deficit", "s4"}


def cats(state, d):
    v = {"groceries": 900, "transport": 520, "eating": 550, "shopping": 614}
    if d >= D(2027, 1, 4):  # 28 remainder pence: +1p on the last 28 days, to groceries (largest remainder)
        v["groceries"] += 1
    if state in AFTER_S1 and d > TODAY:
        v["shopping"] -= 12 if d >= D(2027, 1, 18) else 11
    if state in ("dinner_pv", "dinner", "concert_pv", "s4") and d == D(2026, 11, 11):
        v.update(eating=2000, shopping=0)  # D16 (provisional): groceries/transport untouched; £8.47 borrowed from later shopping
    if state == "concert_pv":
        if d == D(2026, 11, 14):
            v = {k: 0 for k in v}
        if D(2026, 11, 15) <= d <= D(2026, 11, 30):
            v["shopping"] -= 215 if d >= D(2026, 11, 28) else 214
    if state == "deficit" and d > TODAY:
        v = {k: 0 for k in v}
    if state in AFTER_S1 and d == TODAY:
        v = {k: 0 for k in v}
    return v


def day(state, d):
    """Return a dict describing one calendar day."""
    r = {"d": d, "chips": [], "kind": "plan", "total": 0, "spent": 0, "pv": False, "zero": False}
    if d < TODAY:
        r["kind"] = "past"
        if d == D(2026, 11, 1):
            r["chips"].append(("spent", "Rent", 62000, "pin"))
        return r
    if d > END:
        r["kind"] = "out"
        return r
    c = cats(state, d)
    if d.day == 1:
        r["chips"].append(("bill", "Rent", 62000, "pin"))
    if d.day == 15:
        r["chips"].append(("bill", "Utilities", 5500, "pin"))
    if d == D(2026, 12, 18):
        r["chips"].append(("inc", "Transfer", 30000, None))
    if d == TODAY and state in AFTER_S1:
        r["chips"].append(("spent", "Shower filter", 3500, None))
        r["spent"] += 3500
        if state == "deficit":
            r["chips"].append(("spent", "Tuition", 240000, None))
            r["spent"] += 240000
    if d == D(2026, 11, 11) and state in ("dinner_pv", "dinner", "concert_pv", "s4"):
        r["chips"].append(("pv" if state == "dinner_pv" else "buy", "Dinner", 2000, None))
        r["pv"] = state == "dinner_pv"
    extra = 0
    if state == "concert_pv" and d == D(2026, 11, 14):
        r["chips"].append(("pv", "Concert", 6000, None))
        r["pv"] = True
        extra = 6000
    if state == "concert_pv" and D(2026, 11, 15) <= d <= D(2026, 11, 30):
        r["pv"] = True
    if state == "deficit" and d == D(2027, 1, 1):
        r["chips"].append(("short", "Short", 8500, "triangle-alert"))
    if state == "deficit" and d == D(2027, 1, 15):
        r["chips"].append(("short", "Short", 5500, "triangle-alert"))
    r["cats"] = c
    r["total"] = sum(c.values()) + extra
    r["zero"] = r["total"] == 0 and not r["spent"]
    return r


SUMMARY = {
    "s0": dict(funds=390000, bills=140500, reserve=50000, savings=15000, flex=214500, left=2584, spent=0),
    "s1": dict(funds=386500, bills=140500, reserve=50000, savings=15000, flex=211000, left=0, spent=3500),
    "s4": dict(funds=406500, bills=140500, reserve=50000, savings=15000, flex=231000, left=0, spent=3500),
    "deficit": dict(funds=146500, bills=140500, reserve=50000, savings=0, flex=0, left=0, spent=243500),
}


def summ(state):
    return SUMMARY.get(state, SUMMARY["s0" if state == "s0" else "s1"])


# ------------------------------------------------------------------ chrome
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">')
READY = """<script>
const FACES = ["500 16px 'Plus Jakarta Sans'","600 16px 'Plus Jakarta Sans'","700 16px 'Plus Jakarta Sans'","800 16px 'Plus Jakarta Sans'","700 40px 'Bricolage Grotesque'","800 40px 'Bricolage Grotesque'"];
function frame(t) {
  document.querySelectorAll('.bub').forEach(el => {
    const L = t - Math.min((+el.dataset.i) * 40, 400);
    const v = el.querySelector('.v'), cell = el.closest('.chg'), fl = cell && cell.querySelector('.flash');
    let s = 1;
    if (L >= 0 && L < 760) s = 1 + (cell && cell.classList.contains("arow") ? 0.03 : 0.075) * Math.exp(-L / 230) * Math.sin(Math.PI * L / 260);
    if (cell) cell.style.transform = `scale(${s.toFixed(3)})`;
    if (fl) fl.style.opacity = L < 0 ? 0 : L < 180 ? (L / 180).toFixed(2) : L < 760 ? (1 - (L - 180) / 580).toFixed(2) : 0;
    el.querySelectorAll('.dotp').forEach((d, j) => {
      const u = (L - 80 - j * 50) / 600, ang = [-50, -75, -30][j] * Math.PI / 180, dist = [30, 36, 24][j];
      d.style.opacity = (u > 0 && u < 1) ? (1 - u).toFixed(2) : 0;
      d.style.transform = `translate(${(Math.cos(ang) * dist * u).toFixed(1)}px, ${(Math.sin(ang) * dist * u).toFixed(1)}px) scale(${(1 - 0.5 * Math.max(0, u)).toFixed(2)})`;
    });
    if (v && el.dataset.from) {
      const a = +el.dataset.from, b = +el.dataset.to;
      const k = L < 180 ? 0 : L >= 500 ? 1 : (L - 180) / 320;
      const p = Math.round(a + (b - a) * k), pn = Math.abs(p);
      v.textContent = '£' + Math.floor(pn / 100).toLocaleString('en-GB') + (pn % 100 ? '.' + String(pn % 100).padStart(2, '0') : '');
    }
  });
}
document.fonts.ready.then(async () => {
  await Promise.all(FACES.map(f => document.fonts.load(f)));
  await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
  const ok = FACES.every(f => document.fonts.check(f));
  document.documentElement.dataset.fonts = ok ? 'loaded' : 'missing';
  const h = location.hash.match(/t=(\\d+)/);
  if (h && !matchMedia('(prefers-reduced-motion: reduce)').matches) frame(+h[1]);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('rm');
  document.documentElement.dataset.ready = '1';
});
</script>"""


def page(name, body, mobile=False, theme="dark", hash="", reduced=False, full=True, title="StudentPlan"):
    doc = (f'<!doctype html><html lang="en-GB" data-theme="{theme}"><head><meta charset="utf-8">'
           f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)}</title>{FONTS}'
           f'<link rel="stylesheet" href="styles.css">{READY}</head><body>{body}</body></html>')
    with open(os.path.join(HERE, name + ".html"), "w") as f:
        f.write(doc)
    RENDERS.append({"html": name, "out": name if not hash else name + ("-reduced" if reduced else ""), "mobile": mobile, "hash": hash, "reduced": reduced, "full": full})


def brand():
    return f'<div class="brand"><span class="mark">{icon("calendar-days")}</span>StudentPlan</div>'


def topbar(active="plan", demo=True, menu=False):
    links = "".join(f'<a href="#"{" aria-current=page" if k == active else ""}>{t}</a>' for k, t in (("plan", "Plan"), ("projections", "Projections"), ("settings", "Settings")))
    return (f'<header class="top">{brand()}<nav class="nav" aria-label="Main">{links}</nav><span class="sp"></span>'
            f'{"<span class=demo>Demo · Tue 10 Nov 2026</span>" if demo else ""}'
            f'<button class="ibtn{" focus" if menu else ""}" aria-label="App menu" aria-haspopup="menu" aria-expanded="{str(menu).lower()}">{icon("ellipsis")}</button></header>')


def mtop(active="plan", demo=True):
    links = "".join(f'<a href="#"{" aria-current=page" if k == active else ""}>{t}</a>' for k, t in (("plan", "Plan"), ("projections", "Projections"), ("settings", "Settings")))
    return (f'<header class="mtop">{brand()}<span class="sp"></span>{"<span class=demo>Demo · 10 Nov</span>" if demo else ""}'
            f'<button class="ibtn" aria-label="App menu">{icon("ellipsis")}</button></header><nav class="mnav" aria-label="Main">{links}</nav>')


# ------------------------------------------------------------------ summary
def hero(state, mobile=False):
    s = summ(state)
    if state == "deficit":
        return (f'<section class="hero def" aria-label="Today"><div class="k"><span>Left today</span><span class="tag coral">{icon("triangle-alert", "i xs")}Plan £290 short</span></div>'
                f'<div class="big num">{m(0)}</div><div class="foot"><span>Flexible left</span><b>{m(0)}</b></div></section>')
    left = f'<div class="big num">{m(s["left"])}</div>'
    k = f'<div class="k"><span>Left today</span><span>{"£35 spent" if s["spent"] else "Tue 10 Nov"}</span></div>'
    return f'<section class="hero" aria-label="Today">{k}{left}<div class="foot"><span>Flexible left</span><b>{m(s["flex"])}</b></div></section>'


def tiles(state):
    s = summ(state)
    sav = (f'<div class="tile"><span class="lbl">Savings</span><span class="v num">{m(s["savings"])}</span>'
           + ('<span class="d c">of £150 goal</span>' if state == "deficit" else "") + '</div>')
    return ('<div class="tiles">'
            f'<div class="tile"><span class="lbl">Funds left</span><span class="v num">{m(s["funds"])}</span><span class="d">+£300 on 18 Dec</span></div>'
            f'<div class="tile"><span class="lbl">{icon("pin", "i xs")}For bills</span><span class="v num">{m(s["bills"])}</span></div>'
            f'<div class="tile"><span class="lbl">{icon("lock", "i xs")}Reserve</span><span class="v num">{m(s["reserve"])}</span></div>'
            f'{sav}</div>')


# ------------------------------------------------------------------ calendar
def chip(c, big=False):
    kind, label, amt, ic = c
    word = {"bill": "bill", "spent": "spent", "inc": "income", "buy": "planned purchase", "pv": "preview", "short": "short"}[kind]
    a = m(amt, sign=True) if kind == "inc" else m(amt)
    i = icon(ic, "i xs") if ic else ""
    return f'<span class="chip {kind}">{i}<span class="l">{esc(label)}</span><span class="a">{a}</span><span class="sr"> {word}</span></span>'


def cell_html(state, d, month, sel=None, bub_i=None, maxchips=2):
    r = day(state, d)
    cls = ["day"]
    if r["kind"] != "plan":
        cls.append(r["kind"])
    if d.month != month:
        cls.append("om")
    if d == TODAY:
        cls.append("today")
    if sel == d:
        cls.append("sel")
    if r["pv"]:
        cls.append("pvd")
    if r["zero"] and r["kind"] == "plan":
        cls.append("zero")
    chips = r["chips"]
    shown = chips if len(chips) <= maxchips else chips[:maxchips - 1]
    ch = "".join(chip(c) for c in shown)
    if len(chips) > len(shown):
        ch += f'<span class="chip more">+{len(chips) - len(shown)}</span>'
    tot = ""
    if r["kind"] == "plan":
        if r["spent"]:
            val, small = r["spent"], ''
        else:
            val, small = r["total"], ""
        inner = f'<span class="v">{m(val)}</span>'
        if bub_i is not None:
            frm = 2584 if d < D(2027, 1, 4) else 2585
            inner = (f'<span class="bub" data-i="{bub_i}" data-from="{frm}" data-to="{val}">'
                     f'<span class="dotp" style="width:8px;height:8px;left:100%;top:-2px"></span><span class="dotp" style="width:6px;height:6px;left:92%;top:-6px"></span>'
                     f'<span class="dotp" style="width:5px;height:5px;left:104%;top:6px"></span>{inner}</span>')
            cls.append("chg")
        tot = f'<div class="tot num">{inner}{small}</div>'
    flash = '<span class="flash"></span>' if bub_i is not None else ""
    lab = dl(d)
    if r["kind"] == "plan":
        lab += f", planned {m(r['total'])}" + (f", spent {m(r['spent'])}" if r["spent"] else "")
    return f'<div class="{" ".join(cls)}" role="gridcell" aria-label="{esc(lab)}">{flash}<span class="n">{d.day}</span>{"<div class=chips>" + ch + "</div>" if ch else ""}{tot}</div>'


def month_days(y, mo):
    first = D(y, mo, 1)
    start = first - dt.timedelta(days=first.weekday())
    nxt = D(y + (mo == 12), mo % 12 + 1, 1)
    last = nxt - dt.timedelta(days=1)
    end = last + dt.timedelta(days=6 - last.weekday())
    out, d = [], start
    while d <= end:
        out.append(d)
        d += dt.timedelta(days=1)
    return out


def calendar(state, y=2026, mo=11, sel=TODAY, bubble=False, month_menu=False, mobile=False):
    days = month_days(y, mo)
    rows = len(days) // 7
    cells, bi = [], 0
    for d in days:
        b = None
        if bubble and TODAY <= d <= END:
            b, bi = bi, bi + 1
        cells.append(cell_html(state, d, mo, sel, b, maxchips=2 if rows >= 6 else 3))
    name = D(y, mo, 1).strftime("%B")
    mm = ""
    if month_menu:
        opts = [("November", "2026", True), ("December", "2026", False), ("January", "2027", False)]
        mm = ('<div class="menu" role="menu" aria-label="Jump to month" data-reui="c-dropdown-menu-1" style="left:0;top:56px;width:240px">'
              + "".join(f'<div class="mi{" hi" if n == "December" else ""}" role="menuitemradio" aria-checked="{str(c).lower()}">{n} {yy}{"<span class=chk>" + icon("check") + "</span>" if c else ""}</div>' for n, yy, c in opts) + '</div>')
    legend = ('<div class="legend" aria-label="Key">' + chip(("bill", "Bill", 0, "pin")).replace("£0", "") + chip(("spent", "Spent", 0, None)).replace("£0", "")
              + chip(("inc", "Income", 0, None)).replace("+£0", "") + chip(("pv", "Preview", 0, None)).replace("£0", "") + '</div>')
    wk = "".join(f"<span>{w}</span>" for w in ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"))
    return (f'<section class="cal" aria-label="Calendar"><div class="mbar"><button class="mtrig{" focus" if month_menu else ""}" aria-haspopup="menu" aria-expanded="{str(month_menu).lower()}">{name} <span class="yr">{y}</span>{icon("chevron-down")}</button>'
            f'<button class="ibtn" aria-label="Previous month">{icon("chevron-left")}</button><button class="ibtn" aria-label="Next month">{icon("chevron-right")}</button>'
            f'<button class="btn sm">Today</button>{legend}{mm}</div><div class="wk">{wk}</div><div class="grid" role="grid">{"".join(cells)}</div></section>')


# ------------------------------------------------------------------ panel content
def composer(text=None, busy=False, sugg=False):
    s = ""
    if sugg and not text:
        s = '<div class="sugg"><button>I spent £…</button><button>Can I spend £…</button><button>I received £…</button></div>'
    if busy:
        return (f'<div class="composer"><div class="cin busy" aria-busy="true"><span class="t">{esc(text)}</span>'
                f'<span class="send" role="button" aria-disabled="true" aria-label="Reading">{icon("loader-circle")}</span></div>{s}</div>')
    t = f'<span class="t">{esc(text)}</span>' if text else '<span class="t ph">Tell me what changed…</span>'
    return f'<div class="composer"><div class="cin" role="textbox" aria-label="Tell me what changed">{t}<button class="send" aria-label="Send">{icon("arrow-up")}</button></div>{s}</div>'


def ptabs(sel, dot=False):
    out = []
    for k, t in (("day", "Day"), ("change", "Change"), ("offers", "Offers")):
        d = '<span class="dot" aria-hidden="true"></span>' if dot and k == "change" and sel != "change" else ""
        out.append(f'<button role="tab" aria-selected="{str(k == sel).lower()}">{t}{d}</button>')
    return f'<div class="ptabs" role="tablist">{"".join(out)}</div>'


def stepper(p, minus_ok=True):
    return (f'<div class="step"><button aria-label="Decrease"{"" if minus_ok else " aria-disabled=true"}>{icon("minus", "i sm")}</button>'
            f'<span class="amt num">{m(p)}</span><button aria-label="Increase">{icon("plus", "i sm")}</button></div>')


def item_menu():
    sub = ["Fri 13 Nov", "Sat 14 Nov", "Sun 15 Nov", "Mon 16 Nov", "Pick a date…"]
    subm = ('<div class="menu" role="menu" aria-label="Move to" style="left:calc(100% + 6px);top:44px;width:190px">'
            + "".join(f'<div class="mi{" hi" if s == "Sat 14 Nov" else ""}" role="menuitem">{s}</div>' for s in sub) + '</div>')
    return ('<div class="menu" role="menu" aria-label="Groceries actions" data-reui="c-dropdown-menu-5" style="right:0;top:54px;width:210px">'
            f'<div class="mi" role="menuitem">{icon("pencil", "i sm")}Edit amount</div>'
            f'<div class="mi hi" role="menuitem" aria-haspopup="menu" aria-expanded="true">{icon("calendar-days", "i sm")}Move to<span class="sub">{icon("chevron-right", "i sm")}</span></div>'
            f'<div class="mi" role="menuitem">{icon("x", "i sm")}Set to £0</div>{subm}</div>')


def day_tab(state, d, menu=False, form=False):
    r = day(state, d)
    planned = 2584 if (d == TODAY) else r["total"]
    spent = r["spent"]
    leftv = max(0, planned - spent) if d != TODAY or state == "s0" else (2584 if state == "s0" else 0)
    tag = '<span class="tag lime">Today</span>' if d == TODAY else ""
    trio = (f'<div class="trio"><div><span class="lbl">Planned</span><span class="v num">{m(planned)}</span></div>'
            f'<div><span class="lbl">Spent</span><span class="v num spent">{m(spent)}</span></div>'
            f'<div><span class="lbl">Left</span><span class="v num">{m(leftv)}</span></div></div>')
    note = ""
    if d == TODAY and state in AFTER_S1:
        note = f'<p class="note" style="margin:0">{icon("info", "i sm")}£9.16 over today’s plan, taken from shopping on later days.</p>'
    prow = []
    for k, n, ic in CATS:
        v = r["cats"][k]
        mn = item_menu() if (menu and k == "groceries") else ""
        prow.append(f'<div class="irow pl"><span class="ic">{icon(ic)}</span><span class="nm">{n}</span>{stepper(v, v > 0)}'
                    f'<button class="ibtn sm ghost{" focus" if mn else ""}" aria-label="{n} actions" aria-haspopup="menu">{icon("ellipsis")}</button>{mn}</div>')
    srows = ""
    if d == TODAY and state in AFTER_S1:
        srows = (f'<div class="irow"><span class="ic sp">{icon("receipt")}</span><span class="nm">Shower filter<br><span class="catbtn" aria-haspopup="menu">Household{icon("chevron-down", "i xs")}</span></span>'
                 f'<span class="amt num sp">{m(3500)}</span><button class="ibtn sm ghost" aria-label="Shower filter actions">{icon("ellipsis")}</button></div>')
    else:
        srows = '<div class="empty">Nothing recorded yet.</div>'
    rec = f'<button class="btn sm" style="align-self:flex-start">{icon("plus", "i sm")}Record expense</button>'
    if form:
        cm = ('<div class="menu" role="menu" aria-label="Category" data-reui="c-dropdown-menu-1" style="left:0;top:86px;width:100%">'
              + "".join(f'<div class="mi{" hi" if c == "Going out" else ""}" role="menuitemradio" aria-checked="{str(c == "Household").lower()}">{c}{"<span class=chk>" + icon("check") + "</span>" if c == "Household" else ""}</div>'
                        for c in ("Groceries", "Transport", "Eating out", "Shopping", "Household", "Going out", "Books", "Other")) + '</div>')
        rec = (f'<div class="reply" style="border-radius:22px;gap:12px"><div class="g2"><label class="f">Amount<span class="ctl"><span class="u">£</span><span class="grow">12</span></span></label>'
               f'<div class="f" style="position:relative">Category<button class="ctl focus" style="justify-content:space-between" aria-haspopup="menu" aria-expanded="true"><span>Household</span>{icon("chevron-down")}</button>{cm}</div></div>'
               f'<label class="f">What<span class="ctl"><span class="grow">Bin bags</span></span></label>'
               f'<div class="acts"><button class="btn sm">Cancel</button><button class="btn sm primary">Record expense</button></div></div>')
    plan_sum = m(sum(r["cats"].values()))
    return (f'<div class="dhead"><h2 class="h2">{dl(d)}</h2>{tag}</div>{trio}{note}'
            f'<div class="sechead"><span class="h3">Spent</span><b class="num">{m(spent)}</b></div>{srows}'
            f'{rec if form else ""}'
            f'<div class="sechead"><span class="h3">Planned</span><b class="num">{plan_sum}</b></div>{"".join(prow)}'
            f'{"" if form else rec}')


def src(gem=True):
    return (f'<span class="tag line src">{icon("sparkles", "i xs")}Read by Gemini</span>' if gem
            else '<span class="tag line src" title="Read by the built-in demo parser, not AI">Demo parsing</span>')


def prot(names=(("Rent", 62000), ("Utilities", 5500), ("Reserve", 50000), ("Savings goal", 15000))):
    return ('<div class="prot"><span class="lbl">' + icon("lock", "i xs") + 'Unchanged</span>'
            + "".join(f'<span class="tag">{n} {m(a)}</span>' for n, a in names) + '</div>')


def diff(rows):
    out = []
    for nm, sub, before, after, up in rows:
        b = f'<s>{before}</s>{icon("arrow-up", "i xs") if False else "→"}' if before else ""
        out.append(f'<div class="r"><span class="nm">{nm}{"<small>" + sub + "</small>" if sub else ""}</span><span class="ba">{b}<b class="{"up" if up else ""}">{after}</b></span></div>')
    return f'<div class="diff">{"".join(out)}</div>'


S1_TXT = ("Added your £35 expense (household, 10 Nov). That day's allowance covered £25.84; the other £9.16 comes from later days. "
          "Shopping decreased by £9.16 across 11 Nov – 31 Jan. Rent, utilities, your £500 emergency reserve and your £150 savings goal are unchanged.")
S2_TXT = ("Set aside £20 for Dinner (eating out) on 11 Nov. Eating out and shopping that day cover £11.53; the other £8.47 is borrowed from later shopping. "
          "Groceries and transport are unchanged. Rent, utilities, your £500 emergency reserve and your £150 savings goal are unchanged.")
S4_TXT = ("Added £200 of income. Groceries increased by £69.62, transport by £40.18, eating out by £42.64 and shopping by £47.56 across 11 Nov – 31 Jan. "
          "Rent, utilities, your £500 emergency reserve and your £150 savings goal are unchanged.")
DEF_TXT = ("Added your £2,400 expense (tuition, 10 Nov). All £2,400 comes from later days. Groceries decreased by £738.28, transport by £426.40, "
           "eating out by £451 and shopping by £494.32 across 11 Nov – 31 Jan. Your plan is now £290 short; see the deficit details. "
           "Rent, utilities, your £500 emergency reserve and your £150 savings goal are unchanged.")


def change_tab(kind):
    if kind == "s1":
        return ('<div class="chat"><div class="ub">I need to spend £35 on a replacement shower filter today</div><div class="reply" aria-live="polite">'
                f'<div class="row1"><span class="tag blue">Expense</span><span class="parsed">£35 · Household · Tue 10 Nov</span>{src()}</div>'
                f'<p>{S1_TXT}</p>'
                + diff([("Today", "Tue 10 Nov", "£25.84", "£0 left", False),
                        ("Shopping", "11 Nov – 31 Jan · 82 days", "", "−£9.16", False),
                        ("Daily allowance", "from Wed 11 Nov", "£25.84", "£25.73", False)])
                + prot() + f'<div class="acts"><button class="btn sm">{icon("undo-2", "i sm")}Undo</button></div></div></div>')
    if kind == "s2":
        return ('<div class="chat"><div class="ub">Can I spend £20 on dinner tomorrow?</div><div class="reply">'
                f'<div class="row1"><span class="tag pv">Preview · not applied</span>{src()}</div>'
                '<div class="verdict ok">Yes, it fits.</div><span class="tag lime" style="align-self:flex-start;height:32px;font-size:14px">Fits — borrows £8.47 from later shopping</span><span class="parsed">£20 · Eating out · Wed 11 Nov</span>'
                f'<p>{S2_TXT}</p>'
                + diff([("Eating out", "Wed 11 Nov", "£5.50", "£20", True), ("Shopping", "Wed 11 Nov", "£6.03", "£0", False),
                        ("Shopping", "Later days", "", "−£8.47", False), ("Groceries and transport", "Wed 11 Nov", "", "£14.20 same", False)])
                + '<div class="acts"><button class="btn sm">Discard</button><button class="btn sm primary">Apply change</button></div></div></div>')
    if kind == "s3":
        opts = [("Shopping, 15 Nov – 30 Nov", "16 days · −£2.14 to −£2.15 a day", True),
                ("Eating out, 15 Nov – 28 Nov", "14 days · −£2.44 to −£2.45 a day", False),
                ("All flexible spending, 15 Nov – 31 Jan", "78 days · −£0.43 to −£0.44 a day", False)]
        o = "".join(f'<label class="opt{" on" if on else ""}" style="grid-template-columns:24px minmax(0,1fr)"><span class="rd" role="radio" aria-checked="{str(on).lower()}"></span><span><b>{t}</b><small>{s}</small></span></label>' for t, s, on in opts)
        return ('<div class="chat"><div class="ub">Can I spend £60 on a concert ticket on Saturday?</div><div class="reply">'
                f'<div class="row1"><span class="tag pv">Preview · not applied</span>{src()}</div>'
                '<div class="verdict short">£34.27 short</div>'
                '<p>Sat 14 Nov has £25.73, so a £60 ticket is £34.27 more than the day allows.</p>'
                f'<fieldset class="opts" role="radiogroup"><legend>Cover £34.27 from</legend>{o}</fieldset>'
                + diff([("Concert", "Sat 14 Nov", "", "£60", True), ("Shopping", "15 – 30 Nov", "£6.03", "£3.89", False), ("Flexible left", "", "", "£2,110 same", False)])
                + '<div class="acts"><button class="btn sm">Discard</button><button class="btn sm primary">Apply change</button></div></div></div>')
    if kind == "clarify":
        return ('<div class="chat"><div class="ub">Keep £30 for the weekend</div><div class="reply">'
                f'<div class="row1"><span class="tag blue">Hold money</span>{src()}</div>'
                '<div class="verdict" style="font-size:22px">Which day should keep £30?</div>'
                '<div class="clar"><button>Sat 14 Nov</button><button>Sun 15 Nov</button><button>£15 each day</button></div>'
                '<div class="acts"><button class="btn sm ghost" style="flex:none">Cancel</button></div></div></div>')
    if kind == "fail":
        return ('<div class="chat"><div class="ub">sort out the thing from before</div><div class="reply" role="alert">'
                f'<div class="row1"><span class="tag line">Not understood</span>{src(False)}</div>'
                '<p style="font-weight:800;font-size:17px">I couldn’t turn that into a change. Your plan hasn’t changed.</p>'
                '<p class="muted" style="font-weight:600">Try: “I spent £12 on groceries today” or “Can I spend £20 on Friday?”</p>'
                f'<div class="acts"><button class="btn sm" style="flex:none">{icon("pencil", "i sm")}Edit sentence</button></div></div></div>')
    if kind == "loading":
        return ('<div class="chat" aria-busy="true"><div class="ub">I need to spend £35 on a replacement shower filter today</div><div class="reply">'
                '<div class="row1"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span class="parsed" role="status">Reading your change…</span></div>'
                '<div class="skel" style="width:92%"></div><div class="skel" style="width:78%"></div><div class="skel" style="width:85%"></div><div class="skel" style="width:40%"></div></div></div>')
    if kind == "s4":
        return ('<div class="chat"><div class="ub">I received an extra £200</div><div class="reply" aria-live="polite">'
                f'<div class="row1"><span class="tag lime">Income</span><span class="parsed">£200 · Tue 10 Nov</span>{src()}</div>'
                '<div class="verdict ok">+£200</div>'
                f'<p>{S4_TXT}</p>'
                + diff([("Funds left", "", "£3,865", "£4,065", True), ("Flexible left", "", "£2,110", "£2,310", True),
                        ("Each day", "11 – 18 Nov", "", "+£2.43", True), ("Each day", "19 Nov – 31 Jan", "", "+£2.44", True)])
                + prot() + f'<div class="acts"><button class="btn sm">{icon("undo-2", "i sm")}Undo</button></div></div></div>')
    if kind == "deficit":
        reasons = [("Savings goal", "Your £150 savings goal can't be funded: bills, your reserve and what you've spent need £290 more than you have."),
                   ("Fri 1 Jan", "Rent (£620) on 1 Jan leaves you £85 below your £500 reserve."),
                   ("Fri 15 Jan", "Utilities (£55) on 15 Jan leaves you £55 below your £500 reserve.")]
        rl = "".join(f'<div class="r"><span class="nm">{a}<small style="color:var(--text);font-weight:600;font-size:13.5px">{b}</small></span></div>' for a, b in reasons)
        return ('<div class="chat"><div class="ub">I paid £2,400 for my tuition deposit today</div><div class="reply" aria-live="polite">'
                f'<div class="row1"><span class="tag blue">Expense</span><span class="parsed">£2,400 · Tuition · Tue 10 Nov</span></div>'
                '<div class="verdict short">£290 short</div>'
                f'<p>{DEF_TXT}</p><div class="diff" style="box-shadow:inset 0 0 0 2px var(--coral)">{rl}</div>'
                + prot((("Reserve", 50000), ("Rent", 62000), ("Utilities", 5500)))
                + f'<div class="acts"><button class="btn sm primary">{icon("plus", "i sm")}Add income</button><button class="btn sm">Edit reserve</button><button class="btn sm" style="flex:none" aria-label="Undo">{icon("undo-2", "i sm")}</button></div></div></div>')
    raise ValueError(kind)


OFFERS = [
    ("16-25 Railcard", "1/3 off most rail fares", "Transport", "Aged 16–25, or full-time student 26+", "£35 a year. £12 minimum fare Mon–Fri before 10am. Not for season tickets."),
    ("itsu", "15% off food", "Eating out", "Register the itsu app with a university email", "Food only. Scan the app barcode in store."),
    ("LEON", "15% off in app or kiosk", "Eating out", "Verified student (Student Beans)", "£6 minimum. Selected restaurants. Not on delivery apps."),
    ("Tesco Clubcard", "Clubcard Prices on selected groceries", "Groceries", "Anyone; free to join", "Scan the card or app at checkout."),
]


def offers_tab(n=4):
    rows = "".join(
        f'<article class="offer"><div class="top1"><span class="nm">{a}</span><span class="tag line">Sample</span></div><div class="deal">{b}</div>'
        f'<dl><dt>Matches</dt><dd>{c}</dd><dt>Eligibility</dt><dd>{d}</dd><dt>Conditions</dt><dd>{e}</dd></dl>'
        f'<button class="btn sm" style="align-self:flex-start">{icon("tag", "i sm")}Use on a planned purchase</button></article>' for a, b, c, d, e in OFFERS[:n])
    return f'<div class="sechead" style="margin:0"><span class="h3">Sample offers</span><span class="lbl">Checked 31 Oct 2026</span></div>{rows}'


def panel(tab, body, text=None, busy=False, dot=False, sugg=False):
    return (f'<aside class="panel" aria-label="Plan panel">{composer(text, busy, sugg)}{ptabs(tab, dot)}<div class="pbody" role="tabpanel">{body}</div></aside>')


def app_menu():
    sub = ('<div class="menu" role="menu" aria-label="Theme" style="right:calc(100% + 6px);top:120px;width:200px">'
           + "".join(f'<div class="mi{" hi" if t == "Dark" else ""}" role="menuitemradio" aria-checked="{str(t == "Dark").lower()}">{icon(ic, "i sm")}{t}{"<span class=chk>" + icon("check") + "</span>" if t == "Dark" else ""}</div>'
                     for t, ic in (("Dark", "moon"), ("Light", "sun"), ("Match device", "monitor"))) + '</div>')
    return ('<div class="menu" role="menu" aria-label="App menu" data-reui="c-dropdown-menu-8" style="right:24px;top:66px;width:280px">'
            '<div class="grp">Demo</div>'
            '<div class="mi" role="menuitemcheckbox" aria-checked="true">Demo student<span class="sw" aria-hidden="true"></span></div>'
            '<div class="mi dis" role="menuitem" aria-disabled="true">Demo date · Tue 10 Nov 2026</div><hr>'
            '<div class="grp">App</div>'
            f'<div class="mi hi" role="menuitem" aria-haspopup="menu" aria-expanded="true">{icon("sun-moon", "i sm")}Theme<span class="sub">{icon("chevron-right", "i sm")}</span></div>'
            f'<div class="mi" role="menuitem">{icon("settings", "i sm")}Settings</div>'
            f'<div class="mi" role="menuitem">{icon("download", "i sm")}Export plan (JSON)</div><hr>'
            f'<div class="mi danger" role="menuitem">{icon("rotate-ccw", "i sm")}Reset StudentPlan…</div>{sub}</div>')


def plan_desktop(name, state, tab, body, text=None, busy=False, month=(2026, 11), sel=TODAY, bubble=False, month_menu=False, menu=False, dot=False, sugg=False, theme="dark", hashes=()):
    main = (f'<main><div class="heroRow">{hero(state)}{tiles(state)}</div>'
            f'{calendar(state, *month, sel=sel, bubble=bubble, month_menu=month_menu)}</main>')
    body_html = (f'<div style="position:relative">{topbar("plan", menu=menu)}{app_menu() if menu else ""}'
                 f'<div class="plan">{main}{panel(tab, body, text, busy, dot, sugg)}</div></div>')
    if hashes:
        for h, red in hashes:
            page(name, body_html, hash=h, reduced=red, theme=theme)
    else:
        page(name, body_html, theme=theme)


# ------------------------------------------------------------------ mobile plan
def agenda(state, start, end, sel=None, bubble=False):
    out, d, bi, wk = [], start, 0, None
    while d <= end:
        mon = d - dt.timedelta(days=d.weekday())
        if mon != wk:
            wk = mon
            sun = mon + dt.timedelta(days=6)
            out.append(f'<h3 class="wkh">{mon.day} {mon.strftime("%b") if mon.month != sun.month else ""} – {sun.day} {sun.strftime("%b")}</h3>'.replace("  ", " "))
        r = day(state, d)
        cls = ["arow"]
        if d == TODAY:
            cls.append("today")
        if r["pv"]:
            cls.append("pvd")
        if r["zero"]:
            cls.append("zero")
        val = r["spent"] or r["total"]
        small = f'<small>of {m(2584)}</small>' if r["spent"] else ""
        inner = f'<span class="v">{m(val)}</span>'
        flash = ""
        if bubble and d >= TODAY:
            frm = 2584 if d < D(2027, 1, 4) else 2585
            inner = (f'<span class="bub" data-i="{bi}" data-from="{frm}" data-to="{val}">'
                     f'<span class="dotp" style="width:9px;height:9px;left:100%;top:-4px"></span><span class="dotp" style="width:6px;height:6px;left:94%;top:-8px"></span>'
                     f'<span class="dotp" style="width:5px;height:5px;left:104%;top:4px"></span>{inner}</span>')
            cls.append("chg")
            flash = '<span class="flash"></span>'
            bi += 1
        ch = "".join(chip(c) for c in r["chips"])
        mid = f'<div class="chips">{ch}</div>' if ch else ""
        lab = f'{dl(d)}, planned {m(r["total"])}' + (f', spent {m(r["spent"])}' if r["spent"] else "")
        out.append(f'<button class="{" ".join(cls)}" aria-label="{esc(lab)}" style="text-align:left">{flash}<span class="dt"><small>{d.strftime("%a")}</small><b>{d.day}</b></span>'
                   f'<span class="mid">{mid}</span><span class="tot num" style="grid-column:3">{inner}{small}</span></button>')
        d += dt.timedelta(days=1)
    return f'<div class="ag" role="list">{"".join(out)}</div>'


def mhero(state):
    return f'<div class="mpad">{hero(state, True)}{tiles(state)}</div>'


def dock(text=None):
    t = f'<span class="t">{esc(text)}</span>' if text else '<span class="t ph">Tell me what changed…</span>'
    return f'<div class="dock"><div class="cin" role="button" aria-label="Tell me what changed">{t}<span class="send">{icon("arrow-up")}</span></div></div>'


def mbar(label="November", yr="2026"):
    return (f'<div class="mbar"><button class="mtrig" aria-haspopup="menu">{label} <span class="yr">{yr}</span>{icon("chevron-down")}</button><span style="flex:1"></span>'
            f'<button class="ibtn" aria-label="Previous month">{icon("chevron-left")}</button><button class="ibtn" aria-label="Next month">{icon("chevron-right")}</button></div>')


def plan_mobile(name, state, start=TODAY, end=D(2026, 11, 22), bubble=False, theme="dark", hashes=(), month=("November", "2026"), extra=""):
    body = (f'<div class="m">{mtop()}{mhero(state)}<div class="mpad">{extra}{mbar(*month)}{agenda(state, start, end, bubble=bubble)}</div>{dock()}</div>')
    if hashes:
        for h, red in hashes:
            page(name, body, mobile=True, hash=h, reduced=red, theme=theme)
    else:
        page(name, body, mobile=True, theme=theme)


def sheet_mobile(name, state, tab, body, text=None, busy=False, dot=False, sugg=False, behind_end=D(2026, 11, 14)):
    behind = f'{mtop()}{mhero(state)}<div class="mpad">{mbar()}{agenda(state, TODAY, behind_end)}</div>'
    sh = (f'<div class="scrim"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="Plan">'
          f'<div class="grab" aria-hidden="true"></div><div class="shead">{ptabs(tab, dot)}<button class="ibtn" aria-label="Close">{icon("x")}</button></div>'
          f'<div class="pbody" role="tabpanel">{body}</div>{composer(text, busy, sugg)}</section>')
    page(name, f'<div class="m" style="padding-bottom:0">{behind}{sh}</div>', mobile=True)


# ------------------------------------------------------------------ onboarding
STEPS = [
    ("funds", "How much money do you have?"),
    ("last-until", "When does it need to last until?"),
    ("job", "Do you have a job?"),
    ("other-income", "Any other money coming in?"),
    ("rent", "Rent and fixed bills"),
    ("reserve", "Your emergency reserve"),
    ("savings", "Savings"),
    ("food-transport", "Food and transport"),
    ("priorities", "What matters most?"),
]


def money_f(lbl, v, big=False):
    return f'<label class="f">{lbl}<span class="ctl{" big" if big else ""}"><span class="u">£</span><span class="grow">{v}</span></span></label>'


def text_f(lbl, v, ic=None, ph=False):
    return f'<label class="f">{lbl}<span class="ctl"><span class="grow{" ph" if ph else ""}">{v}</span>{icon(ic) if ic else ""}</span></label>'


def ob_fields(slug, error=False, mobile=False):
    g2 = 'class="g2"'
    if slug == "funds":
        amt = (f'<label class="f">Amount<span class="ctl big invalid" aria-invalid="true"><span class="u">£</span><span class="grow"></span></span>'
               f'<span class="err" role="alert">{icon("triangle-alert")}Enter an amount above £0</span></label>') if error else money_f("Amount", "3,900", True)
        return ('<div class="f">This money is<div class="seg" role="group"><button aria-pressed="true">A lump sum</button><button aria-pressed="false">A monthly allowance</button></div></div>' + amt)
    if slug == "last-until":
        return text_f("Last until", "31 Jan 2027", "calendar-days") + '<span class="tag lime" style="align-self:flex-start;height:34px;font-size:14px">83 days from Tue 10 Nov 2026</span>'
    if slug == "job":
        return ('<div class="f">Job<div class="seg" role="group"><button aria-pressed="false">Yes</button><button aria-pressed="true">No</button></div></div>')
    if slug == "other-income":
        return (f'<div {g2}>{text_f("From", "Family transfer")}{money_f("Amount", "300")}{text_f("Date", "18 Dec 2026", "calendar-days")}'
                f'<div class="f">&nbsp;<span class="check" style="height:56px"><span class="box on">{icon("check", "i sm")}</span>Confirmed</span></div></div>'
                f'<button class="btn sm" style="align-self:flex-start">{icon("plus", "i sm")}Add income</button>')

    def rec(r):
        return f'<div class="f">Repeats<button class="ctl" style="justify-content:space-between" aria-haspopup="menu"><span>{r}</span>{icon("chevron-down")}</button></div>'
    if slug == "rent":
        def row(n, a, due):
            if mobile:
                return f'<div class="reply" style="border-radius:22px;background:var(--s1)">{text_f("Name", n)}<div class="g2">{money_f("Amount", a)}{text_f("Due", due)}</div>{rec("Monthly")}</div>'
            return f'<div style="display:grid;grid-template-columns:1.2fr 1fr .8fr 1.2fr;gap:10px">{text_f("Name", n)}{money_f("Amount", a)}{text_f("Due", due)}{rec("Monthly")}</div>'
        return row("Rent", "620", "1st") + row("Utilities", "55", "15th") + f'<button class="btn sm" style="align-self:flex-start">{icon("plus", "i sm")}Add commitment</button>'
    if slug == "reserve":
        return money_f("Minimum to keep", "500", True)
    if slug == "savings":
        return f'{money_f("Save by 31 Jan", "150", True)}<div {g2}>{money_f("Savings now", "200")}{money_f("Investments now", "0")}</div>'
    if slug == "food-transport":
        return (f'<div {g2}>{money_f("Groceries a week", "63")}{money_f("Transport a week", "36.40")}'
                f'{money_f("Eating out a week", "38.50")}{money_f("Shopping a week", "42.98")}</div>')
    if slug == "priorities":
        pr = [("Transport", "bus"), ("Groceries", "shopping-basket"), ("Eating out", "utensils"), ("Shopping", "shopping-bag")]
        rows = "".join(f'<div class="irow" style="background:var(--s1)"><span class="ic" style="background:{"var(--lime);color:var(--on-lime)" if i == 0 else "var(--s3)"};font:700 16px var(--display)">{i + 1}</span>'
                       f'<span class="nm">{p}</span><button class="ibtn sm ghost" aria-label="Move {p} up">{icon("chevron-up")}</button>'
                       f'<button class="ibtn sm ghost" aria-label="Move {p} down">{icon("chevron-down")}</button></div>' for i, (p, ic) in enumerate(pr))
        return (f'<div class="f">Protect first<div style="display:flex;flex-direction:column;gap:8px">{rows}</div></div>'
                f'<div {g2}>{text_f("City (optional)", "London")}{text_f("Diet (optional)", "None", ph=True)}</div>')
    return ""


def progress(n):
    segs = "".join(f'<span style="flex:1;height:8px;border-radius:99px;background:{"var(--lime)" if i < n else "var(--s3)"}"></span>' for i in range(9))
    return f'<div style="display:flex;gap:5px;flex:1" role="progressbar" aria-valuemin="1" aria-valuemax="9" aria-valuenow="{n}" aria-label="Step {n} of 9">{segs}</div>'


def onboarding(name, slug, mobile=False, error=False):
    n = [s for s, _ in STEPS].index(slug) + 1
    q = dict(STEPS)[slug]
    fields = ob_fields(slug, error, mobile)
    img = f'<img src="../sketches/{slug}.webp" alt="" aria-hidden="true">'
    last = n == 9
    nxt = "Create my plan" if last else "Next"
    demo = '<button class="btn ghost sm" style="align-self:flex-start;padding:0 4px;color:var(--blue-text)">Try a demo student</button>'
    if mobile:
        body = (f'<div class="m" style="padding-bottom:120px"><header class="mtop" style="gap:14px"><button class="ibtn" aria-label="Back">{icon("arrow-left")}</button>{progress(n)}'
                f'<span class="lbl" style="color:var(--text)">{n}/9</span></header>'
                f'<div class="mpad" style="display:flex;flex-direction:column;gap:20px"><div class="stage" style="height:200px">{img}</div>'
                f'<h1 class="title" style="font-size:30px">{q}</h1>{fields}{demo}</div>'
                f'<div class="mcta"><button class="btn primary block">{nxt}{icon("arrow-up", "i sm").replace("arrow-up", "") if False else ""}</button></div></div>')
        page(name, body, mobile=True)
        return
    body = (f'<header class="top">{brand()}<span class="sp"></span><span class="lbl" style="color:var(--text)">Step {n} of 9</span><button class="btn sm">Try a demo student</button></header>'
            f'<main style="max-width:1200px;margin:0 auto;padding:0 32px 48px;min-height:900px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:56px;align-items:center">'
            f'<div class="stage" style="aspect-ratio:4/3.4;position:sticky;top:16px">{img}</div>'
            f'<div style="display:flex;flex-direction:column;gap:24px;padding-top:12px">{progress(n)}<h1 class="title" style="font-size:44px">{q}</h1>{fields}'
            f'<div style="display:flex;gap:12px;margin-top:8px">{"" if n == 1 else "<button class=btn>Back</button>"}<button class="btn primary" style="min-width:180px">{nxt}</button></div></div></main>')
    page(name, body)


def welcome(name, mobile=False):
    img = '<img src="../sketches/welcome.webp" alt="" aria-hidden="true">'
    if mobile:
        body = (f'<div class="m" style="padding-bottom:0;display:flex;flex-direction:column;min-height:844px"><header class="mtop">{brand()}</header>'
                f'<div class="mpad" style="display:flex;flex-direction:column;gap:24px;flex:1"><div class="stage" style="height:330px">{img}</div>'
                f'<h1 class="title" style="font-size:38px;line-height:1.08">Know what you can spend today.</h1></div>'
                f'<div class="mpad" style="display:flex;flex-direction:column;gap:10px;padding-bottom:30px"><button class="btn primary block">Set up my plan</button><button class="btn block">Try a demo student</button></div></div>')
        page(name, body, mobile=True)
        return
    body = (f'<header class="top">{brand()}</header><main style="max-width:1200px;margin:24px auto 0;padding:0 32px;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:64px;align-items:center">'
            f'<div class="stage" style="aspect-ratio:4/3.3">{img}</div><div style="display:flex;flex-direction:column;gap:32px">'
            f'<h1 class="title" style="font-size:60px;line-height:1.04;letter-spacing:-.045em">Know what you can spend today.</h1>'
            f'<div style="display:flex;gap:12px"><button class="btn primary" style="height:60px;padding:0 30px;font-size:17px">Set up my plan</button><button class="btn" style="height:60px;padding:0 30px;font-size:17px">Try a demo student</button></div></div></main>')
    page(name, body)


# ------------------------------------------------------------------ projections
PROJ = dict(sav=(80957, 81683, 82172), inv=(24000, 24445, 24785), tot=(104957, 106128, 106957), put=104000, growth=(957, 2128, 2957), income=330000)


def projections(name, empty=False, mobile=False):
    def rate(lbl, vals):
        cells = "".join(f'<label class="f" style="font-size:13px">{s}<span class="ctl" style="padding:0 12px"><span class="grow{" ph" if empty else ""}">{"" if empty else v}</span><span class="u">%</span></span></label>'
                        for s, v in zip(("Low", "Base", "High"), vals))
        return f'<div class="f">{lbl}<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">{cells}</div></div>'
    c0 = "0" if empty else None
    assume = (f'<section class="cal" style="display:flex;flex-direction:column;gap:16px"><h2 class="h2">Savings</h2><div class="g2">{money_f("Start", "200")}{money_f("Each month", c0 or "50")}</div>{rate("Yearly rate", ("2", "3.5", "4.5"))}</section>'
              f'<section class="cal" style="display:flex;flex-direction:column;gap:16px"><h2 class="h2">Investments</h2><div class="g2">{money_f("Start", "0")}{money_f("Each month", c0 or "20")}</div>{rate("Yearly return", ("0", "4", "7"))}</section>'
              f'<section class="cal" style="display:flex;flex-direction:column;gap:16px"><h2 class="h2">Income</h2><div class="g2"><label class="f">Confirmed<span class="ctl ro"><span class="u">£</span><span class="grow">300</span></span></label>{money_f("Expected a month", c0 or "250")}</div></section>')
    disc = f'<span class="tag" style="background:var(--s2);color:var(--lime-text);height:32px">{icon("info", "i xs")}Projection, not advice or a guarantee</span>'
    if empty:
        big = f'<div style="font:800 26px/1.2 var(--display);letter-spacing:-.03em;color:var(--muted);margin:6px 0 4px">Enter rates to see this</div>'
        sc = ""
        rows = [("Savings", ["Enter rates to see this"] * 1), ("Investments", ["Enter rates to see this"]), ("Income received", [m(30000)] * 3)]
        tbl = ('<div class="diff" style="padding:6px 16px">'
               + "".join(f'<div class="r"><span class="nm">{n}</span><span class="ba" style="{"font-family:var(--ui);font-weight:700;color:var(--muted)" if len(v) == 1 else ""}">{" · ".join(v) if len(v) == 1 else v[0]}</span></div>' for n, v in rows) + '</div>')
    else:
        big = f'<div class="num" style="font:800 64px/1 var(--display);letter-spacing:-.045em;margin:10px 0 4px">{m(PROJ["tot"][1])}</div>'
        sc = (f'<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:{8 if mobile else 10}px">'
              + "".join(f'<div class="tile" style="background:{"var(--blue);color:var(--on-blue)" if i == 1 else "var(--s2)"};min-height:0;min-width:0;{"padding:12px" if mobile else ""}"><span class="lbl" style="{"color:var(--on-blue)" if i == 1 else ""}">{s}</span><span class="v num" style="font-size:{16 if mobile else 24}px">{m(PROJ["tot"][i])}</span></div>'
                        for i, s in enumerate(("Low", "Base", "High"))) + '</div>')
        gt = "84px repeat(3,minmax(0,1fr))" if mobile else "minmax(0,1fr) repeat(3,auto)"
        hdr = f'<div class="r" style="grid-template-columns:{gt}"><span class="lbl"></span>' + "".join(f'<span class="lbl" style="text-align:right;min-width:{0 if mobile else 110}px">{s}</span>' for s in ("Low", "Base", "High")) + '</div>'
        rws = [("Savings", PROJ["sav"]), ("Investments", PROJ["inv"]), ("You put in", (PROJ["put"],) * 3), ("Growth", PROJ["growth"]), ("Income received", (PROJ["income"],) * 3)]
        tbl = ('<div class="diff" style="padding:6px 16px">' + hdr
               + "".join(f'<div class="r" style="grid-template-columns:{gt}"><span class="nm" style="{"font-size:13px" if mobile else ""}">{n}</span>'
                         + "".join(f'<span class="ba" style="justify-content:flex-end;min-width:{0 if mobile else 110}px;font-size:{13 if mobile else 15}px">{("+" if n == "Growth" else "") + m(x)}</span>' for x in v) + '</div>' for n, v in rws) + '</div>')
    res = (f'<section class="cal" style="display:flex;flex-direction:column;gap:16px" aria-live="polite"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h2 class="h2">After 12 months · 10 Nov 2027</h2></div>{disc}'
           f'<div><span class="lbl">Savings + investments · Base</span>{big}</div>{sc}{tbl}</section>')
    seg = '<div class="seg" role="group" aria-label="Period" style="width:{w}">' + "".join(f'<button aria-pressed="{str(p == "12").lower()}">{p}{" months" if not mobile else "m"}</button>' for p in ("3", "6", "12", "24")) + '</div>'
    if mobile:
        body = (f'<div class="m" style="padding-bottom:40px">{mtop("projections")}<div class="mpad" style="display:flex;flex-direction:column;gap:14px">'
                f'<h1 class="title" style="font-size:32px">Projections</h1>{seg.format(w="100%")}{res}{assume}</div></div>')
        page(name, body, mobile=True)
        return
    body = (f'{topbar("projections")}<main style="max-width:1280px;margin:0 auto;padding:12px 24px 48px">'
            f'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px"><h1 class="title">Projections</h1>{seg.format(w="460px")}</div>'
            f'<div style="display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:20px;align-items:start"><div>{res}</div><div style="display:flex;flex-direction:column;gap:16px">{assume}</div></div></main>')
    page(name, body)


# ------------------------------------------------------------------ settings
def settings(name, mobile=False, rec_menu=False, dialog=False):
    g = 'class="g2"' if not mobile else 'style="display:flex;flex-direction:column;gap:14px"'
    rm = ""
    if rec_menu:
        opts = ["Once", "Weekly", "Every 2 weeks", "Monthly", "Every 3 months"]
        rm = ('<div class="menu" role="menu" aria-label="Repeats" data-reui="c-dropdown-menu-1" style="left:0;top:92px;width:220px">'
              + "".join(f'<div class="mi{" hi" if o == "Every 2 weeks" else ""}" role="menuitemradio" aria-checked="{str(o == "Monthly").lower()}">{o}{"<span class=chk>" + icon("check") + "</span>" if o == "Monthly" else ""}</div>' for o in opts) + '</div>')

    def crow(n, a, due, locked, menu=""):
        lk = f'<span class="check"><span class="box{" on" if locked else ""}">{icon("check", "i sm") if locked else ""}</span>Locked</span>'
        rep = f'<div class="f" style="position:relative">Repeats<button class="ctl{" focus" if menu else ""}" style="justify-content:space-between" aria-haspopup="menu" aria-expanded="{str(bool(menu)).lower()}"><span>Monthly</span>{icon("chevron-down")}</button>{menu}</div>'
        if mobile:
            return (f'<div class="reply" style="border-radius:22px">{text_f("Name", n)}<div class="g2">{money_f("Amount", a)}{text_f("Due", due)}</div>{rep}'
                    f'<div style="display:flex;justify-content:space-between;align-items:center">{lk}<button class="ibtn ghost" aria-label="Delete {n}">{icon("trash-2")}</button></div></div>')
        return (f'<div style="display:grid;grid-template-columns:1.3fr 1fr .8fr 1.3fr auto 44px;gap:12px;align-items:end">{text_f("Name", n)}{money_f("Amount", a)}{text_f("Due", due)}{rep}'
                f'<span style="height:56px;display:flex;align-items:center">{lk}</span><button class="ibtn ghost" style="margin-bottom:6px" aria-label="Delete {n}">{icon("trash-2")}</button></div>')
    save = '<div style="display:flex;justify-content:flex-end"><button class="btn primary sm" aria-disabled="true">Save changes</button></div>'
    secs = [
        ("money", "Money", f'<div class="f">This money is<div class="seg" role="group"><button aria-pressed="true">A lump sum</button><button aria-pressed="false">A monthly allowance</button></div></div>'
                           f'<div {g}>{money_f("Amount at plan start", "3,900")}{text_f("Last until", "31 Jan 2027", "calendar-days")}</div>'),
        ("income", "Income", f'<div class="f">Job<div class="seg" role="group" style="max-width:320px"><button aria-pressed="false">Yes</button><button aria-pressed="true">No</button></div></div>'
                             f'<div {g}>{text_f("From", "Family transfer")}{money_f("Amount", "300")}{text_f("Date", "18 Dec 2026", "calendar-days")}'
                             f'<div class="f">&nbsp;<span class="check" style="height:56px"><span class="box on">{icon("check", "i sm")}</span>Confirmed</span></div></div>'
                             f'<button class="btn sm" style="align-self:flex-start">{icon("plus", "i sm")}Add income</button>'),
        ("commitments", "Rent and bills", crow("Rent", "620", "1st", True, rm) + crow("Utilities", "55", "15th", True)
         + f'<button class="btn sm" style="align-self:flex-start">{icon("plus", "i sm")}Add commitment</button>'),
        ("reserve", "Reserve and savings", f'<div {g}>{money_f("Minimum reserve", "500")}{money_f("Savings goal by 31 Jan", "150")}{money_f("Savings now", "200")}{money_f("Investments now", "0")}</div>'),
        ("spending", "Food and transport", f'<div {g}>{money_f("Groceries a week", "63")}{money_f("Transport a week", "36.40")}{money_f("Eating out a week", "38.50")}{money_f("Shopping a week", "42.98")}</div>'
                                         '<div class="f">Protect first<div style="display:flex;gap:8px;flex-wrap:wrap">' + "".join(f'<span class="tag" style="height:36px;font-size:14px">{i + 1} · {p}</span>' for i, p in enumerate(["Transport", "Groceries", "Eating out", "Shopping"])) + '</div></div>'),
        ("optional", "Optional", f'<div {g}>{text_f("City or area", "London")}{text_f("Diet", "None")}</div>'
                                 '<div class="f">Discount memberships<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="tag" style="height:36px;font-size:14px">16-25 Railcard</span><span class="tag" style="height:36px;font-size:14px">Student Beans</span></div></div>'),
    ]
    sec = "".join(f'<section class="cal" id="{k}" style="display:flex;flex-direction:column;gap:18px;margin-bottom:16px;{"padding:18px" if mobile else "padding:28px"}"><h2 class="h2">{t}</h2>{b}{save}</section>' for k, t, b in secs)
    sec += (f'<section class="cal" style="box-shadow:inset 0 0 0 2px var(--coral);display:flex;flex-direction:column;gap:14px;{"padding:18px" if mobile else "padding:28px"}"><h2 class="h2">Reset</h2>'
            f'<div style="display:flex;align-items:center;gap:16px;justify-content:space-between;flex-wrap:wrap"><span style="font-weight:700">Deletes your plan, ledger and settings on this device.</span>'
            f'<button class="btn danger">{icon("rotate-ccw", "i sm")}Reset StudentPlan</button></div></section>')
    dlg = ""
    if dialog:
        dlg = ('<div class="scrim"></div><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dt" aria-describedby="dd">'
               f'<span class="ic">{icon("trash-2")}</span><h2 id="dt" class="h2">Reset StudentPlan?</h2>'
               '<p id="dd">This deletes your plan, ledger and settings from this device. It can’t be undone.</p>'
               f'<div class="acts" style="margin-top:6px"><button class="btn focus">Cancel</button><button class="btn danger">Delete everything</button></div></div>')
    if mobile:
        page(name, f'<div class="m" style="padding-bottom:40px">{mtop("settings")}<main class="mpad"><h1 class="title" style="font-size:32px;margin:4px 0 16px">Settings</h1>{sec}</main>{dlg}</div>', mobile=True)
        return
    nav = ('<nav aria-label="Settings sections" style="position:sticky;top:16px;display:flex;flex-direction:column;gap:4px">'
           + "".join(f'<a href="#{k}" style="height:44px;display:flex;align-items:center;padding:0 16px;border-radius:999px;text-decoration:none;font-weight:800;{"background:var(--s3);color:var(--text)" if k == "money" else "color:var(--muted)"}"{" aria-current=true" if k == "money" else ""}>{t}</a>' for k, t, _ in secs)
           + '<a href="#reset" style="height:44px;display:flex;align-items:center;padding:0 16px;color:var(--muted);text-decoration:none;font-weight:800">Reset</a></nav>')
    page(name, f'{topbar("settings")}<main style="max-width:1120px;margin:0 auto;padding:12px 24px 64px"><h1 class="title" style="margin-bottom:24px">Settings</h1>'
               f'<div style="display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;align-items:start">{nav}<div>{sec}</div></div></main>{dlg}')


# ------------------------------------------------------------------ write all
def main():
    # P-onboarding
    onboarding("onboarding-desktop", "funds")
    onboarding("onboarding-mobile", "funds", mobile=True)
    onboarding("onboarding-error-desktop", "funds", error=True)
    onboarding("onboarding-error-mobile", "funds", mobile=True, error=True)
    welcome("onboarding-welcome-desktop")
    welcome("onboarding-welcome-mobile", mobile=True)
    for s, _ in STEPS[1:]:
        onboarding(f"onboarding-step-{s}", s)
        onboarding(f"onboarding-step-{s}-mobile", s, mobile=True)

    # P-plan
    plan_desktop("plan-desktop", "s0", "day", day_tab("s0", TODAY), sugg=True)
    plan_mobile("plan-mobile", "s0")
    plan_desktop("plan-light-desktop", "s0", "day", day_tab("s0", TODAY), sugg=True, theme="light")
    plan_mobile("plan-light-mobile", "s0", theme="light")
    plan_desktop("plan-account-menu", "s0", "day", day_tab("s0", TODAY), menu=True)
    plan_desktop("plan-month-menu", "s0", "day", day_tab("s0", TODAY), month_menu=True)
    plan_desktop("plan-loading", "s0", "change", change_tab("loading"), text="I need to spend £35 on a replacement shower filter today", busy=True)
    sheet_mobile("plan-loading-mobile", "s0", "change", change_tab("loading"), text="I need to spend £35 on a replacement shower filter today", busy=True)
    plan_desktop("plan-deficit-desktop", "deficit", "change", change_tab("deficit"), month=(2027, 1), sel=None)
    plan_mobile("plan-deficit-mobile", "deficit", start=D(2026, 12, 28), end=D(2027, 1, 17), month=("January", "2027"),
                extra=f'<div class="reply" style="margin-top:12px;box-shadow:inset 0 0 0 2px var(--coral);background:var(--s1)"><div class="verdict short" style="font-size:22px">Your plan is £290 short</div>'
                      f'<p style="font-weight:600">Rent (£620) on 1 Jan leaves you £85 below your £500 reserve.</p><p style="font-weight:600">Utilities (£55) on 15 Jan leaves you £55 below your £500 reserve.</p>'
                      f'<p style="font-weight:600">Your £150 savings goal can\'t be funded: bills, your reserve and what you\'ve spent need £290 more than you have.</p>'
                      f'<div class="acts"><button class="btn sm primary">{icon("plus", "i sm")}Add income</button><button class="btn sm">Edit reserve</button></div></div>')

    # P-plan-day
    plan_desktop("plan-day-desktop", "s1", "day", day_tab("s1", TODAY), dot=True)
    sheet_mobile("plan-day-mobile", "s1", "day", day_tab("s1", TODAY), dot=True)
    sheet_mobile("plan-day-ordinary-mobile", "s1", "day", day_tab("s1", D(2026, 11, 12)))
    plan_desktop("plan-day-item-menu", "s1", "day", day_tab("s1", D(2026, 11, 12), menu=True), sel=D(2026, 11, 12))
    plan_desktop("plan-day-category", "s1", "day", day_tab("s1", TODAY, form=True))

    # P-plan-change
    plan_desktop("plan-change-desktop", "s1", "change", change_tab("s1"))
    sheet_mobile("plan-change-mobile", "s1", "change", change_tab("s1"))
    plan_desktop("plan-change-bubble-frame", "bubble", "change", change_tab("s1"), bubble=True, hashes=(("#t=340", False),))
    plan_desktop("plan-change-bubble-reduced", "bubble", "change", change_tab("s1"), bubble=True, hashes=(("#t=340", True),))
    plan_mobile("plan-change-bubble-mobile-frame", "bubble", bubble=True, hashes=(("#t=300", False),))
    plan_desktop("plan-change-preview-desktop", "dinner_pv", "change", change_tab("s2"))
    sheet_mobile("plan-change-preview-mobile", "dinner_pv", "change", change_tab("s2"))
    plan_desktop("plan-change-tradeoff-desktop", "concert_pv", "change", change_tab("s3"), sel=D(2026, 11, 14))
    sheet_mobile("plan-change-tradeoff-mobile", "concert_pv", "change", change_tab("s3"))
    plan_desktop("plan-change-clarify", "s1", "change", change_tab("clarify"))
    sheet_mobile("plan-change-clarify-mobile", "s1", "change", change_tab("clarify"))
    plan_desktop("plan-change-fail", "s1", "change", change_tab("fail"))
    sheet_mobile("plan-change-fail-mobile", "s1", "change", change_tab("fail"))
    sheet_mobile("plan-change-income-mobile", "s4", "change", change_tab("s4"))

    # P-plan-offers
    plan_desktop("plan-offers-desktop", "s1", "offers", offers_tab(3))
    sheet_mobile("plan-offers-mobile", "s1", "offers", offers_tab(4))

    # P-projections
    projections("projections-desktop")
    projections("projections-mobile", mobile=True)
    projections("projections-empty-desktop", empty=True)
    projections("projections-empty-mobile", empty=True, mobile=True)

    # P-settings
    settings("settings-desktop")
    settings("settings-mobile", mobile=True)
    settings("settings-recurrence-menu", rec_menu=True)
    settings("settings-reset-dialog-desktop", dialog=True)
    settings("settings-reset-dialog-mobile", mobile=True, dialog=True)

    # renames for hashed renders
    for r in RENDERS:
        if r["html"] in ("plan-change-bubble-frame", "plan-change-bubble-reduced", "plan-change-bubble-mobile-frame"):
            r["out"] = r["html"]
        if r["html"].endswith("-mobile") or r["html"].startswith("plan-change-bubble-mobile"):
            r["mobile"] = True
        if "reset-dialog" in r["html"]:
            r["full"] = False
    with open(os.path.join(HERE, "renders.json"), "w") as f:
        json.dump(RENDERS, f, indent=1)
    print(len(RENDERS), "pages")


if __name__ == "__main__":
    main()
