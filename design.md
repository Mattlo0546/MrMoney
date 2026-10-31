# StudentPlan — design direction

> **Status:** mockups v1 are ready for review and await approval. The binding contract is `.prd-to-production/design/spec.md`, with the manifest in `design/screens.json` and the gallery in `design/index.md`. This page is the short version; if they differ, spec.md wins.

## 1. Direction: "Pencil for plans, ink for what happened"

StudentPlan looks like a paper planner. Plans are written in **graphite**: dashed outlines and grey figures that can still change. What actually happened is written in **ink**: solid blue fill and settled. Fixed commitments are **pinned**, with a solid outline and a pin icon. Changes get swiped with a **highlighter**, and shortfalls are marked in **red pencil**. Students budgeting a fixed sum, often in a second language, can see at a glance what is spent and what is only intended, without needing a legend. The calendar is the centre of the app and stays crisp: precise rules, tabular figures and no texture. The only illustrations are the onboarding pencil sketches.

## 2. Tokens (summary)

**Type** (Google Fonts via `next/font`; loading verified in every render)
- **Atkinson Hyperlegible Next** 400/500/700 for UI, body and money, always with `tabular-nums` (verified). Its slashed zero has no alternate and is kept on purpose for legibility.
- **Bricolage Grotesque** 600/700, only for screen titles, onboarding questions and the month name.
- Scale: body 16; chips 12; cell totals 16/700; agenda totals 20/700; summary 20/700; titles 32; month name 26.

**Colour** (light; dark values are in the spec)
- Neutrals: bg #F3F4F1, surface #FFFFFF, sunk #ECEEEA, text #1D2125, muted #545B63.
- Planned (graphite) #5B6168, with dashes in #7D848C.
- Actual (ink) #1F4E9C.
- Commitment #3D4752.
- Highlighter #FFE45C, with #8A6A00 for preview outlines, the demo tag and the disclaimer.
- Deficit #B42318 on #FCE8E6.
- Income #2E7D4F.
- Rules #C9CEC8.

All text meets 4.5:1. Colour is never the only signal: each role also has a line style, an icon or a word.

**Space and shape**
- Spacing: 4/8/12/16/24/32/48/64.
- Radii: chips 6, buttons and inputs 10, menus 12, panels and cards 14. The segmented control is the only pill.
- One elevation per element: panel, sheet or menu shadow, or a 1px border.
- Targets: at least 32px on desktop and 44px on mobile. Focus is a 2px ink ring. Pressed states change colour, never scale.

## 3. Layout

- **Desktop (≥1024):** a 56px top bar (wordmark, Plan · Projections · Settings, the demo tag "Demo · Tue 10 Nov 2026", app menu). Below it, a six-figure summary strip, then the month grid with a 400px sticky right panel. The panel holds the "Tell me what changed…" input above the Day / Change / Offers tabs.
- **Tablet (768–1023):** the full-width grid, plus the mobile dock and sheet.
- **Mobile (<768):** a header and a three-tab nav, the summary as a 2×3 grid, and a stacked agenda grouped by week. A docked bottom input bar opens a bottom sheet with the same tabs. This is a deliberate reflow, not a shrunken desktop.
- **Onboarding:** a 600px paper card. Each step has a progress bar ("1 of 9"), a sketch, one question, its fields and Back / Next. Welcome offers "Set up my plan" and "Try a demo student".
- **Projections:** a period segment (3/6/12/24 months), the assumptions (rates start empty) and a Low / Base / High table labelled "Projection, not advice or a guarantee". There is no chart: at realistic rates the scenarios differ by about £20, so "You put in" and "Growth" rows say it more honestly.
- **Settings:** section cards with a sticky section nav. Reset is in its own red-bordered card and asks for confirmation in an alert dialog.

## 4. Day cell

1. **Head row:** the date numeral on the left (today gets an ink ring) and the **day total** on the right. A planned total is graphite with a dashed underline. Once something is spent, the total is in ink, with "of £25.84" underneath.
2. **Chips:** up to 4 rows; beyond that, 3 chips plus "+2 £11.53". The order is commitments, income, actuals, previews, then Groceries / Transport / Eating out / Shopping. Planned chips are dashed, actual chips are ink-filled, commitment chips are outlined with a pin, and preview chips are dashed in highlighter.
3. **Shortfalls** show as a red-pencil "Short £85.00", never just a tint.

States: before the plan, outside the horizon, other month, today, selected, preview, hover, focus and changed.

## 5. Bubble motion

Only items whose values changed in the engine diff move.
- **Rise** (180ms, expo-out): the item lifts `translateY(−2px) scale(1.06)` while a highlighter halo grows behind it.
- **Count** (320ms, linear): the number counts from the old value to the new one.
- **Settle** (260ms): the item returns to rest and the halo fades.

Visible cells are staggered by `min(i×40, 400)`ms, with chips 60ms after their cell. Only transform and opacity change, so layout never shifts. Under reduced motion, the change shows as an instant highlighter fill plus a 2px #8A6A00 ring, held for 1200ms and faded over 600ms.

## 6. Demo numbers

| Fixture | Value |
|---|---|
| Demo date and horizon | Tue 10 Nov 2026, until 31 Jan 2027 (83 days) |
| Starting money | £3,900 |
| Income | £300 on 18 Dec |
| Commitments | rent £620 on the 1st; utilities £55 on the 15th; £1,405 in total |
| Reserve and savings goal | £500 reserve; £150 savings goal |
| Flexible budget | £2,145, which is **£25.84 a day**: groceries £9.00, transport £5.20, eating out £5.50, shopping £6.14 |

How the demo steps play out:
- **£35 shower filter:** £9.16 over today's plan, taken from shopping (−11p a day). The daily allowance becomes £25.73.
- **£20 dinner tomorrow:** fits.
- **£60 concert on Saturday:** £34.27 short, with three trade-off options.
- **£200 income:** adds £2.43–£2.44 a day.

Every figure is worked out in spec §7.

## 7. Copy rules

- No subtitles, blurbs, greetings, promos or explanatory captions.
- Keep labels, units, data, errors, the demo and sample labels, the parser label ("Read by Gemini" / "Demo parsing") and the projection disclaimer.
- The tone is plain and supportive, e.g. "Sat 14 Nov has £25.73, so a £60.00 ticket is £34.27 more than the day allows."
- Buttons name their action: "Apply change", "Undo", "Record expense".
- Errors name the problem and the fix: "Enter an amount above £0".
- Amounts look like "£25.84"; dates look like "Fri 14 Nov".

## 8. Dropdown families (ReUI, required)

| Family | Composition |
|---|---|
| Month jump, category picker, recurrence, spent-item actions | Basic: `@reui/c-dropdown-menu-1` (radio items) |
| Planned-item actions (Edit amount, Move to ▸ dates, Set to £0.00) | Submenu: `@reui/c-dropdown-menu-5` |
| App menu (demo switch, Theme ▸, Settings, Export, Reset…) | Complex: `@reui/c-dropdown-menu-8` |

Category and recurrence need select semantics. If `c-dropdown-menu-1` cannot provide them, raise the conflict rather than substitute another component.

## 9. Onboarding sketches

There are ten real raster sketches, one each for welcome, funds, last-until, job, other-income, rent, reserve, savings, food-transport and priorities. They live in `design/sketches/` as WebP with a PNG fallback: transparent, 1280×960, graphite with one ochre accent, generated with `gemini-nano-banana-2.1`, and shown with `alt=""`.
