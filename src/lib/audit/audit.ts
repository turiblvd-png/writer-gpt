import { randomUUID } from 'node:crypto';
import { collection } from '@/lib/db/engine';
import { analyseSeo, type SeoReport } from '@/lib/seo/analysis';
import { extractHeadings, toPlainText } from '@/lib/seo/text';
import { detectTells, type StyleReport } from '@/lib/style/detect';
import { extractPage, type ExtractedPage } from '@/lib/semantic/extract';
import { normaliseUrl } from '@/lib/semantic/url';
import { STOP_WORDS } from '@/lib/semantic/stopwords';

/**
 * Content Audit: score any live page or pasted draft.
 *
 * Everything in the report is measured locally: SEO assessments, the AI-tell
 * score, readability, freshness, links and image alt text. No model call is
 * needed, so an audit is instant and free; the optional fix plan is a separate
 * step that does use one.
 */

export interface AuditIssue {
  severity: 'high' | 'medium' | 'low';
  area: 'SEO' | 'Writing' | 'Structure' | 'Freshness' | 'Links' | 'Images';
  message: string;
}

export interface AuditReport {
  id: string;
  source: 'url' | 'text';
  url: string | null;
  domain: string | null;
  title: string;
  metaDescription: string;
  keyword: string;
  /** True when the keyword was inferred rather than supplied. */
  keywordInferred: boolean;
  score: number;
  seo: SeoReport;
  style: StyleReport;
  headings: { level: number; text: string }[];
  links: { internal: number; external: number; samples: string[] };
  images: { total: number; missingAlt: number };
  issues: AuditIssue[];
  advice?: string;
  createdAt: number;
}

export class AuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditError';
  }
}

const audits = collection<AuditReport>('audits');

/**
 * Guess the focus keyword when none is given: the longest phrase from the title
 * (2–4 words, no stop-word edges) that the body repeats. Falls back to the first
 * meaningful words of the title.
 */
export function inferKeyword(title: string, body: string): string {
  const words = title.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
  const text = body.toLowerCase();
  let best = '';
  let bestScore = 0;

  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      if (STOP_WORDS.has(gram[0]!) || STOP_WORDS.has(gram[n - 1]!)) continue;
      const phrase = gram.join(' ');
      const hits = text.split(phrase).length - 1;
      // Specificity first, repetition second: a page targeting "six kings slam
      // tickets" repeats "six kings slam" more often by construction, but the
      // longer phrase is the one it is trying to rank for.
      const score = hits >= 2 ? n * 100 + hits : 0;
      if (score > bestScore) {
        best = phrase;
        bestScore = score;
      }
    }
  }
  if (best) return best;
  return words.filter((w) => !STOP_WORDS.has(w)).slice(0, 3).join(' ');
}

