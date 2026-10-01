'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV, itemFor, sectionFor, type IconName, type NavSection } from '@/lib/nav';
import * as I from './icons';

const ICONS: Record<IconName, (p: { className?: string }) => React.ReactElement> = {
  grid: I.IconGrid, spark: I.IconSpark, robot: I.IconRobot, library: I.IconLibrary, globe: I.IconGlobe,
  gear: I.IconGear, hub: I.IconHub, wand: I.IconWand, link: I.IconLink, bolt: I.IconBolt, chat: I.IconChat,
  radar: I.IconRadar, key: I.IconKey, clipboard: I.IconClipboard, chart: I.IconChart, doc: I.IconDoc,
  share: I.IconShare, calendar: I.IconCalendar, upload: I.IconUpload, user: I.IconUser,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const C = ICONS[name];
  return <C className={className ?? 'h-[18px] w-[18px]'} />;
}

/**
 * App frame: icon rail of six sections, a panel listing the active section's
 * tools, and a top bar. Matches the competitor's layout, so users moving
 * between the two products find tools where they expect them.
 */
export function Shell({ children, banner }: { children: React.ReactNode; banner?: React.ReactNode }) {
  const pathname = usePathname();
  const active = sectionFor(pathname);
  const [drawer, setDrawer] = useState(false);

  // Close the mobile drawer on navigation.
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <Rail active={active} />
      {active.items.length > 1 && <SectionPanel section={active} pathname={pathname} />}

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <nav className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-line bg-surface p-4">
            <Brand />
            <div className="mt-5 space-y-5">
              {NAV.map((section) => (
                <div key={section.id}>
                  <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">{section.label}</p>
                  {section.items.map((item) => (
                    <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} badge={item.badge} pathname={pathname} />
                  ))}
                </div>
              ))}
            </div>
          </nav>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setDrawer(true)} title={itemFor(pathname)?.label ?? 'Writer-GPT'} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">
          {banner}
          {children}
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-sm font-extrabold text-accent-ink">
        W
      </span>
      <span className="text-[15px] font-extrabold tracking-tight">
        Writer-gpt<span className="text-ink-3">.com</span>
      </span>
    </Link>
  );
}

function Rail({ active }: { active: NavSection }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-4 lg:flex">
      <Link href="/" aria-label="Dashboard" className="mb-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-base font-extrabold text-accent-ink">
          W
        </span>
      </Link>
      {NAV.map((section) => {
        const on = section.id === active.id;
        return (
          <Link
            key={section.id}
            href={section.items[0]!.href}
            aria-current={on ? 'page' : undefined}
            className={`flex w-[60px] flex-col items-center gap-1 rounded-xl py-2.5 text-[10px] font-semibold transition-colors ${
              on ? 'bg-gradient-to-b from-accent to-accent-2 text-accent-ink shadow-lg shadow-accent/20' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            <Icon name={section.icon} className="h-5 w-5" />
            {section.label}
          </Link>
        );
      })}
    </aside>
  );
}

function SectionPanel({ section, pathname }: { section: NavSection; pathname: string }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-[68px] items-center border-b border-line px-5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{section.label}</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {section.items.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} badge={item.badge} pathname={pathname} />
        ))}
      </nav>
      <p className="border-t border-line px-5 py-4 text-[11px] text-ink-3">Research-grounded generation</p>
    </aside>
  );
}

function NavLink({ href, label, icon, badge, pathname }: { href: string; label: string; icon: IconName; badge?: string; pathname: string }) {
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'bg-accent/12 bg-accent/10 text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
      }`}
    >
      <Icon name={icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
      {badge && <span className="ml-auto rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">{badge}</span>}
    </Link>
  );
}

function TopBar({ onMenu, title }: { onMenu: () => void; title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
      <button className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <I.IconMenu className="h-5 w-5" />
      </button>
      <h1 className="truncate text-base font-bold sm:text-lg">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 sm:flex">
          <I.IconGlobe className="h-3.5 w-3.5" /> EN
        </span>
        <ThemeToggle />
        <Link href="/account" aria-label="Account" className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-xs font-bold text-accent-ink">
          <I.IconUser className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  return (
    <button
      className="rounded-lg border border-line bg-surface p-2 text-ink-2 hover:text-ink"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle('dark', next);
        try {
          localStorage.setItem('wg-theme', next ? 'dark' : 'light');
        } catch {
          /* private mode: the toggle still works for this visit */
        }
        setDark(next);
      }}
    >
      {dark ? <I.IconSun className="h-4 w-4" /> : <I.IconMoon className="h-4 w-4" />}
    </button>
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

export { I as Icons };
