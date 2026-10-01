import { analyseDocument, countWords, splitSentences } from '@/lib/seo/text';
import { detectTells } from '@/lib/style/detect';
import { EM_DASH } from '@/lib/style/patterns';
import { keywordTargets, lengthBudget, splitKeywords, withFaqQuestions } from './brief';
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

export function plannedOutline(project: SemanticProject) {
  const d = project.data;
  const questions = (d.selectedQuestions.length ? d.selectedQuestions : d.autoSuggest).slice(0, 8);
  return d.seoRules.includeFaq ? withFaqQuestions(d.combinedOutline, questions) : d.combinedOutline;
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

  for (const t of keywordTargets(keywords, budget.effective)) {
    const n = countPhrase(markdown, t.term);
    checks.push({
      id: `keyword:${t.term}`, label: `"${t.term}" uses`, ok: n >= t.min && n <= t.max,
      detail: `${n} times; aim for ${t.min}-${t.max}.`,
    });
  }

  const firstWords = markdown.replace(/^#.*$/m, '').split(/\s+/).slice(0, 120).join(' ');
  checks.push({
    id: 'opening', label: 'Answer-first opening', ok: countPhrase(firstWords, primary) > 0 && /last updated/i.test(markdown.slice(0, 400)),
    detail: 'Main keyword in the first 100 words and a "Last updated" line under the H1.',
  });

  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
  const excluded = new Set(project.data.excludedEntities.map((e) => e.toLowerCase()));
  const required = project.data.entities.filter(
    (e) => (e.documentFrequency ?? 0) >= 2 && !excluded.has(e.name.toLowerCase()) && !keywordSet.has(e.name.toLowerCase()),
  );
  const missingEntities = required.filter((e) => countPhrase(markdown, e.name.replace(/\s*\(.*\)$/, '')) === 0).map((e) => e.name);
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
      return `Style: remove ${c.detail}.`;
    });
}