export function buildIssues(r: Pick<AuditReport, 'seo' | 'style' | 'links' | 'images' | 'headings'>): AuditIssue[] {
  const issues: AuditIssue[] = [];

  for (const c of r.seo.checks) {
    if (c.status === 'good') continue;
    const area: AuditIssue['area'] =
      c.category === 'freshness' ? 'Freshness'
        : c.category === 'readability' ? 'Writing'
          : c.category === 'structure' ? 'Structure' : 'SEO';
    issues.push({ severity: c.status === 'bad' ? (c.category === 'freshness' ? 'high' : 'medium') : 'low', area, message: c.message });
  }

  if (r.style.emDashes) {
    issues.push({ severity: 'medium', area: 'Writing', message: `${r.style.emDashes} em dash(es). The most recognisable machine-writing tell.` });
  }
  for (const hit of r.style.hits.slice(0, 6)) {
    issues.push({
      severity: hit.severity === 'critical' ? 'high' : hit.severity === 'major' ? 'medium' : 'low',
      area: 'Writing',
      message: `Uses ${hit.label} (${hit.count}×). ${hit.fix}`,
    });
  }
  if (r.style.sentenceVariation < 0.35 && r.style.sentences > 8) {
    issues.push({ severity: 'medium', area: 'Writing', message: 'Sentence lengths are unusually even, which reads as generated. Vary them.' });
  }

  if (!r.headings.some((h) => h.level === 1)) {
    issues.push({ severity: 'medium', area: 'Structure', message: 'No H1 found.' });
  } else if (r.headings.filter((h) => h.level === 1).length > 1) {
    issues.push({ severity: 'low', area: 'Structure', message: 'More than one H1. Use one, then H2s.' });
  }

  if (r.links.internal === 0) {
    issues.push({ severity: 'medium', area: 'Links', message: 'No internal links in the article body. Link to related pages on the same site.' });
  }
  if (r.links.external === 0) {
    issues.push({ severity: 'low', area: 'Links', message: 'No outbound citations. Link the sources behind statistics and claims.' });
  }
  if (r.images.missingAlt > 0) {
    issues.push({ severity: 'low', area: 'Images', message: `${r.images.missingAlt} of ${r.images.total} image(s) have no alt text.` });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function runAudit(input: {
  url?: string;
  text?: string;
  title?: string;
  metaDescription?: string;
  keyword?: string;
}): Promise<AuditReport> {
  let page: ExtractedPage | null = null;
  let markdown: string;
  let title = input.title?.trim() ?? '';
  let metaDescription = input.metaDescription?.trim() ?? '';

  if (input.url?.trim()) {
    page = await extractPage(normaliseUrl(input.url));
    if (page.error) throw new AuditError(`Could not read that page: ${page.error}`);
    markdown = page.markdown;
    title = title || page.title;
    metaDescription = metaDescription || page.metaDescription;
  } else if (input.text?.trim()) {
    markdown = input.text.trim();
    title = title || /^\s{0,3}#\s+(.+)$/m.exec(markdown)?.[1]?.trim() || markdown.split('\n')[0]!.slice(0, 80);
  } else {
    throw new AuditError('Give a URL to audit, or paste some text.');
  }

  const words = (toPlainText(markdown).match(/[\p{L}\p{N}]+/gu) ?? []).length;
  if (words < 50) throw new AuditError(`Only ${words} words of content found. An audit needs at least 50.`);

  const keyword = input.keyword?.trim() || inferKeyword(title, toPlainText(markdown));
  const seo = analyseSeo({ markdown, title, metaDescription, focusKeyword: keyword, slug: page ? new URL(page.url).pathname.replace(/^\/|\/$/g, '') : undefined });
  const style = detectTells(markdown);
  const headings = extractHeadings(markdown).map((h) => ({ level: h.level, text: h.text }));

  const links = page
    ? { internal: page.links.filter((l) => l.internal).length, external: page.links.filter((l) => !l.internal).length, samples: page.links.slice(0, 8).map((l) => l.href) }
    // Pasted markdown: count its links by syntax, treating all as external.
    : { internal: 0, external: (markdown.match(/\]\(https?:\/\//g) ?? []).length, samples: [] };
  const images = page
    ? { total: page.images.length, missingAlt: page.images.filter((i) => !i.alt).length }
    : { total: (markdown.match(/!\[/g) ?? []).length, missingAlt: (markdown.match(/!\[\]/g) ?? []).length };

  const report: AuditReport = {
    id: randomUUID(),
    source: page ? 'url' : 'text',
    url: page?.url ?? null,
    domain: page?.domain ?? null,
    title,
    metaDescription,
    keyword,
    keywordInferred: !input.keyword?.trim(),
    // SEO matters more for ranking; writing quality is what keeps it there.
    score: Math.round(seo.score * 0.6 + style.humanScore * 0.4),
    seo,
    style,
    headings,
    links,
    images,
    issues: [],
    createdAt: Date.now(),
  };
  // Pasted text has no page context, so link checks would only add noise.
  report.issues = buildIssues(report).filter((i) => page || i.area !== 'Links');

  await audits.put(report);
  return report;
}

export async function listAudits(limit = 50): Promise<AuditReport[]> {
  return audits.list('createdAt', limit);
}

export async function getAudit(id: string): Promise<AuditReport | null> {
  return audits.get(id);
}

export async function saveAuditAdvice(id: string, advice: string): Promise<AuditReport | null> {
  return audits.mutate(id, (a) => ({ ...a, advice }));
}
