# StudentPlan — visual contract (design revision v1)

Derived from root `design.md` ("Pencil for plans, ink for what happened") and approved brief v2. This file, `screens.json` and `prototypes/` form the contract. Prototypes are static design artifacts, not production code. Where the pixels and this text disagree, this text wins.

- Inventory: P-onboarding, P-plan, P-plan-day, P-plan-change, P-plan-offers, P-projections, P-settings (`screens.json`, 47 images).
- Capture: desktop 1440×1000, mobile 390×844, DPR 1, full page, light theme, Chromium 156 (Playwright 1248). The ready selector is `html[data-ready="1"]`, set after `document.fonts.check()` passes for both families and all images have loaded. The renderer fails loudly if fonts are missing.
- Rebuild: `python3 prototypes/build.py <lucide-static/icons>` then `PW=<playwright> node prototypes/render.mjs`, then `python3 prototypes/contact_sheet.py`.

## 1. Direction

This is a paper planner. **Planned money is graphite**: dashed outlines, grey ink, revisable. **What happened is ink**: solid `--ink` fill or ink text. **Fixed commitments are pinned**: a 1.5px solid outline, sunk fill and a pin icon. **Changes are highlighted** with a yellow highlighter. **Shortfalls are red pencil**. The calendar is the visual centre and stays crisp, with no texture. The only illustration is in onboarding: real graphite sketches with one ochre accent. Colour is never the only signal; every role also has a line style, an icon or a word.

## 2. Assets

| Asset | Source | Notes |
|---|---|---|
| UI, body and numbers | **Atkinson Hyperlegible Next** 400/500/700, Google Fonts | Verified loading in every render. `tnum` is verified: tabular figures are the same width (`111` = `888`). Its zero is **slashed** with no alternate (ss01–05, salt and cv01–03 tested). This is kept on purpose for legibility (0 vs O) for second-language readers. Fallback: `"Public Sans", system-ui, sans-serif`. |
| Headings | **Bricolage Grotesque** 600/700 (opsz 12–96), Google Fonts | Used only for screen titles, the onboarding question and the month name. Verified loading. |
| Loading | `next/font/google`, `display: swap`, subsets `latin`, weights as above | No substitutions were needed. |
| Icons | **Lucide** (`lucide-react`, matching `lucide-static@0.460.0`), 16px, stroke 2 | pin, chevron-left/right/down/up, arrow-up, ellipsis, undo-2, check, plus, minus, x, triangle-alert, loader-circle, calendar-days, calendar-arrow-down, sun-moon, download, rotate-ccw, settings, pencil, trash-2, info. No emoji or glyph icons. |
| Onboarding sketches | `design/sketches/<slug>.webp` (PNG fallback), 1280×960, transparent, made by the creative agent (`gemini-nano-banana-2.1`) | Slugs: welcome, funds, last-until, job, other-income, rent, reserve, savings, food-transport, priorities. `alt=""`, `aria-hidden`. Ship the files unchanged. |

## 3. Tokens

### Colour (light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #F3F4F1 | #15181B | page ground |
| `--surface` | #FFFFFF | #1D2125 | cells, panel, sheet, cards |
| `--sunk` | #ECEEEA | #121417 | days before the plan, read-only fields, hover, commitment chip fill |
| `--text` | #1D2125 | #E8EAE6 | primary text (16.2:1) |
| `--muted` | #545B63 | #A3AAB1 | labels, secondary data (6.9:1) |
| `--planned` | #5B6168 | #A3AAB1 | planned amounts and labels (6.3:1) |
| `--ink` | #1F4E9C | #8FB3F0 | actuals, primary buttons, today ring, focus (8.0:1) |
| `--on-ink` | #FFFFFF | #15181B | text on ink |
| `--commit` | #3D4752 | #B8C0C8 | commitment outline and text (9.5:1) |
| `--hl` | #FFE45C | #E8C547 | highlighter fill behind changed items (text on it ≥12.7:1) |
| `--hl-line` | #8A6A00 | #E8C547 | preview outline, demo tag, disclaimer text (5.1:1 on white) |
| `--deficit` / `--deficit-bg` | #B42318 / #FCE8E6 | #F28B82 / #3A1F1D | shortfall text and fill (5.6:1) |
| `--income` | #2E7D4F | #7CC79A | income amounts (5.1:1) |
| `--rule` | #C9CEC8 | #4A525A | grid lines and dividers (decorative) |
| `--control` | #7D848C | #8A939B | control borders and planned-chip dashes (≥3:1 non-text) |

