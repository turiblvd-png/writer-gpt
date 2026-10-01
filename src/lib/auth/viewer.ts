import { currentActor } from './actor';
import { authEnabled, isAdminRole } from './session';
import { getUser, touch, type PublicUser } from './users';
import { getPlatformSettings } from '@/lib/platform/settings';
import { arrangeNav, type NavSection } from '@/lib/nav';

export interface ViewerState {
  user: PublicUser | null;
  isAdmin: boolean;
  /** Signed in with a token, but the account was suspended or deleted since. */
  blocked: 'suspended' | 'deleted' | null;
  sections: NavSection[];
}

/**
 * The signed-in person, checked against the database on every page so a
 * suspension takes effect at once rather than when the cookie expires.
 * With accounts off (no APP_PASSWORD), everyone is the single owner.
 */
export async function getViewer(): Promise<ViewerState> {
  let settings;
  try {
    settings = await getPlatformSettings();
  } catch {
    settings = { signupsOpen: true, nav: { order: {}, hidden: [] } };
  }

  if (!authEnabled()) {
    return { user: null, isAdmin: true, blocked: null, sections: arrangeNav(settings.nav, true) };
  }

  const actor = await currentActor();
  if (!actor) return { user: null, isAdmin: false, blocked: null, sections: arrangeNav(settings.nav, false) };

  let user: PublicUser | null = null;
  try {
    user = await getUser(actor.id);
  } catch {
    // Storage down: fall back to the signed token rather than locking everyone out.
    const isAdmin = isAdminRole(actor.role);
    return { user: null, isAdmin, blocked: null, sections: arrangeNav(settings.nav, isAdmin) };
  }
  if (!user) return { user: null, isAdmin: false, blocked: 'deleted', sections: [] };
  if (user.status === 'suspended') return { user, isAdmin: false, blocked: 'suspended', sections: [] };

  void touch(user.id).catch(() => {});
  const isAdmin = isAdminRole(user.role);
  return { user, isAdmin, blocked: null, sections: arrangeNav(settings.nav, isAdmin) };
}

/** For admin pages and APIs: the database decides, not the cookie. */
export async function requireAdmin(): Promise<PublicUser | null> {
  if (!authEnabled()) return null;
  const viewer = await getViewer();
  if (!viewer.isAdmin || !viewer.user) throw new Error('Developer access only.');
  return viewer.user;
}
