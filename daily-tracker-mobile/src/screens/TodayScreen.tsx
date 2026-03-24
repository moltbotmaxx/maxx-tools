import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTracker } from '../context/TrackerContext';
import { theme } from '../theme/tokens';
import { getTypeColor, getTypeLabel, getSyncTone } from '../utils/presentation';

export function TodayScreen() {
  const {
    session,
    syncState,
    syncMessage,
    todayItems,
    weekPlan,
    weeklyPosted,
    toggleCardStatusById,
    returnCardToInbox,
  } = useTracker();

  const upcoming = weekPlan.filter((day) => !day.isToday && day.scheduledCount > 0).slice(0, 3);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#f5c56f', '#eb7a54']} style={styles.hero}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroEyebrow}>
            {session.mode === 'signed_in' ? 'Live workspace' : 'Preview workspace'}
          </Text>
          <View style={[styles.syncBadge, { borderColor: getSyncTone(syncState) }]}>
            <View style={[styles.syncDot, { backgroundColor: getSyncTone(syncState) }]} />
            <Text style={styles.syncLabel}>{syncState}</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>Focus today, not the whole dashboard.</Text>
        <Text style={styles.heroBody}>{syncMessage}</Text>
      </LinearGradient>

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{todayItems.length}</Text>
          <Text style={styles.metricLabel}>Items today</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{weeklyPosted}</Text>
          <Text style={styles.metricLabel}>Posted this week</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today queue</Text>
        <Text style={styles.sectionMeta}>{todayItems.length ? 'Tap to finish cleanly' : 'Nothing planned yet'}</Text>
      </View>

      {todayItems.length ? (
        todayItems.map((item) => (
          <View key={item.id} style={styles.taskCard}>
            <View style={styles.taskTopRow}>
              <View style={[styles.typePill, { backgroundColor: getTypeColor(item.type) }]}>
                <Text style={styles.typePillLabel}>{getTypeLabel(item.type)}</Text>
              </View>
              <Text style={styles.statusText}>{item.status === 'posted' ? 'Posted' : 'Queued'}</Text>
            </View>
            <Text style={styles.taskTitle}>{item.description}</Text>
            {!!item.url && <Text style={styles.taskMeta}>{item.url}</Text>}
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => toggleCardStatusById(item.id)}
                style={[styles.actionButton, styles.primaryAction]}
              >
                <Text style={styles.primaryActionLabel}>
                  {item.status === 'posted' ? 'Mark open' : 'Mark posted'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => returnCardToInbox(item.id)}
                style={[styles.actionButton, styles.secondaryAction]}
              >
                <Text style={styles.secondaryActionLabel}>Back to inbox</Text>
              </Pressable>
              {!!item.url && (
                <Pressable
                  onPress={() => Linking.openURL(item.url!)}
                  style={[styles.actionButton, styles.ghostAction]}
                >
                  <Text style={styles.ghostActionLabel}>Open</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No content scheduled for today.</Text>
          <Text style={styles.emptyBody}>
            Use Inbox to capture links and Plan to place them into the week without dragging cards around.
          </Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Rest of the week</Text>
        <Text style={styles.sectionMeta}>A tighter mobile view of the same schedule data</Text>
      </View>

      <View style={styles.upcomingList}>
        {upcoming.length ? (
          upcoming.map((day) => (
            <View key={day.dateKey} style={styles.upcomingCard}>
              <View>
                <Text style={styles.upcomingDay}>{day.weekday}</Text>
                <Text style={styles.upcomingDate}>{day.label}</Text>
              </View>
              <View style={styles.upcomingStats}>
                <Text style={styles.upcomingCount}>{day.scheduledCount}</Text>
                <Text style={styles.upcomingMeta}>scheduled</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyMiniCard}>
            <Text style={styles.emptyMiniText}>The rest of the week is open.</Text>
          </View>
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
    gap: theme.spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3a261d',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  syncLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3a261d',
    textTransform: 'capitalize',
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: '#241814',
    maxWidth: 280,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#50372c',
    maxWidth: 300,
  },
  metricRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.inkMuted,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  sectionMeta: {
    fontSize: 13,
    color: theme.colors.inkMuted,
  },
  taskCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
    ...theme.shadow.card,
  },
  taskTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typePill: {
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typePillLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fffdf8',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.inkSoft,
  },
  taskTitle: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  taskMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.inkMuted,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  actionButton: {
    borderRadius: theme.radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryAction: {
    backgroundColor: theme.colors.ink,
  },
  secondaryAction: {
    backgroundColor: theme.colors.shellMuted,
  },
  ghostAction: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  primaryActionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.card,
  },
  secondaryActionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  ghostActionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.inkMuted,
  },
  emptyCard: {
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.inkMuted,
  },
  upcomingList: {
    gap: theme.spacing.sm,
  },
  upcomingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  upcomingDay: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  upcomingDate: {
    marginTop: 2,
    fontSize: 13,
    color: theme.colors.inkMuted,
  },
  upcomingStats: {
    alignItems: 'flex-end',
  },
  upcomingCount: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.teal,
  },
  upcomingMeta: {
    fontSize: 12,
    color: theme.colors.inkSoft,
  },
  emptyMiniCard: {
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyMiniText: {
    color: theme.colors.inkMuted,
    fontSize: 14,
  },
});
