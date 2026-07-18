/**
 * Bottom sheet with swipe-down-anywhere dismissal.
 *
 * Built on react-native-gesture-handler because with the RN new
 * architecture (newArchEnabled), a JS PanResponder can never steal a
 * drag from a native ScrollView — the ScrollView's native recognizer
 * claims the touch first. RNGH arbitrates at the native level: the pan
 * runs simultaneously with the scroll, and we apply it only while the
 * scroll sits at the top (bounces are off, so the content can't fight
 * the sheet for the same downward drag).
 */
import React, { useMemo, useRef } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StyleSheet,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
  ScrollView,
} from 'react-native-gesture-handler';
import { Colors } from '@/theme/colors';

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
  const sheetY = useRef(new Animated.Value(0)).current;
  const scrollOffset = useRef(0);
  // translationY at the moment the sheet-drag actually engages, so a
  // scroll-up that continues into a pull-down doesn't make the sheet jump
  const dragBase = useRef<number | null>(null);

  const dismiss = () => {
    Animated.timing(sheetY, { toValue: 800, duration: 200, useNativeDriver: true }).start(() => {
      sheetY.setValue(0);
      onClose();
    });
  };
  const settle = () => {
    Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start();
  };

  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .simultaneousWithExternalGesture(scrollGesture)
        .onChange((e) => {
          if (scrollOffset.current <= 0) {
            if (dragBase.current === null) dragBase.current = e.translationY;
            const dy = e.translationY - dragBase.current;
            if (dy > 0) sheetY.setValue(dy);
            else sheetY.setValue(0);
          } else {
            dragBase.current = null;
            sheetY.setValue(0);
          }
        })
        .onEnd((e) => {
          const dy = dragBase.current !== null ? e.translationY - dragBase.current : 0;
          dragBase.current = null;
          if (dy > 80 || (e.velocityY > 500 && dy > 20)) dismiss();
          else settle();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollGesture],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* RNGH needs its own root inside a Modal (Modals are separate
          native windows — gestures are dead without this). */}
      <GestureHandlerRootView style={styles.root}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
              <View style={styles.dragArea}>
                <View style={styles.sheetHandle} />
              </View>
              <GestureDetector gesture={scrollGesture}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom }}
                  bounces={false}
                  onScroll={(e) => {
                    scrollOffset.current = e.nativeEvent.contentOffset.y;
                  }}
                  scrollEventThrottle={16}
                >
                  {children}
                </ScrollView>
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
