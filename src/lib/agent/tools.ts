/** Function declarations for gemini-4-argon, generated from the zod arg schemas so both sides agree. */
import { z } from 'zod';
import { AskUserArgsSchema, CLIENT_TOOL_SCHEMAS, ResearchArgsSchema, type ClientToolName } from './types';

const DESCRIPTIONS: Record<ClientToolName, string> = {
  setup_plan:
    'Create the student\'s plan. Call as soon as you know funds and the end date (and rent if they have it); use defaults for the rest and tell the user they can change them. All amounts are integer pence (GBP): £3,900 = 390000. Defaults: minimumReserve 20000, savingsGoal 0, foodWeeklyPence 3500, transportWeeklyPence 1200, priorities [], incomes [] (job pay only counts if amount AND date are confirmed). Rent is a monthly commitment with dayOfMonth.',
  record_expense: 'Record money already spent (applies immediately, with Undo). category is a plan category id from context.categories, or a short lowercase label.',
  record_income: 'Record money received or expected. confirmed=true only when the user says the amount and date are certain.',
  check_purchase: 'Check whether a possible purchase fits ("can I afford…", "what if I…"). Shows a preview with Apply/Discard; never commits.',
  change_commitment: 'Change a bill such as rent. Give deltaPence (signed) OR newAmountPence, and effectiveFrom. Shown as a preview the user confirms.',
  set_goal: 'Save an extra amount, optionally by a date. Shown as a preview the user confirms.',
  keep_available: 'Keep an amount of the daily allowance available on a date (e.g. a planned day out).',
  apply_deal: 'Apply a found deal (dealRef from research) to a planned purchase or category: newAmountPence OR percentOff. Preview, then the user confirms.',
  use_rate_in_projections: 'Use a rate found by research (sourceRef = the item ref) in the savings or investments projection. Only with the user\'s consent; preview, then confirm.',
  undo_last: 'Undo the last applied change.',
  start_demo: 'Load the demo student (only when the user asks for a demo).',
};

/** Gemini accepts JSON Schema via parametersJsonSchema; strip keys it doesn't need. */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export function functionDeclarations() {
  const client = (Object.keys(CLIENT_TOOL_SCHEMAS) as ClientToolName[]).map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    parametersJsonSchema: toGeminiSchema(CLIENT_TOOL_SCHEMAS[name]),
  }));
  return [
    ...client,
    {
      name: 'research',
      description:
        'Live Google search for UK rates and deals (savings_rates, cash_isa_rates, student_bank_accounts, student_deals, cheap_food, transport_savings, other). Takes up to ~30s. Returns cited items with refs. Use for EVERY rate or deal you mention.',
      parametersJsonSchema: toGeminiSchema(ResearchArgsSchema),
    },
    {
      name: 'ask_user',
      description: 'Ask the user ONE question with up to 5 short quick-reply options. Ends your turn. Prefer this during setup.',
      parametersJsonSchema: toGeminiSchema(AskUserArgsSchema),
    },
  ];
}

export const SERVER_TOOL_NAMES = ['research', 'ask_user'] as const;
