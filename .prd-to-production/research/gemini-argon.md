# Gemini 4 Argon research (as of 2026-10-31)

Method: WebFetch summaries of ai.google.dev pages (summaries produced by a small model; quotes not verbatim-verified). Items marked UNVERIFIED need a manual check.

## 1. Gemini 4 Argon
- Model ID: `gemini-4-argon`, status Stable (New), updated Oct 2026. Source: https://ai.google.dev/gemini-api/docs/models and https://ai.google.dev/gemini-api/docs/models/gemini-4-argon
- Context: 1,048,576 tokens, shared between input and output. Max output 65,536 default, up to 1,048,576 with "long decode".
- Thinking: levels low / medium / high; no token budget option mentioned.
- Inputs: text, image, video, audio, PDF. Output: text only. No Live API, no image/audio generation. Implicit caching only (no explicit). Batch, Flex, Priority available.
- Knowledge cutoff: not stated.
- Third-party reports of GA 13 Oct 2026 (toolhalla) are consistent but secondary; the official page is the source.

## 2. Tools on Argon
Supported per model page: function calling, structured outputs, Google Search, Google Maps, URL context, code execution, computer use, file search.
- Combining built-in + custom function tools in one request: Preview, Gemini 4 and 3 models; include `function_declarations` alongside built-ins. Restriction: function calling mode must be `validated` when tool context circulation is on; `auto` not supported. Conflicting location/time info in system instruction can degrade it. Source: https://ai.google.dev/gemini-api/docs/tool-combination
- Structured output + tools (Search, URL context, code exec, file search, function calling): Preview. Page text says Gemini 3 series, but its example uses gemini-4-argon (inconsistent; UNVERIFIED for Argon). Google Maps NOT listed as combinable with structured output. Schema subset only (minLength, maxLength, uniqueItems, contains not enforced). Source: https://ai.google.dev/gemini-api/docs/structured-output
- Maps + Search combo needs 3.5 Flash-Lite or later. Source: https://ai.google.dev/gemini-api/docs/maps-grounding
- Computer Use and custom functions are client-side; Search/Maps/URL context/File Search are server-side with context circulation.
- Whether every pairing (e.g. Computer Use + structured output) works: UNVERIFIED.

## 3. Other models (https://ai.google.dev/gemini-api/docs/models)
- `gemini-3.8-flash` (Stable, New), `gemini-3.6-flash` (Stable), `gemini-3.5-flash-lite` (Stable), `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview`, `gemini-3-flash-preview`.
- Maps grounding: Argon, 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite, 3.1 Pro Preview, 3.1 Flash-Lite, 3 Flash Preview, 2.5 family.
- Computer Use: Argon, 3.8 Flash (recommended), 3.5 Flash-Lite, 3 Flash Preview. 3.6 Flash NOT listed on the computer-use page. Source: https://ai.google.dev/gemini-api/docs/computer-use
- Old Computer Use Preview model `gemini-2.5-computer-use-preview-10-2025` is listed as SHUT DOWN. Computer Use is now a tool on the main models.

## 4. Computer Use
- Client loop: send prompt + screenshot, get a suggested UI action as function call, execute in your own environment (examples use Playwright), return new screenshot. Coordinates are 0-999 normalized; scale to viewport. Sandbox recommended.
- Environments: browser, mobile, desktop (different action sets, e.g. navigate/scroll/type; open_app/list_apps).
- Safety: response may carry `safety_decision` = `require_confirmation` or blocked; prompt user, then set `safety_acknowledgement` in function_result. Overrides (`disabled_safety_policies`) are preferences only. Prompt-injection detection opt-in, default false, on 3.5 Flash-Lite+.
- Terms: may contain errors/vulnerabilities; avoid critical decisions, sensitive data, irreversible actions; see Prohibited Use Policy and Additional ToS. "You may not automatically bypass requests for human confirmation"; you are solely responsible for actions taken. Source: https://ai.google.dev/gemini-api/terms
- JS: examples use `ai.interactions.create(...)`; exact tool-declaration shape not captured (UNVERIFIED).

## 5. Grounding terms (https://ai.google.dev/gemini-api/terms; summarized)
Search:
- Only in an app you own and operate; show Grounded Results with Search Suggestions to the end user; `search_suggestions` HTML snippet provided in the `google_search_result` step.
- Text of results may be kept up to 2 years only in limited cases (display evaluation, user chat history). No programmatic/automated access to results.
- May not cache, frame, syndicate, resell, analyze, train on, or learn from results/suggestions; no collecting links to build an index or crawl. So NO building a dataset. No click tracking, no modification/mixing, no interstitials.
Maps:
- Own app; show with Google Maps links; no modifying/mixing; no interstitials. Attribute "Google Maps" unchanged (translate="no"); show source name linked to annotation URL, immediately after the content it supports.
- Cache up to 90 days only to evaluate/optimize display; chat history up to 6 months. No scraping/exporting; no training. English only; may be region-limited.
- Pricing: 5,000 free/month (shared) then $14/1,000 queries (Gemini 3+). Search default 1,500 RPD/project paid. https://ai.google.dev/gemini-api/docs/google-search

## 6. URL context (https://ai.google.dev/gemini-api/docs/url-context)
- Up to 20 URLs/request, 34MB per URL, public only (no localhost/private/tunnels). Paywalled content unsupported; no YouTube, Workspace files, video/audio. Types: html, json, txt, xml, css, js, csv, rtf, PNG/JPEG/BMP/WebP, PDF. Retrieved content billed as input tokens. Works with Search.
- robots.txt: page does not mention it (UNVERIFIED).

## 7. SDK
- `@google/genai` latest on npm: 2.32.0 (modified 2026-10-29; `npm view`). GitHub README mentions a future 3.0.0 requiring Node 22+ (README appears stale vs npm; UNVERIFIED).
- Declarations (Interactions API): `tools: [{ type: "google_search" }]`, `{ type: "url_context" }`, `{ type: "code_execution" }`, `{ type: "google_maps", latitude, longitude }`, `{ type: "function", name, description, parameters }`. Structured output via `response_format` with `schema` (JSON Schema). Legacy generateContent: `config.tools` with `functionDeclarations` and `parametersJsonSchema`. Sources: https://github.com/googleapis/js-genai and doc pages above.

## 8. Agent frameworks
- Interactions API is GA and "recommended for all new projects"; generateContent is "legacy" but supported; supports background=true, previous_interaction_id state (stored 55 days paid / 1 day free). Integrations listed: LangChain/LangGraph, CrewAI, LlamaIndex, Vercel AI SDK, Temporal; ADK not mentioned. https://ai.google.dev/gemini-api/docs/interactions
- ADK TypeScript (`@google/adk`, npm 2.4.0 per `npm view`; repo https://github.com/google/adk-js) exists; the search snippet said pre-1.0 / not production-recommended, which may be stale (UNVERIFIED). Blog: https://developers.googleblog.com/introducing-agent-development-kit-for-typescript-build-ai-agents-with-the-power-of-a-code-first-approach/
- Hackathon recommendation: use Interactions API directly with a hand-written loop; ADK optional.
