import type { ArticleRecord } from '@/lib/db/store';
import { extractHeadings } from './text';

/**
 * JSON-LD for the Schema tab.
 *
 * Emits a real FAQPage block when the article contains question headings with
 * answers, because that is what earns the rich result — an Article block alone
 * is table stakes and wins nothing.
 */
export function buildSchema(article: ArticleRecord, siteUrl = 'https://example.com'): string {
  const url = `${siteUrl.replace(/\/+$/, '')}/${article.slug}`;
  const published = new Date(article.createdAt).toISOString();

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: article.title.slice(0, 110),
      description: article.metaDescription,
      inLanguage: article.language,
      datePublished: published,
      dateModified: new Date(article.updatedAt).toISOString(),
      wordCount: article.wordCount,
      keywords: article.keywords.join(', '),
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      ...(article.sources.length
        ? { citation: article.sources.slice(0, 10).map((s) => ({ '@type': 'CreativeWork', url: s.uri, name: s.title })) }
        : {}),
    },
  ];

  const faqs = extractFaqs(article.markdown);
  if (faqs.length >= 2) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

export function extractFaqs(markdown: string): { question: string; answer: string }[] {
  const headings = extractHeadings(markdown).filter((h) => h.level >= 2);
  const out: { question: string; answer: string }[] = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    const isQuestion = h.text.trim().endsWith('?') ||
      /^(what|why|how|when|where|who|which|can|do|does|is|are|should|will)\b/i.test(h.text.trim());
    if (!isQuestion) continue;

    // Body runs from the end of this heading line to the start of the next heading.
    const start = markdown.indexOf('\n', h.offset);
    const end = headings[i + 1]?.offset ?? markdown.length;
    if (start === -1 || start >= end) continue;

    const answer = markdown
      .slice(start, end)
      .replace(/^\s{0,3}#{1,6}\s+.*$/gm, '')
      .replace(/[*_`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (answer.length > 30) out.push({ question: h.text.trim(), answer: answer.slice(0, 900) });
  }
  return out;
}
