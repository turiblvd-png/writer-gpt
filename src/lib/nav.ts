/**
 * Navigation, defined once and shared by the rail, the section panel, the
 * mobile drawer and the dashboard. Mirrors the competitor's information
 * architecture: six sections, each with its own tools.
 */
export type IconName =
  | 'grid' | 'spark' | 'robot' | 'library' | 'globe' | 'gear' | 'hub' | 'wand' | 'link'
  | 'bolt' | 'chat' | 'radar' | 'key' | 'clipboard' | 'chart' | 'doc' | 'share' | 'calendar' | 'upload' | 'user'
  | 'shield' | 'users' | 'drag' | 'list';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  description: string;
  badge?: string;
  /** Hidden from subscribers by the developer; only shown to admins. */
  hidden?: boolean;
}

export interface NavSection {
  id: 'dashboard' | 'create' | 'ai' | 'library' | 'publishing' | 'account' | 'developer';
  label: string;
  icon: IconName;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    id: 'dashboard', label: 'Dashboard', icon: 'grid',
    items: [{ href: '/', label: 'Dashboard', icon: 'grid', description: 'Overview of your content and tools.' }],
  },
  {
    id: 'create', label: 'Create', icon: 'spark',
    items: [
      { href: '/generate', label: 'Generate Content', icon: 'spark', description: 'Grounded research, then a full SEO draft.' },
      { href: '/semantic', label: 'Semantic Writer', icon: 'hub', description: 'The 14-stage entity-first workspace.' },
      { href: '/humanizer', label: 'Humanizer', icon: 'wand', description: 'Removes AI writing patterns, measured.', badge: 'New' },
      { href: '/rewrite', label: 'Rewrite from URL', icon: 'link', description: 'Keeps the facts, rewrites in your voice.', badge: 'New' },
    ],
  },
  {
    id: 'ai', label: 'AI', icon: 'robot',
    items: [
      { href: '/autopilot', label: 'Autopilot', icon: 'bolt', description: 'Queue keywords; articles are written one by one.' },
      { href: '/copilot', label: 'SEO Copilot', icon: 'chat', description: 'An SEO assistant grounded in live search.' },
      { href: '/ai-visibility', label: 'AI Visibility', icon: 'radar', description: 'Is your site cited in AI answers?' },
      { href: '/keywords', label: 'Keyword Research', icon: 'key', description: 'Clusters, intent and questions for a seed.' },
      { href: '/audit', label: 'Content Audit', icon: 'clipboard', description: 'Score any page or draft for SEO and AI tells.' },
      { href: '/reports', label: 'Reports', icon: 'chart', description: 'What you have produced and how it scores.' },
    ],
  },
  {
    id: 'library', label: 'Library', icon: 'library',
    items: [
      { href: '/articles', label: 'My Articles', icon: 'doc', description: 'Everything you have generated.' },
      { href: '/social', label: 'Social Media Posts', icon: 'share', description: 'Turn an article into platform-ready posts.' },
      { href: '/calendar', label: 'Content Calendar', icon: 'calendar', description: 'Plan what publishes when.' },
    ],
  },
  {
    id: 'publishing', label: 'Publishing', icon: 'globe',
    items: [
      { href: '/publishing', label: 'WordPress', icon: 'upload', description: 'Publish articles straight to your site.' },
    ],
  },
  {
    id: 'account', label: 'Account', icon: 'gear',
    items: [
      { href: '/account', label: 'Account', icon: 'user', description: 'Your profile, usage and sign out.' },
    ],
  },
  {
    id: 'developer', label: 'Developer', icon: 'shield',
    items: [
      { href: '/admin', label: 'Overview', icon: 'grid', description: 'Subscribers, usage and AI spend at a glance.' },
      { href: '/admin/ai', label: 'AI Models', icon: 'robot', description: 'API keys, models per task and fallback order.' },
      { href: '/admin/subscribers', label: 'Subscribers', icon: 'users', description: 'Everyone who signed up, their plan and usage.' },
      { href: '/admin/limits', label: 'Plans & Limits', icon: 'key', description: 'Monthly AI allowance per plan and a spending cap.' },
      { href: '/admin/activity', label: 'Activity', icon: 'list', description: 'Every AI request, sign-in and change, as it happens.' },
      { href: '/admin/navigation', label: 'Menu & Tools', icon: 'drag', description: 'Drag to reorder tools; hide tools from subscribers.' },
      { href: '/admin/setup', label: 'Setup & Health', icon: 'gear', description: 'Database, keys and deployment checklist.' },
    ],
  },
];

/** Sections and items arranged by the developer's saved menu settings. */
export function arrangeNav(
  settings: { order: Record<string, string[]>; hidden: string[] },
  isAdmin: boolean,
  base: NavSection[] = NAV,
): NavSection[] {
  return base
    .filter((s) => s.id !== 'developer' || isAdmin)
    .map((section) => {
      // Developer and dashboard items stay fixed so the dashboard can never be hidden away.
      const fixed = section.id === 'developer' || section.id === 'dashboard' || section.id === 'account';
      const order = fixed ? [] : settings.order[section.id] ?? [];
      const rank = (href: string) => {
        const i = order.indexOf(href);
        return i === -1 ? order.length + section.items.findIndex((x) => x.href === href) : i;
      };
      const items = [...section.items]
        .sort((a, b) => rank(a.href) - rank(b.href))
        .map((item) => ({ ...item, hidden: !fixed && settings.hidden.includes(item.href) }))
        .filter((item) => isAdmin || !item.hidden);
      return { ...section, items };
    })
    .filter((s) => s.items.length > 0);
}

function matches(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** The most specific item for a path, so /admin/ai picks AI Models over Overview. */
export function itemFor(pathname: string, sections: NavSection[] = NAV): NavItem | undefined {
  return sections
    .flatMap((s) => s.items)
    .filter((i) => matches(i.href, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function sectionFor(pathname: string, sections: NavSection[] = NAV): NavSection {
  const item = itemFor(pathname, sections);
  return (item && sections.find((s) => s.items.includes(item))) ?? sections[0]!;
}

/** Every tool a subscriber could reach, for the menu editor. */
export const EDITABLE_SECTIONS = NAV.filter((s) => !['developer', 'dashboard', 'account'].includes(s.id));
