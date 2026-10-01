'use client';

import type { StageApi } from './workspace';
import { Notice } from '@/components/semantic-ui';
import {
  CompetitorContentStage, CompetitorResearchStage, OutlineStage, WordCountStage,
} from './stages-research';
import {
  AutoSuggestStage, CorpusStats, EntitiesStage, NgramsStage, NlpKeywordsStage, SkipGramStage,
} from './stages-semantic';
import {
  AiInstructionsStage, ContentEditorStage, GrammarStage, MasterPromptStage, SeoRulesStage,
} from './stages-output';

/** Stages that read the measured corpus, so they show its size up front. */
const CORPUS_STAGES = new Set(['entities', 'ngrams', 'nlp-keywords', 'skip-gram']);

export function StagePanel({
  stepId, api, onNavigate,
}: {
  stepId: string;
  api: StageApi;
  onNavigate: (index: number) => void;
}) {
  return (
    <>
      {api.error && (
        <Notice tone="bad">
          <div className="flex items-start justify-between gap-3">
            <span>{api.error}</span>
            <button onClick={api.clearError} className="shrink-0 text-xs text-ink-3 hover:text-ink">Dismiss</button>
          </div>
        </Notice>
      )}

      {CORPUS_STAGES.has(stepId) && <CorpusStats api={api} />}

      {render(stepId, api, onNavigate)}
    </>
  );
}

function render(stepId: string, api: StageApi, onNavigate: (i: number) => void) {
  switch (stepId) {
    case 'competitor-research': return <CompetitorResearchStage api={api} />;
    case 'outline':             return <OutlineStage api={api} />;
    case 'word-count':          return <WordCountStage api={api} />;
    case 'competitor-content':  return <CompetitorContentStage api={api} />;
    case 'entities':            return <EntitiesStage api={api} />;
    case 'ngrams':              return <NgramsStage api={api} />;
    case 'nlp-keywords':        return <NlpKeywordsStage api={api} />;
    case 'skip-gram':           return <SkipGramStage api={api} />;
    case 'auto-suggest':        return <AutoSuggestStage api={api} />;
    case 'grammar':             return <GrammarStage api={api} />;
    case 'seo-rules':           return <SeoRulesStage api={api} />;
    case 'ai-instructions':     return <AiInstructionsStage api={api} />;
    case 'master-prompt':       return <MasterPromptStage api={api} onNavigate={onNavigate} />;
    case 'content-editor':      return <ContentEditorStage api={api} />;
    default:                    return <Notice tone="warn">Unknown stage &ldquo;{stepId}&rdquo;.</Notice>;
  }
}
