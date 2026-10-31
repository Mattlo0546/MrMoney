import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createParser } from '@/lib/parser';
import { isValidISO } from '@/lib/parser/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  text: z.string().trim().min(1).max(500),
  today: z.string().refine(isValidISO, 'today must be YYYY-MM-DD'),
  demoMode: z.boolean().optional().default(false),
  categories: z.array(z.object({ id: z.string().min(1), name: z.string() })).max(50).default([]),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ kind: 'error', message: 'Invalid request body.' }, { status: 400 });
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ kind: 'error', message: 'Invalid request.' }, { status: 400 });
  }
  try {
    const parser = createParser();
    const result = await parser.parse(body.data.text, body.data);
    const source = result.kind === 'error' ? undefined : (result.source ?? (process.env.GEMINI_API_KEY?.trim() ? 'gemini' : 'demo'));
    return NextResponse.json({ ...result, source });
  } catch {
    return NextResponse.json({ kind: 'error', message: 'Could not read that. Please try again.' });
  }
}
