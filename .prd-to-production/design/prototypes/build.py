#!/usr/bin/env python3
"""Generate StudentPlan static design prototypes (design artifacts only).

Usage: python3 build.py <path-to-lucide-static/icons>
All figures come from the demo fixture in brief open decision 4 and are computed
here in integer pence, so every screen shows the same, mutually consistent numbers.
"""
import datetime as dt
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("LUCIDE_ICONS", "")
D = dt.date
TODAY = D(2026, 11, 10)
END = D(2027, 1, 31)


def icon(name, cls="i"):
    with open(os.path.join(ICONS, name + ".svg")) as f:
        svg = f.read()
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S).strip()
    svg = re.sub(r'class="[^"]*"', f'class="{cls}" aria-hidden="true"', svg, count=1)
    svg = re.sub(r'\s(width|height)="24"', "", svg)
    return re.sub(r"\s+", " ", svg)


def gbp(p, sign=False):
    neg = p < 0
    p = abs(p)
    s = f"£{p // 100:,}.{p % 100:02d}"
    if sign:
        return ("−" if neg else "+") + s
    return ("−" if neg else "") + s


def esc(s):
    return html.escape(s, quote=True)


def dlabel(d, year=False):
    s = f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"
    return s + (f" {d.year}" if year else "")


# ---------------------------------------------------------------- engine (fixture)
CATS = ["Groceries", "Transport", "Eating out", "Shopping"]


def base_flex(d):
    v = {"Groceries": 900, "Transport": 520, "Eating out": 550, "Shopping": 614}
    if d >= D(2027, 1, 4):  # 28 remainder pence go to the last 28 days
        v["Shopping"] += 1
    return v


def commitments(d):
    out = []
    if d.day == 1 and TODAY <= d <= END:
        out.append(("Rent", 62000))
    if d.day == 15 and TODAY <= d <= END:
        out.append(("Utilities", 5500))
    return out


def day_model(state, d):
    """Return dict(kind, items[], total, actual_total, planned_total, short)."""
    m = {"items": [], "short": 0, "kind": "plan", "actual": 0, "flex": 0, "commit": 0}
    if d < TODAY:
        m["kind"] = "before"
        if d == D(2026, 11, 1):
            m["items"].append(dict(t="cx", label="Rent", amt=62000))
            m["actual"] = 62000
        return m
    if d > END:
        m["kind"] = "outside"
        return m
    flex = base_flex(d)
    changed = set()
    if state in ("s1", "dinner", "concert", "deficit", "bubble"):
        if d > TODAY:
            flex["Shopping"] -= 12 if d >= D(2027, 1, 18) else 11
            changed.add("Shopping")
    pv = set()
    if state in ("dinner", "concert") and d == D(2026, 11, 11):
        flex.update({"Eating out": 2000, "Shopping": 0, "Groceries": 53})
        if state == "dinner":
            pv |= {"Eating out", "Shopping", "Groceries"}
    extra = []
    if state == "concert":
        if d == D(2026, 11, 14):
            flex = {k: 0 for k in flex}
            extra.append(dict(t="pv", label="Concert", amt=6000))
        if D(2026, 11, 15) <= d <= D(2026, 11, 28):
            flex["Eating out"] -= 244 if d <= D(2026, 11, 17) else 245
            pv.add("Eating out")
    if state == "deficit" and d > TODAY:
        flex = {k: 0 for k in flex}
        if d == D(2027, 1, 1):
            m["short"] = 8500
        if d == D(2027, 1, 15):
            m["short"] = 5500
    for lab, amt in commitments(d):
        m["items"].append(dict(t="c", label=lab, amt=amt))
    if d == D(2026, 12, 18):
        m["items"].append(dict(t="inc", label="Family transfer", amt=30000))
    if d == TODAY and state in ("s1", "dinner", "concert", "deficit", "bubble"):
        m["items"].append(dict(t="x", label="Shower filter", amt=3500, cat="Household"))
        if state == "deficit":
            m["items"].append(dict(t="x", label="Tuition deposit", amt=240000, cat="Education"))
    m["items"] += extra
    for k in CATS:
        if flex[k] > 0:
            t = "pv" if k in pv else "p"
            m["items"].append(dict(t=t, label=k, amt=flex[k], changed=(k in changed and state == "bubble")))
    m["flex"] = sum(flex.values()) + sum(e["amt"] for e in extra)
    m["actual"] = sum(i["amt"] for i in m["items"] if i["t"] in ("x", "cx"))
    m["commit"] = sum(i["amt"] for i in m["items"] if i["t"] == "c")
    m["changed"] = state == "bubble" and d >= TODAY
    return m


def summary(state):
    if state == "initial":
        return dict(funds=390000, commit=140500, reserve=50000, savings=15000, flex=214500, today=2584, spent=0)
    if state == "deficit":
        return dict(funds=146500, commit=140500, reserve=50000, savings=0, flex=0, today=0, spent=243500, short=14000)
    return dict(funds=386500, commit=140500, reserve=50000, savings=15000, flex=211000, today=0, spent=3500)


# ---------------------------------------------------------------- shared chrome
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&display=swap" rel="stylesheet">')
READY = """<script>
document.fonts.ready.then(async () => {
  await Promise.all(["400 16px 'Atkinson Hyperlegible Next'","500 16px 'Atkinson Hyperlegible Next'","700 16px 'Atkinson Hyperlegible Next'","700 26px 'Bricolage Grotesque'"].map(f => document.fonts.load(f)));
  const imgs = [...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }));
  await Promise.all(imgs);
  if (window.__beforeReady) window.__beforeReady();
  const ok = document.fonts.check("700 16px 'Atkinson Hyperlegible Next'") && document.fonts.check("700 26px 'Bricolage Grotesque'");
  document.documentElement.dataset.fonts = ok ? "loaded" : "missing";
  document.documentElement.dataset.ready = "1";
});
</script>"""


def page(title, body, cls="", extra_head="", width=None):
    w = f' style="width:{width}px"' if width else ""
    return (f'<!doctype html><html lang="en-GB" data-theme="light"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(title)}</title>{FONTS}'
            f'<link rel="stylesheet" href="styles.css">{extra_head}</head><body class="{cls}"{w}>{body}{READY}</body></html>')


def topbar(active="plan", demo=True, menu_open=False):
    nav = "".join(f'<a href="#"{" aria-current=\"page\"" if k == active else ""}>{lab}</a>'
                  for k, lab in [("plan", "Plan"), ("projections", "Projections"), ("settings", "Settings")])
    demo_tag = '<span class="demo-tag"><span class="dot"></span>Demo · Tue 10 Nov 2026</span>' if demo else ""
    return (f'<header class="topbar"><a class="wordmark" href="#">StudentPlan</a><nav class="nav" aria-label="Main">{nav}</nav>'
            f'<span class="spacer"></span>{demo_tag}<button class="icon-btn" aria-label="App menu" aria-haspopup="menu" aria-expanded="{str(menu_open).lower()}">{icon("ellipsis")}</button></header>')


def mhead(active="plan", demo=True):
    demo_tag = '<span class="demo-tag"><span class="dot"></span>Demo · 10 Nov</span>' if demo else ""
    nav = "".join(f'<a href="#"{" aria-current=\"page\"" if k == active else ""}>{lab}</a>'
                  for k, lab in [("plan", "Plan"), ("projections", "Projections"), ("settings", "Settings")])
    return (f'<header class="mhead"><a class="wordmark" href="#">StudentPlan</a><span class="spacer"></span>{demo_tag}'
            f'<button class="icon-btn ghost" aria-label="App menu">{icon("ellipsis")}</button></header><nav class="mnav" aria-label="Main">{nav}</nav>')


def summary_html(state, mobile=False):
    s = summary(state)
    figs = [
        ("Funds left", gbp(s["funds"]), '<span class="sub income">+£300.00 on 18 Dec</span>', ""),
        ("For commitments", gbp(s["commit"]), "", ""),
        ("Minimum reserve", gbp(s["reserve"]), "", ""),
        ("Planned savings", gbp(s["savings"]), '<span class="sub">of £150.00 goal</span>' if state == "deficit" else "", ""),
        ("Flexible left", gbp(s["flex"]), "", ""),
        ("Today", gbp(s["today"]), f'<span class="sub">{gbp(s["spent"])} spent</span>' if s["spent"] else '<span class="sub">left to spend</span>' if False else "", "today"),
    ]
    out = []
    for lab, val, sub, c in figs:
        out.append(f'<div class="fig {c}"><span class="lbl">{lab}</span><span class="val money">{val}</span>{sub}</div>')
    if state == "deficit":
        out[4] = ('<div class="fig deficit"><span class="lbl">Flexible left</span><span class="val money">£0.00</span>'
                  '<span class="sub short">£140.00 short</span></div>')
        # keep Today last
        out[4], out[5] = out[5], out[4]
    cls = "msum" if mobile else "summary"
    return f'<section class="{cls}" aria-label="Summary">{"".join(out)}</section>'


