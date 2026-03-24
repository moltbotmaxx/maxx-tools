import type { ContentType, SyncState } from '../types/tracker';
import { theme } from '../theme/tokens';

export function getTypeLabel(type: ContentType): string {
  if (type === 'promo') return 'Promo';
  if (type === 'reel') return 'Reel';
  return 'Post';
}

export function getTypeColor(type: ContentType): string {
  if (type === 'promo') return theme.colors.gold;
  if (type === 'reel') return theme.colors.teal;
  return theme.colors.ember;
}

export function getSyncTone(syncState: SyncState): string {
  if (syncState === 'error') return theme.colors.rose;
  if (syncState === 'synced') return theme.colors.success;
  if (syncState === 'saving') return theme.colors.warning;
  return theme.colors.inkSoft;
}
