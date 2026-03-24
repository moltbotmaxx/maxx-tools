import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTracker } from '../context/TrackerContext';
import { theme } from '../theme/tokens';
import { getSyncTone } from '../utils/presentation';

export function AccountScreen() {
  const {
    configuration,
    session,
    snapshot,
    syncMessage,
    syncState,
    refreshWorkspace,
    signInWithGoogle,
    signOutCurrentUser,
  } = useTracker();

  const identityLabel =
    session.user?.displayName || session.user?.email || (session.mode === 'signed_in' ? 'Signed-in user' : 'Preview mode');

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#eadfd2', '#d6c4b1']} style={styles.hero}>
        <Text style={styles.heroEyebrow}>Account and backend</Text>
        <Text style={styles.heroTitle}>The mobile app stays separate, but the workspace can stay compatible.</Text>
        <Text style={styles.heroBody}>{syncMessage}</Text>
      </LinearGradient>

      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusTitle}>{identityLabel}</Text>
          <View style={[styles.syncBadge, { borderColor: getSyncTone(syncState) }]}>
            <View style={[styles.syncDot, { backgroundColor: getSyncTone(syncState) }]} />
            <Text style={styles.syncLabel}>{syncState}</Text>
          </View>
        </View>
        <Text style={styles.statusMeta}>
          {session.mode === 'signed_in'
            ? 'Live Firestore workspace'
            : 'Preview mode using local persistence until mobile auth is finished.'}
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Backend</Text>
          <Text style={styles.cardBody}>
            Firebase config: {configuration.firebaseReady ? 'connected' : 'missing values'}
          </Text>
          {!configuration.firebaseReady && (
            <Text style={styles.cardFoot}>
              Missing: {configuration.missingFirebaseKeys.join(', ')}
            </Text>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Google mobile auth</Text>
          <Text style={styles.cardBody}>
            {configuration.googleAuthReady
              ? 'Client IDs detected. Final native sign-in wiring is the next slice.'
              : 'Missing mobile OAuth client IDs.'}
          </Text>
          {!configuration.googleAuthReady && (
            <Text style={styles.cardFoot}>
              Missing: {configuration.missingGoogleKeys.join(', ')}
            </Text>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Workspace stats</Text>
          <Text style={styles.cardBody}>{snapshot.appData.ideas.length} ideas in inbox</Text>
          <Text style={styles.cardFoot}>{snapshot.appData.pool.length} staged cards ready to plan</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Shared notes</Text>
          <Text numberOfLines={5} style={styles.cardBody}>
            {snapshot.permanentNotes || 'No permanent notes yet.'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={refreshWorkspace} style={[styles.actionButton, styles.primaryAction]}>
          <Text style={styles.primaryActionLabel}>Refresh workspace</Text>
        </Pressable>

        {session.mode === 'signed_in' ? (
          <Pressable onPress={signOutCurrentUser} style={[styles.actionButton, styles.secondaryAction]}>
            <Text style={styles.secondaryActionLabel}>Sign out</Text>
          </Pressable>
        ) : (
          <Pressable onPress={signInWithGoogle} style={[styles.actionButton, styles.secondaryAction]}>
            <Text style={styles.secondaryActionLabel}>Enable Google sign-in</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing.lg,
    paddingBottom: 120,
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.canvas,
  },
  hero: {
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#463629',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    color: '#2c211a',
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#5a4b3f',
  },
  statusCard: {
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
    ...theme.shadow.card,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statusTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  syncLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.ink,
    textTransform: 'capitalize',
  },
  statusMeta: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.inkMuted,
  },
  grid: {
    gap: theme.spacing.md,
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
    ...theme.shadow.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.inkMuted,
  },
  cardFoot: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.inkSoft,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  actionButton: {
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryAction: {
    backgroundColor: theme.colors.ink,
  },
  secondaryAction: {
    backgroundColor: theme.colors.shellMuted,
  },
  primaryActionLabel: {
    color: theme.colors.card,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryActionLabel: {
    color: theme.colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
});