def chip(it, compact=True):
    t = it["t"]
    pin = icon("pin") if t in ("c", "cx") else ""
    cls = {"p": "chip p", "x": "chip x", "c": "chip c", "cx": "chip c x", "inc": "chip inc", "pv": "chip pv"}[t]
    amt = ("+" if t == "inc" else "") + gbp(it["amt"])
    bub = ' data-bubble="chip"' if it.get("changed") or (t == "x" and it.get("bub")) else ""
    data = ""
    if it.get("changed"):
        data = f' data-from="{it["amt"] + 11}" data-to="{it["amt"]}"'
    title = {"p": "planned", "x": "spent", "cx": "paid", "c": "fixed", "inc": "income", "pv": "preview"}[t]
    return (f'<span class="{cls}"{bub}{data} title="{title}">{pin}<span class="l">{esc(it["label"])}</span>'
            f'<span class="a money">{amt}</span><span class="sr"> {title}</span></span>')


def cell_total(m, state):
    if m["kind"] != "plan":
        if m["actual"]:
            return f'<span class="total actual money">{gbp(m["actual"])}</span>'
        return ""
    planned = m["flex"] + m["commit"]
    if m["actual"]:
        bub = ' data-bubble="total"' if m.get("changed") else ""
        return (f'<span class="total actual money"{bub}>{gbp(m["actual"])}<span class="of">of {gbp(planned)}</span></span>')
    bub = f' data-bubble="total" data-from="{planned + 11}" data-to="{planned}"' if m.get("changed") else ""
    z = " zero" if planned == 0 else ""
    return f'<span class="total money{z}"{bub}>{gbp(planned)}</span>'


def cell(d, month, state, selected=None, preview_days=()):
    m = day_model(state, d)
    cls = ["cell"]
    if m["kind"] == "before":
        cls.append("before")
    if m["kind"] == "outside":
        cls.append("outside")
    if d.month != month:
        cls.append("other")
    if d == TODAY:
        cls.append("today")
    if selected == d:
        cls.append("selected")
    if d in preview_days:
        cls.append("preview")
    items = m["items"]
    if d == TODAY and state == "bubble":
        for it in items:
            if it["t"] == "x":
                it["bub"] = True
    shown = items if len(items) <= 4 else items[:3]
    rest = [] if len(items) <= 4 else items[3:]
    chips = "".join(chip(i) for i in shown)
    if rest:
        mb = ' data-bubble="chip"' if any(i.get("changed") for i in rest) else ""
        chips += f'<span class="chip more"{mb}><span class="l">+{len(rest)}</span><span class="a money">{gbp(sum(i["amt"] for i in rest))}</span></span>'
    short = ""
    if m["short"]:
        short = f'<span class="short-mark">{icon("triangle-alert")}Short {gbp(m["short"])}</span>'
    aria = dlabel(d)
    return (f'<div class="{" ".join(cls)}" role="gridcell" aria-label="{aria}"{" aria-current=\"date\"" if d == TODAY else ""}>'
            f'<div class="head"><span class="num">{d.day}</span>{cell_total(m, state)}</div>'
            f'<div class="chips">{chips}</div>{short}</div>')


