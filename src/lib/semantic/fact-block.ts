import type { RunClock } from '@/lib/pipeline/types';
import type { FactSheet, FactStatus, VerifiedFact } from './types';

/** Safe for client components: formatting only, no model calls. */
/** The fact sheet as the writer sees it. */
export function factSheetBlock(sheet: FactSheet, clock: RunClock): string[] {
  const by = (s: FactStatus) => sheet.facts.filter((f) => f.status === s);
  const line = (f: VerifiedFact) => `- ${f.label}: ${f.value}${f.source || f.url ? ` (source: ${[f.source, f.url].filter(Boolean).join(', ')})` : ''}`;
  const out = [
    `Facts as of ${clock.today}. Take every specific (date, time, place, name, price, number, rule) from this sheet and nowhere else.`,
    '',
  ];
  if (by('confirmed').length) out.push('CONFIRMED by current sources. State plainly:', ...by('confirmed').map(line), '');
  if (by('reported').length) {
    out.push('REPORTED by ranking pages only. Attribute them ("according to <source>"), never state them as settled:', ...by('reported').map(line), '');
  }
  if (by('conflicting').length) out.push('CONFLICTING. Give both values and both sources, and say which is official if known:', ...by('conflicting').map(line), '');
  if (by('unconfirmed').length) {
    out.push('NOT YET CONFIRMED. Say so in the article, in the "confirmed vs not yet announced" list:', ...by('unconfirmed').map((f) => `- ${f.label}${f.value ? `: ${f.value}` : ''}`), '');
  }
  if (!sheet.liveSearch) out.push('Live search was unavailable for this sheet, so no fact is independently confirmed. Attribute every specific to its source.', '');
  if (sheet.sources.length) {
    out.push('SOURCES YOU MAY CITE. The Sources section lists only these, with their URL where given. Never invent a link:');
    out.push(...sheet.sources.map((s) => `- ${s.name}${s.url ? `: ${s.url}` : ''}`));
  }
  return out;
}
