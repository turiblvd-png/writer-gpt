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
  if (/List the specific facts a reader needs/i.test(prompt))
    return 'FACT: Dates | 15-18 October 2026 | riyadhseason.com | CONFIRMED\nFACT: Venue | ANB Arena, Riyadh | riyadhseason.com | CONFIRMED\nFACT: Ticket prices | not announced for 2026 | none | UNCONFIRMED';
  if (/Build a fact sheet for an article/i.test(prompt))
    return JSON.stringify({ facts: [
      { label: '2026 dates', value: '15-18 October 2026', status: 'confirmed', source: 'riyadhseason.com' },
      { label: 'Venue', value: 'ANB Arena, Riyadh', status: 'confirmed', source: 'riyadhseason.com' },
      { label: 'Broadcaster', value: 'Netflix, live worldwide', status: 'reported', source: 'Example guide', url: 'https://guide.example/six-kings' },
      { label: '2026 ticket prices', value: 'not yet announced', status: 'unconfirmed' },
    ], sources: [{ name: 'Riyadh Season', url: '' }, { name: 'Example guide', url: 'https://guide.example/six-kings' }] });
  if (/Revise the article below so it passes these checks/i.test(prompt)) {
    const m = /ARTICLE:\n([\s\S]*?)\n\nReturn the complete revised article/.exec(prompt);
    return (m ? m[1] : ARTICLE) + '\n\n## Sources\n\nRiyadh Season and the Example guide.';
  }
  if (/Write social posts promoting this article/i.test(prompt))
    return JSON.stringify({ posts: [
      { platform: 'linkedin', parts: ['The 2026 Six Kings Slam runs 21-24 October at ANB Arena in Riyadh.\n\nSix players, two byes, one of the richest purses in tennis. Here is how to get tickets and watch it.\n\nWhich match are you watching first?\n\n[LINK]'], hashtags: ['SixKingsSlam', 'Tennis'] },
      { platform: 'x', parts: ['Six Kings Slam 2026: 21-24 October, ANB Arena, Riyadh.', 'Two of the six players get semifinal byes.', 'Tickets, schedule and streams: [LINK]'], hashtags: ['SixKingsSlam'] },
      { platform: 'facebook', parts: ['Six Kings Slam is back in Riyadh from 21 October. Here is the full guide. [LINK]'], hashtags: [] },
      { platform: 'instagram', parts: ['Six players. Four nights. One trophy.\n\nThe Six Kings Slam returns to Riyadh on 21 October. Save this for the schedule.\n\nLink in bio.'], hashtags: ['SixKingsSlam', 'Riyadh', 'Tennis'] },
    ] });
  if (/senior SEO strategist working inside Writer-GPT/i.test(prompt) || /Reply to the last USER message/i.test(prompt))
    return '**Short answer:** official and ticketing sites own page one right now.\n\n1. Riyadh Season holds the top result.\n2. Netflix ranks for the streaming angle.\n\nNext step: run Keyword Research on the ticket queries.';
  if (/List 8 questions real customers would ask/i.test(prompt))
    return JSON.stringify({ queries: ['how much are six kings slam tickets', 'where to buy six kings slam tickets', 'six kings slam 2026 schedule', 'is the six kings slam worth attending'] });
  if (/Report what you find, plainly/i.test(prompt))
    return 'WHO RANKS: riyadhseason.com (official), netflix.com, en.wikipedia.org, enjoy.sa.\nSERP FEATURES: People Also Ask, news.\nRELATED: six kings slam 2026 dates, six kings slam tickets price.';
  if (/Turn this into keyword clusters/i.test(prompt))
    return JSON.stringify({
      clusters: [
        { name: 'Tickets and prices', intent: 'transactional', keywords: [
          { term: 'six kings slam tickets', intent: 'transactional', difficulty: 'high', note: 'Official seller ranks first.' },
          { term: 'six kings slam ticket prices 2026', intent: 'commercial', difficulty: 'medium', note: 'No page lists prices by night.' },
          { term: 'cheapest six kings slam tickets', intent: 'transactional', difficulty: 'low', note: 'Forums only.' } ] },
        { name: 'Dates and schedule', intent: 'informational', keywords: [
          { term: 'six kings slam 2026 dates', intent: 'informational', difficulty: 'medium', note: 'Answer in the first line.' },
          { term: 'six kings slam schedule', intent: 'informational', difficulty: 'medium', note: 'A table wins the snippet.' } ] },
        { name: 'How to watch', intent: 'informational', keywords: [
          { term: 'how to watch six kings slam', intent: 'informational', difficulty: 'high', note: 'Netflix owns it.' } ] },
      ],
      questions: ['how much are six kings slam tickets', 'when is the six kings slam 2026', 'is the six kings slam on netflix'],
      serpFeatures: ['People Also Ask', 'Top stories'],
      competitors: ['riyadhseason.com', 'netflix.com', 'en.wikipedia.org'],
      angle: 'A ticket guide broken down by night, with prices and what each session includes.',
    });
  if (/Research the topic|Research ".*" against live search|research brief the writer/i.test(prompt) && /STATUS NOW/i.test(prompt))
    return 'STATUS NOW: The 2026 edition runs 21 to 24 October at ANB Arena, Riyadh.\nKEY FACTS: Netflix streams it. Field: Sinner, Alcaraz, Djokovic, Zverev, Fritz, de Minaur.\nRECENT CHANGES: Venue name is ANB Arena.\nOPEN QUESTIONS: Exact ticket prices per tier are UNVERIFIED.';
  if (/analyse search intent/i.test(prompt))
    return 'DOMINANT INTENT: Find 2026 dates, tickets and how to watch.\nWINNABLE ANGLE: "Six Kings Slam 2026 tickets and dates".';
  if (/Produce the heading outline/i.test(prompt))
    return JSON.stringify({ headings: ['## When is the Six Kings Slam 2026?', '## Who is playing?', '## How do you buy Six Kings Slam tickets?', '## How can you watch it?', '## FAQ', '### Does the Six Kings Slam give ranking points?'] });
  if (/Produce SEO metadata/i.test(prompt) && /altTexts/.test(prompt))
    return JSON.stringify({ seoTitle: 'Six Kings Slam 2026: Tickets, Dates and Players', metaDescription: 'Six Kings Slam 2026 runs 15-18 October at ANB Arena in Riyadh. Dates, tickets, players and how to watch on Netflix.', slug: 'six-kings-slam-2026', altTexts: ['ANB Arena in Riyadh set up for the Six Kings Slam', 'Six Kings Slam 2026 match schedule table'] });
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

    // OpenAI-compatible endpoints, standing in for DeepSeek and Grok.
    if (req.url?.startsWith('/v1/')) {
      if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
        res.end(JSON.stringify({ data: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }] }));
        return;
      }
      const parsed = JSON.parse(body || '{}');
      if (!String(req.headers.authorization ?? '').startsWith('Bearer sk-')) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: { message: 'Authentication Fails, Your api key is invalid', type: 'authentication_error' } }));
        return;
      }
      const prompt = (parsed.messages ?? []).map((m) => m.content).join('\n');
      let text = answer(prompt);
      if (parsed.response_format?.type === 'json_object' && !/^[\[{]/.test(text.trim())) text = '{"ok":true}';
      console.log(`[mock] openai-compat ${parsed.model} prompt=${prompt.slice(0, 60).replace(/\s+/g, ' ')}…`);
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: text } }],
        usage: { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: Math.ceil(text.length / 4), total_tokens: 0 },
      }));
      return;
    }

    // GEMINI_INVALID=1 answers every Gemini call the way Google does for a bad key.
    if (process.env.GEMINI_INVALID && /generateContent|\/models/.test(req.url ?? '')) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } }));
      return;
    }

    if (req.method === 'GET' && /\/models(\?|$)/.test(req.url)) {
      const models = retired
        ? ['models/gemini-3-flash', 'models/gemini-3-pro']
        : ['models/gemini-2.5-flash', 'models/gemini-2.5-pro'];
      res.end(JSON.stringify({ models: models.map((name) => ({ name, supportedGenerationMethods: ['generateContent'] })) }));
      return;
    }

    const m = /models\/([^:]+):generateContent/.exec(req.url ?? '');
    if (!m) { res.statusCode = 404; res.end('{}'); return; }

    // QUOTA_ALL=1 answers every Gemini call with a per-minute 429, as a busy free key does.
    if (process.env.QUOTA_ALL) {
      res.statusCode = 429;
      res.end(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: `Quota exceeded for metric: generate_content_free_tier_requests, limit: 10, model: ${m[1]}`,
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaValue: '10' }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '45s' },
        ] } }));
      return;
    }
    // QUOTA_PRO=1 answers every Pro call the way Google does for a free key with no Pro allowance.
    if (process.env.QUOTA_PRO && /pro/.test(m[1])) {
      res.statusCode = 429;
      res.end(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED',
        message: `You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: ${m[1]}`,
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '0' }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34s' },
        ] } }));
      console.log(`[mock] ${m[1]} -> 429 quota`);
      return;
    }
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
          groundingChunks: [
            { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/a1', title: 'riyadhseason.com', domain: 'riyadhseason.com' } },
            ...(/tickets/i.test(prompt) ? [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/b2', title: 'riyadhticketsmap.com' } }] : []),
            { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/c3', title: 'en.wikipedia.org' } },
          ],
        } } : {}),
      }],
      usageMetadata: { promptTokenCount: Math.ceil(prompt.length / 4), candidatesTokenCount: Math.ceil(text.length / 4), totalTokenCount: Math.ceil((prompt.length + text.length) / 4) },
    }));
  });
}).listen(port, '127.0.0.1', () => console.log(`mock gemini on ${port}`));
