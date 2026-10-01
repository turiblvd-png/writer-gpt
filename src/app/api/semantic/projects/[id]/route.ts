import { NextResponse } from 'next/server';
import { deleteProject, getProject, updateProject } from '@/lib/semantic/store';
import type { ProjectData } from '@/lib/semantic/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  return NextResponse.json({ project });
}

/** Saves user edits: competitor URLs, exclusions, rules, manual outline changes. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { data?: Partial<ProjectData>; currentStepIndex?: number; completedSteps?: string[]; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const project = await updateProject(id, {
    data: body.data,
    currentStepIndex: body.currentStepIndex,
    completedSteps: body.completedSteps,
    name: body.name,
  });
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
