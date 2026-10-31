# Decisions

Log of product and engineering decisions. Status is either **Proposed** (awaiting user approval) or **Accepted** (approved, binding). The PRD is `.prd-to-production/brief.md`; the process skill is `skills/prd-to-production` (it names this file `decisions.md`, but the user asked for `decision.md`).

| # | Date | Decision | Status | Rationale / source |
|---|---|---|---|---|
| D1 | 2026-10-31 | Follow the prd-to-production gates: brief approval → mockups approval → build | Accepted (brief v2 approved 2026-10-31) | Skill + user request |
| D2 | 2026-10-31 | Every task is done by dedicated subagents; the main session orchestrates and integrates | Accepted | User feedback 1 |
| D3 | 2026-10-31 | Ship as an installable PWA on Vercel's free tier, shared by QR code; no native app or Xcode | Proposed | Fastest way for a room of people to try it; zero cost; no App Store review |
| D4 | 2026-10-31 | Stack: Next.js + TypeScript + Tailwind; Vitest; Playwright | Proposed | Repo has no app yet; the prompt asks for a modern TS web stack |
| D5 | 2026-10-31 | AI: Gemini `gemini-3.8-flash` via the server route `/api/parse` (`gemini-4-argon` is available if needed); deterministic parser fallback; AI never computes amounts. The key lives in `.env.local` (git-ignored). | Accepted (model IDs verified via the models API) | Gemini hackathon (notes); prompt rules |
| D6 | 2026-10-31 | The change input goes in a right side panel on desktop and a docked bottom bar plus sheet on mobile | Accepted (user delegated the choice) | Input and results stay beside the calendar; easy thumb reach on phones |
| D7 | 2026-10-31 | Projections tab uses user-entered rates with low/base/high scenarios; no real products or stocks; labelled not advice | Proposed | Reconciles the user's ROI request with the prompt's "no invented rates / stock picks" |
| D8 | 2026-10-31 | Local-only persistence (per device); no accounts | Proposed | No backend database needed; each person in the room has their own plan |
| D9 | 2026-10-31 | No scraping; offers come from curated sample data; Maps grounding is an optional stretch | Proposed | research/integrations.md |
| D10 | 2026-10-31 | Onboarding sketches are made by a dedicated creative agent during the design phase (after brief approval) | Accepted | The approval gate; onboarding steps must be final first |
| D11 | 2026-10-31 | Onboarding sketches are real raster drawings (WebP/PNG, transparent, 640×480 @2x, ≤40KB, graphite with one ochre accent), not procedural "sketchy" SVG | Accepted: generated with `gemini-nano-banana-2.1` (user choice) | design.md; skill craft-floor bans fake-sketch SVG filters |
| D12 | 2026-10-31 | Job pay feeds the plan only when confirmed; otherwise it is projections-only. Projection rates start empty. | Proposed | Reviewer: avoids "invented income" and "invented rates" |
| D13 | 2026-10-31 | The user authorised starting non-UI build work (scaffold, engine, tests) before design approval. UI still waits for mockup approval. | Accepted (user) | Mockups taking long; the engine doesn't depend on visuals |
| D14 | 2026-10-31 | Route models by cost: Sonnet for routine work (scaffold, test running, narrow fixes), Opus for engine logic, architecture and review | Accepted | User usage concern; skill cost-routing rule |
| D15 | 2026-10-31 | Redesign the visual direction: Cleo-inspired (sleek, modern, bold, playful, fun interactions). This replaces "Pencil for plans, ink for what happened". Take inspiration only: no Cleo name, logo, mascot or copied assets, and none of Cleo's roast-style tone (the PRD forbids a judgmental tone). Mockup set v1 is rejected. | Accepted (user) | User: v1 mockups "look hella ugly" |
| D16 | 2026-10-31 | Groceries get a daily minimum (essential floor). A same-day purchase that exceeds the day's non-essentials may borrow from later non-essential days ("borrow from the week"), and the explanation says so. Only asks larger than that borrowable amount show a shortfall and trade-offs. Demo: the £20 dinner fits by borrowing; the £60 concert still shows a shortfall. | Accepted (user) | User: groceries shouldn't fund a dinner out |
| D17 | 2026-10-31 | "I need to spend £X on Y today" is a committed expense (applied, with Undo), not a hypothetical. "Can I…/Could I afford…" stays hypothetical. | Accepted | The PRD's defining moment uses this exact sentence |
| D18 | 2026-10-31 | The user approved the v2 design direction and ordered the build to start now, before the v2 mockup set was complete. UI agents build from design.md and the v2 spec; the mockups are reconciled when they land. | Accepted (user override of the design gate) | approvals/design-v2-user-override.txt |