def calendar(state, year=2026, month=11, selected=TODAY, preview_days=(), month_menu=False):
    first = D(year, month, 1)
    start = first - dt.timedelta(days=first.weekday())
    nxt = D(year + (month == 12), month % 12 + 1, 1)
    last = nxt - dt.timedelta(days=1)
    end = last + dt.timedelta(days=6 - last.weekday())
    cells = []
    d = start
    while d <= end:
        cells.append(cell(d, month, state, selected, preview_days))
        d += dt.timedelta(days=1)
    wds = "".join(f'<div class="wd">{w}</div>' for w in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    mname = first.strftime("%B %Y")
    menu = ""
    if month_menu:
        opts = [("November 2026", True), ("December 2026", False), ("January 2027", False)]
        items = "".join(f'<div class="mi{" sel" if s else ""}{" hi" if i == 1 else ""}" role="menuitemradio" aria-checked="{str(s).lower()}">{o}'
                        f'{"<span class=chk>" + icon("check") + "</span>" if s else ""}</div>' for i, (o, s) in enumerate(opts))
        menu = f'<div class="menu" role="menu" aria-label="Jump to month" style="left:0;top:44px;min-width:240px" data-reui="c-dropdown-menu-1">{items}</div>'
    key = ('<div class="key" aria-label="Key"><span class="k"><i class="p"></i>Planned</span><span class="k"><i class="a"></i>Spent</span>'
           f'<span class="k"><i class="c"></i>Fixed</span></div>')
    return (f'<div class="monthbar" style="position:relative"><button class="month-trigger" aria-haspopup="menu" aria-expanded="{str(month_menu).lower()}">{mname}{icon("chevron-down")}</button>{menu}'
            f'<button class="icon-btn ghost" aria-label="Previous month">{icon("chevron-left")}</button>'
            f'<button class="icon-btn ghost" aria-label="Next month">{icon("chevron-right")}</button>'
            f'<button class="btn sm">Today</button><span class="spacer"></span>{key}</div>'
            f'<div class="cal" role="grid" aria-label="{mname}">{wds}{"".join(cells)}</div>')


# ---------------------------------------------------------------- panel content
def composer(text=None, busy=False):
    if text:
        f = f'<span class="field">{esc(text)}</span>'
    else:
        f = '<span class="field ph">Tell me what changed…</span>'
    btn = (f'<button class="send" disabled aria-label="Reading">{icon("loader-circle")}</button>' if busy
           else f'<button class="send" aria-label="Send">{icon("arrow-up")}</button>')
    return f'<div class="composer"><label class="sr" for="nl">Tell me what changed</label><div class="input{" busy" if busy else ""}">{f}{btn}</div></div>'


def tabs(sel, badge=False):
    out = []
    for k, lab in [("day", "Day"), ("change", "Change"), ("offers", "Offers")]:
        b = '<span class="badge" aria-hidden="true"></span>' if (k == "change" and badge and sel != "change") else ""
        out.append(f'<button role="tab" aria-selected="{str(k == sel).lower()}">{lab}{b}</button>')
    return f'<div class="tabs" role="tablist">{"".join(out)}</div>'


def stepper(amt, mobile=False):
    return (f'<span class="stepper"><button aria-label="Decrease">{icon("minus")}</button><span class="v money">{gbp(amt)}</span>'
            f'<button aria-label="Increase">{icon("plus")}</button></span>')


def day_tab(state, d, item_menu=False, add_form=False):
    m = day_model(state, d)
    planned_items = [i for i in m["items"] if i["t"] in ("p", "pv")]
    flex_all = base_flex(d)
    if state in ("s1",) and d > TODAY:
        flex_all["Shopping"] -= 11
    planned = m["flex"]
    spent = m["actual"]
    left = max(planned - spent, 0)
    tag = '<span class="tag today">Today</span>' if d == TODAY else ""
    trio = (f'<div class="trio"><div><div class="lbl">Planned</div><div class="val p money">{gbp(planned)}</div></div>'
            f'<div><div class="lbl">Spent</div><div class="val x money">{gbp(spent)}</div></div>'
            f'<div><div class="lbl">Left</div><div class="val money">{gbp(left)}</div></div></div>')
    rows = []
    for c in [i for i in m["items"] if i["t"] == "c"]:
        rows.append(f'<div class="row"><span class="mk c"></span><span class="name">{c["label"]}<small>Fixed · monthly</small></span><span class="amt money">{gbp(c["amt"])}</span></div>')
    for i, it in enumerate(planned_items):
        menu = ""
        more = f'<button class="icon-btn ghost" aria-label="{it["label"]} actions" aria-haspopup="menu" aria-expanded="{str(item_menu and it["label"] == "Eating out").lower()}" style="width:32px;height:32px">{icon("ellipsis")}</button>'
        if item_menu and it["label"] == "Eating out":
            dates = [D(2026, 11, 12), D(2026, 11, 13), D(2026, 11, 14), D(2026, 11, 15)]
            sub = "".join(f'<div class="mi{" hi" if x == D(2026, 11, 14) else ""}" role="menuitem">{dlabel(x)}</div>' for x in dates)
            sub += '<div class="sep"></div><div class="mi" role="menuitem">' + icon("calendar-days") + 'Pick a date…</div>'
            menu = (f'<div class="menu" role="menu" aria-label="Eating out actions" style="right:0;top:40px;width:232px" data-reui="c-dropdown-menu-5">'
                    f'<div class="mi" role="menuitem">{icon("pencil")}Edit amount</div>'
                    f'<div class="mi hi" role="menuitem" aria-haspopup="menu" aria-expanded="true">{icon("calendar-arrow-down")}Move to<span class="sub">{icon("chevron-right")}</span></div>'
                    f'<div class="mi" role="menuitem">{icon("minus")}Set to £0.00</div></div>'
                    f'<div class="menu" role="menu" aria-label="Move to" style="right:236px;top:80px;width:180px">{sub}</div>')
        rows.append(f'<div class="row" style="position:relative"><span class="mk p"></span><span class="name">{it["label"]}</span>{stepper(it["amt"])}{more}{menu}</div>')
    zero = [k for k in CATS if k not in [p["label"] for p in planned_items]]
    for k in zero:
        rows.append(f'<div class="row"><span class="mk p"></span><span class="name">{k}</span>{stepper(0)}<span style="width:32px"></span></div>')
    srows = []
    for it in [i for i in m["items"] if i["t"] == "x"]:
        srows.append(f'<div class="row"><span class="mk x"></span><span class="name">{esc(it["label"])}</span>'
                     f'<button class="catbtn" aria-haspopup="menu">{it["cat"]}{icon("chevron-down")}</button>'
                     f'<span class="amt x money">{gbp(it["amt"])}</span><button class="icon-btn ghost" aria-label="{esc(it["label"])} actions" style="width:32px;height:32px">{icon("ellipsis")}</button></div>')
    over = ""
    if spent > planned and m["kind"] == "plan" and state != "deficit":
        over = f'<p class="note">{icon("info")}<span>{gbp(spent - planned)} over today’s plan, taken from shopping on later days.</span></p>'
    form = ""
    if add_form:
        cats = ["Groceries", "Transport", "Eating out", "Shopping", "Household", "Going out", "Books", "Other"]
        items = "".join(f'<div class="mi{" sel" if c == "Household" else ""}{" hi" if c == "Going out" else ""}" role="menuitemradio" aria-checked="{str(c == "Household").lower()}">{c}'
                        f'{"<span class=chk>" + icon("check") + "</span>" if c == "Household" else ""}</div>' for c in cats)
        form = (f'<div style="border:1px solid var(--rule);border-radius:12px;padding:12px;margin-top:12px;position:relative">'
                f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
                f'<label class="f">Amount<span class="ctl"><span class="u">£</span><span class="grow">35.00</span></span></label>'
                f'<div class="f">Category<button class="ctl" style="justify-content:space-between" aria-haspopup="menu" aria-expanded="true"><span>Household</span>{icon("chevron-down")}</button></div>'
                f'<label class="f" style="grid-column:1/-1">What<span class="ctl">Shower filter</span></label></div>'
                f'<div class="actions"><button class="btn">Cancel</button><button class="btn primary">Record expense</button></div>'
                f'<div class="menu" role="menu" aria-label="Category" style="right:12px;top:84px;width:200px" data-reui="c-dropdown-menu-1">{items}</div></div>')
        srows = []
    spent_list = "".join(srows) if srows else ('' if add_form else '<p class="note" style="margin-top:4px">Nothing recorded yet.</p>')
    add_btn = "" if add_form else f'<div class="actions"><button class="btn">{icon("plus")}Record expense</button></div>'
    return (f'<div class="tabpanel" role="tabpanel"><div class="dayhead"><h3>{dlabel(d)}</h3>{tag}</div>{trio}'
            f'<div class="listhead"><h4>Planned</h4><span class="sum money">{gbp(planned + m["commit"])}</span></div>{"".join(rows)}'
            f'<div class="listhead"><h4>Spent</h4><span class="sum money">{gbp(spent)}</span></div>{spent_list}{over}{form}{add_btn}</div>')


PROTECT = (f'<div class="protect">{{lock}}<span><b>Unchanged:</b> rent £620.00, utilities £55.00, minimum reserve £500.00, savings goal £150.00.</span></div>')


def protect():
    return PROTECT.replace("{lock}", icon("pin"))


def src_tag(demo=False):
    return '<span class="tag sample src">Demo parsing</span>' if demo else '<span class="tag ok src">Read by Gemini</span>'


def change_s1():
    rows = [
        ("Shower filter", "Spent · Tue 10 Nov", "—", "£35.00"),
        ("Today left", "Tue 10 Nov", "£25.84", "£0.00"),
        ("Shopping a day", "Wed 11 Nov – Sun 3 Jan", "£6.14", "£6.03"),
        ("Shopping a day", "Mon 4 – Sun 17 Jan", "£6.15", "£6.04"),
        ("Shopping a day", "Mon 18 – Sun 31 Jan", "£6.15", "£6.03"),
        ("Flexible left", "Until Sun 31 Jan", "£2,145.00", "£2,110.00"),
    ]
    return diff_table(rows)


def diff_table(rows):
    body = "".join(f'<tr><td>{a}<small>{b}</small></td><td class="n before{" same" if c in ("—",) else ""} money">{c}</td><td class="n after money">{d}</td></tr>' for a, b, c, d in rows)
    return f'<table class="diff"><thead><tr><th>Item</th><th class="n">Before</th><th class="n">After</th></tr></thead><tbody>{body}</tbody></table>'


def change_tab(kind):
    if kind == "s1":
        return (f'<div class="tabpanel" role="tabpanel"><p class="said">You said <q>I spent £35 on a shower filter today</q></p>'
                f'<div class="intent"><span class="tag ink">Expense</span><span class="what money">£35.00 · Household · Tue 10 Nov</span>{src_tag()}</div>'
                f'<p class="explain" aria-live="polite">Added your £35.00 expense. Today’s £25.84 covers most of it; the other <b>£9.16 comes from shopping</b>, 11p a day from Wed 11 Nov (12p from 18 Jan).</p>'
                f'{change_s1()}{protect()}<div class="actions"><button class="btn">{icon("undo-2")}Undo</button></div></div>')
    if kind == "dinner":
        rows = [("Eating out", "Wed 11 Nov", "£5.50", "£20.00"), ("Shopping", "Wed 11 Nov", "£6.03", "£0.00"),
                ("Groceries", "Wed 11 Nov", "£9.00", "£0.53"), ("Day total", "Wed 11 Nov", "£25.73", "£25.73")]
        return (f'<div class="tabpanel" role="tabpanel"><p class="said">You asked <q>Can I spend £20 on dinner tomorrow?</q></p>'
                f'<div class="intent"><span class="tag preview">Preview · not applied</span>{src_tag()}</div>'
                f'<p class="explain"><b>Yes, it fits.</b> Wed 11 Nov has £25.73. Dinner raises eating out to £20.00; shopping (£6.03) and groceries (£8.47) cover the £14.50.</p>'
                f'{diff_table(rows).replace("<td class=\"n before money\">£25.73</td>", "<td class=\"n before same money\">£25.73</td>")}{protect()}'
                f'<div class="actions"><button class="btn">Discard</button><button class="btn primary">{icon("check")}Apply change</button></div></div>')
    if kind == "concert":
        opts = [
            ("Eating out", "Sun 15 – Sat 28 Nov · 14 days", "−£2.44 to £2.45 a day", True),
            ("Shopping", "Sun 15 – Mon 30 Nov · 16 days", "−£2.14 to £2.15 a day", False),
            ("All flexible spending", "Sun 15 Nov – Sun 31 Jan · 78 days", "−£0.43 to £0.44 a day", False),
        ]
        o = "".join(f'<div class="opt{" on" if on else ""}" role="radio" aria-checked="{str(on).lower()}"><span class="radio"></span><span><span class="t">{t}</span><br><span class="d">{dd}</span><br><span class="r money">{r}</span></span></div>' for t, dd, r, on in opts)
        rows = [("Concert ticket", "Planned · Sat 14 Nov", "—", "£60.00"), ("Other spending", "Sat 14 Nov", "£25.73", "£0.00"),
                ("Eating out a day", "Sun 15 – Sat 28 Nov", "£5.50", "£3.05–£3.06")]
        return (f'<div class="tabpanel" role="tabpanel"><p class="said">You asked <q>Can I spend £60 on a concert ticket on Saturday?</q></p>'
                f'<div class="intent"><span class="tag short">{icon("triangle-alert")}£34.27 short</span>{src_tag()}</div>'
                f'<p class="shortline">Sat 14 Nov has £25.73, so a £60.00 ticket is <span class="amt money">£34.27</span> more than the day allows.</p>'
                f'<fieldset role="radiogroup"><legend>Cover £34.27 from</legend>{o}</fieldset>'
                f'<div class="listhead"><h4>Preview</h4><span class="tag preview">Not applied</span></div>{diff_table(rows)}{protect()}'
                f'<div class="actions"><button class="btn">Discard</button><button class="btn primary">{icon("check")}Apply change</button></div></div>')
    if kind == "clarify":
        ch = "".join(f'<button class="choice">{c}</button>' for c in ["Sat 14 Nov", "Sun 15 Nov", "£15.00 each day"])
        return (f'<div class="tabpanel" role="tabpanel"><p class="said">You said <q>Keep £30 available for the weekend</q></p>'
                f'<div class="intent"><span class="tag">Hold money</span><span class="what money">£30.00</span>{src_tag()}</div>'
                f'<p class="ask">Which day should keep £30.00?</p><div class="choices">{ch}</div>'
                f'<div class="actions"><button class="btn quiet" style="flex:none">Cancel</button></div></div>')
    if kind == "fail":
        return (f'<div class="tabpanel" role="tabpanel"><p class="said">You said <q>sort out my money for the trip thing</q></p>'
                f'<div class="intent"><span class="tag">Not understood</span>{src_tag(demo=True)}</div>'
                f'<p class="err" role="alert">{icon("triangle-alert")}<span>I couldn’t turn that into a change. Your plan hasn’t changed.</span></p>'
                f'<p class="note" style="margin-top:8px">Try: “I spent £12 on groceries today” or “Can I spend £20 on Friday?”</p>'
                f'<div class="actions"><button class="btn" style="flex:none">Edit sentence</button></div></div>')
    if kind == "loading":
        return (f'<div class="tabpanel" role="tabpanel" aria-busy="true"><p class="said">You asked <q>Can I spend £20 on dinner tomorrow?</q></p>'
                f'<p class="status" role="status">{icon("loader-circle")}Reading your change…</p>'
                f'<div class="skel" style="width:92%"></div><div class="skel" style="width:78%"></div><div class="skel" style="width:85%"></div>'
                f'<div class="skel" style="width:60%;height:40px;margin-top:20px"></div></div>')
    if kind == "deficit":
        rows = [("Tuition deposit", "Spent · Tue 10 Nov", "—", "£2,400.00"), ("Flexible a day", "Wed 11 Nov – Sun 31 Jan", "£25.73", "£0.00"),
                ("Planned savings", "Goal by 31 Jan", "£150.00", "£0.00"), ("Short for rent", "Fri 1 Jan · £620.00 due", "—", "£85.00"),
                ("Short for utilities", "Fri 15 Jan · £55.00 due", "—", "£55.00")]
        return (f'<div class="tabpanel" role="tabpanel"><p class="said">You said <q>I paid £2,400 for my tuition deposit today</q></p>'
                f'<div class="intent"><span class="tag ink">Expense</span><span class="what money">£2,400.00 · Education · Tue 10 Nov</span>{src_tag()}</div>'
                f'<p class="shortline">Recorded. You now need <span class="amt money">£140.00</span> more to pay rent on Fri 1 Jan (£85.00 short) and utilities on Fri 15 Jan (£55.00 short) while keeping your £500.00 reserve.</p>'
                f'{diff_table(rows)}'
                f'<div class="protect">{icon("pin")}<span><b>Not touched:</b> your £500.00 minimum reserve. Flexible spending is £0.00 a day until you add income or change the plan.</span></div>'
                f'<div class="actions"><button class="btn">{icon("plus")}Add income</button><button class="btn">Edit reserve</button></div>'
                f'<div class="actions" style="margin-top:8px"><button class="btn">{icon("undo-2")}Undo</button></div></div>')
    raise ValueError(kind)


OFFERS = [
    ("16-25 Railcard", "1/3 off most rail fares", "Transport", "Aged 16–25, or full-time student 26+", "£35.00 a year. £12 minimum fare Mon–Fri before 10am. Not for season tickets."),
    ("itsu", "15% off food", "Eating out", "Register the itsu app with a university email", "Food only. Scan the app barcode in store."),
    ("LEON", "15% off orders in app or kiosk", "Eating out", "Verified student (Student Beans)", "£6.00 minimum. Selected restaurants. Not on delivery apps."),
    ("Tesco Clubcard", "Clubcard Prices on selected groceries", "Groceries", "Anyone; free to join", "Scan the card or app at checkout."),
]


def offers_tab():
    rows = "".join(
        f'<div class="offer"><div class="top"><span class="nm">{n}</span><span class="tag sample">Sample</span></div><div class="deal">{deal}</div>'
        f'<dl><dt>Matches</dt><dd>{cat}</dd><dt>Eligibility</dt><dd>{el}</dd><dt>Conditions</dt><dd>{cond}</dd></dl>'
        f'<button class="btn sm">Use on a planned purchase</button></div>' for n, deal, cat, el, cond in OFFERS)
    return (f'<div class="tabpanel" role="tabpanel"><div class="listhead" style="margin-top:0"><h4>Sample offers</h4><span class="sum" style="font-weight:500">Checked 31 Oct 2026</span></div>{rows}</div>')


def plan_desktop(state, tab, tabhtml, text=None, busy=False, month=(2026, 11), selected=TODAY, preview_days=(), menu=None, cls="", badge=False, extra_body=""):
    acct = ""
    if menu == "account":
        acct = (f'<div class="menu" role="menu" aria-label="App menu" style="right:24px;top:52px;width:280px" data-reui="c-dropdown-menu-8">'
                f'<div class="lab">Demo</div>'
                f'<div class="mi" role="menuitemcheckbox" aria-checked="true">{icon("calendar-days")}Demo student<span class="switch" aria-hidden="true"></span></div>'
                f'<div class="mi" role="menuitem" aria-disabled="true" style="color:var(--muted)">{icon("info")}Demo date: Tue 10 Nov 2026</div>'
                f'<div class="sep"></div><div class="lab">App</div>'
                f'<div class="mi hi" role="menuitem" aria-haspopup="menu" aria-expanded="true">{icon("sun-moon")}Theme<span class="sub">{icon("chevron-right")}</span></div>'
                f'<div class="mi" role="menuitem">{icon("settings")}Settings</div>'
                f'<div class="mi" role="menuitem">{icon("download")}Export plan (JSON)</div>'
                f'<div class="sep"></div><div class="mi danger" role="menuitem">{icon("rotate-ccw")}Reset StudentPlan…</div></div>'
                f'<div class="menu" role="menu" aria-label="Theme" style="right:308px;top:196px;width:170px">'
                f'<div class="mi sel" role="menuitemradio" aria-checked="true"><span class="rd on"></span>Light</div>'
                f'<div class="mi" role="menuitemradio" aria-checked="false"><span class="rd"></span>Dark</div>'
                f'<div class="mi hi" role="menuitemradio" aria-checked="false"><span class="rd"></span>Match device</div></div>')
    y, mo = month
    body = (f'<div style="position:relative">{topbar("plan", True, menu == "account")}{acct}</div><main class="app {cls}"><div>{summary_html(state)}'
            f'{calendar(state, y, mo, selected, preview_days, month_menu=(menu == "month"))}</div>'
            f'<aside class="panel" aria-label="Changes">{composer(text, busy)}{tabs(tab, badge)}{tabhtml}</aside></main>{extra_body}')
    return body


# ---------------------------------------------------------------- mobile plan
def agenda(state, start=TODAY, end=D(2026, 11, 30), preview_days=()):
    out = []
    d = start
    wk = None
    while d <= end:
        ws = d - dt.timedelta(days=d.weekday())
        if ws != wk:
            we = ws + dt.timedelta(days=6)
            label = f"{ws.day} – {we.day} {we.strftime('%b')}" if ws.month == we.month else f"{ws.day} {ws.strftime('%b')} – {we.day} {we.strftime('%b')}"
            out.append(f'<div class="wk">{label}</div>')
            wk = ws
        m = day_model(state, d)
        chips = "".join(chip(i) for i in m["items"])
        short = f'<span class="short-mark" style="margin-top:6px">{icon("triangle-alert")}Short {gbp(m["short"])}</span>' if m["short"] else ""
        cls = "arow" + (" today" if d == TODAY else "") + (" preview" if d in preview_days else "")
        out.append(f'<div class="{cls}"><div class="adate"><div class="w">{d.strftime("%a")}</div><div class="d">{d.day}</div></div>'
                   f'<div class="abody">{cell_total(m, state)}<div class="chips">{chips}</div>{short}</div></div>')
        d += dt.timedelta(days=1)
    return f'<div class="agenda">{"".join(out)}</div>'


def dock():
    return (f'<div class="dock"><label class="sr" for="nlm">Tell me what changed</label><div class="input"><span class="field ph">Tell me what changed…</span>'
            f'<button class="send" aria-label="Send">{icon("arrow-up")}</button></div></div>')


def plan_mobile(state, month_label="November 2026", start=TODAY, end=D(2026, 11, 22), preview_days=()):
    return (f'<div class="m">{mhead()}{summary_html(state, True)}<div class="mmonth"><button class="month-trigger">{month_label}{icon("chevron-down")}</button><span class="spacer"></span>'
            f'<button class="icon-btn ghost" aria-label="Previous month">{icon("chevron-left")}</button><button class="icon-btn ghost" aria-label="Next month">{icon("chevron-right")}</button></div>'
            f'{agenda(state, start, end, preview_days)}{dock()}</div>')


def sheet_mobile(tab, tabhtml, text=None, busy=False, badge=False):
    return (f'<div class="m"><div class="scrim">{mhead()}</div><div class="scrim" style="height:0"></div>'
            f'<section class="sheet" role="dialog" aria-label="Plan changes"><div class="grab"></div>'
            f'<div class="sheethead"><span class="spacer"></span><button class="icon-btn ghost" aria-label="Close">{icon("x")}</button></div>'
            f'{composer(text, busy)}{tabs(tab, badge)}{tabhtml}</section></div>')


# ---------------------------------------------------------------- bubble script
BUBBLE_JS = """<script>
(() => {
  const RISE = 180, COUNT = 320, SETTLE = 260, STEP = 40, CAP = 400, CHIP_LAG = 60;
  const expo = p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
  const fmt = p => '£' + (p / 100).toFixed(2);
  const cells = [...document.querySelectorAll('.cal .cell, .agenda .arow')].filter(c => c.querySelector('[data-bubble]'));
  const els = [];
  cells.forEach((c, i) => {
    const delay = Math.min(i * STEP, CAP);
    c.querySelectorAll('[data-bubble]').forEach(el => els.push({ el, delay: delay + (el.dataset.bubble === 'chip' ? CHIP_LAG : 0) }));
  });
  function at(t) {
    for (const { el, delay } of els) {
      const l = t - delay; let lift = 0, sc = 1, ho = 0, hs = .8, k = 1;
      if (l <= 0) { k = 0; }
      else if (l < RISE) { const e = expo(l / RISE); lift = -2 * e; sc = 1 + .06 * e; ho = .55 * e; hs = .8 + .35 * e; k = 0; }
      else if (l < RISE + COUNT) { lift = -2; sc = 1.06; ho = .55; hs = 1.15; k = (l - RISE) / COUNT; }
      else if (l < RISE + COUNT + SETTLE) { const e = expo((l - RISE - COUNT) / SETTLE); lift = -2 * (1 - e); sc = 1 + .06 * (1 - e); ho = .55 * (1 - e); hs = 1.15; k = 1; }
      el.style.setProperty('--lift', lift + 'px'); el.style.setProperty('--sc', sc); el.style.setProperty('--halo-o', ho); el.style.setProperty('--halo-s', hs);
      if (el.dataset.from) { const a = el.querySelector('.a') || el; const v = Math.round(+el.dataset.from + (el.dataset.to - el.dataset.from) * k); a.textContent = fmt(v); }
    }
  }
  const m = location.hash.match(/t=(\\d+)/);
  window.__beforeReady = () => {
    if (location.hash.includes('reduced')) { document.body.classList.add('reduced'); return; }
    if (m) { at(+m[1]); return; }
    if (location.hash.includes('play')) { const t0 = performance.now(); const f = n => { at(n - t0); if (n - t0 < CAP + CHIP_LAG + RISE + COUNT + SETTLE + 50) requestAnimationFrame(f); }; requestAnimationFrame(f); }
  };
})();
</script>"""


# ---------------------------------------------------------------- onboarding
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


def ob_fields(slug, error=False):
    if slug == "funds":
        amt = ('<label class="f">Amount<span class="ctl invalid"><span class="u">£</span><span class="grow ph"></span></span>'
               f'<span class="msg" role="alert">{icon("triangle-alert")}Enter an amount above £0</span></label>') if error else \
              '<label class="f">Amount<span class="ctl"><span class="u">£</span><span class="grow">3,900.00</span></span></label>'
        return ('<div class="f">This money is<div class="seg" role="group"><button aria-pressed="true">A lump sum</button><button aria-pressed="false">A monthly allowance</button></div></div>' + amt)
    if slug == "last-until":
        return f'<label class="f">Last until<span class="ctl"><span class="grow">31 Jan 2027</span>{icon("calendar-days")}</span></label><p class="note" style="margin:0">83 days from Tue 10 Nov 2026</p>'
    if slug == "job":
        return ('<div class="f">Job<div class="seg" role="group"><button aria-pressed="false">Yes</button><button aria-pressed="true">No</button></div></div>')
    if slug == "other-income":
        return ('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label class="f">From<span class="ctl">Family transfer</span></label>'
                '<label class="f">Amount<span class="ctl"><span class="u">£</span>300.00</span></label>'
                f'<label class="f">Date<span class="ctl"><span class="grow">18 Dec 2026</span>{icon("calendar-days")}</span></label>'
                f'<div class="f">&nbsp;<span class="check" style="height:44px"><span class="box on">{icon("check")}</span>Confirmed</span></div></div>'
                f'<button class="btn quiet" style="align-self:flex-start">{icon("plus")}Add income</button>')
    if slug == "rent":
        r = lambda n, a, due, rec: (f'<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1.2fr;gap:8px"><label class="f">Name<span class="ctl">{n}</span></label>'
                                    f'<label class="f">Amount<span class="ctl"><span class="u">£</span>{a}</span></label><label class="f">Due<span class="ctl">{due}</span></label>'
                                    f'<div class="f">Repeats<button class="ctl" style="justify-content:space-between" aria-haspopup="menu"><span>{rec}</span>{icon("chevron-down")}</button></div></div>')
        return r("Rent", "620.00", "1st", "Monthly") + r("Utilities", "55.00", "15th", "Monthly") + f'<button class="btn quiet" style="align-self:flex-start">{icon("plus")}Add commitment</button>'
    if slug == "reserve":
        return '<label class="f">Minimum to keep<span class="ctl"><span class="u">£</span>500.00</span></label>'
    if slug == "savings":
        return ('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label class="f">Save by 31 Jan<span class="ctl"><span class="u">£</span>150.00</span></label>'
                '<label class="f">Savings now<span class="ctl"><span class="u">£</span>200.00</span></label>'
                '<label class="f">Investments now<span class="ctl"><span class="u">£</span>0.00</span></label></div>')
    if slug == "food-transport":
        return ('<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label class="f">Groceries a week<span class="ctl"><span class="u">£</span>63.00</span></label>'
                '<label class="f">Transport a week<span class="ctl"><span class="u">£</span>36.40</span></label>'
                '<label class="f">Eating out a week<span class="ctl"><span class="u">£</span>38.50</span></label>'
                '<label class="f">Shopping a week<span class="ctl"><span class="u">£</span>42.98</span></label></div>')
    if slug == "priorities":
        pr = ["Transport", "Groceries", "Eating out", "Shopping"]
        rows = "".join(f'<div class="row" style="border:1px solid var(--rule);border-radius:10px;padding:0 6px 0 12px;margin-bottom:6px"><b style="width:18px">{i + 1}</b><span class="name">{p}</span>'
                       f'<button class="icon-btn ghost" aria-label="Move {p} up">{icon("chevron-up")}</button></div>' for i, p in enumerate(pr))
        return (f'<div class="f">Protect first<div>{rows}</div></div>'
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><label class="f">City (optional)<span class="ctl">London</span></label>'
                '<label class="f">Diet (optional)<span class="ctl ph"><span class="ph">None</span></span></label></div>')
    return ""


def onboarding(slug, mobile=False, error=False):
    if slug == "welcome":
        inner = (f'<img class="sketch" src="../sketches/welcome.webp" alt="" width="640" height="480">'
                 f'<h1 class="title ob-title">Know what you can spend today.</h1>'
                 f'<div class="ob-actions"><button class="btn primary">Set up my plan</button><button class="btn">Try a demo student</button></div>')
        prog = ""
    else:
        idx = [s for s, _ in STEPS].index(slug)
        q = STEPS[idx][1]
        prog = (f'<div class="ob-prog"><span>{idx + 1} of {len(STEPS)}</span><div class="bar" role="progressbar" aria-valuemin="1" aria-valuemax="{len(STEPS)}" aria-valuenow="{idx + 1}">'
                f'<i style="width:{(idx + 1) / len(STEPS) * 100:.1f}%"></i></div></div>')
        inner = (f'<img class="sketch" src="../sketches/{slug}.webp" alt="" width="640" height="480"><h1 class="title ob-title">{q}</h1>'
                 f'<form class="ob-form" novalidate>{ob_fields(slug, error)}</form>'
                 f'<div class="ob-actions"><button class="btn">{icon("chevron-left")}Back</button><span style="flex:1"></span>'
                 f'<button class="btn primary">{"Create my plan" if slug == "priorities" else "Next"}</button></div>')
        if slug == "funds":
            inner += '<div class="ob-demo"><button class="btn quiet">Try a demo student</button></div>'
    head = (f'<header class="{"mhead" if mobile else "topbar"}"><a class="wordmark" href="#">StudentPlan</a></header>')
    return f'{head}<main class="ob{" mob" if mobile else ""}">{prog}{inner}</main>'


OB_CSS = """<style>
.ob { max-width: 600px; margin: 40px auto 64px; padding: 24px 40px 40px; display: flex; flex-direction: column; background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-panel); }
.ob.mob { margin: 0; border-radius: 0; box-shadow: none; padding: 16px 16px 32px; min-height: calc(100vh - 56px); }
.ob .sketch { width: 100%; max-width: 440px; height: auto; aspect-ratio: 4/3; align-self: center; margin: -8px 0 -24px; }
.ob .seg { align-self: flex-start; }
.ob.mob .sketch { max-width: 300px; margin: -12px 0 -20px; }
.ob-title { font-size: 30px; margin: 8px 0 24px; text-wrap: balance; }
.ob.mob .ob-title { font-size: 26px; margin-bottom: 20px; }
.ob-form { display: flex; flex-direction: column; gap: 16px; }
.ob-actions { display: flex; gap: 12px; margin-top: 32px; }
.ob.mob .ob-actions .btn { height: 48px; }
.ob-actions .btn.primary { min-width: 140px; }
.ob-prog { display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 700; color: var(--muted); }
.ob-prog .bar { flex: 1; height: 4px; background: var(--sunk); border-radius: 2px; overflow: hidden; }
.ob-prog .bar i { display: block; height: 100%; background: var(--ink); }
.ob-demo { margin-top: 16px; display: flex; justify-content: center; }
.empty-frame { width: 100%; max-width: 400px; aspect-ratio: 4/3; align-self: center; border: 2px dashed var(--deficit); display: grid; place-items: center; color: var(--deficit); font-weight: 700; }
</style>"""


def welcome_ctas_fix(h, mobile):
    if mobile:
        return h.replace('<div class="ob-actions">', '<div class="ob-actions" style="flex-direction:column">')
    return h


# ---------------------------------------------------------------- projections
def proj_values():
    def fv(p, c, a, n=12):
        b = p
        for _ in range(n):
            b = b * (1 + a / 100 / 12) + c
        return round(b * 100)

    def series(p, c, a, n=12):
        b, out = p, [p]
        for _ in range(n):
            b = b * (1 + a / 100 / 12) + c
            out.append(b)
        return out
    sav = [fv(200, 50, a) for a in (2, 3.5, 4.5)]
    inv = [fv(0, 20, a) for a in (0, 4, 7)]
    tot = [s + i for s, i in zip(sav, inv)]
    ser = [[s + i for s, i in zip(series(200, 50, a), series(0, 20, b))] for a, b in ((2, 0), (3.5, 4), (4.5, 7))]
    return sav, inv, tot, ser


def projections(empty=False, mobile=False):
    sav, inv, tot, ser = proj_values()
    seg = "".join(f'<button aria-pressed="{str(p == 12).lower()}">{p} months</button>' for p in (3, 6, 12, 24))

    def rate(lbl, v):
        if empty:
            return f'<label class="f">{lbl}<span class="ctl"><span class="grow"></span><span class="u">%</span></span></label>'
        return f'<label class="f">{lbl}<span class="ctl"><span class="grow">{v}</span><span class="u">%</span></span></label>'

    def money(lbl, v, ro=False):
        return f'<label class="f">{lbl}<span class="ctl{" ro" if ro else ""}"><span class="u">£</span><span class="grow">{v}</span></span></label>'
    g3 = 'style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"'
    g2 = 'style="display:grid;grid-template-columns:1fr 1fr;gap:8px"'
    form = (f'<section class="pgroup"><h2 class="h2">Savings</h2><div {g2}>{money("Savings now", "200.00")}{money("Add each month", "0.00" if empty else "50.00")}</div>'
            f'<div class="f" role="group">Interest a year<div {g3}>{rate("Low", "2.00")}{rate("Base", "3.50")}{rate("High", "4.50")}</div></div></section>'
            f'<section class="pgroup"><h2 class="h2">Investments</h2><div {g2}>{money("Value now", "0.00")}{money("Add each month", "0.00" if empty else "20.00")}</div>'
            f'<div class="f" role="group">Return a year<div {g3}>{rate("Low", "0.00")}{rate("Base", "4.00")}{rate("High", "7.00")}</div></div></section>'
            f'<section class="pgroup"><h2 class="h2">Income</h2><div {g2}>{money("Confirmed, 18 Dec", "300.00", True)}{money("Expected a month", "0.00" if empty else "250.00")}</div></section>')
    inc = 30000 + (0 if empty else 250 * 12 * 100)
    if empty:
        cell3 = lambda: '<td class="n" colspan="3"><span class="muted-cell">Enter rates to see this</span></td>'
        rows = (f'<tr><th scope="row">Savings</th>{cell3()}</tr><tr><th scope="row">Investments</th>{cell3()}</tr>'
                f'<tr class="tot"><th scope="row">Savings + investments</th>{cell3()}</tr>'
                f'<tr><th scope="row">Income received</th><td class="n" colspan="3">{gbp(inc)}</td></tr>')
    else:
        rows = (f'<tr><th scope="row">Savings</th>{"".join(f"<td class=n>{gbp(v)}</td>" for v in sav)}</tr>'
                f'<tr><th scope="row">Investments</th>{"".join(f"<td class=n>{gbp(v)}</td>" for v in inv)}</tr>'
                f'<tr class="tot"><th scope="row">Savings + investments</th>{"".join(f"<td class=n>{gbp(v)}</td>" for v in tot)}</tr>'
                f'<tr class="sub"><th scope="row">You put in</th><td class="n" colspan="3">£1,040.00</td></tr>'
                f'<tr class="sub"><th scope="row">Growth</th>{"".join(f"<td class=n>{gbp(v - 104000)}</td>" for v in tot)}</tr>'
                f'<tr><th scope="row">Income received</th><td class="n" colspan="3">{gbp(inc)}</td></tr>')
    table = (f'<table class="ptable"><caption class="sr">Projection after 12 months</caption><thead><tr><th></th><th class="n">Low</th><th class="n">Base</th><th class="n">High</th></tr></thead><tbody>{rows}</tbody></table>')
    chart = ""
    res = (f'<section class="pres"><div class="pres-head"><h2 class="h2" style="margin:0">After 12 months · 10 Nov 2027</h2></div>'
           f'<p class="disclaim">{icon("info")}Projection, not advice or a guarantee</p>{table}{chart}</section>')
    head = (f'<div class="phead"><h1 class="title">Projections</h1><div class="seg" role="group" aria-label="Period">{seg}</div></div>')
    if mobile:
        return f'<div class="m">{mhead("projections")}<main class="ppage mob">{head}{res}{form}</main></div>'
    return f'{topbar("projections")}<main class="ppage">{head}<div class="pgrid"><div class="pform">{form}</div>{res}</div></main>'


def chart_svg(ser, w, h):
    pad_l, pad_r, pad_t, pad_b = 52, 64, 12, 28
    lo, hi = 0, 1200
    X = lambda i: pad_l + (w - pad_l - pad_r) * i / 12
    Y = lambda v: pad_t + (h - pad_t - pad_b) * (1 - (v - lo) / (hi - lo))
    grid = "".join(f'<line x1="{pad_l}" x2="{w - pad_r}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="var(--sunk)"/><text x="{pad_l - 8}" y="{Y(v) + 4:.1f}" text-anchor="end" class="ax">£{v:,}</text>' for v in (0, 400, 800, 1200))
    months = ["Nov", "Feb", "May", "Aug", "Nov"]
    xt = "".join(f'<text x="{X(i * 3):.1f}" y="{h - 8}" text-anchor="middle" class="ax">{m}</text>' for i, m in enumerate(months))
    names = ["Low", "Base", "High"]
    styles = ['stroke="var(--planned)" stroke-dasharray="4 4"', 'stroke="var(--ink)" stroke-width="2.5"', 'stroke="var(--planned)" stroke-dasharray="1 4" stroke-linecap="round"']
    lines = ""
    ends = [Y(s[-1]) for s in ser]
    lab_y = [ends[0] + 14, ends[1] + 1, ends[2] - 12]
    for s, st, n, ly in zip(ser, styles, names, lab_y):
        pts = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(s))
        lines += f'<polyline fill="none" {st} stroke-width="2" points="{pts}"/>'
        lines += f'<text x="{w - pad_r + 6}" y="{ly + 4:.1f}" class="lab{" b" if n == "Base" else ""}">{n}</text>'
    return (f'<figure class="pchart"><svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="Savings plus investments by month: low, base and high projections">{grid}{xt}{lines}</svg>'
            f'<figcaption class="sr">Savings plus investments by month</figcaption></figure>')


