# Status

_Updated by the orchestrator at every step. Newest entry first._

## Now
- **Phase:** 2, mockups (running), plus early non-UI build (D13).
- **Gates:**
  - Brief: ✅ approved (v2).
  - Design: 🔁 redo. Mockups v1 rejected; new Cleo-inspired direction (D15).
  - Build: 🔒 locked.
- **Branch:** `prd/studentplan`. Nothing committed yet.

## Agents
| Agent | Role | Task | State |
|---|---|---|---|
| research ×5 (other session) | Research | Integrations: MCP vs API vs scrape | ✅ done → `.prd-to-production/research/integrations.md` |
| prd-reviewer | Review | Independent loss/invention audit of brief v2 against sources | ✅ done: 30 findings, all applied |
| architect | Planning / architecture | Draft `architecture.md` | ✅ done (12 invariants I1–I12, module seams, pipeline diagram) |
| sketch-artist | Creative | Onboarding pencil sketches via Nano Banana 2.1 → `design/sketches/` | ✅ done: 10 sketches, WebP ≤40KB, 12 generations |
| mockup-designer | Design / build | `design/spec.md`, prototypes, desktop+mobile PNGs for 7 screens, contact sheet | ✅ done: 47 PNGs, design check passed |
| scaffolder (Sonnet) | Execution | Next.js + TS + Tailwind + Vitest + Playwright scaffold | ✅ done: Next 16.4, React 19.3; install/typecheck/lint/build/test all exit 0 |
| engine-dev (Opus) | Execution | Deterministic budget engine + invariant tests (`src/lib/engine`) | 🔄 running |
| designer | Design | Draft `design.md` (direction, tokens, bubble motion, sketch brief) | ✅ done: "Pencil for plans, ink for what happened" |

## Log
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
