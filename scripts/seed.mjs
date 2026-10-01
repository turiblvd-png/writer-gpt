/**
 * Seeds the library with a sample article so the SEO panels can be inspected
 * against real content. Writes the JSON store directly; no database driver.
 * Usage: node scripts/seed.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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

const count = (t) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu) ?? []).length;
const file = (process.env.DATABASE_PATH ?? './data/writer-gpt.json').replace(/\.(db|sqlite3?)$/i, '.json');

mkdirSync(dirname(file), { recursive: true });

let db = {};
try { db = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first run */ }

const now = Date.parse('2026-09-27T12:23:43Z');
db.articles = (db.articles ?? []).filter((a) => a.id !== 'seed-six-kings-slam');
db.articles.push({
  id: 'seed-six-kings-slam',
  title: 'Six Kings Slam: 6 Facts About the Elite Tennis Showdown',
  slug: 'six-kings-slam-6-facts-about-the-elite-tennis-showdown',
  markdown,
  metaDescription:
    'The Six Kings Slam stands among the most lucrative exhibition tennis events in world sports, awarding millions to top competitors across a concise schedule.',
  focusKeyword: 'six kings slam',
  keywords: ['six kings slam', 'riyadh season', 'jannik sinner', 'carlos alcaraz', 'exhibition tennis'],
  language: 'English',
  seoMode: 'hybrid',
  wordCount: count(markdown),
  status: 'draft',
  sources: [],
  createdAt: now,
  updatedAt: now,
});

writeFileSync(file, JSON.stringify(db), 'utf8');
console.log(`Seeded 1 article into ${file}`);