Text selection uses `--hl` with #1D2125 text. The caret is `--ink`. Focus is a 2px `--ink` outline with a 2px offset on every control. Theme: light by default; dark when the device or the menu says so (`data-theme` overrides).

### Type (px, weight)
- Body 16/400, line-height 1.5. Labels 13–14/500 or 700. Chips 12/500 (amount 700). Agenda chips 13.
- Summary values 20/700 (18 on mobile). Day panel figures 18/700. Cell totals 16/700. Agenda totals 20/700.
- Screen title: Bricolage 32/700. Onboarding question: 30 (26 on mobile). Month name: Bricolage 26/700 (22 on mobile). Tracking −0.02em on display text only.
- Every number uses `font-variant-numeric: tabular-nums`. Money is always `£1,234.56`, with a minus sign `−` for reductions. Dates are UK style: `Tue 10 Nov`, plus the year when it's outside 2026 context (`31 Jan 2027`).

### Space, shape and depth
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. Within a group ≤12; between groups ≥24. Page gutter is 24 on desktop and 16 on mobile.
- Radii: chips 6; menu items 8; buttons and inputs 10; menus and agenda rows 12; panel, sheet, cards, calendar and summary 14; segmented control 22 (the only pill).
- Borders: 1px rules. Commitment chip 1.5px solid. Planned chip 1px dashed `--control`. Selected cell: 2px inset `--ink`. Preview cell: 2px inset `--hl-line`.
- Elevation (one per element): panel `0 1px 2px rgb(0 0 0/.06), 0 8px 24px rgb(0 0 0/.06)`; sheet and dock `0 -8px 32px rgb(0 0 0/.12)`; menus and dialogs `0 2px 4px rgb(0 0 0/.08), 0 12px 32px rgb(0 0 0/.14)`. Cells and form cards are flat with a 1px `--rule` border.
- Targets: desktop controls ≥32px high (buttons 40, small buttons 32, icon buttons 36, steppers 32). Mobile controls ≥44×44 (buttons 48, icon buttons 44, steppers 44, tabs 48, choice buttons 44). Pressed state is a colour change only (primary goes to `--ink-strong` #183F80; secondary goes to `--sunk`), never a scale. Disabled is `--sunk` fill, `--muted` text and `cursor: not-allowed`, with `aria-disabled` kept on focusable controls.

## 4. Shell and breakpoints

| Range | Layout |
|---|---|
| ≥1024 (desktop) | A 56px top bar holds the wordmark (Bricolage 20/700), the nav (Plan · Projections · Settings, with a 2px ink underline on the active item), the demo tag and the app menu button (36). Below it, `/plan` is a grid `minmax(0,1fr) 400px`, gap 24, padding 24. The panel is sticky at top 24. |
| 768–1023 (tablet) | Same top bar. The month grid is full width, cells are ≥104px tall and show at most 3 chips plus overflow. The change input is the mobile docked bar, which opens the same sheet (max-width 560, centred). |
| <768 (mobile) | A 56px header (wordmark, demo tag "Demo · 10 Nov", 44px menu button), then a 44px nav row with three equal tabs. `/plan` shows the summary 2×3, the month bar and a stacked agenda. A **docked bottom input bar** (sticky, 52px pill input plus a 44px send button, padding 10/12/22) opens a **bottom sheet** (radius 14 at the top, a 36×4 grabber, a 44px close button, the input, then the Day/Change/Offers tabs). The page behind is dimmed with a `rgb(29 33 37/.45)` scrim. |

Demo tag: 28px high, 1px `--hl-line` border and text, a 6px dot, the text "Demo · Tue 10 Nov 2026". It is shown on every screen while demo mode is on (R-demo).

## 5. Components

### Summary strip (R-summary)
Six equal figures in a 14-radius bordered strip, at least 72px high, with 1px dividers. Each figure has a label (13/500 muted) and a value (20/700), with an optional data line (12/500). Labels in order: **Funds left**, **For commitments**, **Minimum reserve**, **Planned savings**, **Flexible left**, **Today**. Data lines: under Funds left, "+£300.00 on 18 Dec" in `--income`; under Today, "£35.00 spent" once any actual exists today. The Today value is ink. In a deficit, the Flexible left figure moves to the end with a `--deficit-bg` fill, a `--deficit` value and the line "£140.00 short", and Planned savings adds "of £150.00 goal". There are no charts or rings.

### Month bar
From left to right: the month trigger (Bricolage 26, chevron-down 20; opens the month menu, see §8); previous and next icon buttons (ghost 36; mobile 44); a "Today" small button; spacer; the key: "Planned" (dashed swatch), "Spent" (ink swatch), "Fixed" (pinned swatch), 13/500 muted. The key is a functional legend, not a caption.

### Day cell (desktop month grid; R-calendar)
The grid is 7 columns (Mon–Sun) with 1px `--rule` gaps, 32px weekday headers (13/700 muted) and cells at least 128px tall with 8px padding and a 6px gap.
1. **Head row** (min 26): the date numeral (14/500 in a 26px circle; today gets a 2px inset ink ring, ink 700) on the left. The **day total** is on the right: 16/700. A planned total is graphite with a 1px dashed underline offset 4. Once actuals exist, the total is ink with no underline, with "of £25.84" (12/500 graphite) on the line below. A £0.00 total is muted 500 with no underline.
2. **Chips**, stacked with a 3px gap, height 18, radius 6, padding 0 5. The label ellipsises; the amount is 700 and never truncated. Order: commitments, income, actuals, previews, then planned categories in fixed order (Groceries, Transport, Eating out, Shopping). At most 4 rows; if there are more items, 3 chips plus an overflow row "+2 £11.53" (muted 700, a button that opens the day).
   - Planned `p`: 1px dashed `--control` border, `--planned` text.
   - Actual `x`: `--ink` fill, `--on-ink` text.
   - Commitment `c`: 1.5px `--commit` border, `--sunk` fill, a 10px pin, 700 text. A commitment that has been paid (`c x`) is ink-filled with the pin.
   - Income `inc`: 1px `--income` border and text, with a "+" prefix.
   - Preview `pv`: 1.5px dashed `--hl-line` border, `--hl` fill at 35%, `--text`.
   - Each chip carries visually hidden text: "planned", "spent", "fixed", "paid", "income" or "preview".
3. **Shortfall mark** (red pencil): "Short £85.00" (12/700, `--deficit` on `--deficit-bg`, triangle-alert icon). It never appears as a tint alone.

Cell states: **before plan** (days before Tue 10 Nov; `--sunk`, muted numeral, only real ledger history, e.g. 1 Nov "Rent £620.00" paid); **outside horizon** (after 31 Jan 2027; `--sunk`, no content, `aria-disabled`); **other month** (muted numeral, full content); **today** (ring); **selected** (2px inset ink); **preview** (2px inset `--hl-line`; with selected it becomes ink + 2px gap + `--hl-line`); **hover** (`--sunk`); **focus** (2px ink outline); **changed** (bubble, §6). The grid uses `role="grid"` with arrow-key navigation, and each cell's `aria-label` is "Tue 10 Nov, planned £25.84, spent £35.00".

### Agenda row (mobile)
Week group header "9 – 15 Nov" (13/700 muted, 16px above and 6 below). Each row is a 12-radius surface card with a 1px rule border, 12px padding and a grid of `48px 1fr` with a 12px gap. The date column holds the weekday (13/700 muted) and the numeral (20/700 in a 36px circle; today gets the ink ring and the whole row gets a 2px ink border). The body holds the total (20/700, with "of £25.84" inline at 13) and **all** chips, wrapping, height 24, 13px. A preview row has a 2px dashed `--hl-line` border. The whole row is a 44px+ target that opens the sheet's Day tab.

### Change panel (desktop right) and sheet (mobile)
- **Composer**: 16px padding and a bottom rule. The input is at least 52px high, with a 1px `--control` border, radius 12 (24 on the mobile dock) and the placeholder **"Tell me what changed…"**. Its accessible label is "Tell me what changed". It is multi-line up to 4 lines; Enter sends and Shift+Enter adds a new line. Send is a 40px ink button (44 on mobile) with arrow-up, `aria-label="Send"`. **Pending**: the field has a `--sunk` fill and shows the typed text read-only; the send button is disabled `--control` with a spinning loader-circle (static under reduced motion), labelled "Reading".
- **Tabs**: Day | Change | Offers, 44px high (48 on mobile), with a 2px ink underline when selected. After a new change, Change shows a 7px ink dot while it is not the selected tab.
- **Day tab (P-plan-day)**: the date heading (20/700) plus a "Today" tag; a trio row "Planned / Spent / Left"; a **Planned** list (rows 44px high, 52 on mobile: a dashed swatch, the category name, a stepper `− £9.00 +` [32/44 high], and an ellipsis menu [§8 submenu]); a **Spent** list (an ink swatch, the item name, a category button [§8 basic], the ink amount and an ellipsis menu with Edit amount / Delete). Section totals sit on the right of the "Planned" and "Spent" headings. The empty Spent state reads "Nothing recorded yet." There is a "Record expense" button; the inline form has Amount, Category and What, plus Cancel and "Record expense". When today's spending is above plan, a note appears: "£9.16 over today's plan, taken from shopping on later days." Steppers move in 50p steps. "−" is disabled at £0.00 and "+" is disabled when the flexible pool is £0.00.
- **Change tab (P-plan-change)**: "You said / You asked" plus the user's sentence in typographic quotes. The **intent row** has an intent tag (Expense / Income / Hold money / Rent change / Goal / Preview · not applied / £34.27 short / Not understood), the parsed summary (e.g. "£35.00 · Household · Tue 10 Nov") and the parser tag on the right: **"Read by Gemini"** or **"Demo parsing"**. Then the explanation (16/400, `aria-live="polite"`), a **diff table** (Item + small sub-line | Before (muted, struck through when it changed) | After (700)), the **protected line** (a `--sunk` box with a pin: "**Unchanged:** rent £620.00, utilities £55.00, minimum reserve £500.00, savings goal £150.00."), and actions.
- **Trade-off options**: a radio group with the legend "Cover £34.27 from". Each option is a 1px bordered row (2px ink when selected) with a 20px radio, the title (15/700), the range line (14 muted) and the per-day change (14/700). It is followed by a "Preview" diff and Discard / Apply change.
- **Offers tab (P-plan-offers)**: a list, not cards. The heading row reads "Sample offers" with "Checked 31 Oct 2026" on the right. Each offer has the name (16/700) plus a "Sample" tag, the deal (15), a definition list (Matches / Eligibility / Conditions) and a "Use on a planned purchase" small button, which opens a preview. A discount never counts as saved until it's applied to a planned purchase or recorded as a lower actual price.

### Forms
Field labels are 14/700 above controls 44px high (1px `--control`, radius 10). Units are inline and muted (`£`, `%`). Read-only fields use `--sunk`. An invalid field has a 2px `--deficit` border plus an error line (triangle-alert, 14/700 `--deficit`, `role="alert"`, linked with `aria-describedby`). The segmented control (lump sum / monthly allowance, Yes/No, period) is a pill whose selected segment is ink. Checkboxes are 20px, radius 5, ink when checked.

### Dialog
The destructive confirm is an `alertdialog`, max-width 440, radius 14 and padding 24, over a `rgb(29 33 37/.45)` scrim. Focus is trapped and Escape cancels. Cancel is focused first.

## 6. Bubble motion (R-feedback)

- **Targets**: only elements whose values differ in the engine diff: the changed chips, the new actual chip, the totals of changed days and an overflow chip that hides a changed item. Summary figures, the panel and unchanged items never move.
- **Timeline per element**: (1) **rise**, 180ms, expo-out `cubic-bezier(.16,1,.3,1)`: `translateY(0→−2px) scale(1→1.06)`, while the highlighter halo (`::before`, `--hl`, inset −3px −4px, radius 8) goes from `opacity 0→.55` and `scale .8→1.15`. (2) **count**, 320ms, linear: the amount text counts from the old to the new pence value. (3) **settle**, 260ms, expo-out: the transform returns to rest and the halo fades to 0. Total 760ms.
- **Stagger**: cells in date order, `delay = min(index × 40ms, 400ms)`, counting only the cells visible in the viewport. Chips follow their cell by +60ms. Off-screen cells just show final values. The whole effect is ≤1.22s.
- **Safety**: only `transform`/`opacity` on the element and its pseudo-element, so layout never shifts. Ink chips paint their fill on `::after` so the halo sits behind them. One timeline is keyed to the change ID, so it is deterministic and seekable (`#t=340` in the prototype freezes a frame). The accessible values (aria-labels, the diff table) update to final values at once. Undo replays the effect on the cells it restores.
- **Reduced motion** (`prefers-reduced-motion: reduce`): no transform and no count. Changed elements get the `--hl` fill at .55 plus a 2px `--hl-line` ring at once, hold for 1200ms, then the fill and ring fade over 600ms (opacity only).
- Frozen frame: `images/plan-change-bubble-frame.png` (t=340ms: Tue 10 in count, Wed–Fri settling or rising, later days not started). Reduced: `images/plan-change-bubble-reduced.png`. Mobile: `images/plan-change-bubble-mobile-frame.png`.

## 7. Demo fixture and figures (R-demo, R-engine)

Demo date **Tue 10 Nov 2026**; horizon Tue 10 Nov 2026 – Sun 31 Jan 2027 (**83 days**). Balance **£3,900.00** (November rent of £620.00 was paid on Sun 1 Nov and shows as paid history). No job. Confirmed income: family transfer **£300.00 on Fri 18 Dec**. Commitments: rent **£620.00** on the 1st (Tue 1 Dec, Fri 1 Jan) and utilities **£55.00** on the 15th (Sun 15 Nov, Tue 15 Dec, Fri 15 Jan), for a total of **£1,405.00**. Minimum reserve **£500.00**. Savings goal **£150.00** by 31 Jan. Savings now £200.00; investments £0.00. City London.

- Flexible pool = 3,900 + 300 − (1,405 + 500 + 150) = **£2,145.00**. Divided by 83 days: 214,500p = 83 × 2,584p + 28p. **£25.84 a day**; the 28 remainder pence go +1p to the **last** 28 days (Mon 4 – Sun 31 Jan = £25.85), so today is £25.84.
- Daily weights (the onboarding weekly amounts ÷ 7): Groceries **£9.00** (£63.00/wk), Transport **£5.20** (£36.40/wk), Eating out **£5.50** (£38.50/wk), Shopping **£6.14** (£42.98/wk; £6.15 on remainder days). Protect-first order: Transport, Groceries, Eating out, Shopping. Reallocation takes from the lowest priority first.
- Cash check: before 18 Dec there are £730.00 of bills and a £500.00 reserve against £3,900.00, so no timing constraint binds.

| Step | Input | Result (exact) |
|---|---|---|
| S1 actual | "I spent £35 on a shower filter today" | The actual of £35.00 (Household) uses today's £25.84 (no double counting); the overspend of **£9.16** comes from **shopping** over the 82 days Wed 11 Nov – Sun 31 Jan: −11p a day, −12p on the last 14 days (18–31 Jan) (82×11 + 14 = 916). Shopping goes to £6.03 (11 Nov – 3 Jan), £6.04 (4–17 Jan) and £6.03 (18–31 Jan). The daily total is **£25.73** (£25.74 on 4–17 Jan). Funds left £3,865.00; Flexible left **£2,110.00** (= 82-day pool); Today £0.00, "£35.00 spent". |
| S2 preview → Apply | "Can I spend £20 on dinner tomorrow?" | It fits (£20.00 ≤ £25.73). On Wed 11 Nov: eating out £5.50 → **£20.00** (+£14.50); shopping £6.03 → £0.00; groceries £9.00 → **£0.53** (−£8.47); transport £5.20 is unchanged; the day total stays £25.73. Before Apply, nothing is committed and the summary is identical. |
| S3 trade-off | "Can I spend £60 on a concert ticket on Saturday?" | Sat 14 Nov has £25.73, so the **shortfall is £34.27**. Options: **Eating out, Sun 15 – Sat 28 Nov** (14 days; −£2.44 on 15–17 Nov, −£2.45 on 18–28 Nov; 3×244 + 11×245 = 3,427), giving eating out £3.06 / £3.05; **Shopping, Sun 15 – Mon 30 Nov** (16 days; −£2.14 ×13, −£2.15 on 28–30 Nov); **All flexible spending, Sun 15 Nov – Sun 31 Jan** (78 days; −£0.43 ×5, −£0.44 ×73). The selected option previews; Apply makes Sat 14 Nov "Concert £60.00" planned, with the other spending that day at £0.00. Flexible left stays £2,110.00. |
| S4 income | "I received an extra £200" | Funds left £4,065.00; Flexible left **£2,310.00**. The +£200.00 is spread over Wed 11 Nov – Sun 31 Jan: +£2.43 on 11–18 Nov (8 days), +£2.44 on 19 Nov – 31 Jan (74 days) (8×243 + 74×244 = 20,000), split across the four categories by weight, with remainder pence going to Shopping. |
| Undo | Undo on S4 | Deep-equal restore of the state after S3. |
| Deficit (state image) | from S1: "I paid £2,400 for my tuition deposit today" | Funds left £1,465.00. Flexible is £0.00 a day, and planned savings are £0.00 of the £150.00 goal. Cash runs short of the protected £500.00 reserve by **£85.00 on Fri 1 Jan** (rent) and **£55.00 on Fri 15 Jan** (utilities), for a total **short of £140.00**. The reserve is not touched. |
| Rent change (copy only) | "My rent increases by £50 next month" | From Tue 1 Dec rent is £670.00, which is 2 payments and £100.00 more. Shopping drops by £1.21–£1.22 a day from Wed 11 Nov (78×122 + 4×121 = 10,000). It is a protected change, so it always previews with Apply. |
| Preference (copy only) | "Keep £30 available for Saturday" | Sat 14 Nov holds £30.00 (+£4.27), taken from shopping on Sun 15 – Mon 30 Nov (−26p ×5, −27p ×11). |
| Goal (copy only) | "Save another £100 by month end" | Planned savings go from £150.00 to £250.00, with £100.00 set aside by Mon 30 Nov. Shopping drops by £1.21–£1.22 a day as above. |

Projections (populated state, user-entered): 12 months to 10 Nov 2027, monthly compounding, contributions at the end of each month. Savings start £200.00 + £50.00/month at 2.00 / 3.50 / 4.50% a year gives **£809.57 / £816.83 / £821.72**. Investments start £0.00 + £20.00/month at 0.00 / 4.00 / 7.00% gives **£240.00 / £244.45 / £247.85**. Savings + investments: **£1,049.57 / £1,061.28 / £1,069.57**. "You put in" £1,040.00. Growth £9.57 / £21.28 / £29.57. Income received: confirmed £300.00 + expected £250.00 × 12 = **£3,300.00** (expected job income is projection-only until confirmed; D12).

## 8. Dropdown families (ReUI, required)

| Family | Where | Composition | Semantics and states shown |
|---|---|---|---|
| Month jump | month trigger (P-plan) | **Basic** `@reui/c-dropdown-menu-1` | `menuitemradio` for months in the horizon (Nov 2026 – Jan 2027), with a check on the current one. `plan-month-menu.png` |
| Category picker | Spent row category button; Record expense form (P-plan-day) | **Basic** `c-dropdown-menu-1` | `menuitemradio`: Groceries, Transport, Eating out, Shopping, Household, Going out, Books, Other. Selected shows a check. `plan-day-category.png` |
| Recurrence | Settings and onboarding "Repeats" | **Basic** `c-dropdown-menu-1` | `menuitemradio`: Once, Weekly, Every 2 weeks, Monthly, Every 3 months. `settings-recurrence-menu.png` |
| Planned item actions | ellipsis on a Planned row | **Submenu** `@reui/c-dropdown-menu-5` | Edit amount · **Move to ▸** (the next 4 dates plus "Pick a date…") · Set to £0.00. `plan-day-item-menu.png` shows the submenu open. |
| Spent item actions | ellipsis on a Spent row | **Basic** `c-dropdown-menu-1` | Edit amount · Delete (Delete is destructive and gives an Undo in the Change tab). |
| App menu | top-bar / header ellipsis | **Complex** `@reui/c-dropdown-menu-8` | Group "Demo": Demo student (switch, `menuitemcheckbox`), Demo date (disabled info). Group "App": **Theme ▸** (radio: Light / Dark / Match device), Settings, Export plan (JSON). Separator, then **Reset StudentPlan…** (destructive, opens the dialog). `plan-account-menu.png` |

Category and recurrence need select-like single-choice semantics; they use the composition's radio items (`menuitemradio` plus a trigger that shows the value). If `c-dropdown-menu-1` cannot expose radio items with a value-bearing trigger, raise the conflict before substituting anything. All menus keep the composition's portal, typeahead, arrow-key, Escape and focus-return behaviour. Menu styling: radius 12, padding 6, 36px items (44 on mobile), highlighted item `--sunk`, check icon in `--ink`.

## 9. Screens

**P-onboarding** (`/onboarding`; R-onboard, R-sketches, R-demo, R-ux, R-persist). On desktop, a 600px white "page" card (radius 14, panel shadow, padding 24/40/40) sits on `--bg`, 40px below the top bar. On mobile it is a full-bleed surface. Order: progress ("3 of 9" + a 4px bar), the sketch (max 440 wide, 4:3; 300 on mobile), the question (h1), the fields, then Back / Next (the primary button is at least 140 wide; "Create my plan" on the last step). The welcome screen (no progress) has the sketch, "Know what you can spend today.", **Set up my plan** and **Try a demo student**. Step 1 also offers "Try a demo student" as a quiet button. Steps and fields:
1 funds: "How much money do you have?" (This money is [A lump sum | A monthly allowance]; Amount). 2 last-until: "When does it need to last until?" (Last until; data line "83 days from Tue 10 Nov 2026"). 3 job: "Do you have a job?" (Yes/No; Yes reveals Pay, Pay dates and **Confirmed** — only confirmed pay feeds the plan). 4 other-income: "Any other money coming in?" (From, Amount, Date, Confirmed; Add income). 5 rent: "Rent and fixed bills" (Name, Amount, Due, Repeats; Add commitment). 6 reserve: "Your emergency reserve" (Minimum to keep). 7 savings: "Savings" (Save by 31 Jan, Savings now, Investments now). 8 food-transport: "Food and transport" (Groceries, Transport, Eating out and Shopping a week). 9 priorities: "What matters most?" (Protect first, a reorderable list; City (optional); Diet (optional)). Nothing is persisted as a plan until "Create my plan" passes validation.

**P-plan** (`/plan`; R-summary, R-calendar, R-nl, R-feedback, R-demo, R-protect). Desktop: the summary, the month bar, the grid, and the panel with the Day tab for today by default. Mobile: the summary 2×3, the month bar, the agenda from today, and the docked input. Loading (`plan-loading.png`): the composer is pending and the Change tab shows the sentence, "Reading your change…" (`role="status"`) and 4 skeleton bars (`--sunk`, no shimmer). On first load from storage the calendar renders skeleton cells (`--sunk` blocks in place of totals and chips) for at most 300ms. Deficit: `plan-deficit-desktop.png` (January view) and `plan-deficit-mobile.png`.

**P-plan-day** (tab `day`; R-day, R-actual, R-undo). The selected day is driven by a cell or agenda tap, and the panel/sheet shows the Day tab. Edits go through the engine and produce a Change entry with Undo.

**P-plan-change** (tab `change`; R-nl, R-preview, R-feedback, R-undo, R-tradeoff, R-protect). Images: the applied explanation (S1), the bubble frame / reduced / mobile, the preview (S2), the trade-off (S3), clarification and not understood.

**P-plan-offers** (tab `offers`; R-offers). Sample data comes from `research/data` (16-25 Railcard, itsu, LEON, Tesco Clubcard), each labelled "Sample". No retailer integration is claimed.

**P-projections** (`/projections`; R-projections, R-engine). The title plus the period segment (3 / 6 / 12 / 24 months). Desktop is a 420px assumptions column (Savings, Investments, Income cards) plus the results card. Mobile puts results first, then assumptions. The results heading is "After 12 months · 10 Nov 2027", followed by the disclaimer "Projection, not advice or a guarantee" (info icon, 14/700 `--hl-line`), then the table (Low / Base / High). **No chart**: the three scenarios differ by about £20 at these rates, so a line chart would be decoration; the "You put in" and "Growth" rows carry that comparison honestly. Empty state (`projections-empty-*`): rate fields are blank (there are no defaults), contribution defaults are £0.00, Savings/Investments rows read "Enter rates to see this", and Income received still shows £300.00. Rate validation: "Enter a rate from −100% to 100%".

**P-settings** (`/settings`; R-onboard, R-protect, R-persist). On desktop, a sticky section nav (200px) sits beside the section cards: Money, Income, Rent and commitments (Name, Amount, Due, Repeats, Locked, Delete), Reserve and savings, Food and transport (with Protect first), Optional, and Reset. Each card has "Save changes", disabled until edited. Saving a protected value (rent, a locked commitment, the reserve) is the explicit instruction R-protect requires, and it produces a Change entry with Undo. The Reset card has a 1px `--deficit` border, a consequence line and "Reset StudentPlan", which opens the dialog (`settings-reset-dialog-*`).

## 10. Stateful copy

The rendered text is what's shown. Accessible additions are in the right column.

| Condition (selector) | Visible copy | Accessible notes |
|---|---|---|
| Onboarding amount empty or ≤0 (client, on Next) | "Enter an amount above £0" | `aria-invalid`, linked; focus moves to the first invalid field |
| Amount not a number | "Enter an amount in pounds, like 3,900.00" | — |
| Last-until on or before today | "Pick a date after today" | — |
| Due day outside 1–31 | "Enter a day from 1 to 31" | — |
| Reserve > funds | "Your reserve can't be more than your funds (£3,900.00)" | — |
| Required name empty | "Add a name" | — |
| Income date after last-until (warning, not blocking) | "This is after 31 Jan 2027, so it won't count in your plan." | `role="status"` |
| Parse pending (client, request in flight) | "Reading your change…" | `aria-busy` on the tab panel; the input is read-only |
| Parser source = Gemini (server returned `source:"gemini"`) | tag "Read by Gemini" | — |
| Parser source = deterministic (no key, or Gemini error/timeout > 6s) | tag "Demo parsing" | "Read by the built-in demo parser, not AI" |
| Ambiguous date (intent valid, date has >1 candidate) | "Which day should keep £30.00?" with chips "Sat 14 Nov" / "Sun 15 Nov" / "£15.00 each day", plus Cancel | — |
| Non-GBP currency | "I can only plan in pounds. How much was it in £?" with a £ field and "Use this amount" | — |
| Missing amount | "How much was it?" with a £ field and "Continue" | — |
| Ambiguous intent | "Did you spend this, or are you planning it?" with chips "I spent it" / "I'm planning it" | — |
| Not understood (schema validation failed in both parsers) | "I couldn't turn that into a change. Your plan hasn't changed." + "Try: “I spent £12 on groceries today” or “Can I spend £20 on Friday?”" + "Edit sentence" | `role="alert"` |
| Applied actual (S1) | "Added your £35.00 expense. Today's £25.84 covers most of it; the other **£9.16 comes from shopping**, 11p a day from Wed 11 Nov (12p from 18 Jan)." + diff + protected line + **Undo** | `aria-live="polite"` |
| Hypothetical fits (S2) | tag "Preview · not applied"; "**Yes, it fits.** Wed 11 Nov has £25.73. Dinner raises eating out to £20.00; shopping (£6.03) and groceries (£8.47) cover the £14.50." Buttons **Discard** / **Apply change** | — |
| Dinner applied | "Planned £20.00 for dinner on Wed 11 Nov. Shopping (£6.03) and groceries (£8.47) that day cover it." + protected line + Undo | — |
| Shortfall (S3) | tag "£34.27 short"; "Sat 14 Nov has £25.73, so a £60.00 ticket is **£34.27** more than the day allows." Legend "Cover £34.27 from" | — |
| Concert applied | "Planned £60.00 for the concert on Sat 14 Nov. It uses that day's £25.73 and £34.27 from eating out, Sun 15 – Sat 28 Nov." + protected line + Undo | — |
| Income (S4) | "Added £200.00 income. Your next 82 days get £2.43 or £2.44 more each." + Undo | — |
| Undo done | "Undone. Your plan is back to how it was before “I received an extra £200”." | `aria-live` |
| Deficit | "Recorded. You now need **£140.00** more to pay rent on Fri 1 Jan (£85.00 short) and utilities on Fri 15 Jan (£55.00 short) while keeping your £500.00 reserve." Protected box: "**Not touched:** your £500.00 minimum reserve. Flexible spending is £0.00 a day until you add income or change the plan." Buttons **Add income**, **Edit reserve**, **Undo** | — |
| Apply after the state changed (server/engine version mismatch) | "Your plan changed since this preview." + "Preview again" | — |
| Storage write failed | "Couldn't save on this device. This change will be lost when you close the app." + "Try again" | `role="alert"` |
| Day overspent today | "£9.16 over today's plan, taken from shopping on later days." | — |
| Spent list empty | "Nothing recorded yet." | — |
| Reset dialog | Title "Reset StudentPlan?"; body "This deletes your plan, ledger and settings from this device. It can't be undone."; **Cancel** / **Delete everything** | `alertdialog` |
| Projections with no rates | "Enter rates to see this" | — |

Tone: plain and supportive. Never "overspent!", never blame. Buttons name their action.

## 11. No-subtext compliance
There are no page subtitles, card blurbs, greetings or promo lines. The retained secondary lines are all data or operational: "+£300.00 on 18 Dec", "£35.00 spent", "of £150.00 goal", "83 days from Tue 10 Nov 2026", the diff sub-lines (dates), "Checked 31 Oct 2026", the "Sample" and demo labels, the disclaimer, the overspend note, the empty-list line and the reset consequence line (required destructive information).

## 12. Known gaps
- The tablet (768–1023) layout is specified but not imaged.
- Dark theme tokens are specified but not imaged.
- The S4 income and rent/preference/goal results are specified as copy and numbers only, with no images.
- Calendar cells repeat identical planned chips by design (the flexible pool is spread evenly); differentiation comes from commitments, actuals, previews and highlights.
