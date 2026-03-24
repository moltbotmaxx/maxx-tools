export type ContentType = 'post' | 'promo' | 'reel';

export type CardStatus = 'scheduled' | 'posted';

export type SyncState = 'booting' | 'preview' | 'saving' | 'synced' | 'error';

export type InboxFilter = 'all' | 'ideas' | 'staged' | 'ready';

export type SessionMode = 'preview' | 'signed_in';

export interface TrackerCard {
  id: string;
  type: ContentType;
  description: string;
  url?: string;
  extraLinks?: string;
  status?: CardStatus;
  createdAt: string;
}

export interface TrackerIdea {
  id: string;
  title: string;
  url?: string;
  image?: string;
  content?: string;
  type: ContentType;
  createdAt: string;
  notes?: string;
  extraLinks?: string;
}

export interface DailyTrackerAppData {
  pool: TrackerCard[];
  schedule: Record<string, Array<TrackerCard | null>>;
  ideas: TrackerIdea[];
}

export interface DailyTrackerSnapshot {
  appData: DailyTrackerAppData;
  permanentNotes: string;
  doneHeadlines: string[];
  managedSentientAccounts: string[];
  lastUpdated: string;
}

export interface TrackerUserSummary {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

export interface MobileSession {
  mode: SessionMode;
  user: TrackerUserSummary | null;
  authConfigured: boolean;
}

export interface InboxItem {
  id: string;
  kind: 'idea' | 'staged';
  title: string;
  subtitle: string;
  type: ContentType;
  url?: string;
  createdAt: string;
}

export interface PlanDay {
  dateKey: string;
  weekday: string;
  label: string;
  isToday: boolean;
  scheduledCount: number;
  postedCount: number;
  openSlots: number;
  items: TrackerCard[];
}
