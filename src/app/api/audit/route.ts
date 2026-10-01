import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuditError, listAudits, runAudit } from '@/lib/audit/audit';
import { UnsafeUrlError } from '@/lib/semantic/extract';
import { safeRead } from '@/lib/db/safe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  url: z.string().max(2000).optional(),
  text: z.string().max(200_000).optional(),
  title: z.string().max(300).optional(),
  metaDescription: z.string().max(500).optional(),
  keyword: z.string().max(200).optional(),
});

export async function GET() {
  return NextResponse.json({ audits: await safeRead(() => listAudits(), [], 'listAudits') });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });

  try {
    return NextResponse.json({ audit: await runAudit(parsed.data) });
  } catch (err) {
    const known = err instanceof AuditError || err instanceof UnsafeUrlError;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Audit failed.' }, { status: known ? 400 : 500 });
  }
}
