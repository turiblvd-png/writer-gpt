/**
 * Seeds the library with the Six Kings Slam article from the existing tool, so
 * the SEO panels can be inspected against real generated content.
 * Usage: node scripts/seed.mjs
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';

const markdown = `# Six Kings Slam: 6 Facts About the Elite Tennis Showdown

The Six Kings Slam stands among the most lucrative exhibition tennis events in world sports, awarding millions to top competitors across a concise three-day schedule. Staged in Riyadh, Saudi Arabia, the tournament features six world-class men's tennis champions competing in an intense knockout bracket.

In this overview, you will learn the competition format, the complete match results, the international broadcast details, and how this event fits into the wider professional tennis calendar.

## What Is the Six Kings Slam?

The Six Kings Slam is an elite men's tennis exhibition tournament staged during the annual Riyadh Season cultural festival in Riyadh, Saudi Arabia. General Entertainment Authority organizers launched the inaugural edition in 2024 to bring the world's most accomplished tennis players directly to Middle Eastern sports fans. Because the competition operates as an unsanctioned exhibition event, players do not earn official ATP Tour ranking points.

Instead, organizers reward participants with guaranteed appearance fees and historic prize money sums. Italian superstar Jannik Sinner won the first edition in October 2024 by defeating Spanish rival Carlos Alcaraz in a thrilling championship match.

## The Tournament Format and Match Schedule

The Six Kings Slam uses a specialized six-player single-elimination bracket spread over four calendar days. Organizers design the bracket with two direct semifinal berths alongside two opening-round quarterfinal matches.

Specifically, the competition schedule includes a mandatory rest day between the semifinals and finals. This pause complies with international tennis governing rules, which limit players from competing in exhibition events on three consecutive calendar days.

## The 2025 Six Kings Slam Player Lineup

The 2025 Six Kings Slam gathered six of the most recognizable athletes in modern tennis. The matches took place from October 15 to October 18, 2025, drawing intense global media coverage.

## Championship Match: Sinner vs Alcaraz

On October 18, 2025, Jannik Sinner and Carlos Alcaraz met in the championship match for the second consecutive year. Sinner broke serve twice in the opening set to take it 6-2, and closed out a decisive 6-2, 6-4 victory to defend his crown.

## Who won the Six Kings Slam in 2024 and 2025?

Jannik Sinner won both the 2024 and 2025 tournaments. Sinner defeated Carlos Alcaraz in both finals, winning the 2025 championship match with a 6-2, 6-4 scoreline.

## Where did the tournament take place?

The tournament took place in Riyadh, Saudi Arabia, during the annual Riyadh Season festival. Netflix identified the 2025 arena as ANB Arena, while early local announcements also referenced Kingdom Arena.

## Conclusion

The Six Kings Slam established a new model for international tennis exhibitions through top-ranked players, high production values, and global live streaming.`;

mkdirSync('./data', { recursive: true });
const db = new Database(process.env.DATABASE_PATH ?? './data/writer-gpt.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL, markdown TEXT NOT NULL,
    meta_description TEXT NOT NULL DEFAULT '', focus_keyword TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '[]', language TEXT NOT NULL DEFAULT 'English',
    seo_mode TEXT NOT NULL DEFAULT 'full-seo', word_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft', sources TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY, pipeline_id TEXT NOT NULL, article_id TEXT, status TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0, snapshot TEXT NOT NULL DEFAULT '{}', error TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
`);

const now = Date.parse('2026-09-27T12:23:43Z');
db.prepare(
  `INSERT OR REPLACE INTO articles (id,title,slug,markdown,meta_description,focus_keyword,keywords,
     language,seo_mode,word_count,status,sources,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
).run(
  'seed-six-kings-slam',
  'Six Kings Slam: 6 Facts About the Elite Tennis Showdown',
  'six-kings-slam-6-facts-about-the-elite-tennis-showdown',
  markdown,
  'The Six Kings Slam stands among the most lucrative exhibition tennis events in world sports, awarding millions to top competitors across a concise schedule.',
  'six kings slam',
  JSON.stringify(['six kings slam', 'riyadh season', 'jannik sinner', 'carlos alcaraz', 'exhibition tennis']),
  'English', 'hybrid', (markdown.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length,
  'draft', JSON.stringify([]), now, now,
);

console.log('Seeded 1 article.');
