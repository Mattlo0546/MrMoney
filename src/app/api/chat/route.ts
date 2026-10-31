import { NextResponse } from 'next/server';
import { runChat, errorReply } from '@/lib/agent/loop';
import { stateSecret } from '@/lib/agent/state';
import { ChatRequestSchema, type ChatResponse } from '@/lib/agent/types';

// NOTE: no `runtime` / `dynamic` exports: next.config has cacheComponents, which rejects them.

const MAX_BODY_CHARS = 600_000;

export async function POST(req: Request) {
  let json: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) return NextResponse.json(errorReply('That conversation is too long. Please start a new one.', false), { status: 413 });
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json(errorReply('Invalid request body.', false), { status: 400 });
  }
  const parsed = ChatRequestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json(errorReply('Invalid chat request.', false), { status: 400 });
  const body = parsed.data;
  const deps = { apiKey: process.env.GEMINI_API_KEY, secret: stateSecret() };
  const wantsStream = body.stream === true || (req.headers.get('accept') ?? '').includes('text/event-stream');

  if (!wantsStream) {
    const res = await safeRun(() => runChat(body, deps));
    return NextResponse.json(res);
  }

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
      const res = await safeRun(() => runChat(body, { ...deps, onStatus: (s) => send('status', s) }));
      send(res.kind, res);
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

async function safeRun(fn: () => Promise<ChatResponse>): Promise<ChatResponse> {
  try {
    return await fn();
  } catch {
    return errorReply('Sorry, something went wrong. Your plan is safe; please try again.');
  }
}
