/** Function declarations for gemini-4-argon, generated from the zod arg schemas so both sides agree. */
import { z } from 'zod';
import { AskUserArgsSchema, CLIENT_TOOL_SCHEMAS, ResearchArgsSchema, type ClientToolName } from './types';

const DESCRIPTIONS: Record<ClientToolName, string> = {
  setup_plan:
    'Create the plan as soon as you know funds and the end date. Integer pence (£3,900 = 390000). Defaults: minimumReserve 20000, savingsGoal 0, foodWeeklyPence 3500, transportWeeklyPence 1200, priorities [], commitments [] unless given, incomes [] (job pay counts only if amount AND date are confirmed). Rent = monthly commitment with dayOfMonth.',
  record_expense: 'Record committed spending: already spent, or "I need to / have to spend|pay ... today". Applies now, with Undo. category = a category id from context, or a short lowercase label.',
  record_income: 'Record money received or expected. confirmed=true only when the user says the amount and date are certain.',
  check_purchase: 'Only for questions: "can I…", "could I afford…", "is it ok…", "what if…", or ending in "?". Preview with Apply/Discard; never commits.',
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

/** Without a plan only setup tools make sense; with one, setup_plan is left out (smaller request = faster turn). */
const NO_PLAN_TOOLS: ClientToolName[] = ['setup_plan', 'start_demo'];

export function functionDeclarations(hasPlan?: boolean) {
  const names = (Object.keys(CLIENT_TOOL_SCHEMAS) as ClientToolName[]).filter((n) =>
    hasPlan === undefined ? true : hasPlan ? n !== 'setup_plan' : NO_PLAN_TOOLS.includes(n));
  const client = names.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    parametersJsonSchema: toGeminiSchema(CLIENT_TOOL_SCHEMAS[name]),
  }));
  return [
    ...client,
    {
      name: 'research',
      description:
        'Live web search for UK rates and deals. Returns cited items with refs. Use for EVERY rate or deal.',
      parametersJsonSchema: toGeminiSchema(ResearchArgsSchema),
    },
    {
      name: 'ask_user',
      description: 'Ask ONE short question with up to 5 quick-reply options. Ends your turn.',
      parametersJsonSchema: toGeminiSchema(AskUserArgsSchema),
    },
  ];
}

export const SERVER_TOOL_NAMES = ['research', 'ask_user'] as const;
