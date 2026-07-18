/**
 * Bottom sheet with swipe-down-anywhere dismissal.
 *
 * Gestures: react-native-gesture-handler, because with the RN new
 * architecture a JS PanResponder can never steal a drag from a native
 * ScrollView. Animation: reanimated shared values, so the drag math
 * runs on the UI thread — no per-frame JS bridge hops, no stutter.
 * The pan runs simultaneously with the scroll and only moves the
 * sheet while the scroll sits at the top (bounces are off, so the
 * content can't fight the sheet for the same downward drag).
 */
import React from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
  ScrollView as GHScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Colors } from '@/theme/colors';

const AnimatedScrollView = Animated.createAnimatedComponent(GHScrollView);

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  paddingBottom: number;
}

export default function BottomSheet({
  visible,
  onClose,
  children,
  paddingBottom,
}: BottomSheetProps) {
  const sheetY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  // translationY at the moment the sheet-drag engages, so a scroll-up
  // that continues into a pull-down doesn't make the sheet jump
  const dragBase = useSharedValue(-1);

  const finishClose = () => {
    sheetY.value = 0;
    onClose();
  };

  // Recreated each render on purpose — RNGH diffs gesture configs, and
  // this keeps the worklets' captured callbacks fresh.
  const scrollGesture = Gesture.Native();
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .simultaneousWithExternalGesture(scrollGesture)
    .onChange((e) => {
      if (scrollOffset.value <= 0) {
        if (dragBase.value < 0) dragBase.value = e.translationY;
        const dy = e.translationY - dragBase.value;
        sheetY.value = dy > 0 ? dy : 0;
      } else {
        dragBase.value = -1;
        if (sheetY.value !== 0) sheetY.value = 0;
      }
    })
    .onEnd((e) => {
      const dy = dragBase.value >= 0 ? e.translationY - dragBase.value : 0;
      dragBase.value = -1;
      if (dy > 80 || (e.velocityY > 500 && dy > 20)) {
        sheetY.value = withTiming(900, { duration: 180 }, (finished) => {
          if (finished) runOnJS(finishClose)();
        });
      } else {
        sheetY.value = withSpring(0, { damping: 22, stiffness: 260, mass: 0.6 });
      }
    });

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollOffset.value = e.contentOffset.y;
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* RNGH needs its own root inside a Modal (Modals are separate
          native windows — gestures are dead without this). */}
      <GestureHandlerRootView style={styles.root}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.sheet, sheetStyle]}>
              <View style={styles.dragArea}>
                <View style={styles.sheetHandle} />
              </View>
              <GestureDetector gesture={scrollGesture}>
                <AnimatedScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom }}
                  bounces={false}
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                >
                  {children}
                </AnimatedScrollView>
              </GestureDetector>
              {/* Solid colour block that fills the bounce-zone below the sheet */}
              <View style={styles.sheetBottomFill} />
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    maxHeight: '92%',
  },
  dragArea: { alignItems: 'center', paddingVertical: 14 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorderLight },
  sheetBottomFill: {
    position: 'absolute',
    bottom: -300,
    left: 0,
    right: 0,
    height: 320,
    backgroundColor: Colors.surface,
  },
});
