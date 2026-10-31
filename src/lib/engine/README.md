# StudentPlan engine

Pure TypeScript, no clock (`today` is passed in). Integer pence (GBP), ISO calendar days.

## Accounting model

- `balanceSOD` = funds + confirmed inflows − bills − recorded expenses, all before today. Unlogged past allowance returns to the pool on roll-forward.
- `pool` = balanceSOD + inflows[today…end] − bills[today…end] − reserve − savings goal.
- `Cap(t)` = balanceSOD − reserve − savings + inflows[today…t] − bills[today…t].
- **Plan:** the pool is spread over today…end as evenly as the Cap limits allow. A cash-tight window before an income gets less instead of borrowing ahead. Days split by category weight, essential floors first.
- **Actuals:** an actual uses its own category, then that day's other categories (lowest priority first). Overspend is spread evenly over the days after today, from the lowest-priority non-essential category first; essentials are taken last.
- **Hypotheticals** fit if ≤ that day's remaining allowance; otherwise options are:
  - the lowest-priority category to the end of the month;
  - the next category over 14 days;
  - all flexible spending to the end of the plan.
- **Monthly mode:** each allowance is income on its date.

## Invariants (all tested)

- **I1:** balanceSOD + inflows + fundingGap = bills + reserve + savings + Σ planned(today…end) + unallocated.
- **I2:** no figure is negative. Shortfalls appear as `deficits`, which are savings-unfunded, then reserve-short, then bills-short.
- **I3:** flexible spending up to day t ≤ max(Cap(t), money already used).
- **I4–I12:** as in architecture.md.

**Demo figures:** 214,500p / 83 days = **2,584p a day**, plus 1p on each of the last 28 days. The £60 concert is **3,427p short**.

## Deviations from architecture.md

1. **I8:** leftover pence go to the **latest** days. This keeps rounding cash-safe for I3 and matches design spec §7.
2. **I3:** stricter than specified, because the reserve and savings are held from today.
3. **Today stays stable:** automatic reallocation changes only days after today.
4. **Fallback:** if an incremental change would break I3, the engine does a full deterministic re-plan and sets `diff.replanned`.
5. **Overdraft:** the summary balance never goes below £0; overdrafts are `bills-short` deficits.
6. **`settingsEdit` intent:** added as the explicit path for changing protected values.
7. **Planned purchases:** an actual in the same day and category uses up the planned purchase rather than adding to it.
8. **Projections:** balances are carried unrounded and rounded only when shown.
