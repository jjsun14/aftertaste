/**
 * Import graduation — rate a "been here" import from the To Rate queue
 * through the full Add Experience flow (log → compare), then save it as a
 * real memory and remove the queue row. Mirrors /rerank/[id]'s pattern of
 * hosting the shared step components in a standalone route.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '@/theme/colors';
import StepLog, { type LogFormData } from '@/components/add/StepLog';
import StepCompare from '@/components/add/StepCompare';
import { useMemories, useImportQueue } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { uploadPhoto } from '@/lib/uploadPhoto';
import { planTierInsertion } from '@/lib/ranking';
import {
  determineTier,
  computeComposite,
  ratingToScore,
  importRatingToLevel,
  type Memory,
  type SearchResult,
} from '@/data/mockData';

export default function RateImportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { addMemory, batchUpdateCompositeScores } = useMemories();
  const { queue, remove } = useImportQueue();
  const { user, scorePreference } = useAuth();

  const item = queue.find((q) => q.id === id);

  const [step, setStep] = useState<1 | 2>(1);
  const [logData, setLogData] = useState<LogFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  if (!item) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.errorText}>This place is no longer in your To Rate list.</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // StepLog/StepCompare speak SearchResult — adapt the queue row.
  const restaurantShim: SearchResult = {
    id: item.placeId ?? item.id,
    name: item.name,
    address: item.address,
    city: item.city || undefined,
    state: item.state || undefined,
    distance: '',
    category: item.category,
    priceTier: undefined,
    isVisited: false,
    isBookmarked: false,
    latitude: item.latitude || undefined,
    longitude: item.longitude || undefined,
  };

  const prefillLevel =
    item.prefillRating !== null ? importRatingToLevel(item.prefillRating) : undefined;

  const handleFinish = async (rankingResult?: {
    insertionIndex: number;
    rankedGroup: Memory[];
    tiedWithMemoryId?: string;
  }) => {
    if (!logData) return;
    setSaving(true);
    try {
      // Photos are optional on imports; upload any the user added
      let uploadedPhotoUrls: string[] = [];
      if ((logData.photos ?? []).length > 0 && user) {
        try {
          uploadedPhotoUrls = await Promise.all(
            logData.photos.map((uri) => uploadPhoto(uri, user.id)),
          );
        } catch {
          uploadedPhotoUrls = []; // never block the save on photos
        }
      }

      const tasteScore = ratingToScore(logData.taste);
      const vibeScore = ratingToScore(logData.vibe);
      const valueScore = ratingToScore(logData.value);
      const preliminaryComposite = computeComposite(tasteScore, vibeScore, valueScore, scorePreference);
      const tier = determineTier(preliminaryComposite);

      const { selfScore, selfTiedGroupId, peerUpdates } = planTierInsertion({
        selfId: 'NEW',
        insertionIndex: rankingResult?.insertionIndex ?? 0,
        rankedGroup: rankingResult?.rankedGroup ?? [],
        tier,
        tiedWithMemoryId: rankingResult?.tiedWithMemoryId,
        fallbackScore: preliminaryComposite,
      });

      const squad = [
        ...(logData.squadFriends ?? []).map((f) => ({
          id: `sq-friend-${f.profileId}`,
          name: f.displayName,
          avatar: '',
          profile_id: f.profileId,
        })),
        ...logData.squadNames
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
          .map((name, i) => ({ id: `sq-${i}`, name, avatar: '' })),
      ];

      await addMemory({
        restaurantName: item.name,
        priceTier: logData.priceTier,
        eateryType: logData.eateryType,
        cuisineType: item.category || '',
        address: item.address,
        city: item.city,
        state: item.state,
        latitude: item.latitude,
        longitude: item.longitude,
        date: logData.date,
        photos: uploadedPhotoUrls,
        whatIHad: logData.foodItems.split(',').map((s) => s.trim()).filter(Boolean),
        occasionTag: logData.occasion,
        moodTag: 'Perfect',
        tasteRating: logData.taste,
        vibeRating: logData.vibe,
        valueRating: logData.value,
        tasteScore,
        vibeScore,
        valueScore,
        compositeScore: selfScore,
        eatAgain: logData.eatAgain,
        squad,
        memoryNote: logData.note,
        isFavorite: false,
        visits: [],
        tiedGroupId: selfTiedGroupId,
        placeId: item.placeId,
        source: 'import',
        importBatchId: item.importBatchId,
      });

      if (peerUpdates.length > 0) {
        await batchUpdateCompositeScores(peerUpdates);
      }

      await remove(item.id);
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save', err.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {step === 2 && (
            <TouchableOpacity style={[styles.closeBtn, { marginRight: 10 }]} onPress={() => setStep(1)}>
              <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          )}
          <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step === 1 ? 0.5 : 0.5 + progress * 0.5) * 100}%` }]} />
      </View>

      <View style={styles.body}>
        {step === 1 ? (
          <StepLog
            restaurant={restaurantShim}
            onNext={() => setStep(2)}
            onDataChange={setLogData}
            initialData={{
              note: item.prefillNote ?? undefined,
              taste: prefillLevel,
              vibe: prefillLevel,
              value: prefillLevel,
            }}
          />
        ) : (
          logData && (
            <StepCompare
              restaurant={restaurantShim}
              eateryType={logData.eateryType}
              preliminaryScore={computeComposite(
                ratingToScore(logData.taste),
                ratingToScore(logData.vibe),
                ratingToScore(logData.value),
                scorePreference,
              )}
              onBack={() => setStep(1)}
              onFinish={handleFinish}
              onProgress={setProgress}
              saving={saving}
            />
          )
        )}
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  title: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', flexShrink: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 16,
    borderRadius: 2,
    marginBottom: 16,
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  body: { flex: 1, paddingHorizontal: 16 },
  errorText: { color: Colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 20 },
});