PROJ_CSS = """<style>
.ppage { max-width: 1160px; margin: 0 auto; padding: 32px 24px 64px; }
.ppage.mob { padding: 20px 16px 48px; }
.phead { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
.ppage.mob .phead { gap: 16px; }
.ppage.mob .seg button { padding: 0 10px; font-size: 14px; }
.pgrid { display: grid; grid-template-columns: 420px minmax(0, 1fr); gap: 32px; align-items: start; }
.pgroup { background: var(--surface); border: 1px solid var(--rule); border-radius: 14px; padding: 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 12px; }
.pgroup .h2 { margin: 0 0 4px; }
.pres { background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-panel); padding: 24px; margin-bottom: 16px; }
.disclaim { display: flex; gap: 8px; align-items: center; font-size: 14px; font-weight: 700; color: var(--hl-line); margin: 8px 0 16px; }
.ptable { width: 100%; border-collapse: collapse; font-size: 16px; }
.ptable th, .ptable td { padding: 12px 0; border-bottom: 1px solid var(--sunk); text-align: left; }
.ptable thead th { font-size: 13px; color: var(--muted); font-weight: 500; border-bottom: 1px solid var(--rule); padding: 6px 0; }
.ptable th[scope=row] { font-weight: 500; }
.ptable .n { text-align: right; padding-left: 12px; font-weight: 700; white-space: nowrap; }
.ptable tr.tot th, .ptable tr.tot td { font-weight: 700; border-bottom: 1px solid var(--rule); }
.ptable td[colspan] { text-align: right; }
.ptable tr.sub th, .ptable tr.sub td { color: var(--muted); font-weight: 500; }
.ptable tr.sub td.n { font-weight: 700; }
.muted-cell { color: var(--muted); font-weight: 500; }
.pchart { margin: 20px 0 0; }
.pchart svg { display: block; max-width: 100%; height: auto; }
.pchart .ax { font-size: 12px; fill: var(--muted); font-family: var(--font); }
.pchart .lab { font-size: 13px; fill: var(--planned); font-weight: 700; font-family: var(--font); }
.pchart .lab.b { fill: var(--ink); }
.ppage.mob .pres { padding: 16px; }
.ppage.mob .ptable { font-size: 14px; }
.ppage.mob .pgroup { padding: 16px; }
</style>"""


