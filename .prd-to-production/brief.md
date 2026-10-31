# StudentPlan — compact PRD (brief v2)

Sources: `source/original-prompt.md`, `source/handwritten-notes.md`, `source/user-feedback-1.md` (wins on conflict). Working name StudentPlan.

## Problem, users, goal

UK international students have a finite sum, either a multi-month lump sum or a monthly allowance, that must last until a set date. Allocating it across rent, food, transport, emergencies and savings takes spreadsheets and mental arithmetic. Too many banks and rates, food options and prices, and transport costs make every choice harder. Promise: **"Know what you can spend today, and see how a change affects the rest of your month."** **Success:** a student understands what they can spend today and adjusts the plan with one sentence. Tone: practical and supportive, never judgmental. **The core flow (onboarding → calendar → replanning → Undo) comes before breadth.** R-sketches, R-projections and R-offers must not delay it.

**Non-goals:** bank connections, transfers, trading, currency conversion, live retailer/offer integrations, naming or recommending real products or stocks, promised returns. **Roadmap:** bank comparison, verified offers, % allocation across real products and assets, daily restaurant and deal picks, recipe-based grocery costing, online-vs-store prices.

**Assumptions:** GBP only. Single user per device. No accounts. The demo needs no paid service.

## Screens

| ID | Route / tab | Content |
|---|---|---|
| P-onboarding | `/onboarding` | Concise steps, each with a pencil sketch; "Try a demo student" |
| P-plan | `/plan` | Summary figures, calendar, change input (right side panel on desktop; docked bottom bar that opens a sheet on mobile) |
| P-plan-day | `/plan` tab `day` | Selected day: planned vs actual items |
| P-plan-change | `/plan` tab `change` | Interpretation, clarification, preview/Apply, trade-offs, explanation, Undo |
| P-plan-offers | `/plan` tab `offers` | Sample student offers |
| P-projections | `/projections` | Predicted savings, investment value and income over a chosen period |
| P-settings | `/settings` | Edit profile, commitments, income, reserve, goals, assumptions; reset |

## Requirements

**R-onboard** — Concise steps collecting only what the plan needs:
- Funds, and whether they are a lump sum or a monthly allowance.
- Last-until date.
- Whether the student has a job, and if so, pay amount and dates.
- Other confirmed income (amount, date).
- Rent and fixed commitments (amount, due date, recurrence).
- **Minimum** emergency reserve.
- Savings goal, and current savings/investments.
- Food and transport needs.
- Spending priorities.
- Optional: city/area, diet, discount memberships.

A lump sum is spread over the whole horizon, never assigned to month one. Job pay counts toward the plan only when the student marks its amount and date as confirmed; otherwise it appears only in projections. Fields have editable defaults; projection rates have none (R-projections). Invalid input shows field errors and creates no plan. *Accept:* onboarding yields a valid plan; changing the end date changes the monthly and daily amounts.

**R-sketches** — Each onboarding step shows a unique, cozy pencil-sketch illustration of its topic, made by a dedicated creative agent.

**R-demo** — "Try a demo student" loads a coherent fixture dated relative to a fixed demo date, which is shown while demo mode is on. It needs no bank, credentials or paid service. *Accept:* load → calendar → record a £35 expense → days and totals update → "Can I spend £20 on dinner tomorrow?" → Apply → an unaffordable ask → shortfall → pick a trade-off → add £200 income → Undo → projections.

**R-summary** — Shows remaining funds, money reserved for commitments, minimum reserve, planned savings, remaining flexible budget, and today's allowance. No decorative charts.

**R-calendar** — A month grid on desktop and a stacked agenda on mobile, navigable across the horizon. Each day shows its planned total prominently and its exact category items (rent, groceries, transport, eating out, books…). Actual spending is visibly distinct from planned, and planned spending is never labelled as spent. Fixed commitments look different from flexible items. Past, today and upcoming days are distinguishable. *Accept:* commitments fall on the correct dates across months of different lengths.

**R-day** — The day detail lists item amounts; actual entries and flexible amounts are editable through the engine.

**R-nl** — The input reads "Tell me what changed…" and handles:
- An actual expense ("I spent £35 on a shower filter today").
- A hypothetical ("Can I spend £20 on dinner tomorrow?").
- Income ("I received an extra £200").
- A price or commitment change ("My rent increases by £50 next month").
- A preference ("Keep £30 available for Saturday").
- A goal ("Save another £100 by month end").

Each sentence becomes a validated structured intent before any mutation. Real parsing and calculation are required, not canned or hardcoded responses. An ambiguous amount, currency (non-GBP is asked about, never converted), date or intent gets a concise clarification. A failure leaves state untouched. AI runs server-side only. Without a key, a deterministic parser behind the same interface handles these intents, labelled as demo parsing, and the app never claims an AI connection it lacks.

**R-actual** — Actual expenses and income go to the ledger, then the plan recalculates. *Accept:* the £35 and £200 steps produce correct totals.

