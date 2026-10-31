Act as my product lead, UX designer, and full-stack engineer. Turn the following concept into a working, polished hackathon MVP.

FIRST: Find and use my installed PRD skill to create the product requirements document. If you cannot access it, ask me for the skill while continuing to organise the requirements below. Do not claim to have used a skill you cannot access.

After creating the PRD, proceed to implementation. Do not stop at a document or implementation plan. Make reasonable, reversible decisions and document your assumptions. Ask questions only when missing information genuinely blocks progress.

Inspect the existing project and its instructions before choosing the implementation approach.

PRODUCT CONCEPT

Working name: StudentPlan. You may suggest a better name, but naming must not delay the build.

A personal budgeting assistant for international students, initially students living in the UK.

Students often receive a lump sum from a scholarship, family, or savings that must cover several months. They then have to decide:
- How much to reserve for rent, utilities, tuition, and other commitments.
- How much they can spend each day on food, transport, and discretionary purchases.
- How much to keep available for emergencies.
- How much to set aside for savings.
- How to adapt when an unexpected expense occurs.
- Which relevant student discounts could reduce planned spending.

Today, doing this requires spreadsheets, mental arithmetic, multiple apps, and repeated decisions.

Our promise:
“Know what you can spend today, and see how a change affects the rest of your month.”

The product should feel like a practical, supportive assistant. Avoid judgmental messages or a parental tone.

CORE PRODUCT EXPERIENCE

The main interface is a financial calendar.

A natural-language input helps users change the plan. The calendar, budget totals, and explanations update together.

The defining moment:
A student types “I need to spend £35 on a replacement shower filter today.”
The app incorporates the expense, recalculates the remaining plan, highlights the affected days, and explains exactly where the £35 came from.

This must be genuine stateful behaviour backed by correct calculations, not a canned animation or a hardcoded response.

PRIMARY USER

An international student in the UK who:
- Has a finite amount of money to last until a specified date.
- Has recurring commitments and variable daily expenses.
- Wants less effort and uncertainty around daily spending.
- May be unfamiliar with local discounts and financial services.

Use GBP for the MVP. Keep currency explicit in the data model. Do not add currency conversion unless the existing project already supports it.

MVP USER JOURNEY

1. SHORT ONBOARDING

Collect only information necessary to create a useful plan:
- Current available funds.
- Date those funds must last until.
- Confirmed future income, with amount and arrival date.
- Rent and other fixed commitments, with due dates and recurrence.
- Minimum emergency reserve.
- Savings goal, if any.
- Typical food and transport needs.
- Flexible spending preferences and priorities.

Optional:
- City or university area.
- Dietary preferences and student discount memberships.

Make the distinction between a monthly allowance and a lump sum covering several months explicit. Do not allocate an entire scholarship to the first month.

Provide sensible editable defaults and a “Try a demo student” shortcut. The demo must work without bank connections or API credentials.

2. GENERATED BUDGET CALENDAR

After onboarding, generate a plan for the funding period and show the selected month.

Display:
- Remaining available funds.
- Money reserved for fixed commitments.
- Emergency reserve.
- Planned savings.
- Remaining flexible budget.
- Today’s suggested spending allowance.

Calendar requirements:
- Monthly calendar on desktop.
- Clear agenda or stacked-day presentation on mobile.
- Daily planned spending totals.
- Actual recorded spending visibly distinguished from planned spending.
- Category items such as rent, groceries, transport, eating out, and books.
- A selected-day detail panel with item amounts and editable entries.
- Clear differentiation between fixed commitments and flexible allocations.
- A sensible indication of whether a day is past, today, or upcoming.

Never label planned spending as money already spent.

3. NATURAL-LANGUAGE REPLANNING

Place a prominent input near the calendar:
“Tell me what changed…”

Support these intents:
- Record an actual expense:
  “I spent £35 on a shower filter today.”
- Explore a possible expense:
  “Can I spend £20 on dinner tomorrow?”
- Add confirmed income:
  “I received an extra £200.”
- Change a recurring commitment:
  “My rent increases by £50 next month.”
- Change a preference:
  “Keep £30 available for Saturday.”
- Change a goal:
  “I want to save another £100 by the end of the month.”

Distinguish an actual transaction from a hypothetical request:
- Actual expenses update the ledger and recalculate the plan.
- Hypothetical requests produce a preview with an Apply action.
- Ambiguous amounts, currencies, dates, or intentions trigger a concise clarification.

For each change:
- Show the interpreted action.
- Recalculate using the budget engine.
- Highlight changed days and categories.
- Explain the numerical before/after difference in plain language.
- Provide an Undo action.
- Preserve the original state if parsing or validation fails.

Example explanation:
“Added your £35 expense. Your remaining eating-out budget decreased by £20 and shopping decreased by £15. Rent and your emergency reserve are unchanged.”

Explanations must match the actual calculation.

4. TRADE-OFFS AND INSUFFICIENT FUNDS

If a proposed purchase does not fit:
- State the shortfall.
- Offer concrete alternatives based on the user’s flexible categories.
- Let the user select a trade-off.
- Show the resulting plan before applying it.

Never silently reduce rent, other locked commitments, or the minimum emergency reserve.

If the original budget cannot cover essentials, show that clearly. Do not manufacture a balanced plan by allowing negative allowances or inventing income.

5. RELEVANT DISCOUNTS — SECONDARY FEATURE

