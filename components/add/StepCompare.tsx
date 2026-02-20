import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
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
import { memories, type SearchResult, type Memory } from '@/data/mockData';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.2;
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.38;

interface StepCompareProps {
  restaurant: SearchResult;
  onBack: () => void;
  onFinish: () => void;
  onProgress: (progress: number) => void;
  saving?: boolean;
}

export default function StepCompare({ restaurant, onBack, onFinish, onProgress, saving }: StepCompareProps) {
  const comparisons = memories.filter(
    (m) => m.restaurantName !== restaurant.name
  );
  const totalComparisons = comparisons.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{ memory: Memory; verdict: 'better' | 'worse' | 'skip' }[]>([]);

  const translateX = useSharedValue(0);
  const borderProgress = useSharedValue(0); // -1 = red/worse, 0 = neutral, 1 = green/better
  const cardScale = useSharedValue(1);
  // useSharedValue instead of useState so gesture handlers read it synchronously on the UI thread
  const isAnimating = useSharedValue(false);

  const currentComparison = comparisons[currentIndex];
  const isFinished = currentIndex >= totalComparisons;

  useEffect(() => {
    if (totalComparisons > 0) {
      onProgress(currentIndex / totalComparisons);
    }
  }, [currentIndex, totalComparisons]);

  useEffect(() => {
    if (isFinished) {
      // Kick off the save immediately — the done screen shows a spinner while saving
      onFinish();
    }
  }, [isFinished]);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const resetCard = useCallback(() => {
    translateX.value = 0;
    borderProgress.value = 0;
    cardScale.value = 1;
    isAnimating.value = false;
  }, []);

  const advanceToNext = useCallback((verdict: 'better' | 'worse' | 'skip') => {
    if (currentComparison) {
      setResults((prev) => [...prev, { memory: currentComparison, verdict }]);
    }
    setCurrentIndex((prev) => prev + 1);
    // Reset card for next comparison
    setTimeout(resetCard, 50);
  }, [currentComparison, resetCard]);

  const undoLast = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setResults((prev) => prev.slice(0, -1));
      resetCard();
    } else {
      onBack();
    }
  }, [currentIndex, onBack, resetCard]);

  const animateSwipeOff = useCallback((direction: 'left' | 'right') => {
    isAnimating.value = true;
    const verdict = direction === 'right' ? 'better' : 'worse';

    // Flash the border color
    borderProgress.value = withTiming(direction === 'right' ? 1 : -1, { duration: 150 });

    // Haptic feedback
    triggerHaptic();

    // Swipe card off screen
    translateX.value = withTiming(
      direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5,
      { duration: 300, easing: Easing.out(Easing.cubic) },
      () => {
        runOnJS(advanceToNext)(verdict);
      }
    );
  }, [advanceToNext, triggerHaptic]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    // Prevent the parent step-navigation swipe from stealing this gesture
    .simultaneousWithExternalGesture()
    .onUpdate((e) => {
      // Read isAnimating.value directly on the UI thread — no JS bridge delay
      if (!isAnimating.value && !isFinished) {
        translateX.value = e.translationX;
        const progress = Math.max(-1, Math.min(1, e.translationX / SWIPE_THRESHOLD));
        borderProgress.value = progress;
      }
    })
    .onEnd((e) => {
      if (isAnimating.value || isFinished) return;

      if (e.translationX > SWIPE_THRESHOLD || e.velocityX > 500) {
        runOnJS(animateSwipeOff)('right');
      } else if (e.translationX < -SWIPE_THRESHOLD || e.velocityX < -500) {
        runOnJS(animateSwipeOff)('left');
      } else {
        // Snap back
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
      [Colors.ratingPoor, Colors.ratingPoor, Colors.surfaceBorderLight, Colors.primary, Colors.primary]
    );
    const borderWidth = Math.abs(borderProgress.value) > 0.1 ? 2.5 : 1;

    return { borderColor, borderWidth };
  });

  // Overlay labels that appear as you drag
  const betterLabelStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, borderProgress.value * 1.5),
  }));

  const worseLabelStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, -borderProgress.value * 1.5),
  }));

  if (isFinished) {
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
              <Text style={styles.doneText}>All done!</Text>
              <Text style={styles.doneSub}>Compared against {totalComparisons} memories</Text>
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
        {currentIndex + 1} of {totalComparisons}
      </Text>

      {/* Current restaurant — stays fixed */}
      <Text style={styles.currentName}>{restaurant.name}</Text>
      <Text style={styles.currentSub}>Your new experience</Text>

      {/* Comparison prompt */}
      <Text style={styles.prompt}>
        Is{' '}
        <Text style={styles.promptBold}>{currentComparison.restaurantName}</Text>
        {' '}better or worse than{' '}
        <Text style={styles.promptBold}>{restaurant.name}</Text>?
      </Text>

      {/* Worse / Better labels */}
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

      {/* Swipeable card — shows the PAST memory being compared */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.swipeCard, cardStyle, borderStyle]}>
          {/* Overlay verdict labels */}
          <Animated.View style={[styles.verdictOverlay, styles.verdictBetter, betterLabelStyle]}>
            <Text style={styles.verdictTextBetter}>BETTER</Text>
          </Animated.View>
          <Animated.View style={[styles.verdictOverlay, styles.verdictWorse, worseLabelStyle]}>
            <Text style={styles.verdictTextWorse}>WORSE</Text>
          </Animated.View>

          {/* Card content — the past memory */}
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
              <View style={styles.cardTag}>
                <Text style={styles.cardTagText}>{currentComparison.moodTag}</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>

      {/* Bottom controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={undoLast}>
          <Ionicons name="arrow-undo" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={() => { triggerHaptic(); advanceToNext('skip'); }}>
          <Text style={styles.skipText}>Too Tough</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlBtn} onPress={() => { triggerHaptic(); advanceToNext('skip'); }}>
          <Ionicons name="play-skip-forward" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
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
    width: 46,
    height: 46,
    borderRadius: 23,
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
});
