# MrMoney — design direction (v2)

> **Status:** v2 direction approved (D15, D18). Binding order: `.prd-to-production/ui-contract.md` (tokens, fonts, ownership), then `.prd-to-production/design/spec.md` (behaviour, copy, states, figures), then the mockups (`design/index.md`, 62 images). v1 is archived in `design/v1-rejected/`.

> **v3: white + gradient (user override).** The user asked for a minimalist white app with strong gradient components and an SVG icon at every value. Where this note disagrees with the dark/lime/navy text in §1–2 below, **v3 wins**; the rest of §1–2 is kept as history.
>
> - **Page and surfaces:** pure white (`--bg`/`--surface` #FFFFFF), `--surface-2` #F2F3F8, hairline `--line` #E5E7EF, soft `shadow-soft`/`shadow-card`. Text `--text` #0F172A (17.9:1), `--muted` #5B6478 (5.9:1 on white, 5.4:1 on surface-2). Light is the default whatever the OS prefers; `[data-theme="dark"]` is a coherent secondary theme.
> - **Colour lives in components, as gradient tokens** (`--grad-*`, utilities `bg-grad-primary|hero|positive|warning|negative` plus `-soft` tints): primary indigo→violet #4F46E5→#7C3AED (5.7:1 on its lightest stop, white text) for buttons, hero, active tabs, spent chips, user bubbles; positive emerald→teal #047857→#0F766E (5.5:1) for income, "fits", applied and the "changed" bubble halo; warning amber→orange #B45309→#C2410C (5.0:1) for fixed bills and previews that need a decision; negative rose→red #E11D48→#B91C1C (4.7:1) for shortfalls and destructive actions. Solid text colours `--accent/--pos/--warn/--neg` are all at least 4.5:1 on white. The old `--lime/--coral/--navy/--c-*` tokens are removed.
> - **Icon rule:** every displayed value (money, date, count, rate, setting) sits next to an SVG icon from `src/components/ui/Value.tsx` (`VALUE_ICONS`, `IconBadge`, `WithIcon`, `Stat`). Hero and tile numbers get a rounded gradient badge; rows, chips and lists get a 12–16px inline icon. Icons are `aria-hidden`; labels and test ids do not change. Axis ticks inside charts and prose sentences are exempt, and table cells rely on their row and column header icons.
> - **Focus:** `outline` is reset globally, so keyboard focus is a 2px violet box-shadow ring (`--accent-2`, 5.7:1 on white; lavender on dark); text fields show it on their wrapper.
> - **Semantics table (§3), re-skinned:** planned = dashed grey; spent = indigo gradient; fixed bill = amber gradient with a pin; income = emerald gradient; preview = dashed violet; shortfall = rose triangle; today = indigo gradient badge.

## 1. Direction: "Bold and bouncy"

Sleek, bold and fun to touch, inspired by modern money apps. We take no names, logos, mascots or screens from them. The voice is supportive and never roasts.
- **Deep navy base** (#0B0C1F) with vivid accents:
  - **Blue** for real money: actions and spending.
  - **Lime** for something that just changed, or good news.
  - **Coral** for a shortfall.
- **One big number** per screen (**£25.84** left today, at 64–72px).
- **Fewer, larger, tactile elements:** 24px cards, pill buttons and chips.
- **Springy interactions:** changed days "bubble".
- **Dark is primary** and light is fully specified, because this is a phone-first demo.

## 2. Tokens

The colour tokens are in ui-contract.md:
- Dark: bg #0B0C1F, surface #16183A, surface-2 #20235A, line #2C3070, text #F5F5FA, muted #A3A6D1.
- Accents: accent #3D5AFE, lime #C8F53C, coral #FF5A5F, navy #1B1F5E.
- Light: bg #F5F5FA, surface #FFFFFF, text #0F1024, lime text #5E7A00, coral #D93A40.

Text-contrast rules:
- **Blue:** on dark, accent-coloured text uses #8FA0FF.
- **Coral:** text on a coral fill is dark (white fails).

**Type:**
- **Bricolage Grotesque** 700/800 for display and every number.
- **Plus Jakarta Sans** for the UI.
- Money always uses `tabular-nums` and the engine's `formatMoney` ("£35", "£25.84", "£3,900").

**Shape:**
- Radii: cards 24, day tiles 18, inputs 16; buttons and chips are pills.
- Targets are at least 44px (mobile buttons 52–56).
- Focus is a 3px lime outline.
- Pressed is `scale(.96)` with a spring.

## 3. Semantics

| Role | Look |
|---|---|
| Planned | muted text, dashed outline |
| Spent | solid blue chip |
| Fixed bill | navy chip with a pin |
| Income | lime outline, "+£300" |
| Preview | dashed lime; "Preview · not applied" |
| Shortfall | coral chip "Short £85" |
| Today | blue ring and badge |

**Calendar rule:** an ordinary day shows **only its total**, and tapping it opens the day. Chips appear only for bills, income, spending, planned purchases, previews and shortfalls.

## 4. Layout

- **Desktop:**
  - **Top bar:** pill nav, demo badge, "…" menu.
  - **`/plan`:** a blue hero ("Left today" and "Flexible left") with four tiles, then the month calendar.
  - **Right panel** (400px): the chat composer "Tell me what changed…" on top, then the Day / Change / Offers tabs.
- **Mobile:**
  - **Header** and pill nav.
  - **Summary:** the hero, then 2×2 tiles.
  - **Agenda:** week-grouped rows.
  - **Docked composer:** it opens a bottom sheet with the same tabs.
- **Onboarding:** a progress bar, the illustration, a big question, the fields and Next. "Try a demo student" is always visible. Illustrations sit on a **light stage (#E6E8FF)** because navy objects fade on dark surfaces.
- **Projections:** a big Base total, Low/Base/High, and the disclaimer. Rates start empty. No chart.
- **Settings:** section cards, with Reset in a coral card and a confirm dialog.

## 5. Change chat

The sentence appears as a blue bubble. The reply card holds:
- The intent tag and the parser tag ("Read by Gemini" / "Demo parsing").
- The verdict.
- The engine sentence, verbatim.
- A before → after diff.
- "Unchanged" pills.
- Undo, or Discard / Apply.

Specific flows:
- **Trade-offs** are radio cards.
- **D17:** "I need to spend £35 on a replacement shower filter today" applies immediately.
- **D16:** the dinner reply says "Fits — borrows £8.47 from later shopping".

## 6. Motion

**Bubble** on changed days:
1. The day pops to about 1.05 with a lime halo (180ms).
2. The number counts to its new value (320ms).
3. It settles (260ms), while lime dots fizz up.

**Rules:**
- The stagger is 40ms, capped at 400ms.
- Only transform and opacity animate.
- **Reduced motion:** a static lime ring for 1.2s, then a fade.

## 7. Copy and dropdowns

**Copy:** no subtitles or blurbs. Buttons name their action. Errors name the fix.

**Dropdowns:** ReUI only.
- Basic `c-dropdown-menu-1`: month, category, recurrence and spent-item menus.
- Submenu `-5`: planned-item actions.
- Complex `-8`: the app menu.

## 8. Demo figures (engine)

- **Daily budget:** £25.84 a day.
- **£35 filter:** £9.16 comes from later shopping; the daily allowance becomes £25.73.
- **£60 concert:** £34.27 short (provisional).
- **+£200:** flexible left becomes £2,310.
- **Deficit:** £290 short (savings £150 + reserve £85 + £55).

The D16 pence figures are provisional.
