import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '@/theme/colors';
import StepCompare from '@/components/add/StepCompare';
import { useMemories } from '@/context/DataContext';
import {
  determineTier,
  type Memory,
  type SearchResult,
} from '@/data/mockData';
import { planTierInsertion } from '@/lib/ranking';

export default function RerankScreen() {
  const {
    id,
    preliminaryScore: preliminaryScoreParam,
    pendingTaste,
    pendingVibe,
    pendingValue,
    pendingTasteScore,
    pendingVibeScore,
    pendingValueScore,
  } = useLocalSearchParams<{
    id: string;
    preliminaryScore?: string;
    pendingTaste?: string;
    pendingVibe?: string;
    pendingValue?: string;
    pendingTasteScore?: string;
    pendingVibeScore?: string;
    pendingValueScore?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { memories, batchUpdateCompositeScores, updateMemory } = useMemories();
  const memory = memories.find((m) => m.id === id);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!memory) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.errorText}>Memory not found</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // If a preliminary score was passed (e.g. after editing ratings), use that for
  // tier determination so the correct peer group is shown even before the ranked
  // score has been updated in the DB.
  const effectiveScore = preliminaryScoreParam
    ? parseFloat(preliminaryScoreParam)
    : memory.compositeScore;

  // StepCompare expects a SearchResult shape — adapt the memory to that.
  const restaurantShim: SearchResult = {
    id: memory.id,
    name: memory.restaurantName,
    address: memory.address,
    city: memory.city,
    state: memory.state,
    distance: '',
    category: memory.cuisineType,
    priceTier: memory.priceTier,
    isVisited: true,
    isBookmarked: false,
    latitude: memory.latitude,
    longitude: memory.longitude,
  };

  const handleFinish = async (result: { insertionIndex: number; rankedGroup: Memory[]; tiedWithMemoryId?: string }) => {
    setSaving(true);
    try {
      const tier = determineTier(effectiveScore);

      // Re-insert this memory at the binary-search position; shared helper
      // handles tie creation and orphaned-tie cleanup.
      const { selfScore, selfTiedGroupId, peerUpdates } = planTierInsertion({
        selfId: memory.id,
        insertionIndex: result.insertionIndex,
        rankedGroup: result.rankedGroup,
        tier,
        tiedWithMemoryId: result.tiedWithMemoryId,
        selfOldTiedGroupId: memory.tiedGroupId ?? null,
        fallbackScore: effectiveScore,
      });

      await batchUpdateCompositeScores([
        ...peerUpdates,
        { id: memory.id, compositeScore: selfScore, tiedGroupId: selfTiedGroupId },
      ]);

      // Write pending rating fields that were held back until rerank completes.
      if (pendingTaste && pendingVibe && pendingValue) {
        await updateMemory(memory.id, {
          tasteRating: pendingTaste as any,
          vibeRating: pendingVibe as any,
          valueRating: pendingValue as any,
          tasteScore: parseFloat(pendingTasteScore ?? '0'),
          vibeScore: parseFloat(pendingVibeScore ?? '0'),
          valueScore: parseFloat(pendingValueScore ?? '0'),
        });
      }

      router.back();
    } catch (err: any) {
      Alert.alert('Could not re-rank', err.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Re-rank</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Your score changed — let's place {memory.restaurantName} in your rankings.</Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.body}>
        <StepCompare
          restaurant={restaurantShim}
          eateryType={memory.eateryType}
          preliminaryScore={effectiveScore}
          excludeMemoryId={memory.id}
          onBack={() => router.back()}
          onFinish={handleFinish}
          onProgress={setProgress}
          saving={saving}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 16,
    borderRadius: 2,
    marginBottom: 20,
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  body: { flex: 1, paddingHorizontal: 16 },
  errorText: { color: Colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 20 },
});
