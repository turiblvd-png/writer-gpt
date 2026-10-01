import { keywordTargets, lengthBudget, splitKeywords, type LengthBudget } from './brief';
import { plannedOutline, requiredEntities, topicWords } from './quality';
import { factLine } from './fact-block';
import type { OutlineHeading, SemanticProject } from './types';

/**
 * Splits the outline into parts that are written at the same time.
 *
 * One call for a whole article is slow (a 3,000-word answer takes minutes) and
 * fragile (one stall loses everything). Parts of about 420 words each come back
 * in well under a minute, run side by side, and save as they land, so the whole
 * article takes roughly as long as its slowest part.
 *
 * Pure, so the client plans the same parts the server writes.
 */

export interface PartKeyword {
  term: string;
  primary: boolean;
  min: number;
  max: number;
}

export interface ArticlePart {
  index: number;
  headings: OutlineHeading[];
  words: number;
  /** Carries the H1, "Last updated" line, definition and key takeaways. */
  opening: boolean;
  last: boolean;
  /** Words budgeted directly under each of `headings`. */
  headingWords: number[];
  /** Required entities this part is responsible for naming. */
  entities: string[];
  /** Facts whose home is in this part: stated in full here and only here. */
  facts: string[];
  keywords: PartKeyword[];
}

export interface PartPlan {
  parts: ArticlePart[];
  budget: LengthBudget;
  outline: OutlineHeading[];
  /** Changes whenever the outline or length changes, so stale parts are never reused. */
  key: string;
}

const PART_WORDS = 420;
const MAX_H2_PER_PART = 2;
/** A single H2 bigger than this is split across parts at its H3s. */
const SPLIT_BLOCK_WORDS = 650;

interface Block {
  headings: OutlineHeading[];
  weight: number;
  opening: boolean;
}

export function planParts(project: SemanticProject): PartPlan {
  const outline = plannedOutline(project);
  const budget = lengthBudget(outline, project.data.wordCount.target);

  const wordsOf = new Map(outline.map((h, i) => [h, budget.weights[i] ?? 0] as const));

  // 1. One block per H2 (with its H3s); everything before the first H2 is the opening.
  const blocks: Block[] = [{ headings: [], weight: budget.opening, opening: true }];
  for (const h of outline) {
    if (h.level === 2) blocks.push({ headings: [h], weight: wordsOf.get(h) ?? 0, opening: false });
    else {
      const cur = blocks[blocks.length - 1]!;
      cur.headings.push(h);
      cur.weight += wordsOf.get(h) ?? 0;
    }
  }
  // 2. Budgets are per heading already; a block is never smaller than a short section.
  for (const b of blocks) b.weight = Math.max(40, b.weight);

  // 3. Split oversized H2 blocks at H3 boundaries.
  const sized: Block[] = [];
  for (const b of blocks) {
    if (b.opening || b.weight <= SPLIT_BLOCK_WORDS || b.headings.length < 4) {
      sized.push(b);
      continue;
    }
    const pieces = Math.ceil(b.weight / PART_WORDS);
    const per = Math.ceil(b.headings.length / pieces);
    for (let i = 0; i < b.headings.length; i += per) {
      const hs = b.headings.slice(i, i + per);
      sized.push({ headings: hs, weight: Math.round((b.weight * hs.length) / b.headings.length), opening: false });
    }
  }

  // 4. Group consecutive blocks into parts of about PART_WORDS.
  const groups: Block[][] = [];
  let cur: Block[] = [];
  let curWords = 0;
  for (const b of sized) {
    const h2s = cur.filter((x) => x.headings[0]?.level === 2).length;
    const full = curWords + b.weight > PART_WORDS * 1.15 || h2s >= MAX_H2_PER_PART;
    // The opening alone is too small to be worth its own request.
    const openingOnly = cur.length === 1 && cur[0]!.opening;
    if (cur.length && full && !openingOnly) {
      groups.push(cur);
      cur = [];
      curWords = 0;
    }
    cur.push(b);
    curWords += b.weight;
  }
  if (cur.length) groups.push(cur);

  const parts: ArticlePart[] = groups.map((g, index) => ({
    index,
    headings: g.flatMap((b) => b.headings),
    headingWords: g.flatMap((b) => b.headings).map((h) => wordsOf.get(h) ?? 0),
    words: Math.max(80, Math.round(g.reduce((s, b) => s + b.weight, 0) / 10) * 10),
    opening: g.some((b) => b.opening),
    last: index === groups.length - 1,
    entities: [],
    facts: [],
    keywords: [],
  }));

  assignFacts(project, parts);
  assignEntities(project, parts);
  assignKeywords(project, parts, budget.effective);

  const key = hash(`${budget.effective}|${outline.map((h) => `${h.level}${h.text}`).join('|')}|${parts.length}`);
  return { parts, budget, outline, key };
}

