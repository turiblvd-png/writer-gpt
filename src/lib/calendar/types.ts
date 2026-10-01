/** Calendar types and options, safe to import from client components. */
export type CalendarStatus = 'planned' | 'written' | 'published';
export type CalendarChannel = 'blog' | 'linkedin' | 'x' | 'facebook' | 'instagram' | 'newsletter';

export interface CalendarEntry {
  id: string;
  date: string;
  title: string;
  channel: CalendarChannel;
  status: CalendarStatus;
  keyword: string;
  articleId: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export const CHANNELS: CalendarChannel[] = ['blog', 'linkedin', 'x', 'facebook', 'instagram', 'newsletter'];
export const STATUSES: CalendarStatus[] = ['planned', 'written', 'published'];

