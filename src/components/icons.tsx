/** Inline icon set — avoids an icon dependency for the handful of glyphs used. */
type P = { className?: string };
const base = 'h-[18px] w-[18px]';
const S = ({ children, className }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" className={className ?? base} aria-hidden="true">
    {children}
  </svg>
);

export const IconGrid = (p: P) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></S>;
export const IconSpark = (p: P) => <S {...p}><path d="m12 3 2.1 5.9L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-2.1L12 3Z"/></S>;
export const IconHub = (p: P) => <S {...p}><circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M12 7.4 6.6 15.8M12 7.4l5.4 8.4M7.4 18h9.2"/></S>;
export const IconWand = (p: P) => <S {...p}><path d="m15 4 5 5L9 20l-5-5L15 4Z"/><path d="M13 6l5 5M6 4v3M4.5 5.5h3M18 15v3M16.5 16.5h3"/></S>;
export const IconLink = (p: P) => <S {...p}><path d="M9.5 14.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1 1"/><path d="M14.5 9.5a4 4 0 0 0-5.7 0L6 12.3a4 4 0 1 0 5.7 5.7l1-1"/></S>;
export const IconDoc = (p: P) => <S {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></S>;
export const IconChart = (p: P) => <S {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></S>;
export const IconCheck = (p: P) => <S {...p}><path d="m4 12.5 5 5L20 6.5"/></S>;
export const IconAlert = (p: P) => <S {...p}><path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/></S>;
export const IconChevron = (p: P) => <S {...p}><path d="m9 6 6 6-6 6"/></S>;
export const IconClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></S>;
export const IconGlobe = (p: P) => <S {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z"/></S>;
