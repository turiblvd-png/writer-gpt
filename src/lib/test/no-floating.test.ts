import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Storage became async. A forgotten `await` on a read still typechecks, because
 * a Promise is truthy: the project route passed its not-found check and sent the
 * client `{}`. Dropped writes fail silently too. Neither shows up as a type
 * error, so this scan is the guard.
 */
const ASYNC_STORE = [
  'saveArticle', 'listArticles', 'getArticle', 'deleteArticle', 'saveRun', 'getRun', 'listRuns',
  'createProject', 'getProject', 'listProjects', 'updateProject', 'markStepComplete', 'deleteProject',
  'saveHumanized', 'listHumanized', 'getHumanized', 'deleteHumanized',
  'listBrandVoices', 'createBrandVoice', 'getBrandVoice', 'deleteBrandVoice', 'seedDefaultVoices',
  'saveRewritten', 'listRewritten', 'deleteRewritten', 'storageStatus', 'probeStorage', 'safeRead',
  'listAudits', 'getAudit', 'listChecks', 'listResearch', 'deleteResearch',
  'enqueue', 'claimNext', 'runNext', 'listQueue', 'retryItem', 'clearFinished',
  'sendMessage', 'listConversations', 'getConversation', 'deleteConversation',
  'generateSocialPosts', 'listSocialSets', 'deleteSocialSet',
  'addEntry', 'updateEntry', 'removeEntry', 'listEntries',
  'getWpConfig', 'getWpConfigView', 'saveWpConfig', 'disconnectWp', 'publishArticle', 'loadReport',
];

/** True when line i sits inside an awaited Promise.all([...]) array. */
function insideAwaitedAll(lines: string[], i: number): boolean {
  for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
    if (/\]\s*\)/.test(lines[j]!)) return false;
    if (/\bawait\s+Promise\.all\(\[\s*$/.test(lines[j]!)) return true;
  }
  return false;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(e) && !e.endsWith('.test.ts') ? [full] : [];
  });
}

describe('async storage calls', () => {
  it('are always awaited, returned, or passed as a callback', () => {
    const call = new RegExp(`\\b(${ASYNC_STORE.join('|')})\\(`);
    const offenders: string[] = [];

    for (const file of walk('src')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const m = call.exec(line);
        if (!m) return;
        const before = line.slice(0, m.index);
        const ok =
          /\b(await|return)\s+$/.test(before) ||
          /=>\s*$/.test(before) ||
          /\bfunction\s+$/.test(before) ||
          /\bimport\b|\bexport\s*\{/.test(line) ||
          /^\s*(\*|\/\/)/.test(line) ||
          /void\s+$/.test(before) ||
          // A method on some other object (e.g. a stream controller), not our store.
          /\.\s*$/.test(before) ||
          (/^\s*$/.test(before) && insideAwaitedAll(lines, i));
        if (!ok) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
