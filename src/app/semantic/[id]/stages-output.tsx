'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { StageApi } from './workspace';
import { Notice, Panel, Spinner, StatTile } from '@/components/semantic-ui';
import { IconAlert, IconBook, IconCheck, IconCopy, IconEdit, IconEye, IconSpark, IconTerminal } from '@/components/icons';
import { analyseSeo } from '@/lib/seo/analysis';
import { renderMarkdown } from '@/lib/content/render';
import { buildMegaPrompt, reviewSummary, reviewWarnings } from '@/lib/semantic/megaprompt';
import { assessArticle } from '@/lib/semantic/quality';
import { planParts } from '@/lib/semantic/sections';
import { makeClock } from '@/lib/pipeline/engine';
import { readJson } from '@/lib/http/read-json';
import type { SemanticProject } from '@/lib/semantic/types';
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

/** How many parts are written at once. Each is its own request. */
const CONCURRENCY = 10;

type Flow = { label: string; done: number; total: number; startedAt: number };

async function postAction(projectId: string, action: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`/api/semantic/projects/${projectId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    const data = await readJson(res);
    if (!res.ok) return { ok: false as const, error: String(data.error ?? 'Action failed.') };
    return { ok: true as const, project: data.project as SemanticProject };
  } catch {
    return { ok: false as const, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

const filled = (p?: SemanticProject) => p?.data.draft?.parts.filter(Boolean).length ?? 0;

export function MasterPromptStage({ api, onNavigate }: { api: StageApi; onNavigate: (i: number) => void }) {
  const { project, runAction, busy, error, setProject } = api;
  const [copied, setCopied] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const buttonRef = useRef<HTMLDivElement>(null);

  // A visible clock, so a long step never looks frozen.
  useEffect(() => {
    if (!flow) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [flow]);

  // Always the brief the writer will actually get, never a stale saved copy.
  const megaPrompt = useMemo(() => buildMegaPrompt(project, makeClock()), [project]);
  const plan = useMemo(() => planParts(project), [project]);
  const summary = useMemo(() => reviewSummary(project), [project]);
  const { blocking, advisory } = useMemo(() => reviewWarnings(project), [project]);
  const budget = plan.budget;
  const running = Boolean(flow);

  const draft = project.data.draft;
  const resumableParts = draft && draft.planKey === plan.key && draft.total === plan.parts.length ? draft : null;
  const partsLeft = resumableParts ? resumableParts.parts.filter((p) => !p).length : 0;
  const stage = project.data.article?.stage;
  const needsFinish = Boolean(stage && stage !== 'done') && !resumableParts;

  function fail(message: string) {
    setFlow(null);
    setFlowError(message);
    buttonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function finish(startedAt: number) {
    setFlow({ label: 'Metadata and fact check', done: 0, total: 0, startedAt });
    // The article is already saved; a failed fact check only skips the claim list.
    await runAction('finish-article');
    setFlow(null);
    onNavigate(STEPS.length - 1);
  }

  /**
   * Facts first (they are the only source of specifics), then every part at
   * once, then assembly and the finishing checks. Each request saves, so a
   * failure keeps everything already written and the run can continue.
   */
  async function runFlow(resume: boolean) {
    setFlowError(null);
    api.clearError();
    const startedAt = Date.now();
    buttonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    if (!resume && !project.data.facts?.facts.length) {
      setFlow({ label: 'Getting facts from the competitor pages', done: 0, total: 0, startedAt });
      // Facts make the article better but must never stop it being written.
      await runAction('research-facts');
    }

    const runId = resume && resumableParts ? resumableParts.runId : crypto.randomUUID();
    const todo = plan.parts
      .map((p) => p.index)
      .filter((i) => !(resume && resumableParts?.parts[i]));
    const total = plan.parts.length;
    let done = total - todo.length;
    let latest: SemanticProject | undefined;
    let lastError = '';
    setFlow({ label: `Writing ${total} parts at once`, done, total, startedAt });

    const queue = [...todo];
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        // One automatic retry per part before giving up on it.
        let res = await postAction(project.id, 'write-part', { runId, index: i });
        if (!res.ok) res = await postAction(project.id, 'write-part', { runId, index: i });
        if (res.ok) {
          done++;
          if (filled(res.project) >= filled(latest)) latest = res.project;
          setFlow((f) => (f ? { ...f, done } : f));
        } else {
          lastError = res.error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    if (latest) setProject(latest);

    if (done < total) {
      fail(`${total - done} of ${total} parts could not be written. ${lastError} Everything written so far is saved.`);
      return;
    }

    setFlow({ label: 'Joining the parts and checking the brief', done: total, total, startedAt });
    if (!(await runAction('assemble-article', { runId }))) {
      fail('The parts were written but could not be joined. Try again.');
      return;
    }
    await finish(startedAt);
  }

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
          Your outline has {budget.h2} H2 and {budget.h3} H3 sections. To give each one a short, useful answer the article
          needs at least {budget.minimum.toLocaleString()} words, so it will be about {budget.effective.toLocaleString()} words
          instead of {budget.requested.toLocaleString()}. To make it shorter, remove headings in Outline Creation.
        </Notice>
      )}

      <FactsPanel api={api} />

      <Panel
        icon={<IconTerminal />}
        title="Master prompt"
        subtitle={`Every stage compiled into one brief. The article is written as ${plan.parts.length} parts at the same time, each from this brief.`}
        action={
          <button
            className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(megaPrompt).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              });
            }}
          >
            {copied ? <><IconCheck className="h-3.5 w-3.5" /> Copied</> : <><IconCopy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        }
      >
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-4 font-mono text-[11px] leading-relaxed text-ink-2">
          {megaPrompt}
        </pre>
      </Panel>

      {blocking.map((w) => <Notice key={w} tone="bad">{w}</Notice>)}
      {advisory.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

      <div ref={buttonRef} />
      {flow && (
        <Notice tone="info">
          <span className="flex items-center gap-2">
            <Spinner className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              <span className="font-semibold">{flow.label}</span>
              {flow.total > 0 && <>: {flow.done} of {flow.total} done</>}
              …{' '}
              <span className="font-mono text-xs text-ink-3">{Math.floor((now - flow.startedAt) / 1000)}s</span>
              {flow.total > 0 && (
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((flow.done / flow.total) * 100)}%` }} />
                </span>
              )}
              <span className="mt-1 block text-xs text-ink-3">Every part saves as it finishes, so nothing is lost if one fails. A full article usually takes 1 to 2 minutes.</span>
            </span>
          </span>
        </Notice>
      )}
      {!running && (flowError || (error && !busy)) && (
        <Notice tone="bad">
          <span className="font-semibold">The article could not be finished: </span>{flowError ?? error}
        </Notice>
      )}

      {!running && partsLeft > 0 && (
        <Notice tone="warn">
          {plan.parts.length - partsLeft} of {plan.parts.length} parts are written and saved.{' '}
          <button className="font-semibold text-accent underline" onClick={() => void runFlow(true)}>
            Write the remaining {partsLeft}
          </button>
        </Notice>
      )}
      {!running && needsFinish && (
        <Notice tone="warn">
          The article is written but the metadata and fact check did not finish.{' '}
          <button className="font-semibold text-accent underline" onClick={() => void finish(Date.now())}>
            Finish it now
          </button>
        </Notice>
      )}

      <button
        className="btn-primary w-full py-4 text-base"
        disabled={Boolean(busy) || running || blocking.length > 0}
        onClick={() => void runFlow(false)}
      >
        {running ? <><Spinner /> Writing the article…</> : <><IconSpark className="h-5 w-5" /> {project.data.article ? 'Generate a new article' : 'Generate article'}</>}
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
