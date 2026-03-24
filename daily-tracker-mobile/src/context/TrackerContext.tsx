import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';

import { createPreviewSnapshot } from '../data/preview';
import { auth, configurationStatus } from '../lib/firebase';
import {
  buildInboxItems,
  buildWeekPlan,
  captureInput,
  countWeeklyCards,
  countWeeklyPosted,
  deleteIdea,
  deletePoolCard,
  getTodayItems,
  planPoolCard,
  returnCardToPool,
  stampSnapshot,
  stageIdea,
  toggleScheduledCardStatus,
} from '../lib/trackerModel';
import { loadTrackerSnapshot, saveTrackerSnapshot } from '../lib/trackerRepository';
import type {
  ContentType,
  DailyTrackerSnapshot,
  InboxItem,
  MobileSession,
  PlanDay,
  SyncState,
  TrackerCard,
} from '../types/tracker';

interface TrackerContextValue {
  snapshot: DailyTrackerSnapshot;
  session: MobileSession;
  syncState: SyncState;
  syncMessage: string;
  isBooting: boolean;
  todayItems: TrackerCard[];
  inboxItems: InboxItem[];
  weekPlan: PlanDay[];
  weeklyTotal: number;
  weeklyPosted: number;
  configuration: typeof configurationStatus;
  captureToInbox: (value: string, type: ContentType) => Promise<void>;
  stageIdeaById: (ideaId: string) => Promise<void>;
  planPoolCardById: (cardId: string, dateKey: string) => Promise<void>;
  toggleCardStatusById: (cardId: string) => Promise<void>;
  returnCardToInbox: (cardId: string) => Promise<void>;
  deleteInboxItemById: (id: string, kind: InboxItem['kind']) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutCurrentUser: () => Promise<void>;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

function buildSession(user: User | null): MobileSession {
  return {
    mode: user ? 'signed_in' : 'preview',
    user: user
      ? {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        }
      : null,
    authConfigured: configurationStatus.googleAuthReady,
  };
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DailyTrackerSnapshot>(createPreviewSnapshot());
  const [session, setSession] = useState<MobileSession>(buildSession(null));
  const [syncState, setSyncState] = useState<SyncState>('booting');
  const [syncMessage, setSyncMessage] = useState('Loading mobile workspace...');
  const [isBooting, setIsBooting] = useState(true);

  const snapshotRef = useRef(snapshot);
  const sessionRef = useRef(session);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  async function hydrateWorkspace(user: User | null) {
    setIsBooting(true);
    setSyncState(user ? 'saving' : 'preview');
    setSyncMessage(user ? 'Restoring your Firestore workspace...' : 'Opening preview mode...');

    try {
      const nextSnapshot = await loadTrackerSnapshot(user?.uid || null);
      setSnapshot(nextSnapshot);
      setSession(buildSession(user));
      setSyncState(user ? 'synced' : 'preview');
      setSyncMessage(
        user ? 'Synced with the shared Daily Tracker backend.' : 'Preview mode is storing changes locally.',
      );
    } catch (error) {
      setSnapshot(createPreviewSnapshot());
      setSession(buildSession(null));
      setSyncState('error');
      setSyncMessage(
        error instanceof Error
          ? error.message
          : 'Workspace load failed. Falling back to local preview mode.',
      );
    } finally {
      setIsBooting(false);
    }
  }

  async function persistSnapshot(nextSnapshot: DailyTrackerSnapshot) {
    const currentUserId = sessionRef.current.user?.uid || null;

    setSnapshot(nextSnapshot);
    setSyncState(currentUserId ? 'saving' : 'preview');
    setSyncMessage(
      currentUserId ? 'Saving changes to Firestore...' : 'Preview mode is saving changes locally.',
    );

    try {
      const savedSnapshot = await saveTrackerSnapshot(nextSnapshot, currentUserId);
      setSnapshot(savedSnapshot);
      setSyncState(currentUserId ? 'synced' : 'preview');
      setSyncMessage(
        currentUserId ? 'Changes synced to Daily Tracker.' : 'Changes saved locally for preview mode.',
      );
    } catch (error) {
      setSyncState('error');
      setSyncMessage(
        error instanceof Error ? error.message : 'We could not save your mobile workspace changes.',
      );
    }
  }

  async function runMutation(
    mutate: (currentSnapshot: DailyTrackerSnapshot) => DailyTrackerSnapshot,
  ): Promise<void> {
    const nextSnapshot = stampSnapshot(mutate(snapshotRef.current));
    await persistSnapshot(nextSnapshot);
  }

  useEffect(() => {
    if (!auth) {
      hydrateWorkspace(null);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      hydrateWorkspace(user);
    });

    return unsubscribe;
  }, []);

  const value: TrackerContextValue = {
    snapshot,
    session,
    syncState,
    syncMessage,
    isBooting,
    todayItems: getTodayItems(snapshot),
    inboxItems: buildInboxItems(snapshot),
    weekPlan: buildWeekPlan(snapshot),
    weeklyTotal: countWeeklyCards(snapshot),
    weeklyPosted: countWeeklyPosted(snapshot),
    configuration: configurationStatus,
    captureToInbox: async (value, type) => {
      await runMutation((currentSnapshot) => captureInput(currentSnapshot, value, type));
    },
    stageIdeaById: async (ideaId) => {
      await runMutation((currentSnapshot) => stageIdea(currentSnapshot, ideaId));
    },
    planPoolCardById: async (cardId, dateKey) => {
      await runMutation((currentSnapshot) => planPoolCard(currentSnapshot, cardId, dateKey));
    },
    toggleCardStatusById: async (cardId) => {
      await runMutation((currentSnapshot) => toggleScheduledCardStatus(currentSnapshot, cardId));
    },
    returnCardToInbox: async (cardId) => {
      await runMutation((currentSnapshot) => returnCardToPool(currentSnapshot, cardId));
    },
    deleteInboxItemById: async (id, kind) => {
      await runMutation((currentSnapshot) =>
        kind === 'idea' ? deleteIdea(currentSnapshot, id) : deletePoolCard(currentSnapshot, id),
      );
    },
    refreshWorkspace: async () => {
      await hydrateWorkspace(auth?.currentUser || null);
    },
    signInWithGoogle: async () => {
      setSyncState('error');
      setSyncMessage(
        configurationStatus.googleAuthReady
          ? 'Google mobile client IDs are present. Native sign-in wiring is the next integration step.'
          : 'Add the iOS, Android, and web Google OAuth client IDs in .env.local to enable mobile sign-in.',
      );
    },
    signOutCurrentUser: async () => {
      if (!auth || !auth.currentUser) {
        setSyncState('preview');
        setSyncMessage('Already running in preview mode.');
        return;
      }

      await signOut(auth);
    },
  };

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker(): TrackerContextValue {
  const context = useContext(TrackerContext);
  if (!context) {
    throw new Error('useTracker must be used inside TrackerProvider');
  }

  return context;
}