# ---------------------------------------------------------------- settings
def settings(mobile=False, recurrence_menu=False, dialog=False):
    def money(lbl, v):
        return f'<label class="f">{lbl}<span class="ctl"><span class="u">£</span><span class="grow">{v}</span></span></label>'

    def field(lbl, v, ic=None):
        return f'<label class="f">{lbl}<span class="ctl"><span class="grow">{v}</span>{icon(ic) if ic else ""}</span></label>'
    cols = "1fr" if mobile else "1fr 1fr"
    g = f'style="display:grid;grid-template-columns:{cols};gap:12px"'
    rec_menu = ""
    if recurrence_menu:
        opts = ["Once", "Weekly", "Every 2 weeks", "Monthly", "Every 3 months"]
        items = "".join(f'<div class="mi{" sel" if o == "Monthly" else ""}{" hi" if o == "Every 2 weeks" else ""}" role="menuitemradio" aria-checked="{str(o == "Monthly").lower()}">{o}'
                        f'{"<span class=chk>" + icon("check") + "</span>" if o == "Monthly" else ""}</div>' for o in opts)
        rec_menu = f'<div class="menu" role="menu" aria-label="Repeats" style="right:0;top:76px;width:200px" data-reui="c-dropdown-menu-1">{items}</div>'

    def crow(n, a, due, rec, locked, menu=""):
        lk = f'<span class="check"><span class="box{" on" if locked else ""}">{icon("check") if locked else ""}</span>Locked</span>'
        if mobile:
            return (f'<div class="crow"><div {g}>{field("Name", n)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">{money("Amount", a)}{field("Due", due)}</div>'
                    f'<div class="f" style="position:relative">Repeats<button class="ctl" style="justify-content:space-between" aria-haspopup="menu"><span>{rec}</span>{icon("chevron-down")}</button>{menu}</div>{lk}</div></div>')
        return (f'<div class="crow" style="display:grid;grid-template-columns:1.4fr 1fr .8fr 1.3fr auto 36px;gap:12px;align-items:end">{field("Name", n)}{money("Amount", a)}{field("Due", due)}'
                f'<div class="f" style="position:relative">Repeats<button class="ctl" style="justify-content:space-between" aria-haspopup="menu" aria-expanded="{str(bool(menu)).lower()}"><span>{rec}</span>{icon("chevron-down")}</button>{menu}</div>'
                f'<span style="height:44px;display:flex;align-items:center">{lk}</span><button class="icon-btn ghost" style="margin-bottom:4px" aria-label="Delete {n}">{icon("trash-2")}</button></div>')
    save = '<div class="sfoot"><button class="btn primary" disabled>Save changes</button></div>'
    secs = [
        ("money", "Money", f'<div class="f">This money is<div class="seg" role="group"><button aria-pressed="true">A lump sum</button><button aria-pressed="false">A monthly allowance</button></div></div>'
                           f'<div {g}>{money("Amount at plan start", "3,900.00")}{field("Last until", "31 Jan 2027", "calendar-days")}</div>'),
        ("income", "Income", f'<div class="f">Job<div class="seg" role="group"><button aria-pressed="false">Yes</button><button aria-pressed="true">No</button></div></div>'
                             f'<div class="crow" style="display:grid;grid-template-columns:{"1fr 1fr" if mobile else "1.4fr 1fr 1.2fr auto"};gap:12px;align-items:end">{field("From", "Family transfer")}{money("Amount", "300.00")}{field("Date", "18 Dec 2026", "calendar-days")}'
                             f'<span style="height:44px;display:flex;align-items:center" class="check"><span class="box on">{icon("check")}</span>Confirmed</span></div>'
                             f'<button class="btn quiet" style="align-self:flex-start">{icon("plus")}Add income</button>'),
        ("commitments", "Rent and commitments", crow("Rent", "620.00", "1st", "Monthly", True, rec_menu) + crow("Utilities", "55.00", "15th", "Monthly", False)
         + f'<button class="btn quiet" style="align-self:flex-start">{icon("plus")}Add commitment</button>'),
        ("reserve", "Reserve and savings", f'<div {g}>{money("Minimum reserve", "500.00")}{money("Savings goal by 31 Jan", "150.00")}{money("Savings now", "200.00")}{money("Investments now", "0.00")}</div>'),
        ("spending", "Food and transport", f'<div {g}>{money("Groceries a week", "63.00")}{money("Transport a week", "36.40")}{money("Eating out a week", "38.50")}{money("Shopping a week", "42.98")}</div>'
                                         '<div class="f">Protect first<div class="prio">' + "".join(f'<span class="tag">{i + 1} · {p}</span>' for i, p in enumerate(["Transport", "Groceries", "Eating out", "Shopping"])) + '</div></div>'),
        ("optional", "Optional", f'<div {g}>{field("City or area", "London")}{field("Diet", "None")}</div>'
                                 f'<div class="f">Discount memberships<div class="prio"><span class="tag">16-25 Railcard</span><span class="tag">Student Beans</span></div></div>'),
    ]
    sec_html = "".join(f'<section class="ssec" id="{k}" aria-labelledby="h-{k}"><h2 class="h2" id="h-{k}">{t}</h2>{b}{save}</section>' for k, t, b in secs)
    sec_html += (f'<section class="ssec danger" aria-labelledby="h-reset"><h2 class="h2" id="h-reset">Reset</h2>'
                 f'<div class="resetrow"><span>Deletes your plan, ledger and settings on this device.</span><button class="btn danger">{icon("rotate-ccw")}Reset StudentPlan</button></div></section>')
    side = "" if mobile else ('<nav class="snav" aria-label="Settings sections">' + "".join(f'<a href="#{k}"{" aria-current=true" if k == "money" else ""}>{t}</a>' for k, t, _ in secs) + '<a href="#reset">Reset</a></nav>')
    dlg = ""
    if dialog:
        dlg = (f'<div class="dscrim"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dt" aria-describedby="dd"><h2 id="dt" class="h2" style="margin-bottom:8px">Reset StudentPlan?</h2>'
               f'<p id="dd" style="margin:0 0 20px">This deletes your plan, ledger and settings from this device. It can’t be undone.</p>'
               f'<div class="actions" style="justify-content:flex-end"><button class="btn" style="flex:none">Cancel</button><button class="btn danger" style="flex:none">Delete everything</button></div></div></div>')
    if mobile:
        return f'<div class="m">{mhead("settings")}<main class="spage mob"><h1 class="title">Settings</h1>{sec_html}</main>{dlg}</div>'
    return f'{topbar("settings")}<main class="spage"><h1 class="title">Settings</h1><div class="sgrid">{side}<div>{sec_html}</div></div></main>{dlg}'


