import { analyseDocument, countWords, splitSentences } from '@/lib/seo/text';
import { detectTells } from '@/lib/style/detect';
import { EM_DASH } from '@/lib/style/patterns';
import { compactOutline, keywordTargets, lengthBudget, splitKeywords, withFaqQuestions } from './brief';
import { STOP_WORDS } from './stopwords';
import type { QualityCheck, QualityReport, SemanticProject } from './types';

/**
 * The brief's self-check, run for real after writing rather than trusted to
 * the model: length, keyword counts, required entities, every heading present,
 * paragraph length, punctuation and stock phrasing. Pure, so the Content Editor
 * re-runs it live as the user edits.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function countPhrase(text: string, phrase: string): number {
  const p = norm(phrase);
  if (!p) return 0;
  const hay = ` ${norm(text)} `;
  let count = 0;
  let i = hay.indexOf(` ${p} `);
  while (i !== -1) {
    count++;
    i = hay.indexOf(` ${p} `, i + p.length + 1);
  }
  return count;
}

/** Prose paragraphs only: headings, lists, tables, quotes and code are not paragraphs. */
export function paragraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>|```|!\[)/.test(b));
}

export function longParagraphs(markdown: string): string[] {
  return paragraphs(markdown).filter((p) => countWords(p) > 50 || splitSentences(p).length > 3);
}

const NOT_PROSE = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>|```|!\[)/;

/**
 * Splits every prose paragraph over three sentences or 50 words at sentence
 * boundaries. Deterministic and meaning-preserving, so the short-paragraph
 * rule holds without spending a model call on it.
 */
export function splitLongParagraphs(markdown: string): string {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => {
      const b = block.trim();
      if (!b || NOT_PROSE.test(b) || b.includes('\n')) return block;
      const sentences = splitSentences(b);
      if (sentences.length < 2 || (sentences.length <= 3 && countWords(b) <= 50)) return block;
      const out: string[][] = [];
      let cur: string[] = [];
      let words = 0;
      for (const s of sentences) {
        const n = countWords(s);
        if (cur.length && (cur.length >= 3 || words + n > 50)) {
          out.push(cur);
          cur = [];
          words = 0;
        }
        cur.push(s);
        words += n;
      }
      if (cur.length) out.push(cur);
      return out.map((group) => group.join(' ')).join('\n\n');
    })
    .join('\n\n');
}

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const SPECIFIC = new RegExp(
  [
    `\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?\\b`,
    `\\b\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?\\s+(?:${MONTHS})\\b`,
    '\\b\\d{1,2}(?::\\d{2})?\\s?(?:AM|PM|am|pm)\\b',
    '\\b\\d[\\d,.]*\\s?(?:SAR|USD|EUR|GBP|AED|riyals?|dollars?|million|billion|%)',
    '[$€£]\\s?\\d[\\d,.]*',
    '\\b\\d{1,3}(?:,\\d{3})+\\b',
  ].join('|'),
  'g',
);

/**
 * Specific figures (dates, times, prices, big numbers) stated more than
 * `limit` times. Once in the key takeaways, once in its section and once in an
 * FAQ answer is fine; more is the repetition readers notice.
 */
export function repeatedSpecifics(markdown: string, limit = 3): { text: string; count: number }[] {
  const counts = new Map<string, { text: string; count: number }>();
  for (const m of bodyText(markdown).match(SPECIFIC) ?? []) {
    const key = m.toLowerCase().replace(/\s+/g, ' ').replace(/–/g, '-').trim();
    const hit = counts.get(key) ?? { text: m.trim(), count: 0 };
    hit.count++;
    counts.set(key, hit);
  }
  return [...counts.values()].filter((c) => c.count > limit).sort((a, b) => b.count - a.count);
}

