# Status

_Updated by the orchestrator at every step. Newest entry first._

## Now
- **Phase:** 3, the BUILD (user go-ahead, D18). Dev server at **http://localhost:3210** (port 3000 belongs to northstar).
- **Gates:**
  - Brief: ✅ approved.
  - Design: ✅ approved (D18; v2 mockups complete, recorded in the workflow).
  - Build: 🔄 in progress.
- **Branch:** `prd/studentplan`, last commit `6417111` (local).
- **Shared UI contract:** `.prd-to-production/ui-contract.md`.

## Agents
| Agent | Role | Task | State |
|---|---|---|---|
| shell-ui (Sonnet) | Execution | Tokens, fonts, nav, UI primitives, illustrations, ReUI dropdowns | ✅ done: typecheck, lint and build pass; ReUI -1/-5/-8 installed; -8 used for the app menu |
| onboarding-ui (Sonnet) | Execution | 10-step onboarding with illustrations + demo shortcut | 🔄 running |
| calendar-ui (Sonnet) | Execution | /plan: summary, calendar/agenda, day detail, bubble, panels | ✅ code done (not browser-verified; it tested the wrong port) → QA |
| composer-ui (Sonnet) | Execution | Composer, Change panel (preview/apply/trade-off/undo), Offers panel | 🔄 running |
| pages-ui (Sonnet) | Execution | /projections and /settings | 🔄 running |
| engine-fix (Opus) | Execution | D16 (groceries floor, borrow from the week) and the review fixes (explanations, earmarks, trade-offs, idempotency) | 🔄 running |
| engine-reviewer (Opus) | Review | Independent engine review | ✅ done: core safe; 15 findings → engine-fix |
| designer-v2 (Opus) | Design | Mockups v2, Cleo-inspired, all 7 screens + states | ✅ done: 62 images; design check passed; approval recorded (D18) |
| parser-dev (Sonnet) | Execution | DemoParser + GeminiParser (`gemini-3.8-flash`) + `/api/parse` → `src/lib/parser/` | ✅ done: 52 tests; live Gemini smoke OK. Fix queued (D17). |
| store-dev (Sonnet) | Execution | localStorage store, preview/apply/undo, highlight state → `src/lib/store/` | ✅ done: 12 tests pass; typecheck and lint exit 0 |
| offers-dev (Sonnet) | Execution | Curated sample offers + matching → `src/lib/offers/` | ✅ done: 11 sample offers, 9 tests pass, lint clean |
| illustrator-v2 (Sonnet) | Creative | Regenerate the 10 onboarding illustrations in the bold, playful Cleo-inspired style (v1 kept in `sketches/v1-pencil/`) | ✅ done: palette navy #1B1F5E, blue #3D5AFE, coral #FF5A5F, lime #C8F53C |
| research ×5 (other session) | Research | Integrations: MCP vs API vs scrape | ✅ done → `.prd-to-production/research/integrations.md` |
| prd-reviewer | Review | Independent loss/invention audit of brief v2 against sources | ✅ done: 30 findings, all applied |
| architect | Planning / architecture | Draft `architecture.md` | ✅ done (12 invariants I1–I12, module seams, pipeline diagram) |
| sketch-artist | Creative | Onboarding pencil sketches via Nano Banana 2.1 → `design/sketches/` | ✅ done: 10 sketches, WebP ≤40KB, 12 generations |
| mockup-designer | Design / build | `design/spec.md`, prototypes, desktop+mobile PNGs for 7 screens, contact sheet | ✅ done: 47 PNGs, design check passed |
| scaffolder (Sonnet) | Execution | Next.js + TS + Tailwind + Vitest + Playwright scaffold | ✅ done: Next 16.4, React 19.3; install/typecheck/lint/build/test all exit 0 |
| engine-dev (Opus) | Execution | Deterministic budget engine + invariant tests (`src/lib/engine`) | ✅ done: 75 tests; demo figures asserted (£25.84/day, £34.27 shortfall) |
| designer | Design | Draft `design.md` (direction, tokens, bubble motion, sketch brief) | ✅ done: "Pencil for plans, ink for what happened" |

