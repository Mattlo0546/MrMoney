/** Function declarations for gemini-4-argon, generated from the zod arg schemas so both sides agree. */
import { z } from 'zod';
import { AskUserArgsSchema, CLIENT_TOOL_SCHEMAS, QuickPlanArgsSchema, ResearchArgsSchema, type ClientToolName } from './types';

const DESCRIPTIONS: Record<ClientToolName, string> = {
  quick_plan:
    'Build the whole 12-month plan once you know monthly income, monthly rent and lifestyle (brokie | balanced | comfy | baller). Integer pence (£1,200 = 120000). The app finds live food deals and the best savings account, puts every meal on the calendar and returns all the figures. Also use it to redo the plan with a new lifestyle.',
  setup_plan:
    'Create the plan as soon as you know funds and the end date. Integer pence (£3,900 = 390000). Defaults: minimumReserve 20000, savingsGoal 0, foodWeeklyPence 3500, transportWeeklyPence 1200, priorities [], commitments [] unless given, incomes [] (job pay counts only if amount AND date are confirmed). Rent = monthly commitment with dayOfMonth.',
  record_expense: 'Record committed spending: already spent, or "I need to / have to spend|pay ... today". Applies now, with Undo. category = a category id from context, or a short lowercase label.',
  record_income: 'Record money received or expected. confirmed=true only when the user says the amount and date are certain.',
  check_purchase: 'Only for questions: "can I…", "could I afford…", "is it ok…", "what if…", or ending in "?". Preview with Apply/Discard; never commits.',
  change_commitment: 'Change a bill such as rent. Give deltaPence (signed) OR newAmountPence, and effectiveFrom. Shown as a preview the user confirms.',
  set_goal: 'Save an extra amount of money, optionally by a date (no specific item). Shown as a preview the user confirms.',
  plan_goal:
    'The user wants to buy a specific thing ("I want a basketball", "saving for AirPods", "my goal is new trainers"). Re-plans their spending calendar around it: treats before the goal day become cheaper meals, a little is set aside each day, and the item lands on byDate (default two weeks out). label = the item, short. amountPence = its price in integer pence. Shown as a preview with the calendar changes; the user taps Apply.',
  keep_available: 'Keep an amount of the daily allowance available on a date (e.g. a planned day out).',
  apply_deal: 'Autonomously apply a student deal or discount (dealRef from research or catalogue, or dealRef="all" with category="all") to a planned purchase or category (eating-out, groceries, transport, shopping): give newAmountPence OR percentOff. Discounts matching expenses on the calendar immediately, with Undo.',
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

/** Without a plan only setup tools make sense; with one, setup_plan is left out (smaller request = faster turn).
 * quick_plan replaces setup_plan in the chat; setup_plan stays declared only when hasPlan is unknown (tests). */
const NO_PLAN_TOOLS: ClientToolName[] = ['quick_plan', 'start_demo'];

/** The model never sends the menu: the server attaches it. */
const MODEL_SCHEMAS: Partial<Record<ClientToolName, z.ZodType>> = { quick_plan: QuickPlanArgsSchema };

export function functionDeclarations(hasPlan?: boolean) {
  const names = (Object.keys(CLIENT_TOOL_SCHEMAS) as ClientToolName[]).filter((n) =>
    hasPlan === undefined ? true : hasPlan ? n !== 'setup_plan' : NO_PLAN_TOOLS.includes(n));
  const client = names.map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    parametersJsonSchema: toGeminiSchema(MODEL_SCHEMAS[name] ?? CLIENT_TOOL_SCHEMAS[name]),
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
