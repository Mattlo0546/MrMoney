# MrMoney engine

Pure TypeScript, no clock (`today` is passed in). Integer pence (GBP), ISO calendar days. Single amounts are capped at £10,000,000 (`MAX_PENCE`); larger ones return an `out-of-range` error.

## Accounting model

- `balanceSOD` = funds + confirmed inflows − bills − recorded expenses, all before today.
- `pool` = balanceSOD + inflows[today…end] − bills[today…end] − reserve − savings goal.
- `held(t)` = reserve (from today) + savings due by t. The savings goal is due on the plan's last day, and any part with a `goal.byDate` is due on that date (`profile.savingsDeadlines`).
- `Cap(t)` = balanceSOD + inflows[today…t] − bills[today…t] − held(t).
- **Plan:** the pool is spread over today…end as evenly as the Cap limits allow. A cash-tight window before an income gets less instead of borrowing ahead. Each day is split by category weight, with essential floors (`minimumDaily`) first.
- **Roll-forward** (`ensurePlan` on a new day): future days keep their planned amounts, so trade-offs and reallocations survive. Money left over from past days is spread evenly over today…end. If that isn't possible (a funding gap, the plan has ended, a cash-timing conflict), the engine falls back to a full re-plan.
- **Use of a cell** = actuals + outstanding planned purchases. A planned purchase is released only by an expense linked to it: `plannedPurchaseId`, or matched automatically on the same day by the same category, or by a label equal to the category or note. It can also be removed with the `removePlannedPurchase` intent.
- **Actuals:** an actual first uses today's whole remaining allowance: its own category, then the day's other categories, lowest priority first. Overspend is spread evenly over the days after today, lowest-priority non-essential category first. **Essential floors are never cut** (D16), so whatever can't be covered becomes a funding gap. The diff reports `absorbed`, `overspend`, `takenFromLater`, `fromUnallocated` (after the plan has ended) and `uncovered`.
- **Cash repair:** if an incremental change breaks I3, the engine first moves the excess to later days in take order, keeping today's amounts and the essential floors. Only if that fails does it do a full re-plan (`diff.replanned`).

## Planned purchases (hypotheticals) and borrowing (D16)

1. **Day available** = the unused part of the purchase's own category + that day's unused non-essential categories. Essentials are never used to make room.
2. **Borrow from the week:** `BORROW_WINDOW_DAYS = 7` days after the purchase, from non-essential categories only, lowest priority first, spread evenly. Each later day gives at most `BORROW_MAX_SHARE = 0.5` of that category's unused amount, and borrowing never goes below a kept-available amount. The request **fits** if amount ≤ day available + borrowable. `diff.borrowed` and `affordability.borrowing` show the amount, categories and date range. The message reads, for example, "Fits — £8.47 comes from shopping over 12–18 Nov".
   - If borrowing would spend money before an income arrives, the week can't lend: borrowable is 0 and the request becomes a shortfall.
3. Otherwise `fits:false`, with shortfall = amount − day available − borrowable. Each option borrows the full week and then covers the shortfall with one of these:
   - `<lowest>-later`: the lowest-priority category to the end of the month;
   - `<next>-two-weeks`: the next category over 14 days;
   - `all-flexible-rest`: all flexible spending to the end of the plan;
   - `earlier-days`: non-essentials from tomorrow until the day before the purchase, useful for late requests.

   `option.sources` sum to the shortfall, and `option.borrowed` is the week part.
4. `affordability` is idempotent. A processed `idempotencyKey` returns `alreadyApplied: true` with a no-op preview. Requests without a key get unique derived keys (`…#2`).

Affordability fields: `dayRemaining` (= `dayAvailable`, what the day can give this purchase), `dayRemainingTotal` (the day's whole unused allowance), `borrowed`/`borrowable`, `borrowing`, `message`.

## Explanations (I11)

`explain(diff)` returns `mentions`: every £ figure in the sentence, in order, with the ChangeSet path it came from (for example `borrowed.amount` or `sources[0].amount`). `assertExplanationFromDiff` (testkit) checks that the figures match the paths exactly. The protected snapshot includes `plannedSavings` and `reserveShortfall`, so an expense that unfunds the savings goal or pushes the reserve short says so rather than calling them "unchanged". `protectedUnchanged` is false in that case.

## Invariants (all tested)

- **I1:** balanceSOD + inflows + fundingGap = bills + reserve + savings + Σ planned(today…end) + unallocated.
- **I2:** no figure is negative. Shortfalls appear as `deficits`: savings-unfunded, then reserve-short, then bills-short, then essentials.
- **I3:** flexible spending up to day t ≤ max(Cap(t), money already used).
- **I4–I12:** as in architecture.md. I4 covers the protected *settings*; funding status can change and is reported.

## Demo figures (fixture: groceries floor £9.00, transport floor £5.20)

- Plan: 214,500p / 83 days = **2,584p a day**, plus 1p on each of the last 28 days.
- S1 (£35 household today): today covers £25.84, and £9.16 comes from shopping over 11 Nov – 31 Jan.
- S2 (£20 dinner on 11 Nov): **fits, borrowing £8.47 from shopping over 12–18 Nov** (−£1.21 a day). 11 Nov has eating out £20, shopping £0, groceries £9 and transport £5.20, both unchanged.
- S3 (£60 concert on Sat 14 Nov): £10.32 to spare + £37.92 borrowable (shopping £18.67, eating out £19.25, 15–21 Nov) → **£11.76 short**, with options `shopping-later`, `eating-out-two-weeks`, `all-flexible-rest` and `earlier-days`.
- Tuition £2,400 after S1: £2,110 from later days, £290 not covered (savings unfunded, reserve £140 short, essentials deficit).

## Deviations from architecture.md

1. **I8:** leftover pence go to the **latest** days. This keeps rounding cash-safe for I3 and matches design spec §7.
2. **I3:** the reserve is held from today; savings are held by their deadline (or the plan's end).
3. **Today stays stable:** automatic reallocation and cash repair change only days after today, unless the cash on today itself is short.
4. **Overdraft:** the summary balance never goes below £0; overdrafts are `bills-short` deficits.
5. **`settingsEdit`** accepts only `minimumReserve`, `savingsGoal`, `horizonEnd`, `categories`, `funds` and `fundsType`. It refuses to move the end date before an outstanding planned purchase, and drops kept-available amounts after the new end date.
6. **Projections:** balances are carried unrounded and rounded only when shown; each point has `growth` = total − contributed.