**R-preview** — Hypotheticals show a preview with Apply; nothing is committed before Apply. *Accept:* state is identical after a preview without Apply.

**R-feedback** — Each applied change shows:
- The interpreted action.
- A **bubble effect** on only the changed days and items (a static highlight under reduced motion).
- A plain-language explanation from the engine diff, naming the categories the money came from and confirming that protected items are unchanged. Example: "Added your £35 expense. Eating out decreased by £20 and shopping by £15. Rent and your emergency reserve are unchanged."
- An Undo action.

*Accept:* explanation numbers equal the diff.

**R-undo** — Undo restores the prior state exactly (deep equality).

**R-tradeoff** — If a request doesn't fit, state the shortfall, offer concrete alternatives drawn from flexible categories, let the user choose, and preview before Apply. *Accept:* an unaffordable request shows a clear shortfall and useful options.

**R-protect** — Rent, locked commitments and the minimum reserve change only through an explicit user instruction (a settings edit, or a confirmed NL change such as a rent increase), never as a side effect of reallocation. If essentials can't be covered, the deficit is shown and explained. No negative allowances, no invented income. *Accept:* protected items are never silently reduced.

**R-engine** — Deterministic; AI never computes amounts. Rules:
- Integer pence with an explicit currency (GBP).
- Funds are allocated over the whole horizon.
- Income cannot fund a bill due before it arrives.
- Money for upcoming essentials stays available.
- Actuals and their planned allocations are never double-counted.
- History is preserved; only future flexible amounts are reallocated.
- Recurrence is correct across month lengths.
- Rounding remainders are distributed deterministically.
- Unallocated funds and deficits are explained to the user.
- Changes are idempotent.

Spending, emergency, savings and investments are planning buckets. Invariants are documented and tested.

**R-projections** — Estimates savings, investment value and cumulative income over a period the user picks. Every rate is user-entered and starts empty; there are no pre-filled rates or returns. Outputs are labelled "projection, not advice or a guarantee" and are computed by the engine. *Accept:* changing a rate or period updates the figures correctly.

**R-offers** — A small, clearly labelled **sample** catalogue matched to the plan, location and preferences, each with its eligibility and assumed conditions. No retailer integration is claimed unless one exists. A discount counts as saved only once applied to a planned purchase or recorded as a lower actual price.

**R-persist** — The plan and ledger survive refresh. A clearly labelled reset is available. *Accept:* refresh preserves the plan.

**R-data** — Separate modules: profile; ledger; commitments; allocations; parser; engine; preview/explanation/undo; projections; offers.

**R-ux** — Calendar-centred, polished and cozy: restrained colour, clear type, generous spacing, accessible contrast, keyboard navigation, reduced motion. Loading, empty, validation and error states are handled. *Accept:* every screen works on desktop and mobile.

**R-deliver** — Deliverables:
- PRD.
- Implementation plan and data model.
- MVP.
- Engine and journey tests.
- Desktop/mobile render checks.
- Setup instructions, a 3-minute demo script, and limitations.
- Root `status.md`, `design.md`, `decision.md` and `architecture.md`, kept current; `status.md` updated every step.
- All work done by dedicated agents.

## Open decisions

1. **Platform:** installable PWA on Vercel's free tier, shared by QR code; no native app or Xcode. Plans are stored locally per device.
2. **Stack:** Next.js, TypeScript, Tailwind, Vitest, Playwright. Gemini (Flash-class) is called via `/api/parse` when `GEMINI_API_KEY` is set. Model IDs are needed.
3. **Accounting:**
   - Flexible pool = balance + future confirmed income − (unpaid commitments + minimum reserve + remaining savings goal).
   - The pool is spread over today…end by category weights, with a per-day cash constraint.
   - A request "fits" if it is ≤ that day's remaining flexible allowance; the shortfall is the excess.
   - Overspend is taken from future flexible days.
4. **Fixture:**
   - Demo date 2026-11-10; end 2027-01-31 (83 days).
   - £3,900 lump sum (November rent already paid); no job; £300 family transfer on 18 Dec.
   - Rent £620 on the 1st; utilities £55 on the 15th.
   - Minimum reserve £500; savings goal £150.
   - This gives ≈ £25.84/day flexible, so the £20 dinner fits.
   - Unaffordable ask: "Can I spend £60 on a concert ticket on Saturday?" leaves a ≈£34 shortfall that needs a trade-off.
5. **Success measures:** demo in ≤3 min; replanning in under 1 s locally; every engine invariant tested.
6. **Projection scenarios:** low, base and high from user-entered rates; monthly compounding.
7. **Offers:** curated seed data per `research/integrations.md`. Maps grounding would be a stretch goal, but it **conflicts with the "live integrations" non-goal**, so adopting it means amending that non-goal. No scraping.
8. **Skill gap:** `software-design-patterns` is missing.
