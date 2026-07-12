import React, { useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '@/theme/colors';
import StepSearch from '@/components/add/StepSearch';
import StepLog, { type LogFormData } from '@/components/add/StepLog';
import StepCompare from '@/components/add/StepCompare';
import ReturnVisitForm from '@/components/add/ReturnVisitForm';
import { useMemories } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { uploadPhoto } from '@/lib/uploadPhoto';
import type { SearchResult, RatingLevel, Memory, Visit } from '@/data/mockData';
import { determineTier, computeComposite, ratingToScore } from '@/data/mockData';
import { planTierInsertion } from '@/lib/ranking';
import { fetchPriceTier } from '@/lib/googlePlaces';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_BACK_THRESHOLD = SCREEN_WIDTH * 0.25;
const TIMING_CONFIG = { duration: 300, easing: Easing.out(Easing.cubic) };

export default function AddExperienceScreen() {
  const [step, setStep] = useState(1);
  const [selectedRestaurant, setSelectedRestaurant] = useState<SearchResult | null>(null);
  const [compareProgress, setCompareProgress] = useState(0);
  const [logData, setLogData] = useState<LogFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [returnVisitMode, setReturnVisitMode] = useState(false);
  const [returnVisitMemory, setReturnVisitMemory] = useState<Memory | null>(null);
  const insets = useSafeAreaInsets();
  const { memories, addMemory, addVisit, batchUpdateCompositeScores } = useMemories();
  const { user, scorePreference } = useAuth();

  const position = useSharedValue(0);
  const dragX = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Reset completely when leaving the tab
  useFocusEffect(
    useCallback(() => {
      return () => {
        setStep(1);
        setSelectedRestaurant(null);
        setCompareProgress(0);
        setLogData(null);
        setReturnVisitMode(false);
        setReturnVisitMemory(null);
        position.value = 0;
        dragX.value = 0;
      };
    }, [])
  );

  const getProgress = () => {
    if (step === 1) return 0.33;
    if (step === 2) return returnVisitMode ? 1.0 : 0.66;
    return 0.66 + compareProgress * 0.34;
  };

  const handleSelect = (result: SearchResult) => {
    setSelectedRestaurant(result);
    setStep(2);
    position.value = withTiming(1, TIMING_CONFIG);
    // Best-effort price prefill — one Enterprise-tier details call per
    // selection (see lib/googlePlaces cost model). Never blocks the flow.
    if (!result.priceTier) {
      fetchPriceTier(result.id).then((priceTier) => {
        if (!priceTier) return;
        setSelectedRestaurant((prev) =>
          prev && prev.id === result.id ? { ...prev, priceTier } : prev,
        );
      });
    }
  };

  const handleQuickCheckin = async (existingMemory: Memory) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const visit: Visit = {
        id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: today,
        whatIHad: [],
      };
      await addVisit(existingMemory.id, visit);
      router.navigate({ pathname: '/(tabs)/library', params: { showTab: 'all' } });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save visit.');
    }
  };

  const handleReturnVisit = (result: SearchResult, existingMemory: Memory) => {
    setSelectedRestaurant(result);
    setReturnVisitMode(true);
    setReturnVisitMemory(existingMemory);
    setStep(2);
    position.value = withTiming(1, TIMING_CONFIG);
  };

  const handleSaveReturnVisit = async (visitData: Omit<Visit, 'id'>) => {
    if (!returnVisitMemory) return;
    setSaving(true);
    try {
      // Upload photo if present
      let photoUrl: string | undefined;
      if (visitData.photo && user) {
        try {
          photoUrl = await uploadPhoto(visitData.photo, user.id);
        } catch {
          photoUrl = undefined; // skip photo on failure
        }
      }

      const visit: Visit = {
        ...visitData,
        id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        photo: photoUrl ?? undefined,
      };

      await addVisit(returnVisitMemory.id, visit);

      const wasRated = visit.tasteScore != null && visit.vibeScore != null && visit.valueScore != null;
      const memoryId = returnVisitMemory.id;

      // Reset and navigate
      setStep(1);
      setSelectedRestaurant(null);
      setReturnVisitMode(false);
      setReturnVisitMemory(null);
      setCompareProgress(0);
      setLogData(null);
      position.value = withTiming(0, TIMING_CONFIG);

      // Rated return visits invalidate the comparative ranking — go re-rank.
      if (wasRated) {
        router.push({ pathname: '/rerank/[id]', params: { id: memoryId } } as any);
      } else {
        router.navigate({ pathname: '/(tabs)/library', params: { showTab: 'all' } });
      }
    } catch (err: any) {
      Alert.alert('Could not save', err.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setReturnVisitMode(false);
      setReturnVisitMemory(null);
      position.value = withTiming(0, TIMING_CONFIG, () => {
        runOnJS(setSelectedRestaurant)(null);
      });
    } else if (step === 3) {
      setStep(2);
      setCompareProgress(0);
      position.value = withTiming(1, TIMING_CONFIG);
    }
  };

  const handleNext = () => {
    setStep(3);
    position.value = withTiming(2, TIMING_CONFIG);
  };

  const handleFinish = async (rankingResult?: { insertionIndex: number; rankedGroup: Memory[]; tiedWithMemoryId?: string }) => {
    if (!selectedRestaurant || !logData) return;

    setSaving(true);
    try {
      // Upload any photos and get back public URLs
      const photoUris = logData.photos ?? [];
      let uploadedPhotoUrls: string[] = [];
      if (photoUris.length > 0 && user) {
        try {
          uploadedPhotoUrls = await Promise.all(
            photoUris.map((uri) => uploadPhoto(uri, user.id))
          );
        } catch (photoErr: any) {
          console.error('Photo upload error:', photoErr);
          Alert.alert(
            'Photo upload failed',
            `Your memory will be saved without photos. Error: ${photoErr.message}`,
            [{ text: 'Continue', style: 'default' }]
          );
          uploadedPhotoUrls = [];
        }
      }

      const tasteScore = ratingToScore(logData.taste);
      const vibeScore = ratingToScore(logData.vibe);
      const valueScore = ratingToScore(logData.value);
      const preliminaryComposite = computeComposite(tasteScore, vibeScore, valueScore, scorePreference);
      const tier = determineTier(preliminaryComposite);

      // Insert the new memory at the binary-search position and
      // redistribute scores across its tier+eateryType group
      const {
        selfScore: newMemoryScore,
        selfTiedGroupId: newMemoryTiedGroupId,
        peerUpdates: otherUpdates,
      } = planTierInsertion({
        selfId: 'NEW',
        insertionIndex: rankingResult?.insertionIndex ?? 0,
        rankedGroup: rankingResult?.rankedGroup ?? [],
        tier,
        tiedWithMemoryId: rankingResult?.tiedWithMemoryId,
        fallbackScore: preliminaryComposite,
      });

      // Build squad from app friends + free-text names
      const friendSquad = (logData.squadFriends ?? []).map((f) => ({
        id: `sq-friend-${f.profileId}`,
        name: f.displayName,
        avatar: '',
        profile_id: f.profileId,
      }));
      const freeTextSquad = logData.squadNames
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name, i) => ({ id: `sq-${i}`, name, avatar: '' }));
      const squad = [...friendSquad, ...freeTextSquad];

      // Use structured city/state from Foursquare locality/region fields.
      // Fallback: parse from address string if structured fields are missing.
      // Purely numeric segments are dropped first — international addresses
      // often put the street number after a comma ("Calle del Casino, 16"),
      // which otherwise ends up as the "city".
      const addressParts = selectedRestaurant.address
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p && !/^\d+$/.test(p));
      const parsedCity = selectedRestaurant.city ??
        (addressParts.length >= 3 ? addressParts[addressParts.length - 2] : '');
      const parsedState = selectedRestaurant.state ??
        (addressParts.length >= 2 ? addressParts[addressParts.length - 1].replace(/\d+/g, '').trim() : '');

      // Save new memory with its tier-calculated score
      await addMemory({
        restaurantName: selectedRestaurant.name,
        priceTier: logData.priceTier,
        eateryType: logData.eateryType,
        cuisineType: selectedRestaurant.category || '',
        address: selectedRestaurant.address,
        city: parsedCity,
        state: parsedState,
        latitude: selectedRestaurant.latitude ?? 0,
        longitude: selectedRestaurant.longitude ?? 0,
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
        compositeScore: newMemoryScore,
        eatAgain: logData.eatAgain,
        squad,
        memoryNote: logData.note,
        isFavorite: false,
        visits: [],
        tiedGroupId: newMemoryTiedGroupId,
        fsqPlaceId: selectedRestaurant.id,
      });

      // Update other memories in the group with redistributed scores
      if (otherUpdates.length > 0) {
        await batchUpdateCompositeScores(otherUpdates);
      }

      // Reset flow then navigate to library
      setStep(1);
      setSelectedRestaurant(null);
      setCompareProgress(0);
      setLogData(null);
      position.value = withTiming(0, TIMING_CONFIG);
      router.navigate({ pathname: '/(tabs)/library', params: { showTab: 'all' } });
    } catch (err: any) {
      Alert.alert('Could not save', err.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  // Swipe-back gesture — disabled on step 3 so the card swipe gesture owns all horizontal input
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .enabled(step !== 3)
    .onStart(() => {
      isDragging.value = true;
      dragX.value = 0;
    })
    .onUpdate((e) => {
      if (step > 1 && e.translationX > 0) {
        dragX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      isDragging.value = false;
      if (step > 1 && e.translationX > SWIPE_BACK_THRESHOLD) {
        dragX.value = 0;
        runOnJS(handleBack)();
      } else {
        dragX.value = withTiming(0, { duration: 150 });
      }
    });

  const step1Style = useAnimatedStyle(() => {
    const base = interpolate(position.value, [0, 1, 2], [0, -SCREEN_WIDTH, -SCREEN_WIDTH * 2]);
    const drag = isDragging.value ? dragX.value : 0;
    return {
      transform: [{ translateX: base + drag }],
      opacity: interpolate(position.value, [0, 0.5, 1], [1, 0.3, 0]),
    };
  });

  const step2Style = useAnimatedStyle(() => {
    const base = interpolate(position.value, [0, 1, 2], [SCREEN_WIDTH, 0, -SCREEN_WIDTH]);
    const drag = isDragging.value ? dragX.value : 0;
    return {
      transform: [{ translateX: base + drag }],
      opacity: interpolate(position.value, [0, 0.5, 1, 1.5, 2], [0, 0.3, 1, 0.3, 0]),
    };
  });

  const step3Style = useAnimatedStyle(() => {
    const base = interpolate(position.value, [0, 1, 2], [SCREEN_WIDTH * 2, SCREEN_WIDTH, 0]);
    const drag = isDragging.value ? dragX.value : 0;
    return {
      transform: [{ translateX: base + drag }],
      opacity: interpolate(position.value, [1, 1.5, 2], [0, 0.3, 1]),
    };
  });

  return (
    <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Add Experience</Text>
        <View style={styles.headerRight}>
          {saving && <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 12 }} />}
          {step > 1 && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: `${getProgress() * 100}%` }]} />
      </View>

      {/* Step panels */}
      <GestureDetector gesture={swipeGesture}>
        <View style={styles.stepsContainer}>
          <Animated.View style={[styles.stepPanel, step1Style]}>
            <StepSearch onSelect={handleSelect} onReturnVisit={handleReturnVisit} onQuickCheckin={handleQuickCheckin} />
          </Animated.View>

          <Animated.View style={[styles.stepPanel, step2Style]} pointerEvents={step === 2 ? 'auto' : 'none'}>
            {selectedRestaurant && returnVisitMode && returnVisitMemory ? (
              <ReturnVisitForm
                restaurant={selectedRestaurant}
                existingMemory={returnVisitMemory}
                onSave={handleSaveReturnVisit}
                onCancel={handleBack}
                saving={saving}
              />
            ) : selectedRestaurant ? (
              <StepLog
                restaurant={selectedRestaurant}
                onNext={handleNext}
                onDataChange={setLogData}
              />
            ) : null}
          </Animated.View>

          <Animated.View style={[styles.stepPanel, step3Style]} pointerEvents={step === 3 ? 'auto' : 'none'}>
            {selectedRestaurant && (
              <StepCompare
                restaurant={selectedRestaurant}
                eateryType={logData?.eateryType}
                preliminaryScore={logData ? computeComposite(
                  ratingToScore(logData.taste),
                  ratingToScore(logData.vibe),
                  ratingToScore(logData.value),
                  scorePreference,
                ) : undefined}
                onBack={() => {
                  setStep(2);
                  setCompareProgress(0);
                  position.value = withTiming(1, TIMING_CONFIG);
                }}
                onFinish={handleFinish}
                onProgress={setCompareProgress}
                saving={saving}
              />
            )}
          </Animated.View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 16,
    borderRadius: 2,
    marginBottom: 20,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  stepsContainer: {
    flex: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  stepPanel: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 16,
  },
});
