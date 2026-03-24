import type {
  CardStatus,
  ContentType,
  DailyTrackerSnapshot,
  InboxItem,
  PlanDay,
  TrackerCard,
  TrackerIdea,
} from '../types/tracker';
import {
  formatMonthDay,
  formatWeekday,
  getTodayKey,
  getWeekDateKeys,
  isTodayKey,
} from '../utils/date';

const MIN_SLOTS_PER_DAY = 8;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeContentType(value: unknown): ContentType {
  return value === 'promo' || value === 'reel' ? value : 'post';
}

function normalizeStatus(value: unknown): CardStatus {
  return value === 'posted' ? 'posted' : 'scheduled';
}

function ensureString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function ensureUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    return new URL(trimmed).toString();
  } catch {
    if (trimmed.includes('.')) {
      try {
        return new URL(`https://${trimmed}`).toString();
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function extractDomain(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function leadingLine(value: string): string {
  return ensureString(value).split('\n')[0].trim();
}

export function createEmptySnapshot(): DailyTrackerSnapshot {
  return {
    appData: {
      pool: [],
      schedule: {},
      ideas: [],
    },
    permanentNotes: '',
    doneHeadlines: [],
    managedSentientAccounts: [],
    lastUpdated: new Date().toISOString(),
  };
}

export function stampSnapshot(snapshot: DailyTrackerSnapshot): DailyTrackerSnapshot {
  return {
    ...snapshot,
    lastUpdated: new Date().toISOString(),
  };
}

export function normalizeCard(raw: unknown): TrackerCard {
  const card = (raw || {}) as Partial<TrackerCard>;
  return {
    id: ensureString(card.id) || generateId('card'),
    type: normalizeContentType(card.type),
    description: ensureString(card.description) || 'Untitled card',
    url: ensureUrl(card.url),
    extraLinks: ensureString(card.extraLinks),
    status: normalizeStatus(card.status),
    createdAt: ensureString(card.createdAt) || new Date().toISOString(),
  };
}

export function normalizeIdea(raw: unknown): TrackerIdea {
  const idea = (raw || {}) as Partial<TrackerIdea>;
  return {
    id: ensureString(idea.id) || generateId('idea'),
    title: ensureString(idea.title) || 'Untitled idea',
    url: ensureUrl(idea.url),
    image: ensureUrl(idea.image),
    content: ensureString(idea.content),
    type: normalizeContentType(idea.type),
    createdAt: ensureString(idea.createdAt) || new Date().toISOString(),
    notes: ensureString(idea.notes),
    extraLinks: ensureString(idea.extraLinks),
  };
}

export function createDaySlots(cards: Array<TrackerCard | null> = []): Array<TrackerCard | null> {
  const normalized = cards.map((card) => (card ? normalizeCard(card) : null));
  while (normalized.length < MIN_SLOTS_PER_DAY) {
    normalized.push(null);
  }
  return normalized;
}

export function normalizeSnapshot(raw: unknown): DailyTrackerSnapshot {
  const snapshot = (raw || {}) as Partial<DailyTrackerSnapshot>;
  const next = createEmptySnapshot();

  const appData = (snapshot.appData || {}) as Partial<DailyTrackerSnapshot['appData']>;
  next.appData.pool = Array.isArray(appData.pool) ? appData.pool.map(normalizeCard) : [];
  next.appData.ideas = Array.isArray(appData.ideas) ? appData.ideas.map(normalizeIdea) : [];

  const scheduleEntries = Object.entries(appData.schedule || {});
  next.appData.schedule = scheduleEntries.reduce<Record<string, Array<TrackerCard | null>>>(
    (acc, [dateKey, value]) => {
      acc[dateKey] = createDaySlots(Array.isArray(value) ? value : []);
      return acc;
    },
    {},
  );

  next.permanentNotes = ensureString(snapshot.permanentNotes);
  next.doneHeadlines = Array.isArray(snapshot.doneHeadlines)
    ? snapshot.doneHeadlines.filter((item): item is string => typeof item === 'string')
    : [];
  next.managedSentientAccounts = Array.isArray(snapshot.managedSentientAccounts)
    ? snapshot.managedSentientAccounts.filter((item): item is string => typeof item === 'string')
    : [];
  next.lastUpdated = ensureString(snapshot.lastUpdated) || new Date().toISOString();

  return next;
}

function copySnapshot(snapshot: DailyTrackerSnapshot): DailyTrackerSnapshot {
  return normalizeSnapshot(snapshot);
}

function findPoolCard(snapshot: DailyTrackerSnapshot, cardId: string): TrackerCard | null {
  return snapshot.appData.pool.find((card) => card.id === cardId) || null;
}

function removeCardFromSchedule(
  schedule: Record<string, Array<TrackerCard | null>>,
  cardId: string,
): { schedule: Record<string, Array<TrackerCard | null>>; removedCard: TrackerCard | null } {
  let removedCard: TrackerCard | null = null;
  const nextSchedule: Record<string, Array<TrackerCard | null>> = {};

  Object.entries(schedule).forEach(([dateKey, day]) => {
    const nextDay = createDaySlots(day).map((card) => {
      if (card?.id === cardId) {
        removedCard = card;
        return null;
      }
      return card;
    });
    nextSchedule[dateKey] = nextDay;
  });

  return { schedule: nextSchedule, removedCard };
}

function buildIdeaTitle(input: string, url?: string): string {
  if (url) {
    const domain = extractDomain(url);
    if (domain) return `Capture from ${domain}`;
  }
  return input.length > 80 ? `${input.slice(0, 77).trim()}...` : input;
}

export function captureInput(
  snapshot: DailyTrackerSnapshot,
  rawValue: string,
  type: ContentType,
): DailyTrackerSnapshot {
  const value = rawValue.trim();
  if (!value) return snapshot;

  const next = copySnapshot(snapshot);
  const url = ensureUrl(value);

  next.appData.ideas.unshift({
    id: generateId('idea'),
    title: buildIdeaTitle(value, url),
    url,
    content: url ? '' : value,
    type,
    createdAt: new Date().toISOString(),
  });

  return stampSnapshot(next);
}

export function stageIdea(snapshot: DailyTrackerSnapshot, ideaId: string): DailyTrackerSnapshot {
  const next = copySnapshot(snapshot);
  const idea = next.appData.ideas.find((item) => item.id === ideaId);
  if (!idea) return snapshot;

  next.appData.ideas = next.appData.ideas.filter((item) => item.id !== ideaId);
  next.appData.pool.unshift({
    id: generateId('pool'),
    type: idea.type,
    description: idea.title || idea.content || 'Inbox idea',
    url: idea.url,
    extraLinks: idea.extraLinks,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  });

  return stampSnapshot(next);
}

export function planPoolCard(
  snapshot: DailyTrackerSnapshot,
  cardId: string,
  dateKey: string,
): DailyTrackerSnapshot {
  const next = copySnapshot(snapshot);
  const card = findPoolCard(next, cardId);
  if (!card) return snapshot;

  next.appData.pool = next.appData.pool.filter((item) => item.id !== cardId);
  const day = createDaySlots(next.appData.schedule[dateKey]);
  const firstEmpty = day.findIndex((item) => item === null);
  const plannedCard = { ...card, status: 'scheduled' as CardStatus };

  if (firstEmpty === -1) {
    day.push(plannedCard);
  } else {
    day[firstEmpty] = plannedCard;
  }

  next.appData.schedule[dateKey] = day;

  return stampSnapshot(next);
}

export function toggleScheduledCardStatus(
  snapshot: DailyTrackerSnapshot,
  cardId: string,
): DailyTrackerSnapshot {
  const next = copySnapshot(snapshot);

  Object.keys(next.appData.schedule).forEach((dateKey) => {
    next.appData.schedule[dateKey] = createDaySlots(next.appData.schedule[dateKey]).map((card) => {
      if (!card || card.id !== cardId) return card;
      return {
        ...card,
        status: card.status === 'posted' ? 'scheduled' : 'posted',
      };
    });
  });

  return stampSnapshot(next);
}

export function returnCardToPool(snapshot: DailyTrackerSnapshot, cardId: string): DailyTrackerSnapshot {
  const next = copySnapshot(snapshot);
  const { schedule, removedCard } = removeCardFromSchedule(next.appData.schedule, cardId);
  if (!removedCard) return snapshot;

  next.appData.schedule = schedule;
  next.appData.pool.unshift({
    ...removedCard,
    status: 'scheduled',
  });

  return stampSnapshot(next);
}

export function deleteIdea(snapshot: DailyTrackerSnapshot, ideaId: string): DailyTrackerSnapshot {
  const next = copySnapshot(snapshot);
  next.appData.ideas = next.appData.ideas.filter((idea) => idea.id !== ideaId);
  return stampSnapshot(next);
}

export function deletePoolCard(snapshot: DailyTrackerSnapshot, cardId: string): DailyTrackerSnapshot {
  const next = copySnapshot(snapshot);
  next.appData.pool = next.appData.pool.filter((card) => card.id !== cardId);
  return stampSnapshot(next);
}

export function buildInboxItems(snapshot: DailyTrackerSnapshot): InboxItem[] {
  const ideas: InboxItem[] = snapshot.appData.ideas.map((idea) => ({
    id: idea.id,
    kind: 'idea',
    title: idea.title,
    subtitle: extractDomain(idea.url) || leadingLine(idea.content || '') || 'Captured note',
    type: idea.type,
    url: idea.url,
    createdAt: idea.createdAt,
  }));

  const staged: InboxItem[] = snapshot.appData.pool.map((card) => ({
    id: card.id,
    kind: 'staged',
    title: leadingLine(card.description) || 'Ready to plan',
    subtitle: extractDomain(card.url) || 'Ready for scheduling',
    type: card.type,
    url: card.url,
    createdAt: card.createdAt,
  }));

  return [...staged, ...ideas].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function getTodayItems(snapshot: DailyTrackerSnapshot): TrackerCard[] {
  return createDaySlots(snapshot.appData.schedule[getTodayKey()]).filter(
    (item): item is TrackerCard => item !== null,
  );
}

export function buildWeekPlan(snapshot: DailyTrackerSnapshot): PlanDay[] {
  return getWeekDateKeys().map((dateKey) => {
    const cards = createDaySlots(snapshot.appData.schedule[dateKey]);
    const plannedItems = cards.filter((item): item is TrackerCard => item !== null);

    return {
      dateKey,
      weekday: formatWeekday(dateKey),
      label: formatMonthDay(dateKey),
      isToday: isTodayKey(dateKey),
      scheduledCount: plannedItems.length,
      postedCount: plannedItems.filter((item) => item.status === 'posted').length,
      openSlots: cards.filter((item) => item === null).length,
      items: plannedItems,
    };
  });
}

export function countWeeklyCards(snapshot: DailyTrackerSnapshot): number {
  return buildWeekPlan(snapshot).reduce((sum, day) => sum + day.scheduledCount, 0);
}

export function countWeeklyPosted(snapshot: DailyTrackerSnapshot): number {
  return buildWeekPlan(snapshot).reduce((sum, day) => sum + day.postedCount, 0);
}
