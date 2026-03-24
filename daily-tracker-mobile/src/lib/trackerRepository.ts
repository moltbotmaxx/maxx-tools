import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { createPreviewSnapshot } from '../data/preview';
import type { DailyTrackerSnapshot } from '../types/tracker';
import { db } from './firebase';
import { normalizeSnapshot } from './trackerModel';

const PREVIEW_KEY = 'daily-tracker-mobile:preview-snapshot';

function getUserStorageKey(userId?: string | null): string {
  return userId ? `daily-tracker-mobile:user:${userId}` : PREVIEW_KEY;
}

async function readLocalSnapshot(userId?: string | null): Promise<DailyTrackerSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(getUserStorageKey(userId));
    if (!raw) return null;
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeLocalSnapshot(snapshot: DailyTrackerSnapshot, userId?: string | null): Promise<void> {
  await AsyncStorage.setItem(getUserStorageKey(userId), JSON.stringify(normalizeSnapshot(snapshot)));
}

export async function loadTrackerSnapshot(userId?: string | null): Promise<DailyTrackerSnapshot> {
  const localSnapshot = await readLocalSnapshot(userId);

  if (userId && db) {
    try {
      const docRef = doc(db, 'daily-tracker-data', userId);
      const remote = await getDoc(docRef);

      if (remote.exists()) {
        const snapshot = normalizeSnapshot(remote.data());
        await writeLocalSnapshot(snapshot, userId);
        return snapshot;
      }
    } catch {
      if (localSnapshot) return localSnapshot;
    }
  }

  return localSnapshot || createPreviewSnapshot();
}

export async function saveTrackerSnapshot(
  snapshot: DailyTrackerSnapshot,
  userId?: string | null,
): Promise<DailyTrackerSnapshot> {
  const normalized = normalizeSnapshot(snapshot);
  await writeLocalSnapshot(normalized, userId);

  if (userId && db) {
    const docRef = doc(db, 'daily-tracker-data', userId);
    await setDoc(docRef, normalized, { merge: true });
  }

  return normalized;
}
