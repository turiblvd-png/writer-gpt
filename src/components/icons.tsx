/** Inline icon set, avoids an icon dependency for the handful of glyphs used. */
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
export const IconPlay = (p: P) => <S {...p}><path d="M7 4.5v15l12-7.5-12-7.5Z"/></S>;
export const IconPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14"/></S>;
export const IconTrash = (p: P) => <S {...p}><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4h6v3"/></S>;
export const IconRefresh = (p: P) => <S {...p}><path d="M20 11A8 8 0 1 0 18 16"/><path d="M20 5v6h-6"/></S>;
export const IconCopy = (p: P) => <S {...p}><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></S>;
export const IconTag = (p: P) => <S {...p}><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.3"/></S>;
export const IconList = (p: P) => <S {...p}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></S>;
export const IconTarget = (p: P) => <S {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/></S>;
export const IconBook = (p: P) => <S {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/></S>;
export const IconEye = (p: P) => <S {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></S>;
export const IconEdit = (p: P) => <S {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M14 6l4 4"/></S>;
export const IconTerminal = (p: P) => <S {...p}><path d="m5 7 4 4-4 4M12 15h7"/><rect x="2" y="3" width="20" height="18" rx="2"/></S>;
export const IconGraph = (p: P) => <S {...p}><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M8 16.5 15.8 7.7M8.4 18.3l6.2-.9"/></S>;

export const IconSearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></S>;
