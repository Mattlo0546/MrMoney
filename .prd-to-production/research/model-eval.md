# Model evaluation — which model for which job (2026-10-31)

Run against the user's AI Studio key, through the REST `generateContent` endpoint. Scripts and raw outputs are in the session scratchpad (`eval.py`, `argon_bakeoff.py`, `score_chain.py`, `eval-*.json`, `chain-*.json`). These are single runs on small samples, so treat the results as directional.

## 1. Intent parsing (R-nl): structured output, 26 cases × 2 repetitions

- **Demo date:** Tue 2026-11-10.
- **Cases:**
  - the six R-nl intents
  - slang: "a fiver", "45 quid", "2 pounds 80"
  - Chinese and Hindi input
  - two expenses in one message
  - currencies other than GBP: yuan, dollars
  - a missing amount
  - an attempt to reduce a protected setting
  - a split bill, which would need arithmetic
  - recurring dates and relative dates
- **Setup:** strict JSON schema (`responseJsonSchema`).

| Model | Score | Median / p90 latency | Misses |
|---|---|---|---|
| **gemini-4-argon** | 50/52 | 5.4 s / 7.0 s | Asked "this Friday (13th) or next week's (20th)?" for "next Friday". That is arguably correct in UK English. **Only model to pass the rent +£50 delta.** |
| gemini-3.8-flash | 50/52 | 3.4 s / 4.9 s | Rent +£50 → asked for the new total |
| gemini-3.7-flash | 50/52 | 3.1 s / 4.8 s | Rent +£50 |
| gemini-3.6-flash | 50/52 | 3.1 s / 4.2 s | Rent +£50 |
| gemini-3.5-flash | 50/52 | 3.0 s / 4.3 s | Rent +£50 |
| gemini-3.1-pro-preview | 50/52 | 5.4 s / 7.1 s | Rent +£50 |
| gemini-3.5-flash-lite | 46/52 | **0.7 s** / 0.8 s | Rent; "a fiver"; Hindi (asked the user to write in English); "around £14" |

All models were consistent across both repetitions. All of them correctly asked for clarification on yuan and dollars, the split bill, and a reserve set to zero. In the first run, the "preference" vs "goal" confusion came from an undefined type in the prompt, not from the models. The fix is to keep type definitions in the system prompt.

## 2. Live Maps grounding: "lunch under £10 near UCL", one run each

| Model | Time | Maps sources | £ prices in answer | Top picks |
|---|---|---|---|---|
| **gemini-4-argon** | **24.8 s** | 12 | 16 | George Farha Café (SU), Caffe Presto |
| gemini-3.5-flash | 29.4 s | 12 | 13 | ICCO Pizza, Roti King |
| gemini-3.6-flash | 31.9 s | 13 | 13 | George Farha Café, ICCO |
| gemini-3.1-pro-preview | 44.2 s | 11 | 22 | Wilkins Refectory, Print Room Café |
| gemini-3.8-flash | 53.9 s | 17 | 13 | ICCO Pizza, Piccolo Café |
| gemini-3.5-flash-lite | **5.1 s** | 11 | 13 | George Farha Café, Print Room Café |

Every model returned real places near UCL, and they all overlap. Nobody hand-checked the prices. Anything over about 5 s needs streaming, or a "thinking" state, in the UI.

## 3. Data collection: the chain-discount task (Search + URL context vs Claude)

| Agent | Entries | Source URLs that load (200) | Broken (404) | Confidence claimed | % agreement with Claude |
|---|---|---|---|---|---|
| **Claude (Sonnet subagent, web search/fetch)** | **36** | **31 (86%)** | 5 | 3 high / 18 medium / 15 low | — |
| gemini-3.1-pro-preview | 31 | 23 (74%) | 5 | 26 high | 23/29 |
| gemini-4-argon | 31 | 18 (58%) | **12** | 17 high / 14 low | 25/29 |
| gemini-3.8-flash | 31 | 18 (58%) | 10 | 20 high | 24/28 |

- **Argon:** ran 39 searches with 134 grounding sources, and took 196 s. **It still wrote plausible-looking brand URLs that 404.** Its "confirmed on official page" notes are not reliable.
- **3.8 Flash:** returned **0 grounding sources and 0 searches**. It answered from memory.
- **All Gemini runs:** they marked most entries high confidence. Claude was more conservative, and its sources mostly load.

The fix, if Gemini collects data: take source URLs from `groundingMetadata.groundingChunks`, never from the model's prose, and verify each with an HTTP check. Remember that the **Search grounding terms forbid storing results as a dataset** (see `gemini-argon.md`). This task is only suitable as an evaluation, or as a URL-context pass over known first-party URLs.

## Recommendation

| Job in the app | Model | Why |
|---|---|---|
| **Main agent / orchestrator** (intent → tools → engine → explanation) | **gemini-4-argon** | It handles nuance best (it was the only model to pass the rent delta, and it flagged the genuinely ambiguous date), supports every tool, and is the hackathon's model. Its 5 s latency is acceptable behind the preview flow. |
| Live Maps "cheap food near me" | **gemini-4-argon** | It was the fastest grounded answer among the full models (25 s). Stream it. |
| Instant pre-parse / typing hints (optional) | gemini-3.5-flash-lite | It takes under 1 s, but it is **not** accurate enough to be the parser of record (it fails on Hindi and slang). |
| Fallback if Argon errors or is rate-limited | gemini-3.5-flash | Same accuracy as the other Flash models, and fastest of them (3.0 s). |
| Curated-dataset refresh (offline) | **Claude research agents**, or gemini-3.1-pro-preview with URL verification | Most live sources. Argon and 3.8 Flash produced too many broken URLs. |
| Screenshot extraction (XHS/IG) | Not yet tested | Next eval: 10 real screenshots, checking place, dish and £ price. |

All arithmetic stays in the deterministic engine (R-engine). The model only emits validated intents.
