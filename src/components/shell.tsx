'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconChart, IconChevron, IconDoc, IconGlobe, IconGrid, IconHub, IconLink, IconSpark, IconWand,
} from './icons';

interface NavItem {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
  badge?: string;
  /** Rendered but inert, so the roadmap is visible without pretending it works. */
  disabled?: boolean;
}

const CREATE: NavItem[] = [
  { href: '/generate', label: 'Generate Content', icon: IconSpark },
  { href: '/semantic', label: 'Semantic Writer', icon: IconHub },
  { href: '/humanizer', label: 'Humanizer', icon: IconWand, badge: 'Soon', disabled: true },
  { href: '/rewrite', label: 'Rewrite from URL', icon: IconLink, badge: 'Soon', disabled: true },
];

const LIBRARY: NavItem[] = [
  { href: '/articles', label: 'My Articles', icon: IconDoc },
  { href: '/analytics', label: 'SEO Analytics', icon: IconChart, disabled: true },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 px-6 py-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-[72px] items-center gap-2.5 border-b border-line px-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm font-extrabold text-accent-ink">
          W
        </span>
        <span className="text-[15px] font-extrabold tracking-tight">
          Writer-gpt<span className="text-ink-3">.com</span>
        </span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        <NavLink href="/" label="Dashboard" icon={IconGrid} exact />
        <NavGroup title="Create" items={CREATE} />
        <NavGroup title="Library" items={LIBRARY} />
      </nav>

      <div className="border-t border-line px-5 py-4 text-[11px] text-ink-3">
        Research-grounded generation · v0.1
      </div>
    </aside>
  );
}

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-ink-3">{title}</p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </div>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, badge, disabled, exact }: NavItem & { exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  const inner = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-auto shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold text-ink-3">
          {badge}
        </span>
      )}
    </>
  );

  const shared = 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors';

  if (disabled) {
    return (
      <span className={`${shared} cursor-not-allowed text-ink-3/60`} title="Not built yet" aria-disabled="true">
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? `${shared} bg-gradient-to-r from-accent to-accent-2 text-accent-ink shadow-lg shadow-accent/20`
          : `${shared} text-ink-2 hover:bg-surface-2 hover:text-ink`
      }
    >
      {inner}
    </Link>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-line bg-canvas/85 px-6 backdrop-blur-xl lg:px-10">
      <h1 className="text-lg font-bold">Welcome back!</h1>
      <div className="ml-auto flex items-center gap-2.5">
        <span className="hidden items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 sm:flex">
          <IconGlobe className="h-3.5 w-3.5" /> EN
        </span>
        <span className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2">
          Free plan
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-xs font-bold text-accent-ink">
          TB
        </span>
      </div>
    </header>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export { IconChevron };
