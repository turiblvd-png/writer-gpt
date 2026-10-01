/**
 * Stand-in for the Gemini REST API, for end-to-end testing without a real key.
 *
 *   node scripts/mock-gemini.mjs 8787
 *   GEMINI_API_KEY=test GEMINI_BASE_URL=http://127.0.0.1:8787 npm run dev
 *
 * It answers each pipeline step with a plausible response chosen from the
 * prompt's wording, and logs every request so the calls a run makes can be
 * inspected. It proves the plumbing, not the writing quality.
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8787);
// RETIRE=2.5 simulates Google withdrawing the 2.5 models: they 404, and the
// list offers only a newer generation.
const retired = process.env.RETIRE ? new RegExp(`gemini-${process.env.RETIRE.replace('.', '\\.')}-`) : null;
const calls = [];

const ARTICLE = `# Six Kings Slam 2026: Dates, Tickets and How to Watch

The Six Kings Slam 2026 runs from 21 to 24 October at ANB Arena in Riyadh. Six players. Four days, with a rest day before the final.

## When is the Six Kings Slam 2026?

Play starts on 21 October with two quarterfinals. The semifinals follow on 22 October, the players rest on 23 October, and the final closes the event on 24 October.

## Who is playing?

Jannik Sinner returns as two-time champion. Carlos Alcaraz, Novak Djokovic, Alexander Zverev, Taylor Fritz and Alex de Minaur complete the field, and two of them skip the quarterfinals entirely.

## How do you buy Six Kings Slam tickets?

Tickets sell through the official Riyadh Season platform. Prices depend on the night and the seating tier, and final-night seats go first.

| Night | Round | What to expect |
| --- | --- | --- |
| 21 Oct | Quarterfinals | Easiest tickets to get |
| 22 Oct | Semifinals | Top seeds enter |
| 24 Oct | Final | Sells out first |

## How can you watch it?

Netflix streams every match live. You need an active subscription and nothing else.

## FAQ

### Does the Six Kings Slam give ranking points?

No. It is an exhibition, so results never touch the ATP rankings.

### Where is the Six Kings Slam held?

At ANB Arena in Riyadh, during Riyadh Season.`;

function answer(prompt) {
  if (/Research the topic|Research ".*" against live search|research brief the writer/i.test(prompt) && /STATUS NOW/i.test(prompt))
    return 'STATUS NOW: The 2026 edition runs 21 to 24 October at ANB Arena, Riyadh.\nKEY FACTS: Netflix streams it. Field: Sinner, Alcaraz, Djokovic, Zverev, Fritz, de Minaur.\nRECENT CHANGES: Venue name is ANB Arena.\nOPEN QUESTIONS: Exact ticket prices per tier are UNVERIFIED.';
  if (/analyse search intent/i.test(prompt))
    return 'DOMINANT INTENT: Find 2026 dates, tickets and how to watch.\nWINNABLE ANGLE: "Six Kings Slam 2026 tickets and dates".';
  if (/Produce the heading outline/i.test(prompt))
    return JSON.stringify({ headings: ['## When is the Six Kings Slam 2026?', '## Who is playing?', '## How do you buy Six Kings Slam tickets?', '## How can you watch it?', '## FAQ', '### Does the Six Kings Slam give ranking points?'] });
  if (/Produce SEO metadata/i.test(prompt))
    return JSON.stringify({ seoTitle: 'Six Kings Slam 2026: Dates, Tickets & How to Watch', metaDescription: 'Six Kings Slam 2026 runs 21 to 24 October at ANB Arena, Riyadh. See the field, ticket options by night and how to stream every match on Netflix.', slug: 'six-kings-slam-2026-tickets-dates', focusKeyword: 'six kings slam 2026', keywords: ['six kings slam tickets', 'anb arena', 'riyadh season'] });
  if (/Fact-check this draft|Fact-check this draft against live search/i.test(prompt))
    return '```json\n' + JSON.stringify({ claims: [{ text: 'Runs 21 to 24 October', sourceUri: 'https://example.com', verdict: 'supported' }, { text: 'Final-night seats go first', sourceUri: null, verdict: 'unsupported', note: 'No source states this.' }] }) + '\n```';
  if (/Write the full article|Return the complete article as markdown|Rewrite the article below|Rewrite the text below|Write a new article/i.test(prompt))
    return ARTICLE;
  if (/Merge these into ONE outline/i.test(prompt))
    return JSON.stringify({ headings: [{ level: 1, text: 'Six Kings Slam 2026' }, { level: 2, text: 'Dates and schedule' }, { level: 2, text: 'Tickets' }] });
  if (/named entities relevant/i.test(prompt))
    return JSON.stringify({ competitor: ['Jannik Sinner', 'ANB Arena'], ai: ['Riyadh Season'], unique: ['General Entertainment Authority'] });
  if (/what people actually ask/i.test(prompt))
    return 'when is the six kings slam 2026\nsix kings slam tickets price\nhow to watch six kings slam';
  return 'OK.';
}

createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && /\/models(\?|$)/.test(req.url)) {
      const models = retired
        ? ['models/gemini-3-flash', 'models/gemini-3-pro']
        : ['models/gemini-2.5-flash', 'models/gemini-2.5-pro'];
      res.end(JSON.stringify({ models: models.map((name) => ({ name, supportedGenerationMethods: ['generateContent'] })) }));
      return;
    }

    const m = /models\/([^:]+):generateContent/.exec(req.url ?? '');
    if (!m) { res.statusCode = 404; res.end('{}'); return; }

    if (retired && retired.test(m[1])) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: `models/${m[1]} is not found for API version v1beta, or is not supported for generateContent.` } }));
      console.log(`[mock] ${m[1]} -> 404 retired`);
      return;
    }
    const parsed = JSON.parse(body || '{}');
    const prompt = (parsed.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? '').join('\n');
    const grounded = JSON.stringify(parsed.tools ?? []).includes('googleSearch');
    calls.push({ model: m[1], grounded, chars: prompt.length });
    console.log(`[mock] ${m[1]} grounded=${grounded} prompt=${prompt.slice(0, 60).replace(/\n/g, ' ')}…`);

    const text = answer(prompt);
    res.end(JSON.stringify({
      candidates: [{
        content: { role: 'model', parts: [{ text }] },
        finishReason: 'STOP',
        ...(grounded ? { groundingMetadata: {
          webSearchQueries: ['six kings slam 2026'],
          groundingChunks: [{ web: { uri: 'https://www.riyadhseason.com/six-kings-slam', title: 'Riyadh Season', domain: 'riyadhseason.com' } }],
        } } : {}),
      }],
      usageMetadata: { promptTokenCount: Math.ceil(prompt.length / 4), candidatesTokenCount: Math.ceil(text.length / 4), totalTokenCount: Math.ceil((prompt.length + text.length) / 4) },
    }));
  });
}).listen(port, '127.0.0.1', () => console.log(`mock gemini on ${port}`));
