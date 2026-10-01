import type { ProjectData } from './types';

export interface StepDef {
  id: string;
  /** Short label for the stepper chip. */
  label: string;
  /** Full heading shown on the panel. */
  title: string;
  whatIsThis: string;
  seoImpact: string;
  optional?: boolean;
  /** Whether the stage has enough input to be considered finished. */
  isComplete(data: ProjectData): boolean;
}

/**
 * The 14 stages. Copy for the first stages is taken verbatim from the product;
 * the rest follows the same "what is this / why it matters for ranking" shape.
 */
export const STEPS: StepDef[] = [
  {
    id: 'competitor-research',
    label: 'Competitor Research',
    title: 'Competitor Research',
    whatIsThis:
      'Identify your main keyword and the top-ranking competitor URLs. The AI will analyze their content structure, topics, and SEO strategies to help you create superior content.',
    seoImpact:
      'Understanding what ranks #1 lets you cover the same topics (and more), signaling topical authority to Google. This is the foundation: every subsequent step builds on these competitors.',
    isComplete: (d) => d.competitors.length > 0,
  },
  {
    id: 'outline',
    label: 'Outline Creation',
    title: 'Outline Creation',
    whatIsThis:
      'Extract the heading structure (H1–H6) from each competitor page. This reveals how top-ranking articles organize their content and which subtopics they cover.',
    seoImpact:
      'Google uses headings to understand content hierarchy. By analyzing competitor outlines, you can create a more comprehensive structure that covers all important subtopics, improving your chances of ranking for related queries.',
    isComplete: (d) => d.combinedOutline.length > 0,
  },
  {
    id: 'word-count',
    label: 'Word Count',
    title: 'Target Word Count',
    whatIsThis:
      'Set how long the finished article should be. Leave it on auto and the target is derived from the average length of the competitors you are trying to beat.',
    seoImpact:
      'Length is not a ranking factor on its own, but under-covering a topic your competitors cover fully is. Matching or modestly exceeding the competitor average is the reliable target; padding past it adds nothing.',
    optional: true,
    isComplete: (d) => d.wordCount.target > 0,
  },
  {
    id: 'competitor-content',
    label: 'Competitor Content',
    title: 'Competitor Content Analysis',
    whatIsThis:
      "Extract and analyze the full text content from competitor pages. The AI examines writing style, tone, vocabulary level, and content patterns to inform your article's approach.",
    seoImpact:
      'Content quality signals like E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) are influenced by writing style. Matching or exceeding competitor content depth helps you compete for featured snippets and top positions.',
    optional: true,
    isComplete: (d) => d.competitorContent.some((c) => !c.error && c.words > 0),
  },
  {
    id: 'entities',
    label: 'Entities',
    title: 'Entity Extraction',
    whatIsThis:
      'Entities are real-world concepts (people, places, organizations, technologies) that search engines use to understand content. This step identifies key entities from competitors, AI recommendations, and unique opportunities.',
    seoImpact:
      "Google's Knowledge Graph connects entities to understand topic relationships. Including relevant entities in your content helps Google classify your page accurately, improving topical relevance scores and entity-based search visibility.",
    isComplete: (d) => d.entities.length > 0,
  },
  {
    id: 'ngrams',
    label: 'N-Grams',
    title: 'N-Gram Analysis',
    whatIsThis:
      'N-grams are the recurring one, two and three word phrases across competitor content. They are counted directly from the extracted text, not guessed by a model.',
    seoImpact:
      'Recurring phrases across every top-ranking page are the vocabulary Google associates with the query. Using the same phrasing naturally signals that your page is about the same thing.',
    isComplete: (d) => d.ngrams.length > 0,
  },
  {
    id: 'nlp-keywords',
    label: 'NLP Keywords',
    title: 'NLP Keyword Salience',
    whatIsThis:
      'Terms ranked by salience, how distinctive each one is to this topic, measured with TF-IDF against the competitor corpus rather than raw frequency.',
    seoImpact:
      "Google's natural language API scores entity salience to decide what a page is primarily about. Covering high-salience terms concentrates topical focus instead of diluting it across generic words.",
    isComplete: (d) => d.nlpKeywords.length > 0,
  },
  {
    id: 'skip-gram',
    label: 'Skip-Gram Words',
    title: 'Skip-Gram Words',
    whatIsThis:
      'Word pairs that repeatedly appear near each other without being adjacent, for example "semantic … optimisation". These capture relationships that plain n-grams miss.',
    seoImpact:
      'Embedding models learn meaning from co-occurrence. Reproducing the co-occurrence patterns of ranking pages places your document nearer them in vector space, which is what retrieval actually compares.',
    optional: true,
    isComplete: (d) => d.skipGrams.length > 0,
  },
  {
    id: 'auto-suggest',
    label: 'Auto-Suggest Keywords',
    title: 'Auto-Suggest Keywords',
    whatIsThis:
      'The questions real people ask around this keyword, autocomplete continuations and People Also Ask style queries. Select the ones worth answering.',
    seoImpact:
      'Answering a question directly, in its own heading, is how a page wins featured snippets and gets cited in AI Overviews. Each selected question becomes a heading in the brief.',
    isComplete: (d) => d.autoSuggest.length > 0,
  },
  {
    id: 'grammar',
    label: 'Grammar Generator',
    title: 'Grammar Generator',
    whatIsThis:
      'Tone, point of view, reading level, and a blocklist of phrases the writer must never use. The blocklist is what keeps output from reading like generic AI copy.',
    seoImpact:
      'Helpful Content rewards writing that sounds like a person who knows the subject. Stock AI phrasing is the clearest signal that nobody with expertise wrote the page.',
    optional: true,
    isComplete: () => true,
  },
  {
    id: 'seo-rules',
    label: 'SEO Rules',
    title: 'SEO Rules',
    whatIsThis:
      'The measurable targets the finished draft is scored against: keyword density, transition-word ratio, passive-voice ceiling, and which structural blocks to include.',
    seoImpact:
      'These are the same assessments Yoast and Rank Math run. Setting them before generation means the draft is written to hit them, rather than being rewritten afterwards to chase a score.',
    optional: true,
    isComplete: () => true,
  },
  {
    id: 'ai-instructions',
    label: 'AI Instructions',
    title: 'AI Instructions',
    whatIsThis:
      'Your own instructions for the writer: the angle to take, things to avoid, brand voice notes, anything the earlier stages cannot express.',
    seoImpact:
      'The stages above supply evidence and targets. This is where you supply judgement, which is what separates an article that covers the topic from one worth reading.',
    optional: true,
    isComplete: () => true,
  },
  {
    id: 'master-prompt',
    label: 'Master Prompt',
    title: 'Master Prompt',
    whatIsThis:
      'Every entity, phrase, question and rule from the previous stages compiled into the single brief the writer receives. Shown in full, then generated from.',
    seoImpact:
      'The master prompt is what separates this from one-shot generation. The model writes against gathered evidence and explicit coverage targets instead of from memory.',
    isComplete: (d) => Boolean(d.article),
  },
  {
    id: 'content-editor',
    label: 'Content Editor',
    title: 'Content Editor',
    whatIsThis:
      'The finished article with live scoring, entity coverage, keyword density, readability and the SEO assessments, recalculated as you edit.',
    seoImpact:
      'Scoring against the brief you built means coverage gaps are visible while you can still fix them, rather than after publishing.',
    isComplete: (d) => Boolean(d.article?.markdown),
  },
];

export const STEP_IDS = STEPS.map((s) => s.id);

export function stepIndex(id: string): number {
  return STEPS.findIndex((s) => s.id === id);
}

export function stepById(id: string): StepDef | undefined {
  return STEPS.find((s) => s.id === id);
}
