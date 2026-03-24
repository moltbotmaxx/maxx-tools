import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTracker } from '../context/TrackerContext';
import { theme } from '../theme/tokens';
import { getTypeColor, getTypeLabel } from '../utils/presentation';

export function PlanScreen() {
  const {
    snapshot,
    weekPlan,
    weeklyTotal,
    planPoolCardById,
    toggleCardStatusById,
    returnCardToInbox,
  } = useTracker();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(snapshot.appData.pool[0]?.id || null);

  useEffect(() => {
    if (!selectedCardId) return;
    const exists = snapshot.appData.pool.some((card) => card.id === selectedCardId);
    if (!exists) {
      setSelectedCardId(snapshot.appData.pool[0]?.id || null);
    }
  }, [selectedCardId, snapshot.appData.pool]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#cde8e2', '#7bc7b8']} style={styles.hero}>
        <Text style={styles.heroEyebrow}>Plan with intention</Text>
        <Text style={styles.heroTitle}>Tap a staged card, then assign it to the week.</Text>
        <Text style={styles.heroBody}>
          Same schedule data, different interaction model. No 7-column desktop grid.
        </Text>
      </LinearGradient>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{snapshot.appData.pool.length}</Text>
          <Text style={styles.summaryLabel}>Ready to assign</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{weeklyTotal}</Text>
          <Text style={styles.summaryLabel}>This week</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Ready queue</Text>
        <Text style={styles.sectionMeta}>
          {selectedCardId ? 'A card is selected for assignment' : 'Select a staged card first'}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queueRow}>
        {snapshot.appData.pool.length ? (
          snapshot.appData.pool.map((card) => {
            const isSelected = card.id === selectedCardId;
            return (
              <Pressable
                key={card.id}
                onPress={() => setSelectedCardId(card.id)}
                style={[
                  styles.queueCard,
                  isSelected && { borderColor: theme.colors.teal, backgroundColor: theme.colors.tealSoft },
                ]}
              >
                <View style={[styles.typePill, { backgroundColor: getTypeColor(card.type) }]}>
                  <Text style={styles.typePillLabel}>{getTypeLabel(card.type)}</Text>
                </View>
                <Text numberOfLines={3} style={styles.queueTitle}>
                  {card.description}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.emptyQueue}>
            <Text style={styles.emptyQueueText}>Inbox is emptying into the calendar cleanly.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Week view</Text>
        <Text style={styles.sectionMeta}>Assign from the queue or clean up what is already planned</Text>
      </View>

      <View style={styles.dayList}>
        {weekPlan.map((day) => (
          <View key={day.dateKey} style={[styles.dayCard, day.isToday && styles.dayCardToday]}>
            <View style={styles.dayHeader}>
              <View>
                <Text style={styles.dayName}>
                  {day.weekday} · {day.label}
                </Text>
                <Text style={styles.dayMeta}>
                  {day.scheduledCount} planned, {day.openSlots} slots open
                </Text>
              </View>
              <Pressable
                disabled={!selectedCardId}
                onPress={async () => {
                  if (!selectedCardId) return;
                  await planPoolCardById(selectedCardId, day.dateKey);
                }}
                style={[
                  styles.assignButton,
                  !selectedCardId && styles.assignButtonDisabled,
                ]}
              >
                <Text style={styles.assignButtonLabel}>Assign here</Text>
              </Pressable>
            </View>

            {day.items.length ? (
              day.items.map((item) => (
                <View key={item.id} style={styles.plannedItem}>
                  <View style={styles.plannedTopRow}>
                    <View style={[styles.typePill, { backgroundColor: getTypeColor(item.type) }]}>
                      <Text style={styles.typePillLabel}>{getTypeLabel(item.type)}</Text>
                    </View>
                    <Text style={styles.plannedStatus}>{item.status === 'posted' ? 'Posted' : 'Queued'}</Text>
                  </View>
                  <Text style={styles.plannedTitle}>{item.description}</Text>
                  <View style={styles.plannedActions}>
                    <Pressable
                      onPress={() => toggleCardStatusById(item.id)}
                      style={[styles.smallAction, styles.smallPrimary]}
                    >
                      <Text style={styles.smallPrimaryLabel}>
                        {item.status === 'posted' ? 'Undo' : 'Posted'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => returnCardToInbox(item.id)}
                      style={[styles.smallAction, styles.smallSecondary]}
                    >
                      <Text style={styles.smallSecondaryLabel}>Back</Text>
                    </Pressable>
                    {!!item.url && (
                      <Pressable
                        onPress={() => Linking.openURL(item.url!)}
                        style={[styles.smallAction, styles.smallGhost]}
                      >
                        <Text style={styles.smallGhostLabel}>Open</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.dayEmpty}>No content scheduled yet.</Text>
            )}
          </View>
        ))}
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
    color: '#134a45',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    color: '#14312f',
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#225651',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  summaryLabel: {
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
  queueRow: {
    gap: theme.spacing.sm,
  },
  queueCard: {
    width: 220,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  queueTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  typePill: {
    alignSelf: 'flex-start',
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typePillLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.card,
  },
  emptyQueue: {
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyQueueText: {
    color: theme.colors.inkMuted,
    fontSize: 14,
  },
  dayList: {
    gap: theme.spacing.md,
  },
  dayCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
    ...theme.shadow.card,
  },
  dayCardToday: {
    borderColor: theme.colors.teal,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  dayName: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  dayMeta: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.inkMuted,
  },
  assignButton: {
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.teal,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assignButtonDisabled: {
    backgroundColor: theme.colors.shellMuted,
  },
  assignButtonLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.card,
  },
  plannedItem: {
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.shell,
  },
  plannedTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  plannedStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.inkSoft,
  },
  plannedTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  plannedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  smallAction: {
    borderRadius: theme.radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallPrimary: {
    backgroundColor: theme.colors.ink,
  },
  smallSecondary: {
    backgroundColor: theme.colors.shellMuted,
  },
  smallGhost: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  smallPrimaryLabel: {
    color: theme.colors.card,
    fontSize: 12,
    fontWeight: '800',
  },
  smallSecondaryLabel: {
    color: theme.colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  smallGhostLabel: {
    color: theme.colors.inkMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  dayEmpty: {
    color: theme.colors.inkMuted,
    fontSize: 14,
  },
});