const sectionText = (p: ArticlePart) => p.headings.flatMap((h) => [h.text, ...(h.covers ?? [])]).join(' \n ');
const isSourcesOnly = (p: ArticlePart) => p.headings.length > 0 && p.headings.every((h) => /^\s*(sources?|references|further reading)\b/i.test(h.text));

/**
 * Gives every fact one home: the part whose headings share the most topic
 * words with it. Parts are written at the same time, so without a home each
 * writer restates the dates, venue and prices and the joined article repeats
 * them six or eight times. Facts with no clear home open the article.
 */
function assignFacts(project: SemanticProject, parts: ArticlePart[]) {
  const sheet = project.data.facts;
  if (!sheet?.facts.length) return;
  const ignore = topicWords(project.mainKeyword);
  const homes = parts.map((p) => (isSourcesOnly(p) ? new Set<string>() : topicWords(sectionText(p), ignore)));
  for (const f of sheet.facts) {
    const label = topicWords(f.label, ignore);
    const value = topicWords(f.value, ignore);
    let best = 0;
    let score = 0;
    homes.forEach((words, i) => {
      let s = 0;
      for (const w of label) if (words.has(w)) s += 2;
      for (const w of value) if (words.has(w)) s += 1;
      if (s > score) {
        score = s;
        best = i;
      }
    });
    parts[best]!.facts.push(factLine(f));
  }
}

/**
 * A required entity goes to the part whose headings or facts mention it.
 * One with no home stays optional: forcing it into an unrelated section is
 * worse for readers and rankings than leaving it out.
 */
function assignEntities(project: SemanticProject, parts: ArticlePart[]) {
  const pool = parts.filter((p) => !isSourcesOnly(p));
  for (const name of requiredEntities(project)) {
    const n = name.toLowerCase();
    const home =
      pool.find((p) => sectionText(p).toLowerCase().includes(n)) ??
      pool.find((p) => p.facts.some((f) => f.toLowerCase().includes(n)));
    home?.entities.push(name);
  }
}

/** Splits each keyword's whole-article range across parts by length (largest remainder). */
function assignKeywords(project: SemanticProject, parts: ArticlePart[], words: number) {
  const targets = keywordTargets(splitKeywords(project.mainKeyword), words);
  const weights = parts.map((p) => p.words);
  for (const t of targets) {
    const mins = distribute(t.min, weights);
    const maxs = distribute(t.max, weights);
    parts.forEach((p, i) => {
      // The opening must carry the primary keyword in the H1 and the first 100 words.
      const min = p.opening && t.primary ? Math.max(2, mins[i]!) : mins[i]!;
      p.keywords.push({ term: t.term, primary: t.primary, min, max: Math.max(min, maxs[i]!) });
    });
  }
}

export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((s, n) => s + n, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return out;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Makes a part's headings match the plan exactly. Models reword or re-level
 * headings now and then; when the part has the right number of headings, each
 * is restored to the planned wording and level. Stray H1s in later parts and
 * any preamble before the first heading are removed.
 */
export function fixPartHeadings(markdown: string, part: ArticlePart): { markdown: string; matched: boolean } {
  let lines = markdown.split('\n');
  if (!part.opening) lines = lines.filter((l) => !/^\s{0,3}#\s/.test(l));

  const isHeading = (l: string) => /^\s{0,3}#{1,6}\s/.test(l);
  const idx = lines.map((l, i) => (isHeading(l) ? i : -1)).filter((i) => i >= 0);

  // Drop a preamble ("Here is part 2:") before the first heading.
  if (idx.length && part.headings.length) {
    const first = idx[0]!;
    const pre = lines.slice(0, first).join('\n').trim();
    if (pre && (!part.opening || part.headings[0]!.level === 1)) {
      lines = lines.slice(first);
      for (let k = 0; k < idx.length; k++) idx[k] = idx[k]! - first;
    }
  }

  if (idx.length === part.headings.length) {
    idx.forEach((li, k) => {
      const h = part.headings[k]!;
      lines[li] = `${'#'.repeat(Math.max(1, Math.min(6, h.level)))} ${h.text}`;
    });
    return { markdown: lines.join('\n').trim(), matched: true };
  }

  const present = new Set(idx.map((i) => norm(lines[i]!.replace(/^\s*#+\s*/, ''))));
  const matched = part.headings.every((h) => present.has(norm(h.text)));
  return { markdown: lines.join('\n').trim(), matched };
}
