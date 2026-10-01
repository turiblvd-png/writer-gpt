import { NextResponse } from 'next/server';
import { configuredProviders } from '@/lib/ai';
import { probeStorage, storageStatus } from '@/lib/db/store';
import { STEPS } from '@/lib/semantic/steps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment diagnostics.
 *
 * `build` exists because an earlier version of this route read only env vars,
 * so it returned a healthy 200 while every page was failing. That made it
 * impossible to tell which commit was actually live. The commit SHA settles it.
 */
export async function GET() {
  // Never let a storage fault take down the one endpoint used to diagnose it.
  let storage;
  try {
    // Probe an actual write: reads can succeed while writes fail, which is how
    // "Create project" broke while every page rendered normally.
    storage = { ...(await storageStatus()), ...(await probeStorage()) };
  } catch (err) {
    storage = {
      mode: 'memory', path: 'none', perInstance: true, writable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json({
    ok: true,
    build: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
      host: process.env.VERCEL ? 'vercel' : 'self-hosted',
      node: process.version,
    },
    storage,
    providers: configuredProviders(),
    tools: {
      'generate-content': 'ready',
      'semantic-writer': { status: 'ready', stages: STEPS.length },
      humanizer: 'ready',
      'rewrite-url': 'ready',
      autopilot: { status: 'ready', scheduled: Boolean(process.env.CRON_SECRET) },
      'seo-copilot': 'ready',
      'ai-visibility': 'ready',
      'keyword-research': 'ready',
      'content-audit': 'ready',
      reports: 'ready',
      'social-posts': 'ready',
      'content-calendar': 'ready',
      wordpress: 'ready',
    },
    access: { passwordProtected: Boolean(process.env.APP_PASSWORD) },
  });
}
