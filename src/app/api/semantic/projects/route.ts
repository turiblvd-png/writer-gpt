import { NextResponse } from 'next/server';
import { createProjectSchema } from '@/lib/semantic/types';
import { createProject, listProjects } from '@/lib/semantic/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input.', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  return NextResponse.json({ project: createProject(parsed.data) }, { status: 201 });
}
