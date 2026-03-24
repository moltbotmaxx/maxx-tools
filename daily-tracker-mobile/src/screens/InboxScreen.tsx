import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTracker } from '../context/TrackerContext';
import { theme } from '../theme/tokens';
import type { ContentType, InboxFilter } from '../types/tracker';
import { getTodayKey } from '../utils/date';
import { getTypeColor, getTypeLabel } from '../utils/presentation';

const filters: Array<{ id: InboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'staged', label: 'Staged' },
  { id: 'ready', label: 'Ready' },
];

const contentTypes: ContentType[] = ['post', 'reel', 'promo'];

export function InboxScreen() {
  const {
    inboxItems,
    captureToInbox,
    stageIdeaById,
    planPoolCardById,
    deleteInboxItemById,
  } = useTracker();
  const [draft, setDraft] = useState('');
  const [selectedType, setSelectedType] = useState<ContentType>('post');
  const [activeFilter, setActiveFilter] = useState<InboxFilter>('all');

  const filteredItems = inboxItems.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'ideas') return item.kind === 'idea';
    return item.kind === 'staged';
  });

  const stagedCount = inboxItems.filter((item) => item.kind === 'staged').length;
  const ideaCount = inboxItems.filter((item) => item.kind === 'idea').length;

  async function handleCapture() {
    if (!draft.trim()) return;
    await captureToInbox(draft, selectedType);
    setDraft('');
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#f6d6b6', '#f1b786']} style={styles.hero}>
        <Text style={styles.heroEyebrow}>Capture and triage</Text>
        <Text style={styles.heroTitle}>Inbox replaces the desktop clipper, pool, and half the sourcing noise.</Text>
        <Text style={styles.heroBody}>
          Add a link or thought here, then stage it or schedule it for today in one tap.
        </Text>
      </LinearGradient>

      <View style={styles.composerCard}>
        <Text style={styles.composerTitle}>Quick capture</Text>
        <TextInput
          multiline
          onChangeText={setDraft}
          placeholder="Paste a link or write a content idea..."
          placeholderTextColor={theme.colors.inkSoft}
          style={styles.input}
          value={draft}
        />
        <View style={styles.typeRow}>
          {contentTypes.map((type) => {
            const isActive = selectedType === type;
            return (
              <Pressable
                key={type}
                onPress={() => setSelectedType(type)}
                style={[
                  styles.typeChip,
                  isActive && { backgroundColor: getTypeColor(type), borderColor: getTypeColor(type) },
                ]}
              >
                <Text style={[styles.typeChipLabel, isActive && styles.typeChipLabelActive]}>
                  {getTypeLabel(type)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={handleCapture} style={styles.captureButton}>
          <Text style={styles.captureButtonLabel}>Add to Inbox</Text>
        </Pressable>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.miniMetric}>
          <Text style={styles.miniMetricValue}>{ideaCount}</Text>
          <Text style={styles.miniMetricLabel}>Ideas</Text>
        </View>
        <View style={styles.miniMetric}>
          <Text style={styles.miniMetricValue}>{stagedCount}</Text>
          <Text style={styles.miniMetricLabel}>Staged</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {filters.map((filter) => {
          const isActive = activeFilter === filter.id;
          return (
            <Pressable
              key={filter.id}
              onPress={() => setActiveFilter(filter.id)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipLabel, isActive && styles.filterChipLabelActive]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.list}>
        {filteredItems.length ? (
          filteredItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemTopRow}>
                <View style={[styles.typePill, { backgroundColor: getTypeColor(item.type) }]}>
                  <Text style={styles.typePillLabel}>{getTypeLabel(item.type)}</Text>
                </View>
                <Text style={styles.kindLabel}>{item.kind === 'idea' ? 'Idea' : 'Ready'}</Text>
              </View>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
              <View style={styles.actions}>
                {item.kind === 'idea' ? (
                  <Pressable onPress={() => stageIdeaById(item.id)} style={[styles.action, styles.primaryAction]}>
                    <Text style={styles.primaryActionLabel}>Stage</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => planPoolCardById(item.id, getTodayKey())}
                    style={[styles.action, styles.primaryAction]}
                  >
                    <Text style={styles.primaryActionLabel}>Plan today</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => deleteInboxItemById(item.id, item.kind)}
                  style={[styles.action, styles.secondaryAction]}
                >
                  <Text style={styles.secondaryActionLabel}>Delete</Text>
                </Pressable>
                {!!item.url && (
                  <Pressable onPress={() => Linking.openURL(item.url!)} style={[styles.action, styles.ghostAction]}>
                    <Text style={styles.ghostActionLabel}>Open</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>This filter has no items.</Text>
            <Text style={styles.emptyBody}>Capture something above or move a ready card into today.</Text>
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
    gap: theme.spacing.sm,
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#513424',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    color: '#26170e',
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#654632',
  },
  composerCard: {
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  composerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  input: {
    minHeight: 104,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    fontSize: 16,
    lineHeight: 22,
    color: theme.colors.ink,
    backgroundColor: theme.colors.card,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  typeChip: {
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.card,
  },
  typeChipLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  typeChipLabelActive: {
    color: theme.colors.card,
  },
  captureButton: {
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.ink,
    alignItems: 'center',
    paddingVertical: 14,
  },
  captureButtonLabel: {
    color: theme.colors.card,
    fontSize: 14,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  miniMetric: {
    flex: 1,
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  miniMetricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  miniMetricLabel: {
    fontSize: 13,
    color: theme.colors.inkMuted,
  },
  filterRow: {
    gap: theme.spacing.sm,
  },
  filterChip: {
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.shell,
  },
  filterChipActive: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.ink,
  },
  filterChipLabelActive: {
    color: theme.colors.card,
  },
  list: {
    gap: theme.spacing.md,
  },
  itemCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  itemTopRow: {
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
    color: theme.colors.card,
    fontSize: 12,
    fontWeight: '800',
  },
  kindLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.inkSoft,
    textTransform: 'uppercase',
  },
  itemTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  itemSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.inkMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  action: {
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
  },
  primaryActionLabel: {
    color: theme.colors.card,
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryActionLabel: {
    color: theme.colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  ghostActionLabel: {
    color: theme.colors.inkMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: theme.colors.shell,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
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
    lineHeight: 20,
    color: theme.colors.inkMuted,
  },
});