SET_CSS = """<style>
.spage { max-width: 1040px; margin: 0 auto; padding: 32px 24px 64px; }
.spage.mob { padding: 20px 16px 48px; }
.spage .title { margin-bottom: 24px; }
.sgrid { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 40px; align-items: start; }
.snav { position: sticky; top: 24px; display: flex; flex-direction: column; }
.snav a { height: 40px; display: flex; align-items: center; padding: 0 12px; border-radius: 10px; color: var(--muted); text-decoration: none; font-weight: 500; }
.snav a[aria-current] { background: var(--surface); color: var(--text); font-weight: 700; box-shadow: inset 0 0 0 1px var(--rule); }
.ssec { background: var(--surface); border: 1px solid var(--rule); border-radius: 14px; padding: 24px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 16px; }
.spage.mob .ssec { padding: 16px; }
.ssec .h2 { margin: 0; }
.sfoot { display: flex; justify-content: flex-end; border-top: 1px solid var(--sunk); padding-top: 16px; }
.crow { padding-bottom: 12px; border-bottom: 1px solid var(--sunk); }
.spage.mob .crow > div { display: flex; flex-direction: column; gap: 12px; }
.prio { display: flex; gap: 8px; flex-wrap: wrap; }
.prio .tag { height: 32px; font-size: 14px; padding: 0 12px; background: var(--sunk); color: var(--text); }
.ssec.danger { border-color: var(--deficit); }
.resetrow { display: flex; align-items: center; gap: 16px; justify-content: space-between; flex-wrap: wrap; }
.dscrim { position: fixed; inset: 0; background: rgb(29 33 37 / .45); display: grid; place-items: center; z-index: 60; padding: 16px; }
.dialog { background: var(--surface); border-radius: 14px; box-shadow: var(--shadow-menu); padding: 24px; width: 100%; max-width: 440px; }
</style>"""


