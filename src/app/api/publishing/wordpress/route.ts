import { NextResponse } from 'next/server';
import { z } from 'zod';
import { disconnectWp, getWpConfigView, saveWpConfig, WordPressError } from '@/lib/publishing/wordpress';
import { UnsafeUrlError } from '@/lib/semantic/extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  siteUrl: z.string().min(3).max(300),
  username: z.string().min(1).max(100),
  appPassword: z.string().min(1).max(200),
});

export async function GET() {
  return NextResponse.json({ wordpress: await getWpConfigView() });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter the site address, username and Application Password.' }, { status: 400 });
  try {
    const { name, view } = await saveWpConfig(parsed.data);
    return NextResponse.json({ name, wordpress: view });
  } catch (err) {
    const status = err instanceof WordPressError ? err.status : err instanceof UnsafeUrlError ? 400 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not connect.' }, { status });
  }
}

export async function DELETE() {
  await disconnectWp();
  return NextResponse.json({ wordpress: await getWpConfigView() });
}
