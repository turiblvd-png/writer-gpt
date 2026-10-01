import { listArticles, type ArticleRecord } from '@/lib/db/store';
import { listHumanized } from '@/lib/humanizer/store';
import { listRewritten } from '@/lib/rewrite/store';
import { listProjects } from '@/lib/semantic/store';
import { listAudits } from '@/lib/audit/audit';
import { listChecks, type VisibilityCheck } from '@/lib/visibility/check';
import { listResearch } from '@/lib/keywords/research';
import { listSocialSets } from '@/lib/social/posts';
import { listQueue } from '@/lib/autopilot/queue';
import { analyseSeo } from '@/lib/seo/analysis';
import { detectTells } from '@/lib/style/detect';
import { safeRead } from '@/lib/db/safe';

/**
 * Reports: what has been produced and how good it is.
 *
 * Quality is re-measured from the stored text every time rather than read from
 * a score saved at generation, so improvements to the analysers show up here
 * and nobody can be flattered by a stale number.
 */

export interface ArticleQuality {
  id: string;
  title: string;
  words: number;
  seoScore: number;
  humanScore: number;
  emDashes: number;
  published: boolean;
}

export interface WeekBucket {
  /** Monday of the week, YYYY-MM-DD. */
  week: string;
  words: number;
  items: number;
}

export interface DomainTrend {
  domain: string;
  latest: number;
  previous: number | null;
  checks: number;
}

export interface Report {
  totals: {
    articles: number;
    words: number;
    published: number;
    humanized: number;
    rewrites: number;
    semanticProjects: number;
    audits: number;
    keywordResearch: number;
    visibilityChecks: number;
    socialSets: number;
    autopilotWritten: number;
  };
  quality: {
    avgSeo: number | null;
    avgHuman: number | null;
    dashFreeShare: number | null;
    humanizerUplift: number | null;
    avgRewriteSimilarity: number | null;
  };
  weekly: WeekBucket[];
  visibility: DomainTrend[];
  weakest: ArticleQuality[];
}

export interface ReportInput {
  articles: ArticleRecord[];
  humanized: { words: number; scoreBefore: number; scoreAfter: number; createdAt: number }[];
  rewrites: { words: number; similarityToSource: number; createdAt: number }[];
  semanticProjects: number;
  audits: number;
  keywordResearch: number;
  visibility: VisibilityCheck[];
  socialSets: number;
  autopilotWritten: number;
  now?: Date;
}

const avg = (values: number[]): number | null =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

function mondayOf(ts: number): string {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function measureArticle(a: ArticleRecord): ArticleQuality {
  const seo = analyseSeo({ markdown: a.markdown, title: a.title, metaDescription: a.metaDescription, focusKeyword: a.focusKeyword, slug: a.slug });
  const style = detectTells(a.markdown);
  return {
    id: a.id,
    title: a.title,
    words: a.wordCount,
    seoScore: seo.score,
    humanScore: style.humanScore,
    emDashes: style.emDashes,
    published: a.status === 'published',
  };
}

export function buildReport(input: ReportInput, weeks = 8): Report {
  const quality = input.articles.map(measureArticle);

  const now = input.now ?? new Date();
  const buckets = new Map<string, WeekBucket>();
  for (let i = weeks - 1; i >= 0; i--) {
    const week = mondayOf(now.getTime() - i * 7 * 86_400_000);
    buckets.set(week, { week, words: 0, items: 0 });
  }
  const tally = (createdAt: number, words: number) => {
    const bucket = buckets.get(mondayOf(createdAt));
    if (bucket) {
      bucket.words += words;
      bucket.items += 1;
    }
  };
  input.articles.forEach((a) => tally(a.createdAt, a.wordCount));
  input.humanized.forEach((h) => tally(h.createdAt, h.words));
  input.rewrites.forEach((r) => tally(r.createdAt, r.words));

  const byDomain = new Map<string, VisibilityCheck[]>();
  for (const c of [...input.visibility].sort((a, b) => b.createdAt - a.createdAt)) {
    byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), c]);
  }
  const visibility: DomainTrend[] = [...byDomain.entries()].map(([domain, checks]) => ({
    domain,
    latest: checks[0]!.citationRate,
    previous: checks[1]?.citationRate ?? null,
    checks: checks.length,
  }));

  return {
    totals: {
      articles: input.articles.length,
      words: input.articles.reduce((s, a) => s + a.wordCount, 0),
      published: input.articles.filter((a) => a.status === 'published').length,
      humanized: input.humanized.length,
      rewrites: input.rewrites.length,
      semanticProjects: input.semanticProjects,
      audits: input.audits,
      keywordResearch: input.keywordResearch,
      visibilityChecks: input.visibility.length,
      socialSets: input.socialSets,
      autopilotWritten: input.autopilotWritten,
    },
    quality: {
      avgSeo: avg(quality.map((q) => q.seoScore)),
      avgHuman: avg(quality.map((q) => q.humanScore)),
      dashFreeShare: quality.length ? Math.round((quality.filter((q) => q.emDashes === 0).length / quality.length) * 100) : null,
      humanizerUplift: avg(input.humanized.map((h) => h.scoreAfter - h.scoreBefore)),
      avgRewriteSimilarity: avg(input.rewrites.map((r) => r.similarityToSource)),
    },
    weekly: [...buckets.values()],
    visibility,
    weakest: [...quality].sort((a, b) => (a.seoScore + a.humanScore) - (b.seoScore + b.humanScore)).slice(0, 5),
  };
}

export async function loadReport(): Promise<Report> {
  const [articles, humanized, rewrites, projects, audits, research, visibility, social, queue] = await Promise.all([
    safeRead(() => listArticles(500), [], 'listArticles'),
    safeRead(() => listHumanized(500), [], 'listHumanized'),
    safeRead(() => listRewritten(500), [], 'listRewritten'),
    safeRead(() => listProjects(500), [], 'listProjects'),
    safeRead(() => listAudits(500), [], 'listAudits'),
    safeRead(() => listResearch(500), [], 'listResearch'),
    safeRead(() => listChecks(500), [], 'listChecks'),
    safeRead(() => listSocialSets(500), [], 'listSocialSets'),
    safeRead(() => listQueue(500), [], 'listQueue'),
  ]);
  return buildReport({
    articles,
    humanized,
    rewrites,
    semanticProjects: projects.length,
    audits: audits.length,
    keywordResearch: research.length,
    visibility,
    socialSets: social.length,
    autopilotWritten: queue.filter((q) => q.status === 'done').length,
  });
}
