import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { htmlToPage } from '@/lib/semantic/extract';

const PAGE = `<!doctype html><html><head>
<title>Six Kings Slam 2026 Tickets: Prices, Dates and Seating</title>
<meta name="description" content="Everything about Six Kings Slam 2026 tickets: prices by night, seating at ANB Arena and how to buy.">
</head><body>
<header><nav><a href="/">Home</a><a href="/events">Events</a></nav></header>
<article>
<h1>Six Kings Slam 2026 Tickets</h1>
<p>Six Kings Slam 2026 tickets go on sale through Riyadh Season. The event runs 21 to 24 October at ANB Arena.</p>
<h2>How much are Six Kings Slam tickets?</h2>
<p>Prices depend on the night. Final-night seats cost the most and sell out first, so buy those early if you want them.</p>
<ul><li>Quarterfinal night: lowest prices</li><li>Final night: highest prices</li></ul>
<p>Read our <a href="/riyadh-season-guide">Riyadh Season guide</a> or check the <a href="https://www.atptour.com">ATP Tour</a> calendar.</p>
<img src="/arena.jpg" alt="ANB Arena seating map"><img src="/court.jpg">
<h2>Where is the Six Kings Slam held?</h2>
<p>At ANB Arena in Riyadh. Six Kings Slam tickets include entry for one session only, so plan which night matters most.</p>
</article>
<footer><p>Copyright notice and a long footer paragraph that should never be counted as article text.</p></footer>
</body></html>`;

describe('htmlToPage', () => {
  const page = htmlToPage(PAGE, 'https://riyadhticketsmap.com/six-kings-slam-tickets');

  it('reads title and meta description from the head', () => {
    expect(page.title).toBe('Six Kings Slam 2026 Tickets: Prices, Dates and Seating');
    expect(page.metaDescription).toMatch(/^Everything about Six Kings Slam 2026 tickets/);
  });

  it('converts the article to markdown and ignores nav and footer chrome', () => {
    expect(page.markdown).toContain('# Six Kings Slam 2026 Tickets');
    expect(page.markdown).toContain('## How much are Six Kings Slam tickets?');
    expect(page.markdown).toContain('- Final night: highest prices');
    expect(page.markdown).not.toMatch(/Copyright notice/);
  });

  it('classifies links as internal or external and resolves relative ones', () => {
    const internal = page.links.filter((l) => l.internal).map((l) => l.href);
    const external = page.links.filter((l) => !l.internal).map((l) => l.href);
    expect(internal).toContain('https://riyadhticketsmap.com/riyadh-season-guide');
    expect(external).toContain('https://www.atptour.com/');
  });

  it('counts images missing alt text', () => {
    expect(page.images).toHaveLength(2);
    expect(page.images.filter((i) => !i.alt)).toHaveLength(1);
  });
});

describe('inferKeyword', () => {
  it('picks the longest title phrase the body actually repeats', async () => {
    const { inferKeyword } = await import('./audit');
    const body = 'six kings slam tickets are on sale. buy six kings slam tickets early. six kings slam is in riyadh.';
    expect(inferKeyword('Six Kings Slam Tickets: A Buying Guide', body)).toBe('six kings slam tickets');
  });

  it('falls back to the first meaningful title words', async () => {
    const { inferKeyword } = await import('./audit');
    expect(inferKeyword('The Ultimate Guide to Nothing Repeated', 'unrelated body text')).toBe('ultimate guide nothing');
  });
});

describe('runAudit on pasted text', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'wg-audit-')), 'data.json');
    delete process.env.DATABASE_URL;
  });

  it('scores a draft, finds its AI tells, ranks issues by severity, and saves it', async () => {
    const { runAudit, listAudits } = await import('./audit');
    const draft = `# Six Kings Slam Guide

In today's digital age, the Six Kings Slam has become a game-changer — it is important to note that fans love it.
We must delve into the rich tapestry of this event. Furthermore, the tournament leverages a robust format.
The Six Kings Slam runs in Riyadh each October, and the six kings slam field changes every year.`;

    const r = await runAudit({ text: draft, keyword: 'six kings slam' });
    expect(r.source).toBe('text');
    expect(r.title).toBe('Six Kings Slam Guide');
    expect(r.style.emDashes).toBe(1);
    expect(r.style.humanScore).toBeLessThan(60);
    expect(r.issues[0]!.severity).toBe('high');
    expect(r.issues.some((i) => /delve/i.test(i.message))).toBe(true);
    // Pasted text has no page, so link checks are suppressed rather than noisy.
    expect(r.issues.some((i) => i.area === 'Links')).toBe(false);
    expect((await listAudits())[0]!.id).toBe(r.id);
  });

  it('rejects input too short to judge', async () => {
    const { runAudit } = await import('./audit');
    await expect(runAudit({ text: 'Too short.' })).rejects.toThrow(/at least 50/);
  });

  it('rejects an empty request', async () => {
    const { runAudit } = await import('./audit');
    await expect(runAudit({})).rejects.toThrow(/URL to audit, or paste/);
  });
});
