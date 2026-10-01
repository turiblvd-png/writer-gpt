'use client';

import { useMemo, useState } from 'react';
import type { StageApi } from './workspace';
import { Notice, Panel, Spinner, StatTile } from '@/components/semantic-ui';
import { IconAlert, IconBook, IconCheck, IconCopy, IconEdit, IconEye, IconSpark, IconTerminal } from '@/components/icons';
import { analyseSeo } from '@/lib/seo/analysis';
import { renderMarkdown } from '@/lib/content/render';
import { reviewSummary, reviewWarnings } from '@/lib/semantic/megaprompt';
import { lengthBudget } from '@/lib/semantic/brief';
import { assessArticle, plannedOutline } from '@/lib/semantic/quality';
import { FactsPanel } from './stages-facts';
import { STEPS } from '@/lib/semantic/steps';

export function GrammarStage({ api }: { api: StageApi }) {
  const { project, patch } = api;
  const g = project.data.grammar;
  const [phrase, setPhrase] = useState('');

  const set = (next: Partial<typeof g>) => void patch({ grammar: { ...g, ...next } });

  return (
    <>
      <Panel icon={<IconBook />} title="Voice" subtitle="How the article should sound.">
        <label className="label" htmlFor="tone">Tone</label>
        <input id="tone" className="field" value={g.tone} onChange={(e) => set({ tone: e.target.value })} />

        <label className="label mt-4" htmlFor="pov">Point of view</label>
        <select id="pov" className="field" value={g.pointOfView} onChange={(e) => set({ pointOfView: e.target.value as typeof g.pointOfView })}>
          <option value="second-person">Second person, &ldquo;you&rdquo;</option>
          <option value="first-person-plural">First person plural, &ldquo;we&rdquo;</option>
          <option value="third-person">Third person, neither</option>
        </select>

        <label className="label mt-4" htmlFor="level">Reading level</label>
        <input id="level" className="field" value={g.readingLevel} onChange={(e) => set({ readingLevel: e.target.value })} />

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
          <input type="checkbox" className="accent-accent" checked={g.sentenceVariety} onChange={(e) => set({ sentenceVariety: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold text-ink">Enforce sentence variety</span>
            <span className="block text-xs text-ink-3">Uniform sentence length is the most recognisable AI tell.</span>
          </span>
        </label>
      </Panel>

      <Panel icon={<IconAlert />} title="Banned phrases" subtitle="Never allowed in the output.">
        <Notice tone="info">
          This list does more for output quality than any other setting here. Stock phrasing is the clearest signal
          that nobody with expertise wrote the page.
        </Notice>

        <div className="mb-3 flex gap-2">
          <input
            className="field"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !phrase.trim()) return;
              set({ avoidPhrases: [...new Set([...g.avoidPhrases, phrase.trim().toLowerCase()])] });
              setPhrase('');
            }}
            placeholder="Add a phrase to ban…"
            aria-label="Phrase to ban"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {g.avoidPhrases.map((p) => (
            <button
              key={p}
              onClick={() => set({ avoidPhrases: g.avoidPhrases.filter((x) => x !== p) })}
              className="rounded-lg border border-bad/30 bg-bad/10 px-2.5 py-1 text-xs text-bad transition-colors hover:bg-bad/20"
              title="Remove"
            >
              {p} ×
            </button>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function SeoRulesStage({ api }: { api: StageApi }) {
  const { project, patch } = api;
  const s = project.data.seoRules;
  const set = (next: Partial<typeof s>) => void patch({ seoRules: { ...s, ...next } });

  const toggles = [
    { key: 'includeKeyTakeaways' as const, label: 'Key takeaways block', hint: 'Answers the query immediately, above the fold.' },
    { key: 'includeTables' as const, label: 'Comparison tables', hint: 'Only where comparison genuinely helps.' },
    { key: 'includeFaq' as const, label: 'FAQ section', hint: 'Built from the questions you selected.' },
  ];

  return (
    <>
      <Panel icon={<IconSpark />} title="Measurable targets" subtitle="The draft is written to hit these, then scored against them.">
        <label className="label" htmlFor="density">
          Keyword density, <span className="font-mono text-accent">{s.targetKeywordDensity}%</span>
        </label>
        <input id="density" type="range" min={0.5} max={3} step={0.1} value={s.targetKeywordDensity}
               onChange={(e) => set({ targetKeywordDensity: Number(e.target.value) })} className="w-full accent-accent" />
        <p className="mt-1 text-xs text-ink-3">Above roughly 2.5% reads as stuffing and is penalised.</p>

        <label className="label mt-5" htmlFor="trans">
          Minimum transition words, <span className="font-mono text-accent">{s.minTransitionRatio}%</span> of sentences
        </label>
        <input id="trans" type="range" min={0} max={60} step={5} value={s.minTransitionRatio}
               onChange={(e) => set({ minTransitionRatio: Number(e.target.value) })} className="w-full accent-accent" />

        <label className="label mt-5" htmlFor="passive">
          Maximum passive voice, <span className="font-mono text-accent">{s.maxPassiveRatio}%</span> of sentences
        </label>
        <input id="passive" type="range" min={0} max={30} step={1} value={s.maxPassiveRatio}
               onChange={(e) => set({ maxPassiveRatio: Number(e.target.value) })} className="w-full accent-accent" />
      </Panel>

      <Panel icon={<IconBook />} title="Structure">
        <div className="space-y-2">
          {toggles.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
              <input type="checkbox" className="accent-accent" checked={s[t.key]} onChange={(e) => set({ [t.key]: e.target.checked })} />
              <span>
                <span className="block text-sm font-semibold text-ink">{t.label}</span>
                <span className="block text-xs text-ink-3">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <label className="label mt-5" htmlFor="internal">Internal links <span className="font-normal text-ink-3">(optional)</span></label>
        <textarea id="internal" className="field min-h-[70px] resize-y" value={s.internalLinks}
                  onChange={(e) => set({ internalLinks: e.target.value })}
                  placeholder="/guides/tennis-calendar Tennis calendar&#10;/tickets Ticket guide" />
      </Panel>
    </>
  );
}

export function AiInstructionsStage({ api }: { api: StageApi }) {
  const { project, patch } = api;

  return (
    <Panel icon={<IconEdit />} title="Your instructions" subtitle="Appended to the master prompt, word for word.">
      <textarea
        className="field min-h-[180px] resize-y"
        value={project.data.aiInstructions}
        onChange={(e) => void patch({ aiInstructions: e.target.value })}
        placeholder="Angle to take, things to avoid, brand voice notes, anything the stages above cannot express…"
        aria-label="AI instructions"
      />
      <p className="mt-2 text-xs text-ink-3">
        Optional. Everything measured in the earlier stages is already in the brief; this is for judgement the
        tool cannot infer.
      </p>
    </Panel>
  );
}

export function MasterPromptStage({ api, onNavigate }: { api: StageApi; onNavigate: (i: number) => void }) {
  const { project, runAction, busy } = api;
  const [copied, setCopied] = useState(false);
  const megaPrompt = project.data.megaPrompt;

  const summary = useMemo(() => reviewSummary(project), [project]);
  const { blocking, advisory } = useMemo(() => reviewWarnings(project), [project]);
  const budget = useMemo(() => lengthBudget(plannedOutline(project), project.data.wordCount.target), [project]);
  const generating = busy === 'generate-article';

  const rows: [string, string | number][] = [
    ['Competitors', summary.competitors],
    ['Outlines extracted', summary.outlinesExtracted],
    ['Headings', summary.headings],
    ['Pages with content', summary.contentExtracted],
    ['Corpus words', summary.corpusWords.toLocaleString()],
    ['Entities', summary.entities],
    ['N-grams', summary.ngrams],
    ['NLP keywords', summary.keywords],
    ['Skip-grams', summary.skipGrams],
    ['Questions', summary.questions],
    ['Target length', `${budget.effective.toLocaleString()} words`],
    ['Verified facts', project.data.facts?.facts.length ?? 0],
  ];

  return (
    <>
      <Panel icon={<IconEye />} title="Coverage" subtitle="What each stage contributed to the brief.">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1.5">
              <dt className="text-sm text-ink-2">{label}</dt>
              <dd className={`font-mono text-sm ${value === 0 ? 'text-warn' : 'text-ink'}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {budget.raised && (
        <Notice tone="warn">
          Your outline has {budget.h2} H2 and {budget.h3} H3 sections, which needs about {budget.minimum.toLocaleString()} words to say
          something useful under each. The brief asks for {budget.effective.toLocaleString()} words instead of {budget.requested.toLocaleString()}.
          To keep it shorter, remove headings in Outline Creation.
        </Notice>
      )}

      <FactsPanel api={api} />

      <Panel
        icon={<IconTerminal />}
        title="Master prompt"
        subtitle="Every stage compiled into the single brief the writer receives."
        action={
          <div className="flex shrink-0 gap-2">
            {megaPrompt && (
              <button
                className="btn-ghost px-3 py-1.5 text-xs"
                onClick={() => {
                  void navigator.clipboard?.writeText(megaPrompt).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  });
                }}
              >
                {copied ? <><IconCheck className="h-3.5 w-3.5" /> Copied</> : <><IconCopy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            )}
            <button className="btn-primary px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => runAction('compile-mega-prompt')}>
              {busy === 'compile-mega-prompt' ? <Spinner className="h-3.5 w-3.5" /> : megaPrompt ? 'Recompile' : 'Compile'}
            </button>
          </div>
        }
      >
        {megaPrompt ? (
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-4 font-mono text-[11px] leading-relaxed text-ink-2">
            {megaPrompt}
          </pre>
        ) : (
          <p className="text-sm text-ink-3">
            Not compiled yet. Compile to see exactly what the writer will be told; nothing is hidden.
          </p>
        )}
      </Panel>

      {blocking.map((w) => <Notice key={w} tone="bad">{w}</Notice>)}
      {advisory.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

      {generating && (
        <Notice tone="info">
          Researching, drafting, checking for AI patterns, then fact-checking. That is several model calls and
          usually takes one to three minutes.
        </Notice>
      )}

      <button
        className="btn-primary w-full py-4 text-base"
        disabled={Boolean(busy) || blocking.length > 0}
        onClick={async () => {
          const ok = await runAction('generate-article');
          if (ok) onNavigate(STEPS.length - 1);
        }}
      >
        {generating ? <><Spinner /> Writing the article…</> : <><IconSpark className="h-5 w-5" /> Generate article</>}
      </button>

      {blocking.length > 0 && (
        <p className="mt-2 text-center text-xs text-ink-3">Resolve the blocking issues above to generate.</p>
      )}
    </>
  );
}

export function ContentEditorStage({ api }: { api: StageApi }) {
  const { project, patch } = api;
  const article = project.data.article;
  const [tab, setTab] = useState<'preview' | 'markdown'>('preview');

  const report = useMemo(
    () =>
      article
        ? analyseSeo({
            markdown: article.markdown,
            title: article.seoTitle,
            metaDescription: article.metaDescription,
            focusKeyword: project.mainKeyword,
            slug: article.slug,
          })
        : null,
    [article, project.mainKeyword],
  );

  // Entity coverage is the metric this whole workspace exists to move, so it is
  // measured against the brief rather than inferred from the generic SEO score.
  const coverage = useMemo(() => {
    if (!article) return null;
    const excluded = new Set(project.data.excludedEntities.map((e) => e.toLowerCase()));
    const wanted = project.data.entities.filter((e) => !excluded.has(e.name.toLowerCase()));
    const body = article.markdown.toLowerCase();
    const covered = wanted.filter((e) => body.includes(e.name.toLowerCase()));
    return { wanted, covered, missing: wanted.filter((e) => !covered.includes(e)) };
  }, [article, project.data.entities, project.data.excludedEntities]);

  const quality = useMemo(
    () => (article ? assessArticle(project, article.markdown, article.quality?.revised ?? false) : null),
    [article, project],
  );

  if (!article) {
    return <Notice tone="warn">No article generated yet. Go back to Review and generate one.</Notice>;
  }

  return (
    <>
      {article.unverifiedClaims && article.unverifiedClaims.length > 0 && (
        <Notice tone="bad">
          <p className="mb-1.5 font-semibold text-bad">
            {article.unverifiedClaims.length} claim(s) could not be verified, check before publishing.
          </p>
          <ul className="space-y-1 text-xs">
            {article.unverifiedClaims.map((c) => <li key={c}>• {c}</li>)}
          </ul>
        </Notice>
      )}

      {report && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatTile label="SEO score" value={report.score} tone={report.score >= 80 ? 'ok' : report.score >= 55 ? 'warn' : 'bad'} />
          <StatTile label="Words" value={report.stats.words.toLocaleString()} />
          <StatTile label="Density" value={`${report.keywordDensity}%`} />
          <StatTile label="Grade" value={report.readability.grade} />
          {coverage && (
            <StatTile
              label="Entities"
              value={`${coverage.covered.length}/${coverage.wanted.length}`}
              tone={coverage.wanted.length && coverage.covered.length / coverage.wanted.length >= 0.8 ? 'ok' : 'warn'}
            />
          )}
        </div>
      )}

      {quality && (
        <Panel
          icon={<IconCheck />}
          title={`Brief check: ${quality.passed} of ${quality.total} passed`}
          subtitle={quality.revised ? 'A revision pass already ran after the first draft. This re-checks live as you edit.' : 'Re-checks live as you edit.'}
        >
          <ul className="space-y-1.5">
            {quality.checks.map((c) => (
              <li key={c.id} className="flex gap-2.5 text-sm">
                {c.ok ? <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
                <span><span className="font-semibold">{c.label}.</span> <span className="text-ink-2">{c.detail}</span></span>
              </li>
            ))}
          </ul>
          {article.altTexts && article.altTexts.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-ink-3">Image alt text suggestions</p>
              <ul className="space-y-0.5 text-sm text-ink-2">{article.altTexts.map((t) => <li key={t}>• {t}</li>)}</ul>
            </div>
          )}
        </Panel>
      )}

      {coverage && coverage.missing.length > 0 && (
        <Notice tone="warn">
          <p className="mb-1.5 font-semibold">Entities in the brief that the article never names:</p>
          <p className="text-xs">{coverage.missing.map((e) => e.name).join(' · ')}</p>
        </Notice>
      )}

      <Panel icon={<IconEdit />} title={article.seoTitle} subtitle={`/${article.slug}`}>
        <div className="mb-4 flex gap-1 border-b border-line">
          {(['preview', 'markdown'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                tab === t ? 'border-accent text-accent' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'preview' ? (
          <article className="prose-article max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(article.markdown) }} />
        ) : (
          <textarea
            className="field min-h-[600px] resize-y font-mono text-xs leading-relaxed"
            value={article.markdown}
            onChange={(e) => void patch({ article: { ...article, markdown: e.target.value } })}
            aria-label="Article markdown"
          />
        )}
      </Panel>

      {report && (
        <Panel icon={<IconEye />} title="SEO assessments" subtitle="Recalculated from the current text.">
          <ul className="space-y-2">
            {report.checks.map((c) => (
              <li key={c.id} className="flex gap-3 text-sm">
                {c.status === 'good'
                  ? <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                  : <IconAlert className={`mt-0.5 h-4 w-4 shrink-0 ${c.status === 'bad' ? 'text-bad' : 'text-warn'}`} />}
                <span className="text-ink-2">{c.message}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
