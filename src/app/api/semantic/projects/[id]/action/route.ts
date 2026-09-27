import { NextResponse } from 'next/server';
import { configuredProviders } from '@/lib/ai';
import * as A from '@/lib/semantic/actions';
import { compileMegaPrompt } from '@/lib/semantic/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Extraction fetches several pages and generation runs four model calls.
export const maxDuration = 300;

/** Actions that never call a model, so they work without an API key. */
const LOCAL_ACTIONS = new Set([
  'extract-outlines', 'extract-content', 'compute-ngrams', 'compute-keywords',
  'compute-skipgrams', 'recompute-all', 'compile-mega-prompt',
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { action?: string; urls?: string[]; scope?: A.EntityScope };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const action = body.action ?? '';
  if (!action) return NextResponse.json({ error: 'No action given.' }, { status: 400 });

  if (!LOCAL_ACTIONS.has(action) && !configuredProviders().gemini) {
    return NextResponse.json(
      { error: 'No Gemini API key configured. Set GEMINI_API_KEY (see .env.example).' },
      { status: 503 },
    );
  }

  try {
    const project = await run(id, action, body);
    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof A.ProjectNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Action failed.' },
      { status: 500 },
    );
  }
}

function run(id: string, action: string, body: { urls?: string[]; scope?: A.EntityScope }) {
  switch (action) {
    case 'extract-outlines':     return A.extractOutlines(id, body.urls);
    case 'combine-outlines':     return A.combineOutlines(id);
    case 'extract-content':      return A.extractCompetitorContent(id, body.urls);
    case 'analyse-style':        return A.analyseCompetitorStyle(id);
    case 'generate-entities':    return A.generateEntities(id, body.scope ?? 'all');
    case 'compute-ngrams':       return Promise.resolve(A.computeNgrams(id));
    case 'compute-keywords':     return Promise.resolve(A.computeNlpKeywords(id));
    case 'compute-skipgrams':    return Promise.resolve(A.computeSkipGrams(id));
    case 'recompute-all':        return Promise.resolve(A.recomputeAll(id));
    case 'generate-questions':   return A.generateQuestions(id);
    case 'compile-mega-prompt':  return Promise.resolve(compileMegaPrompt(id));
    case 'generate-article':     return A.generateArticle(id);
    default:
      throw new Error(`Unknown action "${action}".`);
  }
}
