/**
 * Seeds a Semantic Writer project with pre-extracted competitor content, so the
 * deterministic stages (n-grams, salience, skip-grams) can be exercised without
 * network access or an API key.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const pages = [
  { url: 'https://riyadhseason.com/en/events/six-kings-slam-tennis-rs26-tickets-182736', domain: 'riyadhseason.com', text: `
The Six Kings Slam returns to Riyadh for its third edition. The exhibition tennis tournament brings six elite players to ANB Arena during Riyadh Season.
Tickets for the Six Kings Slam go on sale through the official Riyadh Season platform. Ticket prices vary by session and seating category.
The exhibition tennis tournament awards no ATP ranking points. Players receive guaranteed appearance fees instead of ranking points.
The tournament format uses a six player knockout bracket. Two top seeded players receive semifinal byes.
Riyadh Season hosts the exhibition tennis tournament each October. The General Entertainment Authority organises the event.
Jannik Sinner won the previous edition. Carlos Alcaraz reached the final. Novak Djokovic also competed in the tournament.
` },
  { url: 'https://enjoy.sa/en/events/six-kings-slam-95/', domain: 'enjoy.sa', text: `
Six Kings Slam tickets are available across several seating categories at ANB Arena in Riyadh.
The exhibition tennis tournament runs over four days with a mandatory rest day between semifinals and the final.
Six elite players compete for the largest prize fund in exhibition tennis. The winner takes home a record sum.
The tournament format gives two players semifinal byes while four players contest the quarterfinals.
Riyadh Season visitors can combine Six Kings Slam tickets with other Riyadh Season events.
Jannik Sinner and Carlos Alcaraz have met in the final in consecutive editions of the exhibition tennis tournament.
` },
  { url: 'https://www.netflix.com/tudum/articles/six-kings-slam-tennis-riyadh-season-2026', domain: 'netflix.com', text: `
Netflix streams the Six Kings Slam live to subscribers worldwide. The exhibition tennis tournament is broadcast from ANB Arena in Riyadh.
Netflix acquired global live broadcast rights for the exhibition tennis tournament. Subscribers watch every match without pay per view fees.
The six player field includes Jannik Sinner, Carlos Alcaraz and Novak Djokovic. Alexander Zverev and Taylor Fritz also feature.
Riyadh Season hosts the tournament each October. The tournament format runs a knockout bracket across four days.
Netflix also offers on demand replays of every Six Kings Slam match after the live broadcast ends.
` },
  { url: 'https://en.wikipedia.org/wiki/Six_Kings_Slam', domain: 'en.wikipedia.org', text: `
The Six Kings Slam is an exhibition tennis tournament held in Riyadh, Saudi Arabia during Riyadh Season.
The inaugural edition took place in 2024 at The Venue, later renamed ANB Arena. The General Entertainment Authority organises the tournament.
The exhibition tennis tournament awards no ATP ranking points because it is unsanctioned by the ATP Tour.
Players receive guaranteed appearance fees. The prize fund is among the largest in exhibition tennis.
The tournament format features six players in a knockout bracket, with two semifinal byes and a mandatory rest day.
Jannik Sinner won the 2024 and 2025 editions, defeating Carlos Alcaraz in both finals. Novak Djokovic and Rafael Nadal have competed.
` },
];

const count = (t) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

mkdirSync('./data', { recursive: true });
const db = new Database(process.env.DATABASE_PATH ?? './data/writer-gpt.db');
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS semantic_projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'English',
  main_keyword TEXT NOT NULL, current_step INTEGER NOT NULL DEFAULT 0,
  completed TEXT NOT NULL DEFAULT '[]', data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);

const data = {
  competitors: pages.map((p) => ({ url: p.url, domain: p.domain })),
  outlines: pages.map((p) => ({
    url: p.url, domain: p.domain,
    headings: [
      { level: 1, text: 'Six Kings Slam' },
      { level: 2, text: 'Tournament format' },
      { level: 2, text: 'Players and field' },
      { level: 2, text: 'Tickets and venue' },
    ],
  })),
  combinedOutline: [
    { level: 1, text: 'Six Kings Slam 2026: Dates, Players, Tickets and How to Watch' },
    { level: 2, text: 'What is the Six Kings Slam?' },
    { level: 2, text: '2026 dates and schedule' },
    { level: 3, text: 'The mandatory rest day' },
    { level: 2, text: 'The six-player field' },
    { level: 2, text: 'Tickets and seating at ANB Arena' },
    { level: 2, text: 'How to watch on Netflix' },
    { level: 2, text: 'Prize money and appearance fees' },
    { level: 2, text: 'Frequently asked questions' },
  ],
  competitorContent: pages.map((p) => ({
    url: p.url, domain: p.domain, text: p.text.trim(), words: count(p.text),
  })),
  wordCount: { target: 1800, auto: true, competitorAverage: Math.round(pages.reduce((s, p) => s + count(p.text), 0) / pages.length) },
  entities: [
    { name: 'Jannik Sinner', source: 'competitor' }, { name: 'Carlos Alcaraz', source: 'competitor' },
    { name: 'Novak Djokovic', source: 'competitor' }, { name: 'ANB Arena', source: 'competitor' },
    { name: 'Riyadh Season', source: 'competitor' }, { name: 'Netflix', source: 'competitor' },
    { name: 'ATP Tour', source: 'competitor' }, { name: 'Rafael Nadal', source: 'competitor' },
    { name: 'General Entertainment Authority', source: 'ai' }, { name: 'Alexander Zverev', source: 'ai' },
    { name: 'Taylor Fritz', source: 'ai' }, { name: 'Saudi Arabia', source: 'ai' },
    { name: 'Public Investment Fund (PIF)', source: 'unique' }, { name: 'GreenSet Worldwide', source: 'unique' },
    { name: 'ATP Article 8.05 (Exhibition Restrictions)', source: 'unique' }, { name: 'Turki Al-Sheikh', source: 'unique' },
  ],
  excludedEntities: [],
  autoSuggest: [
    'when is the six kings slam 2026',
    'six kings slam 2026 tickets price',
    'how to watch six kings slam on netflix',
    'who is playing in the six kings slam 2026',
    'six kings slam prize money 2026',
    'where is the six kings slam held',
    'does the six kings slam give ranking points',
    'six kings slam 2026 schedule and dates',
  ],
  selectedQuestions: [],
  aiInstructions: '',
};

const id = randomUUID();
const now = Date.now();
db.prepare(`INSERT INTO semantic_projects (id,name,language,main_keyword,current_step,completed,data,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)`)
  .run(id, 'Six Kings Slam 2026', 'English', 'six kings slam', 0, '[]', JSON.stringify(data), now, now);

console.log(id);
