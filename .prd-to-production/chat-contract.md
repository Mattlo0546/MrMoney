# Chat agent contract (D20–D22) — binding for the backend and chat-UI agents

## Principle
Argon decides **what** to do and talks to the user. The deterministic engine (`@/lib/engine`, run in the browser through `@/lib/store`) does **all** arithmetic. The model never states a computed budget number that the engine hasn't produced. Rates and deals come only from grounded search, with sources.

## Flow (one chat turn)
1. Client → `POST /api/chat` with:
   - `{ messages: ChatMessage[], context: { today, demoMode, hasPlan, summary?, planDigest?, categories? }, toolResults?: ToolResult[] }`.
   - `summary` and `planDigest` are small, client-computed engine outputs: totals, today's allowance, bills, and the next 14 days' totals. Never send the whole state.
2. The server runs `gemini-4-argon` with function declarations. Results:
   - **Client tools** (they touch the plan): the server returns `{ kind:'tool_calls', calls: ClientToolCall[], assistantDraft? }`. The client executes them via the store and engine, then calls `/api/chat` again with `toolResults`. The server continues the model turn and loops until a final reply. Cap the loop at 6 steps.
   - **Server tools** (`research`): run on the server inside the same request (a Google Search–grounded Gemini call). Stream progress if possible.
   - **Final:** `{ kind:'reply', text, cards: Card[] }`.
3. Streaming is optional. If implemented, use SSE events: `status` ("thinking…", "searching the web…"), `tool_calls`, `reply`. Non-streaming is acceptable for v1; the UI shows a status from a `phase` field.

## Client tools (function declarations; args validated with zod on BOTH sides)
| name | args | client executes | result returned to the model |
|---|---|---|---|
| `setup_plan` | funds (pence), fundsType lump\|monthly, horizonEnd (ISO), commitments[{name, amountPence, dayOfMonth, recurrence}], incomes[{label, amountPence, date ISO, confirmed}], minimumReserve, savingsGoal, foodWeeklyPence, transportWeeklyPence, priorities[], city? | `store.completeOnboarding` (build the Profile the same way `src/components/onboarding/model.ts` does; reuse that builder) | ok + engine summary, or validation errors (the model then asks the user) |
| `record_expense` | amountPence, date, category, note | `store.apply` (expense intent) | diff explanation + summary |
| `record_income` | amountPence, date, label, confirmed | `store.apply` | same |
| `check_purchase` | amountPence, date, category, label | `store.preview` (hypothetical / affordability), shown as a card with Apply/Discard; NOT committed | fits, shortfall, borrowing message, options[id, summary] |
| `change_commitment` | name, deltaPence or newAmountPence, effectiveFrom | preview card → the user confirms → apply | explanation |
| `set_goal` | extraSavingsPence, byDate? | preview → confirm → apply | explanation |
| `keep_available` | amountPence, date | apply | explanation |
| `apply_deal` | plannedPurchaseLabel or category, newAmountPence or percentOff, dealRef | preview → confirm → apply (lowers the planned amount; the saving then counts) | explanation |
| `use_rate_in_projections` | bucket savings\|investments, ratePercent, sourceRef | update the projection assumptions (persisted) after the user confirms | ok |
| `undo_last` | — | `store.undo` | ok |
| `start_demo` | — | `store.startDemo` | summary |

Destructive or protected changes (commitments, goals, deals, projection rates) ALWAYS go through a confirm card; expenses and income apply immediately with Undo. Never apply a hypothetical.

## Server tool
- `research`: args `{ topic: 'savings_rates'|'cash_isa_rates'|'student_bank_accounts'|'student_deals'|'cheap_food'|'transport_savings'|'other', query, city? }`.
- It runs a grounded Gemini call (Google Search). Pick the fastest model that is accurate enough: try `gemini-3.5-flash` / `gemini-3.8-flash`, falling back to `gemini-4-argon`.
- It extracts STRUCTURED items `{ provider, product, headline (e.g. "4.75% AER variable"), ratePercent?, conditions[], sourceUrl, sourceTitle }`, plus `retrievedAt` (ISO).
- Every item must map to a grounding source URL; drop items without one.
- Cache per (topic, city) for 6h in memory.
- On failure: return the curated sample offers from `@/lib/offers`, labelled `sample: true`.

## Cards (rendered in the chat; types exported from `src/lib/agent/types.ts`)
- `plan_created`
- `change_applied`, with an Undo handle (the changeId)
- `preview`, with Apply/Discard, or trade-off options to choose
- `clarify`, with quick-reply chips
- `research_results`: items with source links, the retrieval time, and the label "Live search result. Check with the provider before acting." Each item has actions: "Use this rate in projections", "Apply to a planned purchase".
- `error`

## System prompt essentials
- You're StudentPlan, a friendly, concise money assistant for UK international students. Replies are 1–3 sentences.
- Ask one question at a time during setup, grouping where natural. Use sensible defaults and say so.
- Never invent numbers or rates. Use tools for every number and research for every rate.
- Never recommend a specific stock. Investments are general categories with "not advice".
- Currency is GBP; ask before handling any other currency.
- Today's date comes from context, and in demo mode it is the demo date.

## Files and ownership
- **Backend agent:** `src/lib/agent/**` (types, tool schemas, system prompt, Gemini client, research) and `src/app/api/chat/**`.
- **Chat UI agent:**
  - `src/components/chat/**`, `src/app/page.tsx`, `src/app/onboarding/**` (becomes chat-first) and `src/components/plan/layout/**`.
  - Composer and change are swapped for Chat in the right panel; the mobile chat-first layout lives here too.
  - It may also edit `src/components/plan/composer/**` and `src/components/plan/change/**` to retire or reuse them.
- **Shared types:** `src/lib/agent/types.ts`, owned by the backend agent and written FIRST, within 10 minutes. The UI agent imports it and waits for it.
- Model IDs: `gemini-4-argon` (chat). The key is `GEMINI_API_KEY` in `.env.local`, server-side only.
- The dev server is http://localhost:3210. Never use port 3000, and never start or kill servers.
