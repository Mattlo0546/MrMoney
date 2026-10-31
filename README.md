# StudentPlan

StudentPlan helps UK international students whose money has to last until a set date, either a lump sum or a monthly allowance. It turns that sum into a day-by-day plan (rent and bills first, then a flexible daily allowance) and lets you change the plan with one sentence, such as "I spent £35 on a shower filter today" or "Can I spend £20 on dinner tomorrow?". Every amount is computed by a deterministic engine; AI only reads your sentence. Every change shows a plain-language explanation and an Undo. Your data stays on your device.

> Note: the app is moving to a chat-first flow (decision D20). Sections marked "chat" may change.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # optional: add GEMINI_API_KEY=...
pnpm dev                     # http://localhost:3210
```

`GEMINI_API_KEY` is optional. Without it the app uses a deterministic "demo parser" and labels it as such. On the first screen choose **Try a demo student** to load a ready-made plan.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server on port 3210 |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest: engine, store and parser unit and property tests |
| `pnpm test:e2e` | Playwright journeys on desktop (1440x1000) and mobile (390x844); expects the app on http://localhost:3210 (reuses a running server) |

## Architecture

See [architecture.md](architecture.md) for the module map, data model and invariants, [decision.md](decision.md) for decisions, [design.md](design.md) for the visual system, and [status.md](status.md) for progress. In short: a Next.js App Router PWA; a pure TypeScript engine (integer pence, no clock) in `src/lib/engine`; a store with localStorage persistence and an undo stack in `src/lib/store`; and one server route, `/api/parse`.

## How parsing works (Gemini and demo fallback)

`POST /api/parse` receives the sentence, today's date and the category names. If `GEMINI_API_KEY` is set, a Gemini Flash-class model (see D5/D19) turns the sentence into a structured intent, validated with Zod, with a 4 second timeout. If there is no key, or Gemini fails or times out, a deterministic parser behind the same interface handles it. The response carries `source: 'gemini' | 'demo'` and the UI shows "Read by Gemini" or "Demo parsing". The key is read server-side only and never reaches the browser. The model never computes amounts. Ambiguous input (a missing date, or a non-GBP currency) gets a clarifying question and changes nothing.

## Project structure

```
src/app/            routes: /onboarding, /plan, /projections, /settings, /api/parse
src/components/     onboarding, plan (calendar, day, change, composer, offers), projections, settings, shell, ui
src/lib/engine/     allocation, accounting, intents, diff, explanations (see its README)
src/lib/parser/     Gemini and demo parsers
src/lib/store/      persisted state, undo
src/lib/offers/     curated sample offers
e2e/                Playwright specs
docs/               demo-script.md, limitations.md
.prd-to-production/ process folder: brief (PRD), research, design mockups, approvals, QA reports
skills/             process skill (prd-to-production) used by the agents that built this
```

`.prd-to-production/` and `skills/` document how the project was produced (brief, gates, QA); they are not needed to run the app.

## Testing

- `pnpm test`: the engine's invariants (no negative figures, cash availability, no double counting, protected items, idempotency, exact Undo) plus parser and store tests.
- `pnpm test:e2e`: the demo journey and layout/focus checks. Start the app first (`pnpm dev`).
- Known limits are listed in [docs/limitations.md](docs/limitations.md); the demo walkthrough is [docs/demo-script.md](docs/demo-script.md).
