# StudentPlan — visual contract (design revision v2, "Bold and bouncy")

Implements D15 (a Cleo-inspired direction: inspiration only, a supportive tone, no roasts), D16, D17 and D18. Tokens, fonts and ownership come from `.prd-to-production/ui-contract.md`. This file adds anatomy, states, copy and figures. If the pixels and this text disagree, this text wins. Root `design.md` is the short version.

- **Inventory:** all 7 screens in `screens.json`, 62 images. Each screen has a desktop and a mobile image. Mobile was added for every onboarding step, loading, clarify, fail and income, and light-theme versions were added for `/plan`.
- **Capture:**
  - Desktop 1440×1000; mobile 390×844.
  - DPR 1, full page. Dialogs are captured at the viewport size.
  - Chromium via Playwright 1.64.1.
  - Ready selector: `html[data-ready="1"]`, set after `document.fonts.check()` passes for all 6 faces and every image has loaded. The renderer exits non-zero if fonts are missing (all 62 passed).
- **Rebuild:** `python3 prototypes/build.py <lucide-static@0.460.0/icons>`, then `PW=<playwright/index.mjs> node prototypes/render.mjs`, then `python3 prototypes/contact_sheet.py`.

## 1. What carries over from v1 unchanged

The behaviour, copy and states in `v1-rejected/spec.md` remain binding. That covers:
- §5: component behaviour (steppers in 50p steps, Enter / Shift+Enter, tab badge, the Record expense form).
- §8: dropdown families.
- §9: per-screen behaviour.
- §10: stateful copy, the table of conditions and selectors.
- §11: no-subtext compliance.

Only the visuals, the money format and the figures in §6 below change. Where v1 copy contains a figure, use the §6 figure instead.

## 2. Assets

