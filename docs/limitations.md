# Limitations

An honest list of what MrMoney is not, and what is still open.

## Scope
- **No bank connection.** All figures come from what you enter. Nothing is verified against a real account.
- **Sample offers only.** The Offers tab shows a small, curated, clearly labelled sample catalogue. There are no real retailer or bank integrations and no live prices. A discount counts as saved only once applied to a planned purchase.
- **GBP only.** Other currencies are asked about, never converted.
- **Single user per device, no accounts.** Plans are stored locally (localStorage), so clearing site data or switching browser or device loses the plan. There is no sync or backup.
- **Not yet deployed.** It runs locally on port 3210. The Vercel PWA and QR code sharing are planned (D3) but not done.
- **Not financial advice.** Projections use only rates you type in (none are pre-filled) and are labelled "projection, not advice or a guarantee". No real products or stocks are named.

## AI and parsing
- **Gemini latency and fallback.** With a key, a parse takes roughly 1 second (a flash-lite model with minimal thinking); there is a 4 second timeout, after which the deterministic demo parser is used. The demo parser handles the supported intents but is less flexible with unusual phrasing, and the UI labels it "Demo parsing".
- Without an API key the app never claims an AI connection.
- The app is moving to a chat-first agent (D20); this document may need updating.

## Product gaps
- **Onboarding extras partially used (QA G1).** Current savings, investments, city, diet and memberships are stored in `localStorage['mrmoney.onboardingExtras']`; not all of them feed projections and offers yet.
- Funds and funds type, and a bill's due day, were not editable in Settings in the first build (QA G2).
- Job income counts only when marked confirmed; otherwise it is projections-only.
- Rounding pence go to the latest days of the plan.
- If a request cannot be covered without touching rent, bills or the reserve, the plan shows a deficit instead of moving protected money.

## Known open QA defects (qa-1, at time of writing)
Fixes were in flight when this was written; see `.prd-to-production/qa/qa-1.md` for the live list and `status.md` for state. Items still observed by the e2e suite are listed in the e2e report. Original list: Q1 income shown as expense; Q2 mobile header overflow; Q3 hero shows allowance rather than "left today"; Q4 calendar hides the past; Q5 Change panel clipping; Q6 clarification not visible; Q7 calendar keyboard (PageUp/PageDown, Home/End); Q8 preview not on the calendar; Q9 mobile reset stays on /settings; Q10/Q11 duplicate chips; Q12 mobile summary layout; Q13-Q17, Q20 lower-severity polish.

## Testing
- E2E covers the demo journey at 1440x1000 and 390x844 only, in Chromium. No Safari or Firefox runs, no automated screen-reader testing, no visual regression.