/** Headings with too little under them to deserve one; FAQ questions, Sources and H2s that lead into H3s are exempt. */
export function thinSections(markdown: string, min = 45): string[] {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inFaq = false;
  lines.forEach((line, i) => {
    const m = /^\s{0,3}(#{1,6})\s+(.+)$/.exec(line);
    if (!m) return;
    const level = m[1]!.length;
    const text = m[2]!.trim();
    if (level === 2) inFaq = /\b(faq|faqs|frequently asked|common questions|questions and answers)\b/i.test(text);
    if (level === 1 || inFaq || /^(sources?|references|further reading)\b/i.test(text)) return;
    let j = i + 1;
    const body: string[] = [];
    while (j < lines.length && !/^\s{0,3}#{1,6}\s/.test(lines[j]!)) body.push(lines[j++]!);
    const nextLevel = /^\s{0,3}(#{1,6})\s/.exec(lines[j] ?? '')?.[1]?.length ?? 0;
    if (nextLevel > level) return;
    if (countWords(body.join(' ')) < min) out.push(text);
  });
  return out;
}

export interface TextEdit {
  find: string;
  replace: string;
  why?: string;
}

/**
 * Applies an editor's exact-text edits. An edit is skipped unless its text
 * occurs in the article, stays inside one paragraph, and touches no heading,
 * table row or link target, so a bad edit can never break the structure.
 */
export function applyEdits(markdown: string, edits: TextEdit[]): { markdown: string; applied: TextEdit[] } {
  let out = markdown;
  const applied: TextEdit[] = [];
  for (const e of edits) {
    const find = e.find ?? '';
    const replace = (e.replace ?? '').replace(/\u2014/g, ', ');
    if (find.trim().length < 12 || find.includes('\n\n') || /(^|\n)\s*(#|\|)/.test(find) || /(^|\n)\s*#/.test(replace)) continue;
    if (/\]\(/.test(find) && !/\]\(/.test(replace)) continue;
    const at = out.indexOf(find);
    if (at === -1) continue;
    out = out.slice(0, at) + replace + out.slice(at + find.length);
    applied.push(e);
  }
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { markdown: out, applied };
}

/** The article without its heading lines. */
export function bodyText(markdown: string): string {
  return markdown.split('\n').filter((l) => !/^\s{0,3}#{1,6}\s/.test(l)).join('\n');
}

/**
 * The outline the article is written to: FAQ questions as their own headings,
 * then fitted to the length so no heading sits over a two-sentence fragment.
 */
export function plannedOutline(project: SemanticProject) {
  const d = project.data;
  const questions = (d.selectedQuestions.length ? d.selectedQuestions : d.autoSuggest).slice(0, 6);
  const full = d.seoRules.includeFaq ? withFaqQuestions(d.combinedOutline, questions) : d.combinedOutline;
  return compactOutline(full, d.wordCount.target);
}

/** Content words, for matching facts and entities to sections. */
export function topicWords(text: string, ignore: Set<string> = new Set()): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP_WORDS.has(w) && !ignore.has(w)),
  );
}

/**
 * Entities the article must name: two or more ranking pages name them AND the
 * outline or the fact sheet connects them to this topic. A name that is only
 * frequent on those pages (a celebrity at a neighbouring event, a sister
 * tournament) is optional, so the writer never forces it into a section.
 */
export function requiredEntities(project: SemanticProject): string[] {
  const d = project.data;
  const keywordSet = new Set(splitKeywords(project.mainKeyword).map((k) => k.toLowerCase()));
  const excluded = new Set(d.excludedEntities.map((e) => e.toLowerCase()));
  const context = [
    ...d.combinedOutline.map((h) => h.text),
    ...(d.facts?.facts.flatMap((f) => [f.label, f.value]) ?? []),
  ].join(' \n ').toLowerCase();
  return d.entities
    .filter((e) => (e.documentFrequency ?? 0) >= 2 && !excluded.has(e.name.toLowerCase()) && !keywordSet.has(e.name.toLowerCase()))
    .map((e) => e.name.replace(/\s*\(.*\)$/, '').trim())
    .filter((name) => name && context.includes(name.toLowerCase()));
}

export function assessArticle(project: SemanticProject, markdown: string, revised = false): QualityReport {
  const checks: QualityCheck[] = [];
  const outline = plannedOutline(project);
  const budget = lengthBudget(outline, project.data.wordCount.target);
  const words = analyseDocument(markdown).words;
  const keywords = splitKeywords(project.mainKeyword);
  const primary = keywords[0] ?? project.mainKeyword;

  const low = Math.round(budget.effective * 0.85);
  const high = Math.round(budget.effective * 1.2);
  checks.push({
    id: 'length', label: 'Length', ok: words >= low && words <= high,
    detail: `${words.toLocaleString()} words; target ${budget.effective.toLocaleString()} (accepted ${low.toLocaleString()}-${high.toLocaleString()}).`,
  });

  // Body text only, against the article's real length: a keyword in an
  // outline heading is placement, and density is a share of what was written.
  const body = bodyText(markdown);
  for (const t of keywordTargets(keywords, Math.max(words, 1))) {
    const n = countPhrase(body, t.term);
    checks.push({
      id: `keyword:${t.term}`, label: `"${t.term}" uses`, ok: n >= t.min && n <= t.max,
      detail: `${n} times in the body text; aim for ${t.min}-${t.max}.`,
    });
  }

  const firstWords = markdown.replace(/^#.*$/m, '').split(/\s+/).slice(0, 120).join(' ');
  checks.push({
    id: 'opening', label: 'Answer-first opening', ok: countPhrase(firstWords, primary) > 0 && /last updated/i.test(markdown.slice(0, 400)),
    detail: 'Main keyword in the first 100 words and a "Last updated" line under the H1.',
  });

  const required = requiredEntities(project);
  const missingEntities = required.filter((name) => countPhrase(markdown, name) === 0);
  checks.push({
    id: 'entities', label: 'Required entities', ok: missingEntities.length === 0,
    detail: missingEntities.length ? `Missing: ${missingEntities.join(', ')}.` : `All ${required.length} named.`,
  });

  const present = new Set(
    markdown.split('\n').filter((l) => /^#{1,6}\s/.test(l)).map((l) => norm(l.replace(/^#+\s*/, ''))),
  );
  const missingHeadings = outline.filter((h) => !present.has(norm(h.text))).map((h) => h.text);
  checks.push({
    id: 'headings', label: 'Outline followed', ok: missingHeadings.length === 0,
    detail: missingHeadings.length ? `Missing or reworded: ${missingHeadings.slice(0, 6).join(' | ')}${missingHeadings.length > 6 ? ` and ${missingHeadings.length - 6} more` : ''}.` : `All ${outline.length} headings present.`,
  });

  const repeats = repeatedSpecifics(markdown);
  checks.push({
    id: 'repeats', label: 'Each fact said once', ok: repeats.length === 0,
    detail: repeats.length ? `Repeated: ${repeats.slice(0, 5).map((r) => `"${r.text}" ×${r.count}`).join(', ')}.` : 'No date, time, price or figure is repeated more than three times.',
  });

  const thin = thinSections(markdown);
  checks.push({
    id: 'sections', label: 'Sections earn their headings', ok: thin.length === 0,
    detail: thin.length ? `${thin.length} heading(s) with under 45 words: ${thin.slice(0, 4).join(' | ')}${thin.length > 4 ? ' …' : ''}.` : 'Every heading has a real section under it.',
  });

  const long = longParagraphs(markdown);
  checks.push({
    id: 'paragraphs', label: 'Short paragraphs', ok: long.length === 0,
    detail: long.length ? `${long.length} paragraph(s) over 3 sentences or 50 words.` : 'Every paragraph is 1-3 sentences.',
  });

  const dashes = (markdown.match(EM_DASH) ?? []).length;
  const tells = detectTells(markdown).hits.filter((h) => h.severity !== 'minor');
  checks.push({
    id: 'style', label: 'No AI tells', ok: dashes === 0 && tells.length === 0,
    detail: dashes || tells.length
      ? [dashes ? `${dashes} em dash(es)` : '', ...tells.map((t) => `${t.label} ×${t.count}`)].filter(Boolean).join(', ')
      : 'No em dashes or stock phrases.',
  });

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length, revised };
}

/** What to tell the model when a check failed. Length is fixed by adding detail, never padding. */
export function revisionInstructions(report: QualityReport): string[] {
  return report.checks
    .filter((c) => !c.ok)
    .map((c) => {
      if (c.id === 'length') return `Length: ${c.detail} Adjust by adding or cutting specifics from the fact sheet, never by padding.`;
      if (c.id.startsWith('keyword:')) return `${c.label}: ${c.detail} Change wording where it reads naturally.`;
      if (c.id === 'entities') return `Entities: ${c.detail} Name each with its relationship to the topic, only if the fact sheet supports it.`;
      if (c.id === 'headings') return `Headings: ${c.detail} Restore the exact headings from the structure, in order.`;
      if (c.id === 'paragraphs') return 'Paragraphs: split every paragraph over 3 sentences or 50 words.';
      if (c.id === 'opening') return 'Opening: put "Last updated" under the H1 and use the main keyword in the first 100 words.';
      if (c.id === 'repeats') return `Repetition: ${c.detail} Keep each figure in its own section; elsewhere refer to it briefly.`;
      if (c.id === 'sections') return `Thin sections: ${c.detail} Add the specifics a reader needs there.`;
      return `Style: remove ${c.detail}.`;
    });
}
