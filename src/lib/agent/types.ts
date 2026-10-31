/**
 * Shared chat-agent types (chat-contract.md, D20–D22). Owned by the backend agent; the chat UI imports these.
 *
 * ROUND-TRIP DESIGN (opaque `modelState`):
 * - A new user turn: the client sends `messages` (UI history) + `context`. The server rebuilds Gemini `contents`
 *   from the messages (text only; research cards and change ids are summarised into the assistant text so the
 *   model can refer back to them).
 * - When the model calls CLIENT tools, the server returns `{kind:'tool_calls', calls, modelState}`. `modelState`
 *   is an opaque, HMAC-signed blob holding the Gemini-native `contents` of the in-progress turn, INCLUDING the
 *   model's parts with their `thoughtSignature`s, plus the loop step. The client must send it back unchanged with
 *   `toolResults` (one per call id). The server replays those parts exactly and appends `functionResponse` parts.
 * - If `modelState` is missing, tampered with or expired, the server answers with an `error` card (retryable);
 *   the client should then just resend the user's message without toolResults.
 * All money is integer pence (GBP). Dates are ISO YYYY-MM-DD (Europe/London).
 */
import { z } from 'zod';
import { LIFESTYLES, LifestyleMenuSchema } from '@/lib/lifestyle/types';

