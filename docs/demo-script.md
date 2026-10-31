# 3-minute demo script

> DRAFT: to update for chat-first (D20). Written for the old onboarding form and sentence box. Wording to type and the numbers should stay valid; the UI steps will change.

Demo date is fixed at 10 Nov 2026 (shown as demo mode). Fixture: £3,900 lump sum until 31 Jan 2027, rent £620 on the 1st, utilities £55 on the 15th, £500 minimum reserve, £150 savings goal, £300 family transfer on 18 Dec.

| Time | Do / type | Point at | Expect |
|---|---|---|---|
| 0:00 | Open the app. Say: "Students have one pot of money that has to last. StudentPlan tells you what you can spend today." Click **Try a demo student**. | Demo badge | Lands on /plan |
| 0:20 | Point at the hero and the calendar | Today's allowance; rent chip on the 1st; the 15th | **£25.84 a day**; no guesswork |
| 0:40 | Type: `I spent £35 on a shower filter today` | The explanation and Undo | Today's £25.84 covered; **£9.16 taken from later shopping**; rent and reserve unchanged; funds down £35 |
| 1:10 | Type: `Can I spend £20 on dinner tomorrow?` | "Fits", "Preview, not applied"; the summary has not moved | Fits by **borrowing £8.47 from shopping over 12 to 18 Nov**. Click **Apply** |
| 1:40 | Type: `can i afford a £60 concert ticket on saturday` | The coral shortfall and the options | **£11.76 short**; pick an option (for example shopping later) and **Apply** |
| 2:10 | Type: `I received an extra £200` | Funds | Funds up £200, shown as income |
| 2:25 | Click **Undo** | Funds | Back to the figure before the £200 |
| 2:35 | Type: `I spent $20 on lunch` | The question | Asks about the currency; nothing changes |
| 2:40 | Open **Money**. Click **How should I split my spare money each month?** | The money map animating: spare cash flowing into buckets; "Why this split" and the paid-plan check | Gemini 4 Argon calls the allocation engine; the map reallocates £250 a month |
| 2:50 | Click **Find me the best savings account right now** | "Searching the web…", then live cited rates and the green **+£/yr, worth switching** cards | Live research, £-per-year gain computed by the engine, not the model |
| 2:45 | Open **Projections** | Empty state | "Enter rates": nothing is pre-filled; labelled not advice |
| 2:55 | Close: "Your data stays on your device; Gemini only reads the sentence, the engine does the maths." | | |

Reset between runs: Settings, **Reset StudentPlan**.

## After deployment: the phone and QR angle
Once the app is deployed (Vercel, planned and not yet done), show a QR code to the room. People scan it, tap **Try a demo student** on their phones and type the same sentences. Each phone keeps its own plan locally, so nobody shares data. On mobile the sentence box is a docked bottom bar that opens a sheet. This step is not available until deployment.
