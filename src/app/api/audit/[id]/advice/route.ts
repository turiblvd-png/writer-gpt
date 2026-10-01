import { NextResponse } from 'next/server';
import { complete, aiReady, AI_NOT_READY } from '@/lib/ai';
import { getAudit, saveAuditAdvice } from '@/lib/audit/audit';
import { makeClock } from '@/lib/pipeline/engine';
import { systemPreamble } from '@/lib/style/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Turns a measured audit into a prioritised fix plan. The scoring itself never needs a model. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await aiReady())) {
    return NextResponse.json({ error: AI_NOT_READY }, { status: 503 });
  }
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 });

  const clock = makeClock();
  const findings = [
    `Page: ${audit.url ?? 'pasted draft'}`,
    `Title: ${audit.title}`,
    `Meta description: ${audit.metaDescription || '(none)'}`,
    `Focus keyword: ${audit.keyword}${audit.keywordInferred ? ' (inferred)' : ''}`,
    `Scores: overall ${audit.score}, SEO ${audit.seo.score}, human-writing ${audit.style.humanScore}`,
    `Words: ${audit.seo.stats.words}. H2s: ${audit.seo.stats.h2}. H3s: ${audit.seo.stats.h3}.`,
    '',
    'Headings:',
    ...audit.headings.map((h) => `${'  '.repeat(h.level - 1)}H${h.level} ${h.text}`),
    '',
    'Measured issues, most severe first:',
    ...audit.issues.map((i) => `- [${i.severity}] ${i.area}: ${i.message}`),
  ].join('\n');

  try {
    const res = await complete('reason', {
      system: systemPreamble(clock, 'English'),
      prompt: [
        'You are reviewing an SEO audit. Write a prioritised fix plan for this page.',
        '',
        findings,
        '',
        'Rules:',
        '- At most 8 fixes, ordered by likely ranking impact. Highest impact first.',
        '- Each fix is concrete: say exactly what to change, and where. Rewrite the title or meta description yourself when they need it.',
        '- Base every fix on the measured issues above. Do not invent problems the audit did not find.',
        `- If the topic is time-bound and the page does not address ${clock.year}, that is the first fix.`,
        '- Suggest headings for questions the page fails to answer only when the issues support it.',
        '',
        'Format: a numbered markdown list. Each item: a bold one-line fix, then one or two sentences on why. No preamble.',
      ].join('\n'),
      temperature: 0.3,
    });
    const updated = await saveAuditAdvice(id, res.text.trim());
    return NextResponse.json({ audit: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not generate a fix plan.' }, { status: 500 });
  }
}
