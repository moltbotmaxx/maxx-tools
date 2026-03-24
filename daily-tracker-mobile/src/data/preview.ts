import type { DailyTrackerSnapshot, TrackerCard } from '../types/tracker';
import { getDateKey, getWeekDates } from '../utils/date';
import { createDaySlots, createEmptySnapshot } from '../lib/trackerModel';

function buildCard(overrides: Partial<TrackerCard>): TrackerCard {
  return {
    id: overrides.id || Math.random().toString(36).slice(2, 10),
    type: overrides.type || 'post',
    description: overrides.description || 'Preview item',
    url: overrides.url,
    extraLinks: overrides.extraLinks || '',
    status: overrides.status || 'scheduled',
    createdAt: overrides.createdAt || new Date().toISOString(),
  };
}

export function createPreviewSnapshot(): DailyTrackerSnapshot {
  const [sunday, monday, tuesday, wednesday] = getWeekDates(new Date());
  const snapshot = createEmptySnapshot();

  snapshot.appData.ideas = [
    {
      id: 'idea-mobile-1',
      title: 'Short carousel on AI workflow upgrades',
      url: 'https://openai.com/news',
      type: 'post',
      createdAt: new Date().toISOString(),
      notes: 'Turn this into a 5-slide explainer.',
    },
    {
      id: 'idea-mobile-2',
      title: 'Behind-the-scenes reel about prompt testing',
      type: 'reel',
      createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      content: 'Fast capture from mobile. Keep it raw.',
    },
  ];

  snapshot.appData.pool = [
    buildCard({
      id: 'pool-mobile-1',
      type: 'promo',
      description: 'Launch reminder for the new weekly tracker review',
      url: 'https://sentient.example/promo',
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    }),
    buildCard({
      id: 'pool-mobile-2',
      type: 'post',
      description: 'Checklist post: 3 ideas worth scheduling this week',
      createdAt: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    }),
  ];

  snapshot.appData.schedule[getDateKey(sunday)] = createDaySlots([]);
  snapshot.appData.schedule[getDateKey(monday)] = createDaySlots([
    buildCard({
      id: 'sched-mobile-1',
      type: 'reel',
      description: 'Record a 20-second reel on what made this week work',
      status: 'posted',
    }),
    buildCard({
      id: 'sched-mobile-2',
      type: 'post',
      description: 'Publish the AI workflow carousel draft',
      url: 'https://openai.com/news',
    }),
  ]);
  snapshot.appData.schedule[getDateKey(tuesday)] = createDaySlots([
    buildCard({
      id: 'sched-mobile-3',
      type: 'promo',
      description: 'Reminder story about the tracker workflow',
    }),
  ]);
  snapshot.appData.schedule[getDateKey(wednesday)] = createDaySlots([
    buildCard({
      id: 'sched-mobile-4',
      type: 'post',
      description: 'Mobile-first post review and cleanup',
    }),
  ]);

  snapshot.permanentNotes =
    'Preview mode mirrors the mobile direction: capture fast, schedule lightly, ship without the desktop dashboard.';
  snapshot.managedSentientAccounts = ['sentientagency', 'chatgptips'];
  snapshot.lastUpdated = new Date().toISOString();

  return snapshot;
}
