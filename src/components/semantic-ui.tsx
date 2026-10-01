'use client';

import { IconAlert, IconCheck } from './icons';

/** The blue "what is this / why it matters" card at the top of each stage. */
export function StepInfo({ title, whatIsThis, seoImpact }: { title: string; whatIsThis: string; seoImpact: string }) {
  return (
    <div className="card mb-5 border-accent/25 bg-accent/[0.06] p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">i</span>
        <h3 className="font-bold text-ink">{title}</h3>
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">What is this?</dt>
          <dd className="text-ink-2">{whatIsThis}</dd>
        </div>
        <div>
          <dt className="mb-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">SEO impact</dt>
          <dd className="text-ink-2">{seoImpact}</dd>
        </div>
      </dl>
    </div>
  );
}

export function Panel({
  icon, title, subtitle, action, children, tone,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  tone?: 'accent';
}) {
  return (
    <section className={`card mb-4 overflow-hidden ${tone === 'accent' ? 'border-accent/30' : ''}`}>
      <header className={`flex flex-wrap items-center gap-3 p-5 ${children ? 'pb-4' : ''} ${
        tone === 'accent' ? 'bg-gradient-to-r from-accent/15 to-accent-2/10' : ''
      }`}>
        {icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-3 text-accent">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-ink">{title}</h4>
          {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children && <div className="border-t border-line p-5">{children}</div>}
    </section>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: React.ReactNode }) {
  const styles = {
    info: 'border-line bg-surface-2 text-ink-2',
    warn: 'border-warn/30 bg-warn/10 text-ink-2',
    bad: 'border-bad/30 bg-bad/10 text-ink-2',
    ok: 'border-ok/30 bg-ok/10 text-ink-2',
  }[tone];
  const Icon = tone === 'ok' ? IconCheck : IconAlert;
  const iconColour = { info: 'text-ink-3', warn: 'text-warn', bad: 'text-bad', ok: 'text-ok' }[tone];

  return (
    <div className={`mb-4 flex gap-3 rounded-xl border p-3.5 text-sm ${styles}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColour}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A selectable/excludable chip. Clicking toggles exclusion from the mega prompt. */
export function Chip({
  label, count, excluded, tone = 'accent', onClick, title,
}: {
  label: string;
  count?: string | number;
  excluded?: boolean;
  tone?: 'accent' | 'info' | 'ok';
  onClick?: () => void;
  title?: string;
}) {
  const active = {
    accent: 'border-accent/40 bg-accent/10 text-accent',
    info: 'border-info/40 bg-info/10 text-info',
    ok: 'border-ok/40 bg-ok/10 text-ok',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (excluded ? 'Excluded, click to include' : 'Click to exclude from the mega prompt')}
      aria-pressed={!excluded}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
        excluded ? 'border-line bg-surface-2 text-ink-3 line-through opacity-60' : active
      } ${onClick ? 'cursor-pointer hover:brightness-125' : 'cursor-default'}`}
    >
      {label}
      {count != null && <span className="font-mono text-[10px] opacity-70">{count}</span>}
    </button>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-accent/30 border-t-accent ${className}`} />;
}

export function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'bad' }) {
  const colour = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink';
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-3 text-center">
      <p className={`truncate text-lg font-bold ${colour}`} title={String(value)}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-3">{label}</p>
    </div>
  );
}