## Log
- 2026-10-31: Gemini latency ~3.5s → ~0.85s (gemini-3.5-flash-lite, D19).
- 2026-10-31: All 5 routes return 200 on :3210; repo typecheck has 0 errors. Calendar done; browser QA pending.
- 2026-10-31: Moved StudentPlan to port 3210; port 3000 is the user's northstar app. Fixed the /api/parse 500 by removing `runtime` (incompatible with cacheComponents). Gemini latency is ~7s; to optimise. Shell UI done.
- 2026-10-31: User said "build it". 6 agents launched in parallel: 5 UI and 1 engine fix. The engine review verdict is safe to build on.
- 2026-10-31: Parser done and committed. Decisions D16 (groceries floor, borrow from the week) and D17 ("need to spend" = expense). Engine change waits for the reviewer so all fixes are batched.
- 2026-10-31: Engine, store and offers verified by the orchestrator: 96 tests pass, typecheck and lint exit 0. Committed. Independent engine review started.
- 2026-10-31: Store done. Engine follow-ups to consider: an edit-entry intent, an undo diff, exporting the `UndoStack` type. The store works around all three today.
- 2026-10-31: Offers done. Before demo day, verify: Pizza Express 25% vs 30%, Leon %, Zizzi day tiers, Itsu redemption, My Waitrose perks. Whole-project typecheck currently exits 2 (other modules mid-write); to be rechecked at integration.
- 2026-10-31: The orchestrator fanned out 4 more agents in parallel (designer-v2, parser, store, offers) with non-overlapping file ownership. All build on the engine's `types.ts`.
- 2026-10-31: v2 illustrations done (bold, playful). Weak contrast for navy bodies on dark backgrounds; the v2 mockups should put them on a lighter card or use a lighter dark background.
- 2026-10-31: Committed `071acf5` (PRD, docs, sketches v1, mockups v1, scaffold). Illustrations being regenerated in the new style.
- 2026-10-31: User rejected mockups v1 as too plain. New direction: Cleo-inspired, sleek and playful (D15). Open: keep or drop the pencil sketches; three numeric questions (dinner from groceries, overspend source, repeated chips) still unanswered.
- 2026-10-31: Scaffold done (Next 16.4.3, Tailwind 4.3, Vitest 5, Playwright 1.64 reusing the local Chromium). `skills/` excluded from lint/typecheck.
- 2026-10-31: Mockups done (47 images, spec.md §7 worked numbers). Engine agent told to reconcile with spec §7.
- 2026-10-31: User asked to start the build in parallel. Non-UI work started: scaffold and engine (D13, D14).
- 2026-10-31: 10 onboarding sketches generated (Nano Banana 2.1). Open item: they need a light backing card in dark mode.
- 2026-10-31: Brief v2 **approved** and recorded (the key is redacted in the approval file). Key stored in `.env.local` (git-ignored). Models verified: `gemini-nano-banana-2.1`, `gemini-3.8-flash`, `gemini-4-argon`.
- 2026-10-31: Reviewer findings applied to brief v2 (now 1,623 words). Fixes:
  - Protected-change rule.
  - Confirmed vs expected job pay.
  - Empty projection rates.
  - Unaffordable demo ask (£60 concert).
  - Restored rules: no canned responses, clarification triggers, minimum reserve, explanation names source categories.
  - R-buckets merged into R-engine.
  - `workflow.py check --stage brief` passes.
- 2026-10-31: design.md drafted. Sketch format question raised (raster vs SVG).
- 2026-10-31: architecture.md drafted. Open risk: worked examples are needed for overspend vs late-arriving income.
- 2026-10-31: Brief v2 written. Changes: projections tab, job question, bubble effect, onboarding sketches, input placement, PWA proposal. It is compacted to 1,586 words (from 1,773 in v1). `workflow.py check --stage brief` passes.
- 2026-10-31: Research from the other session folded into open decision 7.
- 2026-10-31: Brief v1 written from the prompt and the handwritten notes.
- 2026-10-31: Repo `Mattlo0546/argon-hack` created; bede-lau invited.

## Blockers
- The `software-design-patterns` skill referenced by prd-to-production is missing.

## Next
The engine agent finishes → commit (pending user OK) → redesign mockups v2 (maybe in a fresh session; resume from `.prd-to-production/checkpoint.md` and this file).

_Previous:_ Sketches and mockups done → show the contact sheet → user approves the mockup set → build.
