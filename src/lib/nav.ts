/**
 * Navigation, defined once and shared by the rail, the section panel, the
 * mobile drawer and the dashboard. Mirrors the competitor's information
 * architecture: six sections, each with its own tools.
 */
export type IconName =
  | 'grid' | 'spark' | 'robot' | 'library' | 'globe' | 'gear' | 'hub' | 'wand' | 'link'
  | 'bolt' | 'chat' | 'radar' | 'key' | 'clipboard' | 'chart' | 'doc' | 'share' | 'calendar' | 'upload' | 'user';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  description: string;
  badge?: string;
}

export interface NavSection {
  id: 'dashboard' | 'create' | 'ai' | 'library' | 'publishing' | 'account';
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
      { href: '/account', label: 'Account & Setup', icon: 'user', description: 'Connection status, storage and usage.' },
    ],
  },
];

export function sectionFor(pathname: string): NavSection {
  if (pathname === '/') return NAV[0]!;
  return (
    NAV.find((s) => s.items.some((i) => i.href !== '/' && (pathname === i.href || pathname.startsWith(`${i.href}/`)))) ??
    NAV[0]!
  );
}

export function itemFor(pathname: string): NavItem | undefined {
  return NAV.flatMap((s) => s.items).find((i) => (i.href === '/' ? pathname === '/' : pathname === i.href || pathname.startsWith(`${i.href}/`)));
}
