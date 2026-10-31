import { NextResponse } from 'next/server';
import { moneyError, runMoney } from '@/lib/finance/loop';
import { MoneyRequestSchema, type MoneyResponse } from '@/lib/finance/types';

// NOTE: no `runtime` / `dynamic` exports: next.config has cacheComponents, which rejects them.

const MAX_BODY_CHARS = 200_000;

export async function POST(req: Request) {
  let json: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return NextResponse.json(moneyError('That conversation is too long. Please start a new one.', false), { status: 413 });
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json(moneyError('Invalid request body.', false), { status: 400 });
  }
  const parsed = MoneyRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json(moneyError('Invalid request.', false), { status: 400 });
  const body = parsed.data;
  const deps = { apiKey: process.env.GEMINI_API_KEY };
  const wantsStream = body.stream === true || (req.headers.get('accept') ?? '').includes('text/event-stream');

  if (!wantsStream) return NextResponse.json(await safeRun(() => runMoney(body, deps)));

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client went away */
        }
      };
      send('reply', await safeRun(() => runMoney(body, { ...deps, onStatus: (s) => send('status', s) })));
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
}

async function safeRun(fn: () => Promise<MoneyResponse>): Promise<MoneyResponse> {
  try {
    return await fn();
  } catch {
    return moneyError('Sorry, something went wrong. Please try again.');
  }
}
