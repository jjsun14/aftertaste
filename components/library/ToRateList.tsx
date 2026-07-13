/**
 * To Rate list — "been here" imports waiting to be rated. Tapping a row
 * launches the full Add Experience flow (/rate-import/[id]); the trailing
 * menu handles "don't remember it" (remove, or convert to Want to Try).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/theme/colors';
import { useImportQueue, useWantToTry } from '@/context/DataContext';
import { importRatingToLevel, type ImportQueueItem } from '@/data/mockData';

export default function ToRateList({ items }: { items: ImportQueueItem[] }) {
  const { remove } = useImportQueue();
  const { toggleBookmark } = useWantToTry();

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="checkmark-done-outline" size={36} color={Colors.textMuted} />
        <Text style={styles.emptyText}>All caught up — nothing left to rate!</Text>
      </View>
    );
  }

  const openMenu = (item: ImportQueueItem) => {
    Alert.alert(item.name, undefined, [
      { text: 'Rate it now', onPress: () => router.push(`/rate-import/${item.id}` as any) },
      {
        text: 'Move to Want to Try',
        onPress: async () => {
          try {
            await toggleBookmark({
              name: item.name,
              address: item.address,
              city: item.city,
              state: item.state,
              latitude: item.latitude,
              longitude: item.longitude,
              placeId: item.placeId ?? undefined,
            });
            await remove(item.id);
          } catch (err: any) {
            Alert.alert('Error', err.message ?? 'Could not move it.');
          }
        },
      },
      {
        text: "Don't remember it — remove",
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(item.id);
          } catch (err: any) {
            Alert.alert('Error', err.message ?? 'Could not remove it.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Tap a place to rate it — it goes through the full experience flow and joins your rankings.
      </Text>
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.row}
          onPress={() => router.push(`/rate-import/${item.id}` as any)}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="restaurant-outline" size={18} color={Colors.primary} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {[item.category, item.city].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {item.prefillRating !== null && (
            <View style={styles.prefillChip}>
              <Text style={styles.prefillChipText}>{importRatingToLevel(item.prefillRating)}?</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => openMenu(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16 },
  hint: { color: Colors.textSecondary, fontSize: 13, marginBottom: 14, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  rowSub: { color: Colors.textSecondary, fontSize: 12 },
  prefillChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10, backgroundColor: Colors.primaryBg,
  },
  prefillChipText: { color: Colors.primary, fontSize: 11, fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
});
