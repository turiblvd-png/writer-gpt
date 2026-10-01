'use client';

import { createContext, useContext } from 'react';
import { NAV, type NavSection } from '@/lib/nav';

/**
 * What the signed-in person may see: the menu as the developer arranged it,
 * plus who they are. Provided once by the root layout, read by the shell.
 */
export interface Viewer {
  sections: NavSection[];
  user: { name: string; email: string; role: string } | null;
  isAdmin: boolean;
}

const ViewerContext = createContext<Viewer>({ sections: NAV.filter((s) => s.id !== 'developer'), user: null, isAdmin: false });

export function ViewerProvider({ value, children }: { value: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}
