# QA round 1 — defects (independent QA, 2026-10-31)

Screenshots: /private/tmp/claude-501/-Users-mattlo-Desktop-argon-hack/b5c36841-6555-45d4-aa08-68b69251daab/scratchpad/qa/final/ (desk-*, mob-*). App: http://localhost:3210. Mockups: `.prd-to-production/design/images/`.

| ID | Sev | Defect | Owner |
|---|---|---|---|
| Q1 | High | Income (£200) shows as a solid blue "Expense £200" chip and "Spent: Expense £200" in Day. It must show as Income/Received in lime styling. | calendar + day |
| Q2 | High | Mobile header overflows. Page is 533px wide on /plan and 398px on onboarding; the demo badge is clipped; the "…" menu is off-screen. No horizontal scroll is allowed at 390px. | shell |
| Q3 | High | Hero reads "Today's allowance £35 / £0 left today" after a £35 spend. The mockup shows "Left today" with a big £0, "£35 spent" at the top right, and "Flexible left £2,110". | plan layout |
| Q4 | High | The desktop calendar hides the past: blank cells before today, no dates, no 1 Nov Rent chip, and the previous-month arrow is disabled. Show the full month (26 Oct–6 Dec grid) with dates; past days dimmed but visible, with their bills and actuals. | calendar |
| Q5 | High | The Change panel clips: Apply, Undo and Unchanged sit below the fold inside a fixed height, and one run showed a blank panel with no loading state. The primary action must always be visible. | composer/change |
| Q6 | High | "I spent $20 on lunch" shows no visible clarification: the panel stays on the Day tab. A clarification must switch to Change and show the question plus chips. | composer/change + plan layout tab switching |
| Q7 | Med | Calendar keyboard: only arrows work. Add PageUp/PageDown for months and Home/End for the week; use a proper grid with roving tabindex. | calendar |
| Q8 | Med | Preview is not visible on the calendar. Affected days need dashed-lime outlines and preview chips, plus a Discard button next to Apply. | calendar (read preview state from `src/components/plan/change/changeState.ts`) + change |
| Q9 | Med | Mobile reset stays on /settings with "No plan yet"; it must go to /onboarding. | settings |
| Q10 | Med | Duplicate chips: "Planned: Eating out £20" ×2, and Spent + Planned "Household £35" on the same day. A linked planned purchase should be consumed by its actual, not shown twice. | calendar (check engine data) |
| Q11 | Med | Sat 14 shows both "concert ticket £60" and "Planned: Shopping £60" chips (total £74.20). Something is double-listed. | calendar (+ engine check) |
| Q12 | Med | The mobile summary leaves an orphan card. The mockup is the hero plus a 2×2 grid (Funds left with "+£300 on 18 Dec", For bills, Reserve, Savings). | plan layout |
| Q13 | Low | Mobile composer chips are clipped at the left. | composer |
| Q14 | Low | Touch targets <44px: Settings checkboxes (24px), wordmark link (28px tall). | settings, shell |
| Q15 | Low | The mobile welcome illustration is cropped (object-fit: cover). The headline should be "Know what you can spend today." Onboarding has decorative subtext ("A calm daily number…"); remove it. | onboarding |
| Q16 | Low | Desktop chip labels are truncated ("concert tic…"). | calendar |
| Q17 | Low | The last calendar row is cut off in some states. | calendar/layout |
| Q20 | Low | The nav shows Plan/Projections/Settings before a plan exists; the mockup shows only the logo. | shell |

## Fidelity gaps against the mockups
- **Summary/hero** (Q3/Q12).
- **Calendar:** full month; bordered cells; legend "Bill / Spent / Income / Preview"; month picker.
- **Right panel:** round lime send button; short chips "I spent £…", "Can I spend £…", "I received £…".
- **Change cards:** "Preview · not applied" pill; coral "£X short" headline; option radio cards with "N days · −£x to −£y a day"; before/after with strikethrough; Discard plus a lime "Apply change"; "Unchanged" as chips. The demo badge is outlined with a dot.

## Integration gaps (from agent reports)
- **G1:** onboarding stores current savings, investments, city, diet and memberships in `localStorage['studentplan.onboardingExtras']`, but nobody reads them. Projections should prefill "savings now" and "investments now"; offers should use city and memberships.
- **G2:** the engine now exposes `ProjectionPoint.growth` (use it, don't compute it in the UI), `affordability.message`, `option.borrowed`, `protectedAfter.plannedSavings` and `reserveShortfall` (never show "Unchanged" for savings or reserve when they changed), and `settingsEdit` funds/fundsType (make them editable in settings).
- **G3:** `PreviewResult` in the store drops `affordability`; the composer re-added it locally.
