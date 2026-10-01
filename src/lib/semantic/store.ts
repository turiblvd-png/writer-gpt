import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import { emptyProjectData, type ProjectData, type SemanticProject } from './types';

const projects = collection<SemanticProject>('semantic_projects');

/** Merge over defaults so a project saved before a field existed still loads. */
function hydrate(p: SemanticProject): SemanticProject {
  return { ...p, data: { ...emptyProjectData(), ...p.data } };
}

export function createProject(input: { name: string; mainKeyword: string; language: string }): SemanticProject {
  const now = Date.now();
  return projects.put({
    id: randomUUID(),
    name: input.name,
    language: input.language,
    mainKeyword: input.mainKeyword,
    currentStepIndex: 0,
    completedSteps: [],
    data: emptyProjectData(),
    createdAt: now,
    updatedAt: now,
  });
}

export function getProject(id: string): SemanticProject | null {
  const found = projects.get(id);
  return found ? hydrate(found) : null;
}

export function listProjects(limit = 50): SemanticProject[] {
  return projects.list('updatedAt', limit).map(hydrate);
}

/**
 * Merge a patch into the stored project.
 *
 * Read and write happen inside one mutate call, because a user can trigger two
 * stage actions at once (entity generation is slow, and nothing stops them
 * clicking N-Grams meanwhile) and a read-modify-write would let the second
 * result clobber the first.
 */
export function updateProject(
  id: string,
  patch: {
    data?: Partial<ProjectData>;
    currentStepIndex?: number;
    completedSteps?: string[];
    name?: string;
    language?: string;
    mainKeyword?: string;
  },
): SemanticProject | null {
  return projects.mutate(id, (current) => ({
    ...hydrate(current),
    name: patch.name ?? current.name,
    language: patch.language ?? current.language,
    mainKeyword: patch.mainKeyword ?? current.mainKeyword,
    currentStepIndex: patch.currentStepIndex ?? current.currentStepIndex,
    completedSteps: patch.completedSteps ?? current.completedSteps,
    data: { ...hydrate(current).data, ...patch.data },
    updatedAt: Date.now(),
  }));
}

export function markStepComplete(id: string, stepId: string): SemanticProject | null {
  const project = getProject(id);
  if (!project) return null;
  if (project.completedSteps.includes(stepId)) return project;
  return updateProject(id, { completedSteps: [...project.completedSteps, stepId] });
}

export function deleteProject(id: string): void {
  projects.remove(id);
}
