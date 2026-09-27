/**
 * Catalogue of AI writing tells.
 *
 * These are measured, not guessed. Each entry is a pattern that appears far more
 * often in model output than in writing by someone who knows the subject, so a
 * hit is evidence the draft needs work rather than a style opinion.
 */

export type TellSeverity = 'critical' | 'major' | 'minor';

export interface TellPattern {
  id: string;
  label: string;
  severity: TellSeverity;
  /** Global, case-insensitive. */
  pattern: RegExp;
  /** What to do instead, shown in the UI and fed back to the rewrite prompt. */
  fix: string;
}

/**
 * Stock phrases. Ordered roughly by how strongly each one signals machine
 * authorship: the first group is close to a giveaway on its own.
 */
export const PHRASE_TELLS: TellPattern[] = [
  { id: 'delve', label: '"delve into"', severity: 'critical', pattern: /\bdelv(e|es|ing|ed)\s+into\b/gi, fix: 'Say what you are examining, directly.' },
  { id: 'tapestry', label: '"tapestry" / "rich tapestry"', severity: 'critical', pattern: /\b(rich\s+)?tapestry\b/gi, fix: 'Cut it. Name the actual thing.' },
  { id: 'landscape', label: '"ever-evolving / changing landscape"', severity: 'critical', pattern: /\b(ever[-\s]?(evolving|changing)|rapidly\s+(evolving|changing))\s+(landscape|world|environment|era)\b/gi, fix: 'State what changed and when.' },
  { id: 'digital-age', label: '"in today\'s digital age"', severity: 'critical', pattern: /\bin\s+(today'?s?|the\s+modern)\s+(digital\s+)?(age|world|era|landscape)\b/gi, fix: 'Delete the opener and start with the point.' },
  { id: 'unlock', label: '"unlock the power/potential"', severity: 'critical', pattern: /\bunlock(ing|s)?\s+(the\s+)?(power|potential|secrets?|value)\b/gi, fix: 'Say what it lets the reader do.' },
  { id: 'game-changer', label: '"game-changer"', severity: 'critical', pattern: /\bgame[-\s]?chang(er|ing)\b/gi, fix: 'State the specific change and its size.' },
  { id: 'navigate-complex', label: '"navigate the complexities"', severity: 'critical', pattern: /\bnavigat(e|ing|es)\s+(the\s+)?(complexit|intricac|nuanc|challeng)\w*/gi, fix: 'Name the specific difficulty.' },
  { id: 'realm', label: '"in the realm of"', severity: 'critical', pattern: /\bin\s+the\s+(realm|world|sphere)\s+of\b/gi, fix: 'Use "in" or cut it.' },
  { id: 'testament', label: '"a testament to"', severity: 'critical', pattern: /\b(a|is\s+a)\s+testament\s+to\b/gi, fix: 'Give the evidence instead of gesturing at it.' },

  { id: 'important-to-note', label: '"it is important/worth noting"', severity: 'major', pattern: /\bit'?s?\s+(is\s+)?(important|worth|crucial|essential)\s+to\s+(note|remember|mention|understand)\b/gi, fix: 'Just state the fact.' },
  { id: 'in-conclusion', label: '"in conclusion"', severity: 'major', pattern: /\bin\s+conclusion\b/gi, fix: 'End with the point, not a label.' },
  { id: 'when-it-comes', label: '"when it comes to"', severity: 'major', pattern: /\bwhen\s+it\s+comes\s+to\b/gi, fix: 'Use "for" or restructure.' },
  { id: 'dive-into', label: '"dive into" / "deep dive"', severity: 'major', pattern: /\b(deep\s+dive|div(e|es|ing)\s+(deep\s+)?into)\b/gi, fix: 'Say what you are covering.' },
  { id: 'seamless', label: '"seamless / seamlessly"', severity: 'major', pattern: /\bseamless(ly)?\b/gi, fix: 'Describe what actually happens.' },
  { id: 'leverage', label: '"leverage" as a verb', severity: 'major', pattern: /\bleverag(e|es|ing|ed)\b/gi, fix: 'Use "use".' },
  { id: 'robust', label: '"robust"', severity: 'major', pattern: /\brobust\b/gi, fix: 'Say what makes it strong.' },
  { id: 'elevate', label: '"elevate your"', severity: 'major', pattern: /\belevat(e|es|ing)\s+your\b/gi, fix: 'Say what improves, measurably.' },
  { id: 'at-the-end', label: '"at the end of the day"', severity: 'major', pattern: /\bat\s+the\s+end\s+of\s+the\s+day\b/gi, fix: 'Cut it.' },
  { id: 'article-will', label: '"this article will explore"', severity: 'major', pattern: /\bthis\s+(article|guide|post|piece)\s+(will\s+)?(explore|examine|cover|discuss|delve|look)\b/gi, fix: 'Start covering it instead of announcing it.' },
  { id: 'not-only', label: '"not only … but also"', severity: 'major', pattern: /\bnot\s+only\b[^.!?]{0,120}\bbut\s+also\b/gi, fix: 'Split into two sentences.' },
  { id: 'whether-youre', label: '"whether you\'re … or …"', severity: 'major', pattern: /\bwhether\s+you'?re\b[^.!?]{0,120}\bor\b/gi, fix: 'Address one reader, specifically.' },
  { id: 'plays-a-role', label: '"plays a crucial/vital role"', severity: 'major', pattern: /\bplays?\s+(a|an)\s+\w+\s+role\b/gi, fix: 'Say what it does.' },
  { id: 'harness', label: '"harness the power"', severity: 'major', pattern: /\bharness(ing|es)?\s+(the\s+)?(power|potential)\b/gi, fix: 'Say what it achieves.' },

  { id: 'furthermore', label: 'stacked "furthermore / moreover"', severity: 'minor', pattern: /\b(furthermore|moreover)\b/gi, fix: 'Fine once. Three times reads as filler.' },
  { id: 'crucial', label: '"crucial / vital / pivotal"', severity: 'minor', pattern: /\b(crucial|vital|pivotal|paramount)\b/gi, fix: 'Show why it matters instead of asserting it.' },
  { id: 'comprehensive', label: '"comprehensive"', severity: 'minor', pattern: /\bcomprehensive\b/gi, fix: 'Say what it covers.' },
  { id: 'myriad', label: '"a myriad of" / "plethora"', severity: 'minor', pattern: /\b(a\s+)?(myriad|plethora)\s+(of\s+)?/gi, fix: 'Give the number.' },
  { id: 'foster', label: '"foster" / "cultivate"', severity: 'minor', pattern: /\b(foster|cultivat)(s|ing|ed)?\b/gi, fix: 'Use a plain verb.' },
  { id: 'underscore', label: '"underscores / highlights the importance"', severity: 'minor', pattern: /\b(underscor|highlight)\w*\s+the\s+(importance|need|significance)\b/gi, fix: 'State the consequence.' },
];

/**
 * Punctuation tells.
 *
 * An em dash is always a tell. An en dash is only a tell when it is doing an em
 * dash's job: between numbers ("October 15–18", "2024–2026") it is correct
 * typography and must be left alone, or the tool would "fix" properly written
 * date ranges into commas.
 */
export const EM_DASH = /—|(?<!\d\s?)–(?!\s?\d)/g;
/** ASCII double hyphen used as an em dash. */
export const DOUBLE_HYPHEN = /(?<=\S)\s*--\s*(?=\S)/g;

/** Sentence openers that read as machine transitions when stacked. */
export const TRANSITION_OPENERS = [
  'additionally', 'furthermore', 'moreover', 'in addition', 'consequently',
  'therefore', 'thus', 'however', 'nevertheless', 'nonetheless',
];