// ---------------------------------------------------------------- primitives

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isoDateSchema = z
  .string()
  .regex(ISO_RE, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real calendar date');
/** Engine cap: £10,000,000. */
export const MAX_AGENT_PENCE = 1_000_000_000;
export const pencePositive = z.number().int('Amount must be whole pence').positive('Amount must be above zero').max(MAX_AGENT_PENCE);
export const penceNonNeg = z.number().int('Amount must be whole pence').min(0).max(MAX_AGENT_PENCE);
const shortText = (max = 80) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------- client tool args (validated on BOTH sides)

export const FLEX_PRIORITY_IDS = ['eating-out', 'shopping', 'books', 'social'] as const;

export const SetupCommitmentSchema = z
  .object({
    name: shortText(60),
    amountPence: pencePositive,
    recurrence: z.enum(['monthly', 'once']),
    /** Required when recurrence = monthly (1–31). */
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    /** Required when recurrence = once. */
    date: isoDateSchema.optional(),
  })
  .refine((c) => (c.recurrence === 'monthly' ? c.dayOfMonth !== undefined : c.date !== undefined), {
    message: 'monthly needs dayOfMonth; once needs date',
  });

export const SetupIncomeSchema = z.object({
  label: shortText(60),
  amountPence: pencePositive,
  date: isoDateSchema,
  /** Only confirmed income (amount AND date) feeds the plan. */
  confirmed: z.boolean(),
  source: z.enum(['job', 'other']).optional(),
});

export const SetupPlanArgsSchema = z.object({
  /** Lump sum, or the amount of each monthly allowance. */
  funds: pencePositive,
  fundsType: z.enum(['lump', 'monthly']),
  /** Monthly mode only: day the allowance arrives (default 1). */
  allowanceDay: z.number().int().min(1).max(31).optional(),
  horizonEnd: isoDateSchema,
  commitments: z.array(SetupCommitmentSchema).max(20),
  incomes: z.array(SetupIncomeSchema).max(30),
  minimumReserve: penceNonNeg,
  savingsGoal: penceNonNeg,
  foodWeeklyPence: penceNonNeg,
  transportWeeklyPence: penceNonNeg,
  /** Flexible categories, most important first. Empty = default order. */
  priorities: z.array(z.enum(FLEX_PRIORITY_IDS)).max(4),
  city: z.string().trim().max(60).optional(),
});

export const RecordExpenseArgsSchema = z.object({
  amountPence: pencePositive,
  date: isoDateSchema,
  category: shortText(40),
  note: z.string().trim().max(120).optional(),
});

export const RecordIncomeArgsSchema = z.object({
  amountPence: pencePositive,
  date: isoDateSchema,
  label: shortText(60),
  confirmed: z.boolean(),
});

export const CheckPurchaseArgsSchema = z.object({
  amountPence: pencePositive,
  date: isoDateSchema,
  category: shortText(40),
  label: shortText(60),
});

export const ChangeCommitmentArgsSchema = z
  .object({
    name: shortText(60),
    /** Signed change, e.g. +4000 for "rent goes up £40". */
    deltaPence: z.number().int().min(-MAX_AGENT_PENCE).max(MAX_AGENT_PENCE).optional(),
    newAmountPence: penceNonNeg.optional(),
    effectiveFrom: isoDateSchema,
  })
  .refine((a) => (a.deltaPence === undefined) !== (a.newAmountPence === undefined), {
    message: 'Give exactly one of deltaPence or newAmountPence',
  });

export const SetGoalArgsSchema = z.object({
  extraSavingsPence: pencePositive,
  byDate: isoDateSchema.optional(),
});

/** "I want to buy X": re-plan the calendar around it (treats cut, a little set aside each day, X on the goal day). */
export const PlanGoalArgsSchema = z.object({
  label: shortText(40),
  amountPence: pencePositive,
  /** The day to buy it; default two weeks from today. */
  byDate: isoDateSchema.optional(),
});

export const KeepAvailableArgsSchema = z.object({
  amountPence: pencePositive,
  date: isoDateSchema,
});

export const ApplyDealArgsSchema = z
  .object({
    plannedPurchaseLabel: z.string().trim().max(60).optional(),
    category: z.string().trim().max(40).optional(),
    newAmountPence: penceNonNeg.optional(),
    percentOff: z.number().gt(0).max(100).optional(),
    /** A research item ref (e.g. "r-ab12cd-2") or an offer id. */
    dealRef: shortText(80),
  })
  .refine((a) => !!(a.plannedPurchaseLabel || a.category), { message: 'Give plannedPurchaseLabel or category' })
  .refine((a) => (a.newAmountPence === undefined) !== (a.percentOff === undefined), {
    message: 'Give exactly one of newAmountPence or percentOff',
  });

export const UseRateInProjectionsArgsSchema = z.object({
  bucket: z.enum(['savings', 'investments']),
  ratePercent: z.number().min(0).max(25),
  /** The research item ref the rate came from. Required: rates only come from cited research. */
  sourceRef: shortText(80),
});

export const EmptyArgsSchema = z.object({}).strict();

/** The three things the chat asks before planning everything itself. */
export const QuickPlanArgsSchema = z.object({
  monthlyIncomePence: pencePositive,
  /** 0 = no rent. */
  monthlyRentPence: penceNonNeg,
  lifestyle: z.enum(LIFESTYLES),
});
/** What the client receives: the model's args plus the food prices and savings account the server researched. */
export const QuickPlanCallSchema = QuickPlanArgsSchema.extend({ menu: LifestyleMenuSchema });

export const CLIENT_TOOL_SCHEMAS = {
  quick_plan: QuickPlanCallSchema,
  setup_plan: SetupPlanArgsSchema,
  record_expense: RecordExpenseArgsSchema,
  record_income: RecordIncomeArgsSchema,
  check_purchase: CheckPurchaseArgsSchema,
  change_commitment: ChangeCommitmentArgsSchema,
  set_goal: SetGoalArgsSchema,
  plan_goal: PlanGoalArgsSchema,
  keep_available: KeepAvailableArgsSchema,
  apply_deal: ApplyDealArgsSchema,
  use_rate_in_projections: UseRateInProjectionsArgsSchema,
  undo_last: EmptyArgsSchema,
  start_demo: EmptyArgsSchema,
} as const;

export type ClientToolName = keyof typeof CLIENT_TOOL_SCHEMAS;
export const CLIENT_TOOL_NAMES = Object.keys(CLIENT_TOOL_SCHEMAS) as ClientToolName[];
export type ClientToolArgs = { [K in ClientToolName]: z.infer<(typeof CLIENT_TOOL_SCHEMAS)[K]> };

export type SetupPlanArgs = ClientToolArgs['setup_plan'];
export type QuickPlanArgs = ClientToolArgs['quick_plan'];
export type RecordExpenseArgs = ClientToolArgs['record_expense'];
export type RecordIncomeArgs = ClientToolArgs['record_income'];
export type CheckPurchaseArgs = ClientToolArgs['check_purchase'];
export type ChangeCommitmentArgs = ClientToolArgs['change_commitment'];
export type SetGoalArgs = ClientToolArgs['set_goal'];
export type PlanGoalArgs = ClientToolArgs['plan_goal'];
export type KeepAvailableArgs = ClientToolArgs['keep_available'];
export type ApplyDealArgs = ClientToolArgs['apply_deal'];
export type UseRateInProjectionsArgs = ClientToolArgs['use_rate_in_projections'];

/** Tools that must go through a confirm card (preview -> Apply/Discard) before committing. */
export const CONFIRM_TOOLS: readonly ClientToolName[] = ['check_purchase', 'change_commitment', 'set_goal', 'plan_goal', 'use_rate_in_projections'];

/** A client tool call. Args are already zod-validated by the server; the client re-validates with CLIENT_TOOL_SCHEMAS. */
export type ClientToolCall = { [K in ClientToolName]: { id: string; name: K; args: ClientToolArgs[K] } }[ClientToolName];

// ---------------------------------------------------------------- server tool: research

export const RESEARCH_TOPICS = ['savings_rates', 'cash_isa_rates', 'student_bank_accounts', 'student_deals', 'cheap_food', 'transport_savings', 'other'] as const;
export type ResearchTopic = (typeof RESEARCH_TOPICS)[number];
export const ResearchArgsSchema = z.object({
  topic: z.enum(RESEARCH_TOPICS),
  query: shortText(200),
  city: z.string().trim().max(60).optional(),
});
export type ResearchArgs = z.infer<typeof ResearchArgsSchema>;

/** Server-side pseudo-tool: ends the turn with a question and quick-reply chips (a `clarify` card). */
export const AskUserArgsSchema = z.object({
  question: shortText(300),
  options: z.array(shortText(40)).max(5).optional(),
});

export interface ResearchItem {
  /** Stable ref to pass back as dealRef / sourceRef, e.g. "r-k3j9x2-0". */
  ref: string;
  provider: string;
  product: string;
  /** e.g. "4.75% AER variable" or "20% off with UNiDAYS". */
  headline: string;
  ratePercent?: number;
  percentOff?: number;
  conditions: string[];
  sourceUrl: string;
  sourceTitle: string;
}

export const RESEARCH_LABEL = 'Live search result. Check with the provider before acting.';
export const SAMPLE_LABEL = 'Curated student deals. Check with the provider before acting.';

export interface ResearchResult {
  topic: ResearchTopic;
  query: string;
  city?: string;
  items: ResearchItem[];
  retrievedAt: string; // ISO timestamp
  /** true = curated sample catalogue fallback, not live search. */
  sample: boolean;
  label: string;
  model?: string;
  cached?: boolean;
}

// ---------------------------------------------------------------- cards

export type CardAction = { kind: 'use_rate_in_projections' } | { kind: 'apply_deal' };

export type Card =
  /** Client-generated after setup_plan succeeds. */
  | { id: string; type: 'plan_created'; text?: string }
  /** Client-generated; changeId is the Undo handle. */
  | { id: string; type: 'change_applied'; changeId: string; explanation: string; tool?: ClientToolName }
  /** Client-generated preview with Apply/Discard, or trade-off options to choose. */
  | { id: string; type: 'preview'; previewId: string; tool: ClientToolName; explanation: string; fits?: boolean; options?: { id: string; summary: string }[] }
  /** Server-generated (ask_user): a question with quick-reply chips. */
  | { id: string; type: 'clarify'; question: string; chips: string[] }
  /** Server-generated. Each item supports actions "Use this rate in projections" / "Apply to a planned purchase". */
  | ({ id: string; type: 'research_results'; actions: CardAction[] } & ResearchResult)
  | { id: string; type: 'error'; message: string; retryable: boolean };
export type CardType = Card['type'];

// ---------------------------------------------------------------- request

export const ChatMessageSchema = z.object({
  id: z.string().max(80).optional(),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(4000),
  /** Optional; research_results and change_applied cards are summarised for the model. Other cards are ignored. */
  cards: z.array(z.any()).max(10).optional(),
});
export type ChatMessage = { id?: string; role: 'user' | 'assistant'; text: string; cards?: Card[] };

const int = z.number().int();
/** Small client-computed engine outputs. Never the whole state. */
export const ChatSummarySchema = z.object({
  balancePence: int.optional(),
  todayAllowancePence: int.optional(),
  todayRemainingPence: int.optional(),
  todaySpentPence: int.optional(),
  flexibleRemainingPence: int.optional(),
  reservedForCommitmentsPence: int.optional(),
  reservePence: int.optional(),
  plannedSavingsPence: int.optional(),
  futureIncomePence: int.optional(),
  unallocatedPence: int.optional(),
  fundingGapPence: int.optional(),
  planStart: isoDateSchema.optional(),
  horizonEnd: isoDateSchema.optional(),
});
export type ChatSummary = z.infer<typeof ChatSummarySchema>;

export const PlanDigestSchema = z.object({
  bills: z.array(z.object({ name: z.string().max(60), amountPence: int, date: isoDateSchema })).max(20).optional(),
  /** Next 14 days' totals. */
  next14: z.array(z.object({ date: isoDateSchema, plannedPence: int, spentPence: int.optional() })).max(14).optional(),
  incomes: z.array(z.object({ label: z.string().max(60), amountPence: int, date: isoDateSchema, confirmed: z.boolean() })).max(20).optional(),
  deficits: z.array(z.object({ kind: z.string().max(30), amountPence: int, reason: z.string().max(200) })).max(10).optional(),
  plannedPurchases: z.array(z.object({ label: z.string().max(60), amountPence: int, date: isoDateSchema, category: z.string().max(40) })).max(20).optional(),
  projectionRates: z.object({ savings: z.number().optional(), investments: z.number().optional() }).optional(),
  city: z.string().max(60).optional(),
});
export type PlanDigest = z.infer<typeof PlanDigestSchema>;

export const ChatContextSchema = z.object({
  /** Demo date in demo mode. */
  today: isoDateSchema,
  demoMode: z.boolean(),
  hasPlan: z.boolean(),
  summary: ChatSummarySchema.optional(),
  planDigest: PlanDigestSchema.optional(),
  categories: z.array(z.object({ id: z.string().min(1).max(40), name: z.string().max(60) })).max(30).optional(),
});
export type ChatContext = z.infer<typeof ChatContextSchema>;

export const ToolResultSchema = z.object({
  /** The ClientToolCall.id this answers. */
  id: z.string().min(1).max(80),
  name: z.enum(CLIENT_TOOL_NAMES as [ClientToolName, ...ClientToolName[]]),
  ok: z.boolean(),
  /** Small JSON for the model: engine summary, explanation sentence, preview status ("shown, awaiting user"), etc. */
  result: z.unknown().optional(),
  /** Validation / engine error text; the model will ask the user. */
  error: z.string().max(1000).optional(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(60),
  context: ChatContextSchema,
  toolResults: z.array(ToolResultSchema).max(10).optional(),
  /** Opaque; echo back exactly what the last tool_calls response gave. Required with toolResults. */
  modelState: z.string().max(400_000).optional(),
  /** Ask for an SSE stream (also enabled by `Accept: text/event-stream`). */
  stream: z.boolean().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ---------------------------------------------------------------- response

/** UI hint. thinking/researching appear as SSE status events; awaiting_client = run the calls; done/error = final. */
export type ChatPhase = 'thinking' | 'researching' | 'awaiting_client' | 'done' | 'error';

export type ChatResponse =
  | {
      kind: 'tool_calls';
      calls: ClientToolCall[];
      /** Any text the model wrote alongside the calls (may be shown as a pending bubble). */
      assistantDraft?: string;
      /** Cards produced server-side during this step (e.g. research_results). */
      cards: Card[];
      modelState: string;
      phase: 'awaiting_client';
      /** Loop step (1-based); the server stops at 6. */
      step: number;
    }
  | {
      kind: 'reply';
      text: string;
      cards: Card[];
      phase: 'done' | 'error';
    };

/** SSE events (stream mode). The stream always ends with exactly one `tool_calls` or `reply` event whose data is the ChatResponse. */
export type ChatStreamEvent =
  | { event: 'status'; data: { phase: 'thinking' | 'researching'; label: string; step: number } }
  | { event: 'tool_calls'; data: Extract<ChatResponse, { kind: 'tool_calls' }> }
  | { event: 'reply'; data: Extract<ChatResponse, { kind: 'reply' }> };

export const MAX_LOOP_STEPS = 6;