Add a small optional section showing offers relevant to planned spending, location, and preferences.

For the demo:
- Use clearly labelled sample offers.
- Keep the catalogue small.
- Explain eligibility and any assumed conditions.
- Do not present sample prices, rates, availability, or discounts as live facts.
- Do not claim a retailer integration exists unless it actually does.

Do not count a potential discount as money saved until the user applies it to a planned purchase or records the actual lower price.

This feature must not delay the core calendar and replanning flow.

FINANCIAL PLANNING RULES

Use a deterministic calculation engine. AI may interpret user language and explain changes, but it must not be the source of arithmetic truth.

Requirements:
- Store amounts as integer pence.
- Define a clear, testable accounting model.
- Avoid double-counting actual expenses and their corresponding planned allocations.
- Allocate funds across the entire funding horizon.
- Respect due dates and cash availability: future income cannot pay a bill due before that income arrives.
- Preserve historical transactions when replanning.
- Reallocate only future flexible amounts unless the user explicitly edits a protected setting.
- Handle recurring payments across months of different lengths.
- Distribute rounding remainders deterministically.
- Explain unallocated funds and deficits explicitly.
- Ensure applying a change twice accidentally does not duplicate a transaction.
- Undo must restore the previous financial state exactly.

Document the accounting invariants and test them.

SAVINGS, BANKS, AND INVESTMENTS

The broader vision includes helping students decide where to hold spending money, emergency cash, and savings.

For this MVP:
- Represent these as planning buckets.
- Keep real bank connections, transfers, and trading out of scope.
- Do not invent interest rates or promise investment returns.
- Do not recommend specific stocks as part of the demo.
- Money needed for upcoming essentials must remain available in the plan.

Include bank comparisons, verified offers, and longer-term investment planning as future roadmap items, rather than blocking the MVP on integrations.

DESIGN DIRECTION

Create a polished, approachable financial planning tool.

Priorities:
- The calendar is the visual centre of the experience.
- Amounts, dates, and changes are easy to scan.
- The natural-language input is obvious without overwhelming the screen.
- Changes are highlighted subtly and meaningfully.
- Use clear typography, restrained colour, and generous spacing.
- Provide accessible contrast, keyboard navigation, and reduced-motion support.
- Handle loading, empty, validation, and error states.
- Keep the language practical and concise.

Avoid a generic dashboard full of charts and decorative metrics. Every visible element should help the student understand or adjust their plan.

TECHNICAL IMPLEMENTATION

Use the existing stack if a repository exists. Otherwise choose a straightforward modern TypeScript web stack.

Separate:
- User profile and preferences.
- Actual transaction ledger.
- Recurring commitments.
- Generated budget allocations.
- Natural-language intent parsing.
- Deterministic budget calculations.
- Change previews, explanations, and undo history.
- Optional sample-offer catalogue.

Validate structured input before applying mutations.

Persist the demo locally so refreshing does not erase the plan. Provide a clearly labelled reset action.

If an AI service is available:
- Call it through a server-side endpoint.
- Keep API keys off the client.
- Require structured, validated intent output.
- Handle service errors without losing user state.

If no AI credentials are available:
- Implement a useful deterministic parser for the supported demo intents.
- Clearly identify this as demo parsing.
- Keep the architecture ready for a real model adapter.
- Do not pretend that the demo is connected to an AI service.

DEMO SCENARIO

Create one consistent, realistic student fixture with:
- A lump sum that lasts for multiple months.
- Monthly rent and utilities.
- Food and transport budgets.
- An emergency reserve.
- A small savings goal.
- Flexible spending that can absorb an unexpected purchase.

Use dates relative to a single controlled demo date so the demo remains reproducible. Display that date when demo mode is active.

The three-minute demo should show:
1. Load the demo student or complete short onboarding.
2. View the generated financial calendar.
3. Record a £35 unexpected expense.
4. See the calendar and totals change.
5. Ask whether a £20 dinner fits.
6. Apply an affordable proposal or select a trade-off.
7. Add £200 of income and see the revised allocation.
8. Undo the last change.

Choose fixture amounts that make these interactions mathematically coherent.

ACCEPTANCE CRITERIA

The MVP is complete when:
- A student can finish onboarding and receive a valid plan.
- The funding horizon affects monthly and daily allocations.
- Fixed commitments appear on their correct dates.
- Planned and actual spending are distinct.
- An unexpected expense produces a correct recalculation.
- A hypothetical purchase does not change committed state before Apply.
- Additional income updates the plan correctly.
- An unaffordable request produces a clear shortfall and useful options.
- Protected commitments and reserves are not silently reduced.
- Undo restores the previous state.
- Refresh preserves the user's plan.
- The experience works on desktop and mobile.
- The complete demo works without paid integrations.
- Automated tests cover the important accounting and replanning rules.

DELIVERABLES AND WORK ORDER

1. Use my PRD skill to produce a focused PRD.
   Include problem, audience, core journey, MVP scope, non-goals, assumptions, acceptance criteria, success measures, and roadmap.
2. Write a short implementation plan and data model.
3. Build the working MVP.
4. Test the calculation engine and the critical user journey.
5. Check the rendered interface at desktop and mobile sizes.
6. Provide setup instructions, a three-minute demo script, and an honest list of limitations.

Prioritise a complete, reliable core experience over breadth.

The product succeeds when a student can understand what they can spend today and adjust their plan with one sentence.
