import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db/store';
import { emptyProjectData, type ProjectData, type SemanticProject } from './types';

/**
 * Project persistence. The whole `data` blob is stored as JSON rather than
 * normalised into tables: the 14 stages evolve together, every read wants the
 * entire project, and nothing queries across projects by stage content.
 */

function ensureTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS semantic_projects (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      language      TEXT NOT NULL DEFAULT 'English',
      main_keyword  TEXT NOT NULL,
      current_step  INTEGER NOT NULL DEFAULT 0,
      completed     TEXT NOT NULL DEFAULT '[]',
      data          TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_semantic_updated ON semantic_projects(updated_at DESC);
  `);
}

type Row = Record<string, unknown>;

function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toProject(row: Row): SemanticProject {
  return {
    id: String(row.id),
    name: String(row.name),
    language: String(row.language ?? 'English'),
    mainKeyword: String(row.main_keyword ?? ''),
    currentStepIndex: Number(row.current_step ?? 0),
    completedSteps: parse<string[]>(row.completed, []),
    // Merge over defaults so a project created before a field existed still loads.
    data: { ...emptyProjectData(), ...parse<Partial<ProjectData>>(row.data, {}) },
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function createProject(input: { name: string; mainKeyword: string; language: string }): SemanticProject {
  ensureTable();
  const now = Date.now();
  const project: SemanticProject = {
    id: randomUUID(),
    name: input.name,
    language: input.language,
    mainKeyword: input.mainKeyword,
    currentStepIndex: 0,
    completedSteps: [],
    data: emptyProjectData(),
    createdAt: now,
    updatedAt: now,
  };

  getDb()
    .prepare(
      `INSERT INTO semantic_projects (id,name,language,main_keyword,current_step,completed,data,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(project.id, project.name, project.language, project.mainKeyword, 0, '[]',
         JSON.stringify(project.data), now, now);

  return project;
}

export function getProject(id: string): SemanticProject | null {
  ensureTable();
  const row = getDb().prepare(`SELECT * FROM semantic_projects WHERE id = ?`).get(id) as Row | undefined;
  return row ? toProject(row) : null;
}

export function listProjects(limit = 50): SemanticProject[] {
  ensureTable();
  const rows = getDb()
    .prepare(`SELECT * FROM semantic_projects ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as Row[];
  return rows.map(toProject);
}

/**
 * Merge a patch into the stored project.
 *
 * Reads and writes in one transaction: a user can trigger two stage actions
 * concurrently (entity generation is slow, and nothing stops them clicking
 * N-Grams meanwhile), and a read-modify-write outside a transaction would let
 * the second result clobber the first.
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
  ensureTable();
  const db = getDb();

  const run = db.transaction((): SemanticProject | null => {
    const row = db.prepare(`SELECT * FROM semantic_projects WHERE id = ?`).get(id) as Row | undefined;
    if (!row) return null;

    const current = toProject(row);
    const next: SemanticProject = {
      ...current,
      name: patch.name ?? current.name,
      language: patch.language ?? current.language,
      mainKeyword: patch.mainKeyword ?? current.mainKeyword,
      currentStepIndex: patch.currentStepIndex ?? current.currentStepIndex,
      completedSteps: patch.completedSteps ?? current.completedSteps,
      data: { ...current.data, ...patch.data },
      updatedAt: Date.now(),
    };

    db.prepare(
      `UPDATE semantic_projects
         SET name=?, language=?, main_keyword=?, current_step=?, completed=?, data=?, updated_at=?
       WHERE id=?`,
    ).run(next.name, next.language, next.mainKeyword, next.currentStepIndex,
          JSON.stringify(next.completedSteps), JSON.stringify(next.data), next.updatedAt, id);

    return next;
  });

  return run();
}

export function markStepComplete(id: string, stepId: string): SemanticProject | null {
  const project = getProject(id);
  if (!project) return null;
  if (project.completedSteps.includes(stepId)) return project;
  return updateProject(id, { completedSteps: [...project.completedSteps, stepId] });
}

export function deleteProject(id: string): void {
  ensureTable();
  getDb().prepare(`DELETE FROM semantic_projects WHERE id = ?`).run(id);
}
