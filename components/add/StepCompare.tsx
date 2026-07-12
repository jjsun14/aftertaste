import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, getScoreColor } from '@/theme/colors';
import type { SearchResult, Memory, EateryType } from '@/data/mockData';
import { determineTier } from '@/data/mockData';
import { useMemories } from '@/context/DataContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.38;
const MAX_COMPARISONS = 5;

interface StepCompareProps {
  restaurant: SearchResult;
  eateryType?: EateryType;
  preliminaryScore?: number;
  excludeMemoryId?: string;
  onBack: () => void;
  onFinish: (result: {
    insertionIndex: number;
    rankedGroup: Memory[];
    tiedWithMemoryId?: string;
  }) => void;
  onProgress: (progress: number) => void;
  saving?: boolean;
}

export default function StepCompare({
  restaurant,
  eateryType,
  preliminaryScore,
  excludeMemoryId,
  onBack,
  onFinish,
  onProgress,
  saving,
}: StepCompareProps) {
  const { memories } = useMemories();

  // Build the ranked group: same tier + same eatery type, sorted ascending by score
  const rankedGroup = useMemo(() => {
    const tier = determineTier(preliminaryScore ?? 5.0);
    const type = eateryType ?? 'Restaurant';
    const newNameKey = restaurant.name.toLowerCase().trim();

    return memories
      .filter((m) => {
        if (excludeMemoryId && m.id === excludeMemoryId) return false;
        if (!excludeMemoryId && m.restaurantName.toLowerCase().trim() === newNameKey) return false;
        if (m.eateryType !== type) return false;
        if (determineTier(m.compositeScore) !== tier) return false;
        return true;
      })
      .sort((a, b) => a.compositeScore - b.compositeScore);
  }, [memories, restaurant.name, eateryType, preliminaryScore, excludeMemoryId]);

  const totalPossible = Math.min(MAX_COMPARISONS, rankedGroup.length > 0 ? Math.ceil(Math.log2(rankedGroup.length + 1)) : 0);

  // Binary search state
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(rankedGroup.length);
  const [comparisonCount, setComparisonCount] = useState(0);
  const [searchHistory, setSearchHistory] = useState<{ lo: number; hi: number }[]>([]);
  const [forceSearchDone, setForceSearchDone] = useState(false);
  // When user taps "Too Close", remember which memory the new one is tied with
  // so the parent can persist the tied_group_id link on save.
  const [tiedWithMemoryId, setTiedWithMemoryId] = useState<string | null>(null);

  // Keep binary search bounds consistent with rankedGroup length —
  // memories can load async, causing rankedGroup to recompute after mount.
  useEffect(() => {
    setLo(0);
    setHi(rankedGroup.length);
    setComparisonCount(0);
    setSearchHistory([]);
    setForceSearchDone(false);
    setTiedWithMemoryId(null);
  }, [rankedGroup.length]);

  const isSearchDone = forceSearchDone || lo >= hi || comparisonCount >= MAX_COMPARISONS;
  const midIndex = Math.floor((lo + hi) / 2);
  const currentComparison = !isSearchDone && rankedGroup.length > 0 ? rankedGroup[midIndex] : null;

  // Animation values
  const translateX = useSharedValue(0);
  const borderProgress = useSharedValue(0);
  const isAnimating = useSharedValue(false);

  const hasFinished = useRef(false);

  useEffect(() => {
    if (totalPossible > 0) {
      onProgress(comparisonCount / totalPossible);
    }
  }, [comparisonCount, totalPossible, onProgress]);


  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const resetCard = useCallback(() => {
    translateX.value = 0;
    borderProgress.value = 0;
    isAnimating.value = false;
  }, []);

  const advanceSearch = useCallback((verdict: 'better' | 'worse') => {
    setSearchHistory((prev) => [...prev, { lo, hi }]);
    if (verdict === 'better') {
      setLo(midIndex + 1);
    } else {
      setHi(midIndex);
    }
    setComparisonCount((prev) => prev + 1);
    setTimeout(resetCard, 50);
  }, [lo, hi, midIndex, resetCard]);

  const undoLast = useCallback(() => {
    if (searchHistory.length > 0) {
      const prev = searchHistory[searchHistory.length - 1];
      setLo(prev.lo);
      setHi(prev.hi);
      setSearchHistory((h) => h.slice(0, -1));
      setComparisonCount((c) => c - 1);
      resetCard();
    } else {
      onBack();
    }
  }, [searchHistory, onBack, resetCard]);

  const animateSwipeOff = useCallback((direction: 'left' | 'right') => {
    isAnimating.value = true;
    const verdict = direction === 'right' ? 'better' : 'worse';

    borderProgress.value = withTiming(direction === 'right' ? 1 : -1, { duration: 150 });
    triggerHaptic();

    translateX.value = withTiming(
      direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5,
      { duration: 300, easing: Easing.out(Easing.cubic) },
      () => {
        runOnJS(advanceSearch)(verdict);
      },
    );
  }, [advanceSearch, triggerHaptic]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .simultaneousWithExternalGesture()
    .onUpdate((e) => {
      if (!isAnimating.value && !isSearchDone) {
        translateX.value = e.translationX;
        const progress = Math.max(-1, Math.min(1, e.translationX / SWIPE_THRESHOLD));
        borderProgress.value = progress;
      }
    })
    .onEnd((e) => {
      if (isAnimating.value || isSearchDone) return;

      if (e.translationX > SWIPE_THRESHOLD || e.velocityX > 500) {
        runOnJS(animateSwipeOff)('right');
      } else if (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -500) {
        runOnJS(animateSwipeOff)('left');
      } else {
        translateX.value = withSpring(0, { damping: 15 });
        borderProgress.value = withTiming(0, { duration: 200 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${translateX.value / 25}deg` },
    ],
  }));

  const borderStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      borderProgress.value,
      [-1, -0.1, 0, 0.1, 1],
      [Colors.ratingPoor, Colors.ratingPoor, Colors.surfaceBorderLight, Colors.primary, Colors.primary],
    );
    const borderWidth = Math.abs(borderProgress.value) > 0.1 ? 2.5 : 1;
    return { borderColor, borderWidth };
  });

  const betterLabelStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, borderProgress.value * 1.5),
  }));

  const worseLabelStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, -borderProgress.value * 1.5),
  }));

  // ── Finished / no comparisons state ──
  if (isSearchDone || rankedGroup.length === 0 || !currentComparison) {
    return (
      <View style={styles.container}>
        <View style={styles.doneWrap}>
          {saving ? (
            <>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.doneText}>Saving...</Text>
              <Text style={styles.doneSub}>Uploading photos & saving your memory</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={48} color={Colors.primary} />
              <Text style={styles.doneText}>Ready to save!</Text>
              <Text style={styles.doneSub}>
                {rankedGroup.length === 0
                  ? memories.length <= 1
                    ? 'Your first memory — nothing to compare yet!'
                    : 'No similar memories to rank against.'
                  : `Ranked against ${comparisonCount} ${comparisonCount === 1 ? 'memory' : 'memories'}`}
              </Text>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => {
                  if (!hasFinished.current) {
                    hasFinished.current = true;
                    onFinish({
                      insertionIndex: lo,
                      rankedGroup,
                      tiedWithMemoryId: tiedWithMemoryId ?? undefined,
                    });
                  }
                }}
              >
                <Text style={styles.saveBtnText}>Save Memory</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Counter */}
      <Text style={styles.counter}>
        {comparisonCount + 1} of {totalPossible}
      </Text>

      {/* New restaurant name */}
      <Text style={styles.currentName}>{restaurant.name}</Text>
      <Text style={styles.currentSub}>Your new experience</Text>

      {/* Comparison prompt */}
      <Text style={styles.prompt}>
        Was{' '}
        <Text style={styles.promptBold}>{restaurant.name}</Text>
        {' '}better or worse than{' '}
        <Text style={styles.promptBold}>{currentComparison.restaurantName}</Text>?
      </Text>

      {/* Direction labels */}
      <View style={styles.labelRow}>
        <View style={styles.labelLeft}>
          <Ionicons name="arrow-back" size={16} color={Colors.ratingPoor} />
          <Text style={styles.labelTextWorse}>Worse</Text>
        </View>
        <View style={styles.labelRight}>
          <Text style={styles.labelTextBetter}>Better</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
        </View>
      </View>

      {/* Swipeable comparison card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.swipeCard, cardStyle, borderStyle]}>
          {/* Overlay verdict labels */}
          <Animated.View style={[styles.verdictOverlay, styles.verdictBetter, betterLabelStyle]}>
            <Text style={styles.verdictTextBetter}>BETTER</Text>
          </Animated.View>
          <Animated.View style={[styles.verdictOverlay, styles.verdictWorse, worseLabelStyle]}>
            <Text style={styles.verdictTextWorse}>WORSE</Text>
          </Animated.View>

          {/* Card content */}
          <View style={styles.cardContent}>
            <Text style={styles.cardName}>{currentComparison.restaurantName}</Text>
            <Text style={styles.cardSub}>
              {currentComparison.priceTier} · {currentComparison.cuisineType}
            </Text>
            <View style={styles.cardScoreRow}>
              <Text style={styles.cardScoreLabel}>Score</Text>
              <Text style={[styles.cardScore, { color: getScoreColor(currentComparison.compositeScore) }]}>
                {currentComparison.compositeScore.toFixed(1)}
              </Text>
            </View>
            <View style={styles.cardDivider} />
            <Text style={styles.cardNote} numberOfLines={3}>
              {currentComparison.memoryNote}
            </Text>
            <View style={styles.cardTagRow}>
              <View style={styles.cardTag}>
                <Text style={styles.cardTagText}>{currentComparison.occasionTag}</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Bottom controls */}
      <View style={styles.controls}>
        <GHTouchableOpacity style={styles.controlBtn} onPress={undoLast}>
          <Ionicons name="arrow-undo" size={20} color={Colors.textSecondary} />
        </GHTouchableOpacity>

        <GHTouchableOpacity
          style={styles.skipBtn}
          onPress={() => {
            triggerHaptic();
            // Tie the new memory's score to the comparison memory's permanently.
            setLo(midIndex);
            setTiedWithMemoryId(currentComparison.id);
            setForceSearchDone(true);
          }}
        >
          <Text style={styles.skipText}>Too Close</Text>
        </GHTouchableOpacity>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  counter: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
  },
  currentName: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 2,
  },
  currentSub: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 20,
  },
  prompt: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  promptBold: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  labelRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  labelTextWorse: {
    color: Colors.ratingPoor,
    fontSize: 14,
    fontWeight: '600',
  },
  labelTextBetter: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  swipeCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorderLight,
    borderRadius: 20,
    overflow: 'hidden',
  },
  verdictOverlay: {
    position: 'absolute',
    top: 20,
    zIndex: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
  },
  verdictBetter: {
    right: 20,
    borderColor: Colors.primary,
  },
  verdictWorse: {
    left: 20,
    borderColor: Colors.ratingPoor,
  },
  verdictTextBetter: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  verdictTextWorse: {
    color: Colors.ratingPoor,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cardContent: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardName: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  cardSub: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  cardScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  cardScoreLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  cardScore: {
    fontSize: 24,
    fontWeight: '900',
  },
  cardDivider: {
    width: 60,
    height: 1,
    backgroundColor: Colors.surfaceBorderLight,
    marginBottom: 16,
  },
  cardNote: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  cardTagRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cardTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
  },
  cardTagText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginTop: 24,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  skipText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  doneText: {
    color: Colors.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  doneSub: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  saveBtn: {
    marginTop: 24,
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