| Asset | Source | Notes |
|---|---|---|
| Display + all numbers | **Bricolage Grotesque** 700/800 (opsz 12–96), Google Fonts | Verified loaded. `tnum` verified (`111` = `888` width). Hero 72 desktop / 64 mobile, tracking −.04em; titles 36; tile values 24 (21 mobile); day totals 17 desktop / 20 agenda. Note: its £ glyph is distinctive; we accepted it. |
| UI / body | **Plus Jakarta Sans** 500/600/700/800 | Verified loaded. Body 16; labels 14/700; chips 12/800. Contract lists 400/600/700; 800 is used only for chip and tab labels (drop to 700 if the shell keeps three weights). |
| Icons | Lucide (`lucide-react` = `lucide-static@0.460.0`), 20px stroke 2.2; 12px in chips | calendar-days (mark), pin, lock, receipt, shopping-basket, bus, utensils, shopping-bag, arrow-up, undo-2, sparkles (Gemini tag), triangle-alert, info, tag, sun/moon/monitor, sun-moon, settings, download, rotate-ccw, trash-2, pencil, plus, minus, x, chevron-*, ellipsis, loader-circle, arrow-left. No emoji. |
| Illustrations | `sketches/<slug>.webp` (v2 clay set: navy #1B1F5E, blue #3D5AFE, coral #FF5A5F, lime #C8F53C) | Shown on a **light stage `#E6E8FF`, radius 24**, in both themes. **This deviates from the contract ("raised --surface-2 card"):** navy objects on #20235A lose their silhouette. `alt=""`. |

## 3. Tokens (contract values + prototype additions)

Contract tokens: `--bg --surface --surface-2 --line --text --muted --accent --lime --coral --navy`. The prototype uses `--s1 = --surface` and `--s2 = --surface-2`. It adds the following:

| Added token | Dark | Light | Use |
|---|---|---|---|
| `--s3` | #2C3070 | #DDE1FF | selected tab/pill, hover, stepper buttons |
| `--ctl` | #5C61A8 | #8A8FC0 | control borders (≥3:1 non-text) |
| `--blue-text` | #8FA0FF | #3048D8 | accent-coloured *text* on dark (7.1:1 on surface); #3D5AFE text on #16183A is only 3.6:1 |
| `--lime-text` | #C8F53C | #5E7A00 | lime text (13.6:1 dark / 6.2:1 light) |
| `--coral-text` | #FF7A7E | #D93A40 | shortfall text (6.9:1 dark) |
| `--on-lime`, `--on-coral` | #0B0C1F | #0F1024 | text on lime/coral fills (white on coral fails at 3.05:1) |
| `--stage` | #E6E8FF | #E6E8FF | illustration ground |
| `--scrim` | rgb(5 6 18/.66) | rgb(18 20 74/.42) | sheet/dialog scrim |

- **Radii:** cards, panel and hero 24; tiles 22; day tiles 18; inputs 16 (big amount input 22); chat bubbles 24 with one 6px "tail" corner. Pills: buttons, chips, tags, tabs, segments.
- **Elevation:** none on cards (colour steps carry depth). Menus and dialogs use `0 24px 60px rgb(0 0 0/.55)`. The sheet uses `0 -20px 60px rgb(0 0 0/.45)`.
- **Targets:**
  - Buttons are 52px (sm 40, desktop only), icon buttons 44 (sm 36 desktop) and inputs 56.
  - Agenda rows are ≥64, tabs 44 and segments 48.
  - Focus is a 3px lime outline with a 3px offset.
  - Pressed is `scale(.96)` with a spring, so a 52px button stays ≥44px.
  - Disabled is `--surface-2` with `--muted` text at 70% opacity, keeping `aria-disabled`.
- **Money format:** use engine `formatMoney` everywhere ("£35", "£25.84", "£3,900"), with `tabular-nums`. This is a change from v1's "£35.00". UI-built deltas use a real minus "−£9.16". Engine sentences are shown verbatim.

## 4. Shell, layout and components

**Desktop ≥1024**

*Top bar and grid*
- **Top bar** (72px):
  - The mark: a 34px lime rounded square, rotated −6°, holding the calendar icon.
  - The "StudentPlan" wordmark (display 19/800).
  - The pill nav (Plan / Projections / Settings): a `--surface` track with the active pill in `--s3`.
  - On the right: the demo badge "Demo · Tue 10 Nov 2026" (lime outline, dot) and a 44px "…" button.
- **Grid:** `/plan` is `minmax(0,1fr) 400px`, gap 24, padding 4/24/24.

*Summary row:* `380px 1fr`.
- **Hero card:** `--accent` fill with a soft top-left light glow, radius 24, padding 22/24. It shows:
  - Label "Left today", with "Tue 10 Nov" (or "£35 spent" once anything is spent) on the right.
  - The value in display 72/800.
  - A footer, "Flexible left £2,145".
- **Tiles** (2×2):
  - Funds left, with the data line "+£300 on 18 Dec" in lime.
  - For bills (pin icon).
  - Reserve (lock icon).
  - Savings, with "of £150 goal" in coral when it's unfunded.
- **Deficit hero:** `--surface` with a 2px coral ring, a coral tag "Plan £290 short" and the value £0.

*Calendar card* (`--surface`, radius 24, padding 20)
- **Month bar:**
  - The month trigger (display 28; the year in muted; a chevron; opens the basic menu).
  - Previous and next buttons, 44 round.
  - A "Today" pill.
  - The legend chips (Bill · Spent · Income · Preview) on the right.
- **Weekday row:** 12/800 uppercase.
- **Grid:** 7 columns, gap 8. Each cell is ≥100px high, `--surface-2`, radius 18 and padded 10/11, with a **1.5px dashed `--line` outline** (planned).
  - The date is 15/800.
  - The **total sits at the bottom**, display 17/700.
  - Chips sit between the date and the total.
- **Chip rule:**
  - **Ordinary days show the total only.**
  - Chips appear only for bills (navy + pin), income (lime outline, "+£300"), actuals (accent fill), planned purchases (blue-text outline), previews (dashed lime) and shortfalls (coral fill with an alert icon, "Short £85").
  - Show at most 2 chips per cell in a 6-row month (3 in a 5-row month), otherwise 1 plus "+N".
  - Labels ellipsise; amounts never do.
  - Each chip carries a screen-reader word ("bill", "spent", "income", "planned purchase", "preview", "short").
- **Cell states:**
  - Today: 2.5px accent ring and an accent date badge.
  - Selected: `--s3` fill plus a 2.5px blue-text ring.
  - Past / before the plan: transparent with a 1.5px `--line` ring and a muted date. Only real history shows, e.g. 1 Nov "Rent £620" as a spent chip with a pin.
  - Outside the horizon: 50% opacity.
  - Preview: dashed lime outline, with the total in lime.
  - Zero: muted total.
  - `role="grid"`; `aria-label` reads e.g. "Tue 10 Nov, planned £25.84, spent £35".

*Right panel:* sticky, `height: 100dvh − 96px`, `--surface`, radius 24. It contains, in order:
1. **The composer** (the contract puts it at the top). A 60px pill input in `--surface-2` with a 1.5px `--ctl` ring and the placeholder "Tell me what changed…", plus a 44px lime send button (arrow-up). When the input is empty, three prefill chips sit below it: "I spent £…", "Can I spend £…", "I received £…". These are actions, not captions.
2. **Pill tabs** Day / Change / Offers, on a `--bg` track. When the Change tab isn't selected, it shows an 8px lime dot after a change.
3. **Content.**

**Mobile <1024**
- **Header and nav:** a 64px header (mark + wordmark, the badge "Demo · 10 Nov", a 44px menu button), then a full-width pill nav (44px).
- **Summary:** the hero (64px number), then 2×2 tiles.
- **Month bar.**
- **Week-grouped agenda:** a header like "9 – 15 Nov" in 12/800 uppercase. Each row is a `--surface` card, radius 20, ≥64px high, laid out as `52px 1fr auto`:
  - A date badge (weekday 10.5/800 + date in display 18).
  - The chips (26px high, 13px; all of them, wrapping).
  - The total on the right, display 20 (with "of £25.84" under it once something is spent).
  - Today gets an accent ring and an accent badge.
  - The whole row is one button that opens the sheet's Day tab.
- **Dock:** absolute at the bottom, padding 12/12/30 (safe area), with a fade from `--bg`. It holds the composer pill with a shadow.
- **Sheet:**
  - Starts 52px from the top; top radius 30.
  - A 44×5 grabber, then the tabs and a 44px close button.
  - The content.
  - The composer, sticky at the bottom.
  - Scrim behind it.
  - Opens with a spring (350ms, `cubic-bezier(.34,1.56,.64,1)`). Drag down or Escape closes it. Focus is trapped.

**Day tab** (P-plan-day)
- **Header:** "Tue 10 Nov" (display 24) plus a lime "Today" tag.
- **Trio:** Planned / Spent / Left tiles (display 20; Spent in blue-text).
- **Note** (when today is overspent): "£9.16 over today’s plan, taken from shopping on later days."
- **Spent section:** the heading with its total. Rows are 56px:
  - A 40px accent icon tile, the name, and a category pill (basic menu).
  - The amount in blue-text and "…".
  - Empty state: a dashed box reading "Nothing recorded yet."
- **Planned section:** rows have a dashed outline, a category icon, a stepper (34px round − / +, amount in display) and "…" (submenu).
- **"Record expense":** a secondary pill button. Its form shows Amount, Category (menu) and What, then Cancel and Record expense.
- **Ordinary day:** see `plan-day-ordinary-mobile`. Tapping a day is how its items appear; the calendar itself never lists them.

**Change tab: chat** (P-plan-change)
- **The sentence:** a right-aligned accent bubble, 16/700.
- **The reply:** a `--surface-2` card containing:
  1. Row 1: the intent tag (Expense · Income · Hold money · Preview · not applied (dashed lime) · Not understood), the parsed summary ("£35 · Household · Tue 10 Nov"), and the parser tag on the right ("Read by Gemini" with sparkles, or "Demo parsing").
  2. A display verdict where useful: "Yes, it fits." (lime), "£34.27 short" (coral), "+£200" (lime), "£290 short".
  3. The engine sentence, 15/500, `aria-live="polite"`.
  4. A diff box (`--surface`): item + sub-line | ~~before~~ → **after**. Increases are lime.
  5. A row of "Unchanged" (lock icon) pills for the protected items.
  6. Actions.
- **Trade-off options:** radio cards (`radiogroup`, legend "Cover £34.27 from"). The selected card gets a lime ring and `--s3` fill. Each card has a title and a "N days · −£a to −£b a day" line.
- **Loading:** three typing dots, "Reading your change…" (`role="status"`) and four skeleton bars. No shimmer.
- **Composer while pending:** the field turns `--bg`, the typed text shows read-only, and the send button becomes `--s3` with a loader, `aria-label="Reading"`.

**Offers tab:**
- **Header:** "Sample offers" on the left; "Checked 31 Oct 2026" on the right.
- **Cards** (`--surface-2`, radius 22) hold:
  - The name and a "Sample" tag.
  - The deal in display 19, lime.
  - A list: Matches / Eligibility / Conditions.
  - A "Use on a planned purchase" button.
- **Labels:** the contract's shared label is "Sample offer". Either label is fine, but use the same one everywhere.

**Onboarding:**
- **Desktop:**
  - Header: the brand, then on the right "Step n of 9" and a "Try a demo student" pill (visible on every step, per the contract).
  - Below it, a centred two-column layout: the stage (4:3.4) and the content (a 9-segment lime progress bar, the question in display 44, the fields, then Back / Next or "Create my plan").
  - Welcome: the stage plus "Know what you can spend today." (display 60), with "Set up my plan" (lime) and "Try a demo student".
- **Mobile:**
  - Header: back button, progress bar, "n/9".
  - The stage (200px high, `flex:none`), the question (display 30), the fields and a ghost "Try a demo student".
  - A sticky full-width lime Next button.
- **Fields:**
  - The funds amount is a big 76px input in display 34.
  - Segments (lump sum / monthly allowance, Yes/No): the selected segment is lime.
  - Errors: a 2.5px coral ring, plus an alert line (coral-text, 15/800, `role="alert"`).

**Projections:**
- **Header:** the title, plus a period segment (3/6/12/24 months).
- **Results card:**
  - Heading "After 12 months · 10 Nov 2027".
  - Disclaimer tag "Projection, not advice or a guarantee".
  - "Savings + investments · Base" in display 64.
  - Low / **Base** (accent) / High tiles.
  - A table: Savings, Investments, You put in, Growth, Income received.
- **Assumptions:** the Savings, Investments and Income cards. **No chart** (v1 rationale holds).
- **Order:** desktop puts results on the left with a 440px assumptions column; mobile puts results first.
- **Empty state:** "Enter rates to see this"; Income received still shows £300.

**Settings:**
- Section cards (padding 28; 18 on mobile), each with a disabled "Save changes" button until it's edited.
- A sticky pill section nav on desktop.
- The Reset card has a coral ring and a coral "Reset StudentPlan" button that opens an `alertdialog`. The dialog has a coral-soft icon tile, Cancel (focused first) and "Delete everything".

## 5. Motion

**Springs:** `--spring: cubic-bezier(.34,1.56,.64,1)` (tabs, sheet, press, menu open at 220ms from scale .96) and `--out: cubic-bezier(.16,1,.3,1)`.

**Bubble** (R-feedback; matches the contract's 180/320/260 and 40ms-stagger spec)
- **Targets:** the cells or agenda rows whose values differ in the engine diff, plus any new chip. Summary, panel and unchanged days don't move. Cells are counted in date order among visible cells (`i`); delay = `min(i×40, 400)`ms. Off-screen cells just show final values.
- **Per target, `L` ms after its delay:**
  - **Pop + settle:** the cell scales by `1 + A·e^(−L/230)·sin(πL/260)` for 0–760ms. A = .075 for desktop tiles and .03 for full-width agenda rows, so a row never leaves the screen. Peak ≈1.05, a small undershoot, then rest.
  - **Halo:** an overlay with `0 0 0 6px` lime at 35% plus a 2.5px inset lime ring. Opacity 0→1 over 0–180ms, then 1→0 by 760ms.
  - **Count:** the total counts from the old pence to the new over 180–500ms (≈320ms).
  - **Fizz:** three lime dots (8/6/5px) rise from the right of the number and fade, starting 80/130/180ms and lasting 600ms. There is deliberately **no ring around the number**: a ring with dots above it read as a face in review.
- **Safety:** only transform and opacity are animated. One timeline is keyed to the change ID. `#t=340` freezes a frame in the prototype. Accessible values update immediately. Undo replays the effect on the restored days.
- **Reduced motion:** no scale, no count and no dots. The halo becomes a static 2.5px lime inset ring plus a 10% lime fill, held 1200ms, then fading over 600ms.
- **Frames:** `plan-change-bubble-frame` (t=340), `-reduced`, `-mobile-frame` (t=300).
- **Optional:** `navigator.vibrate(8)` on Apply where supported.

## 6. Figures: engine-authoritative

The source is `src/lib/engine/demo-journey.test.ts`, which passed `pnpm vitest run src/lib/engine` (75/75) on 31 Oct 13:00. The sentences were captured from `explain()` against the fixture. Fixture: as v1 §7 (Tue 10 Nov 2026 – 31 Jan 2027, 83 days, £3,900, +£300 on 18 Dec, rent £620 / utilities £55, reserve £500, goal £150) → **£25.84 a day**.

**Differences from v1 §7, adopted:**
1. **Remainder pennies:** the 28 remainder pence go to **groceries** (largest remainder), not shopping: groceries £9.01 from 4 Jan. Daily totals are unchanged.
2. **S1 (D17):** the sentence is **"I need to spend £35 on a replacement shower filter today"**. It applies immediately with Undo. Engine explanation: "Added your £35 expense (household, 10 Nov). That day's allowance covered £25.84; the other £9.16 comes from later days. Shopping decreased by £9.16 across 11 Nov – 31 Jan. Rent, utilities, your £500 emergency reserve and your £150 savings goal are unchanged." After it: Funds left £3,865; Flexible left £2,110; Left today £0; days £25.73 (£25.74 4–17 Jan).
3. **S2 dinner (D16, PROVISIONAL):** groceries and transport are untouched. Eating out (£5.50) and shopping (£6.03) that day cover **£11.53**, and **£8.47 is borrowed from later shopping**. Wed 11 Nov becomes eating out £20, shopping £0, groceries £9, transport £5.20, total £34.20.
   - Treatment: a lime tag **"Fits — borrows £8.47 from later shopping"** under "Yes, it fits."
   - Prototype sentence (placeholder until the engine lands): "Set aside £20 for Dinner (eating out) on 11 Nov. Eating out and shopping that day cover £11.53; the other £8.47 is borrowed from later shopping. Groceries and transport are unchanged. …"
   - The exact per-day borrow and the later-day totals are **pending the orchestrator's final figures**. The mockups don't change later days.
4. **S3 concert:** the engine **option order is Shopping, 15 Nov – 30 Nov (default) · Eating out, 15 Nov – 28 Nov · All flexible spending, 15 Nov – 31 Jan**. The applied example uses Shopping (v1 used Eating out). Shortfall **£34.27**, which is **provisional under D16** and may change.
   - Shopping option: £6.03 → £3.89 a day (£3.88 on 28–30 Nov).
   - Applying sets Sat 14 Nov to concert £60 with the other categories £0.
   - Flexible left stays £2,110. The summary gains `earmarked` £80.
5. **S4:** engine sentence "Added £200 of income. Groceries increased by £69.62, transport by £40.18, eating out by £42.64 and shopping by £47.56 across 11 Nov – 31 Jan. …" Funds left £4,065; Flexible left £2,310; +£2.43 a day 11–18 Nov, +£2.44 a day after.
6. **Deficit:** the engine reports **fundingGap £290**, not v1's £140, because it adds savings-unfunded £150 to reserve-short £85 (1 Jan) and £55 (15 Jan). The UI shows "£290 short", with the three engine reasons verbatim:
   - "Your £150 savings goal can't be funded: bills, your reserve and what you've spent need £290 more than you have."
   - "Rent (£620) on 1 Jan leaves you £85 below your £500 reserve."
   - "Utilities (£55) on 15 Jan leaves you £55 below your £500 reserve."

   After it: Funds left £1,465; Savings £0 "of £150 goal"; Flexible £0.
7. **Rent / preference / goal (copy only):**
   - "Rent is £670 from 1 Dec (was £620); that changes your bills by £100 over the plan. Shopping decreased by £100 across 11 Nov – 31 Jan. …"
   - "14 Nov now keeps £30 available (you asked for £30). Shopping decreased by £4.27 across 15 Nov – 30 Nov. …"
   - "Your savings goal rose by £100 to £250. …"
8. **Projections:** these match v1 exactly, e.g. £1,049.57 / £1,061.28 / £1,069.57; put in £1,040; income £3,300.
9. **Dates in engine sentences** read "10 Nov" (no weekday). UI-built labels use "Tue 10 Nov".

## 7. Dropdowns

The families are unchanged (v1 §8):
- Month, category, recurrence and spent-item menus use basic `@reui/c-dropdown-menu-1`.
- The planned-item menu uses submenu `-5`.
- The app menu uses complex `-8`. Its Theme submenu offers Dark (default) / Light / Match device.

Restyle:
- **Menu:** `--surface-2`, radius 20, padding 8.
- **Items:** 42px (44 touch), radius 12. The highlighted item is `--s3`; checks are lime.
- **Group labels:** 11.5/800 uppercase.
- **Demo switch:** a lime track.

Images: `plan-month-menu`, `plan-day-category`, `settings-recurrence-menu`, `plan-day-item-menu`, `plan-account-menu`.

## 8. Known gaps and weaknesses

- The D16 dinner figures are placeholders, and the concert shortfall may move. Re-render once the engine lands; the build only needs the §6 text updated.
- The illustration stage colour conflicts with the contract (see §2).
- Desktop cells truncate long chip labels ("Shower…", "Utiliti…" at narrower widths). The amount always shows, and the full label is in the day detail and `aria-label`.
- The tablet range (768–1023) uses the mobile layout and isn't imaged. Only `/plan` has light-theme images.
- The rent illustration sits close to the stage edge on mobile (it's the asset's own margin).
- The mobile settings and agenda pages are long scrolls by nature.