# ---------------------------------------------------------------- write all
def write(name, title, body, width=None, head=""):
    with open(os.path.join(HERE, name + ".html"), "w") as f:
        f.write(page(title, body, extra_head=head, width=width))


def main():
    sk_dir = os.path.join(HERE, "..", "sketches")
    have_sketches = all(os.path.exists(os.path.join(sk_dir, s + ".webp")) for s in ["welcome"] + [s for s, _ in STEPS])

    def ob(slug, mobile=False, error=False):
        h = onboarding(slug, mobile, error)
        if not have_sketches:
            h = re.sub(r'<img class="sketch"[^>]*>', '<div class="empty-frame">Sketch missing</div>', h)
        return welcome_ctas_fix(h, mobile and slug == "welcome")

    # onboarding
    write("onboarding-desktop", "StudentPlan · Onboarding", ob("funds"), head=OB_CSS)
    write("onboarding-mobile", "StudentPlan · Onboarding", ob("funds", True), head=OB_CSS)
    write("onboarding-error-desktop", "StudentPlan · Onboarding error", ob("funds", False, True), head=OB_CSS)
    write("onboarding-error-mobile", "StudentPlan · Onboarding error", ob("funds", True, True), head=OB_CSS)
    write("onboarding-welcome-desktop", "StudentPlan · Welcome", ob("welcome"), head=OB_CSS)
    write("onboarding-welcome-mobile", "StudentPlan · Welcome", ob("welcome", True), head=OB_CSS)
    for slug, _ in STEPS[1:]:
        write(f"onboarding-step-{slug}", f"StudentPlan · {slug}", ob(slug), head=OB_CSS)

    # plan
    write("plan-desktop", "StudentPlan · Plan", plan_desktop("initial", "day", day_tab("initial", TODAY)))
    write("plan-mobile", "StudentPlan · Plan", plan_mobile("initial"))
    write("plan-account-menu", "StudentPlan · App menu", plan_desktop("initial", "day", day_tab("initial", TODAY), menu="account"))
    write("plan-month-menu", "StudentPlan · Month menu", plan_desktop("initial", "day", day_tab("initial", TODAY), menu="month"))
    write("plan-loading", "StudentPlan · Reading", plan_desktop("s1", "change", change_tab("loading"), text="Can I spend £20 on dinner tomorrow?", busy=True))
    write("plan-deficit-desktop", "StudentPlan · Deficit", plan_desktop("deficit", "change", change_tab("deficit"), month=(2027, 1), selected=None))
    write("plan-deficit-mobile", "StudentPlan · Deficit", plan_mobile("deficit", "January 2027", D(2026, 12, 28), D(2027, 1, 17)))

    # day
    write("plan-day-desktop", "StudentPlan · Day", plan_desktop("s1", "day", day_tab("s1", TODAY)))
    write("plan-day-mobile", "StudentPlan · Day", sheet_mobile("day", day_tab("s1", TODAY)))
    write("plan-day-item-menu", "StudentPlan · Day item menu", plan_desktop("s1", "day", day_tab("s1", D(2026, 11, 11), item_menu=True), selected=D(2026, 11, 11)))
    write("plan-day-category", "StudentPlan · Record expense", plan_desktop("initial", "day", day_tab("initial", TODAY, add_form=True)))

    # change
    write("plan-change-desktop", "StudentPlan · Change", plan_desktop("s1", "change", change_tab("s1")))
    write("plan-change-mobile", "StudentPlan · Change", sheet_mobile("change", change_tab("s1")))
    write("plan-change-bubble", "StudentPlan · Bubble frame", plan_desktop("bubble", "change", change_tab("s1")) + BUBBLE_JS)
    write("plan-change-bubble-mobile", "StudentPlan · Bubble frame", plan_mobile("bubble") + BUBBLE_JS)
    write("plan-change-preview-desktop", "StudentPlan · Preview", plan_desktop("dinner", "change", change_tab("dinner"), preview_days=(D(2026, 11, 11),), selected=D(2026, 11, 11)))
    write("plan-change-preview-mobile", "StudentPlan · Preview", sheet_mobile("change", change_tab("dinner")))
    cdays = tuple([D(2026, 11, 14)] + [D(2026, 11, 15) + dt.timedelta(days=i) for i in range(14)])
    write("plan-change-tradeoff-desktop", "StudentPlan · Trade-off", plan_desktop("concert", "change", change_tab("concert"), preview_days=(D(2026, 11, 14),), selected=D(2026, 11, 14)))
    write("plan-change-tradeoff-mobile", "StudentPlan · Trade-off", sheet_mobile("change", change_tab("concert")))
    write("plan-change-clarify", "StudentPlan · Clarification", plan_desktop("s1", "change", change_tab("clarify")))
    write("plan-change-fail", "StudentPlan · Not understood", plan_desktop("s1", "change", change_tab("fail")))

    # offers
    write("plan-offers-desktop", "StudentPlan · Offers", plan_desktop("s1", "offers", offers_tab()))
    write("plan-offers-mobile", "StudentPlan · Offers", sheet_mobile("offers", offers_tab()))

    # projections / settings
    write("projections-desktop", "StudentPlan · Projections", projections(), head=PROJ_CSS)
    write("projections-mobile", "StudentPlan · Projections", projections(mobile=True), head=PROJ_CSS)
    write("projections-empty-desktop", "StudentPlan · Projections empty", projections(empty=True), head=PROJ_CSS)
    write("projections-empty-mobile", "StudentPlan · Projections empty", projections(empty=True, mobile=True), head=PROJ_CSS)
    write("settings-desktop", "StudentPlan · Settings", settings(), head=SET_CSS)
    write("settings-mobile", "StudentPlan · Settings", settings(mobile=True), head=SET_CSS)
    write("settings-recurrence-menu", "StudentPlan · Repeats menu", settings(recurrence_menu=True), head=SET_CSS)
    write("settings-reset-dialog", "StudentPlan · Reset", settings(dialog=True), head=SET_CSS)
    write("settings-reset-dialog-mobile", "StudentPlan · Reset", settings(mobile=True, dialog=True), head=SET_CSS)
    print("sketches:", "present" if have_sketches else "MISSING")


if __name__ == "__main__":
    main()
