# Checkpoint

- **Phase:** 1 — compact brief, awaiting user approval of brief v2 (v1 was superseded by user feedback 1).
- **Branch:** `prd/studentplan` (from `origin/codex/add-prd-to-production-skill`).
- **Sources:** `source/original-prompt.md` (sha256 c0687ac5…8a38, 1922 words); `source/handwritten-notes.md` (transcribed from image).
- **Sources (added):** `source/user-feedback-1.md`.
- **Size:** brief v2 is 1586 words vs 1922 primary-source words, and about 2700 words across all sources. v1 was 1773 words.
- **Checks:** `workflow.py check --stage brief` passed.
- **Approvals:** none yet.
- **Agents:** none for brief v1. Research role (2026-10-31): 5 Sonnet subagents (supermarkets, banking, restaurant discounts plus one follow-up, places/prices, social) → `research/integrations.md`. Round 2 (2026-10-31): 7 more agents plus 2 follow-ups → `research/data/*.json`, `expansion.md`, `gemini-argon.md`. User accepted live Maps with a fallback and screenshot extraction, and set Gemini 4 Argon as the main agent. Brief changes are not applied (the PRD session owns brief.md and decision.md).
- **Blockers:**
  - `software-design-patterns` skill missing (needed for the build phase).
  - Gemini model IDs and API key unconfirmed.
- **Agents (brief v2):** prd-reviewer (independent audit), architect (`architecture.md`) and designer (`design.md`), all running in the background. Root logs: `status.md`, `decision.md`.
- **Next:** on approval, record it with `workflow.py approve --stage brief`, then produce mockups for P-onboarding, P-plan, P-plan-day, P-plan-change, P-plan-offers, P-projections and P-settings; the creative agent draws the onboarding sketches at desktop and mobile sizes.
