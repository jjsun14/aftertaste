import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Animated,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme/colors';
import {
  occasionEmojis,
  eateryEmojis,
  type OccasionTag,
  type EateryType,
  type RatingLevel,
} from '@/data/mockData';
import { useMemories } from '@/context/DataContext';
import PhotoCarousel from '@/components/shared/PhotoCarousel';
import TagChip from '@/components/shared/TagChip';
import ScoreBadge from '@/components/shared/ScoreBadge';

const OCCASION_TAGS: OccasionTag[] = [
  'Quick Bite', 'Date Night', 'Group Hangout', 'Family Meal', 'Solo Dining', 'Special Moment',
];
const EATERY_TYPES: EateryType[] = ['Restaurant', 'Bar', 'Cafe', 'Bakery', 'Dessert'];
const PRICE_TIERS = ['$', '$$', '$$$', '$$$$'] as const;
const RATINGS: RatingLevel[] = ['Great', 'Okay', 'Poor'];

const RATING_COLOR: Record<RatingLevel, string> = {
  Great: Colors.ratingGreat, Okay: Colors.ratingOkay, Poor: Colors.ratingPoor,
};
const RATING_BG: Record<RatingLevel, string> = {
  Great: 'rgba(1,217,174,0.12)', Okay: 'rgba(245,197,24,0.12)', Poor: 'rgba(239,68,68,0.12)',
};
const PRICE_COLOR: Record<string, string> = {
  '$': Colors.ratingGreat, '$$': Colors.ratingOkay, '$$$': '#F97316', '$$$$': Colors.ratingPoor,
};
const PRICE_BG: Record<string, string> = {
  '$': 'rgba(1,217,174,0.12)', '$$': 'rgba(245,197,24,0.12)',
  '$$$': 'rgba(249,115,22,0.12)', '$$$$': 'rgba(239,68,68,0.12)',
};

function ratingToScore(r: RatingLevel) {
  if (r === 'Great') return 8.5;
  if (r === 'Okay') return 6.0;
  return 3.5;
}
function computeComposite(t: number, vi: number, va: number) {
  return Math.round((t * 0.5 + vi * 0.25 + va * 0.25) * 10) / 10;
}

// ── Draggable bottom sheet ───────────────────────────────────────────────────
// PanResponder lives ONLY on the handle View (above the ScrollView),
// so it never competes with the inner scroll — same pattern as the filter sheet.
function BottomSheet({
  visible, onClose, children, paddingBottom,
}: {
  visible: boolean; onClose: () => void;
  children: React.ReactNode; paddingBottom: number;
}) {
  const sheetY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture once the finger moves clearly downward on the handle
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) sheetY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(sheetY, { toValue: 800, duration: 200, useNativeDriver: true })
            .start(() => { sheetY.setValue(0); onClose(); });
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
          {/* Handle — PanResponder is ONLY here, above the ScrollView */}
          <View {...panResponder.panHandlers} style={styles.dragArea}>
            <View style={styles.sheetHandle} />
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom }}
          >
            {children}
          </ScrollView>
          {/* Solid colour block that fills the bounce-zone below the sheet */}
          <View style={styles.sheetBottomFill} />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { memories, updateMemory, deleteMemory } = useMemories();
  const memory = memories.find((m) => m.id === id);

  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState<'$' | '$$' | '$$$' | '$$$$'>('$');
  const [editEatery, setEditEatery] = useState<EateryType>('Restaurant');
  const [editOccasion, setEditOccasion] = useState<OccasionTag>('Quick Bite');
  const [editTaste, setEditTaste] = useState<RatingLevel>('Great');
  const [editVibe, setEditVibe] = useState<RatingLevel>('Great');
  const [editValue, setEditValue] = useState<RatingLevel>('Great');
  const [editEatAgain, setEditEatAgain] = useState(true);
  const [editWhatIHad, setEditWhatIHad] = useState('');
  const [editSquad, setEditSquad] = useState('');
  const [editNote, setEditNote] = useState('');

  if (!memory) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Memory not found</Text>
      </View>
    );
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });

  const handleDelete = () => {
    Alert.alert(
      'Delete Memory',
      `Are you sure you want to delete your memory of ${memory?.restaurantName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMemory(id!);
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Could not delete memory.');
            }
          },
        },
      ]
    );
  };

  const openEdit = () => {
    setEditName(memory.restaurantName);
    setEditPrice(memory.priceTier);
    setEditEatery(memory.eateryType);
    setEditOccasion(memory.occasionTag);
    setEditTaste(memory.tasteRating);
    setEditVibe(memory.vibeRating);
    setEditValue(memory.valueRating);
    setEditEatAgain(memory.eatAgain);
    setEditWhatIHad(memory.whatIHad.join(', '));
    setEditSquad(memory.squad.map((s) => s.name).join(', '));
    setEditNote(memory.memoryNote);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const tasteScore = ratingToScore(editTaste);
      const vibeScore = ratingToScore(editVibe);
      const valueScore = ratingToScore(editValue);
      const squad = editSquad
        .split(',').map((n) => n.trim()).filter(Boolean)
        .map((name, i) => ({ id: `sq-${i}`, name, avatar: '' }));
      await updateMemory(id!, {
        restaurantName: editName.trim(),
        priceTier: editPrice,
        eateryType: editEatery,
        cuisineType: editEatery,
        occasionTag: editOccasion,
        tasteRating: editTaste, vibeRating: editVibe, valueRating: editValue,
        tasteScore, vibeScore, valueScore,
        compositeScore: computeComposite(tasteScore, vibeScore, valueScore),
        eatAgain: editEatAgain,
        whatIHad: editWhatIHad.split(',').map((s) => s.trim()).filter(Boolean),
        squad,
        memoryNote: editNote.trim(),
      });
      setShowEdit(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const RatingPicker = ({ label, value, onChange }: {
    label: string; value: RatingLevel; onChange: (v: RatingLevel) => void;
  }) => (
    <View style={styles.ratingGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.ratingRow}>
        {RATINGS.map((r) => {
          const active = value === r;
          return (
            <TouchableOpacity
              key={r}
              style={[styles.ratingBtn, active && { borderColor: RATING_COLOR[r], backgroundColor: RATING_BG[r] }]}
              onPress={() => onChange(r)}
            >
              <Text style={[styles.ratingBtnText, active && { color: RATING_COLOR[r], fontWeight: '700' }]}>
                {r}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View>
          <PhotoCarousel photos={memory.photos} height={380} />
          <TouchableOpacity style={[styles.backBtn, { top: insets.top + 8 }]} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.editBtn, { top: insets.top + 8 }]} onPress={openEdit}>
            <Ionicons name="pencil" size={16} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.deleteBtn, { top: insets.top + 8 }]} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.name}>{memory.restaurantName}</Text>
              <Text style={styles.subtitle}>{memory.priceTier} | {memory.eateryType}</Text>
              <View style={styles.infoRow}>
                <Ionicons name="location-sharp" size={13} color={Colors.purple} />
                <Text style={styles.infoText}>{memory.address}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
                <Text style={styles.infoText}>{formatDate(memory.date)}</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.subScores}>
                {[{ emoji: '👅', score: memory.tasteScore }, { emoji: '✨', score: memory.vibeScore }, { emoji: '💰', score: memory.valueScore }]
                  .map(({ emoji, score }) => (
                    <View key={emoji} style={styles.subScoreRow}>
                      <Text style={styles.subScoreEmoji}>{emoji}</Text>
                      <Text style={styles.subScoreText}>{score.toFixed(1)}</Text>
                    </View>
                  ))}
              </View>
              <ScoreBadge score={memory.compositeScore} size="large" />
            </View>
          </View>

          <Text style={styles.sectionTitle}>WHAT I HAD</Text>
          <View style={styles.chipRow}>
            {memory.whatIHad.map((item) => <TagChip key={item} label={item} variant="food" />)}
          </View>

          <Text style={styles.sectionTitle}>TAGS</Text>
          <View style={styles.chipRow}>
            <TagChip label={memory.eateryType} emoji={eateryEmojis[memory.eateryType]} variant="eatery" />
            <TagChip label={memory.occasionTag} emoji={occasionEmojis[memory.occasionTag]} variant="occasion" />
          </View>

          <View style={styles.eatAgainRow}>
            <Text style={styles.sectionTitle}>EAT AGAIN?</Text>
            <View style={[styles.eatAgainBadge, { backgroundColor: memory.eatAgain ? Colors.primaryBg : 'rgba(239,68,68,0.15)' }]}>
              <Ionicons name={memory.eatAgain ? 'checkmark-circle' : 'close-circle'} size={16}
                color={memory.eatAgain ? Colors.primary : Colors.ratingPoor} />
              <Text style={[styles.eatAgainText, { color: memory.eatAgain ? Colors.primary : Colors.ratingPoor }]}>
                {memory.eatAgain ? 'Yes!' : 'Nah'}
              </Text>
            </View>
          </View>

          {memory.squad.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>THE SQUAD</Text>
              <View style={styles.squadRow}>
                <View style={styles.avatarStack}>
                  {memory.squad.slice(0, 3).map((member, i) => (
                    member.avatar ? (
                      <Image key={member.id} source={{ uri: member.avatar }}
                        style={[styles.avatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i }]} />
                    ) : (
                      <View key={member.id}
                        style={[styles.avatar, styles.avatarInitial, { marginLeft: i > 0 ? -10 : 0, zIndex: 3 - i }]}>
                        <Text style={styles.avatarInitialText}>{member.name[0]?.toUpperCase()}</Text>
                      </View>
                    )
                  ))}
                  {memory.squad.length > 3 && (
                    <View style={[styles.avatar, styles.avatarMore, { marginLeft: -10 }]}>
                      <Text style={styles.avatarMoreText}>+{memory.squad.length - 3}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.squadNames}>
                  {memory.squad.length <= 2
                    ? memory.squad.map((m) => m.name).join(' & ')
                    : `${memory.squad[0].name}, ${memory.squad[1].name} & ${memory.squad.length - 2} others`}
                </Text>
              </View>
            </>
          )}

          <View style={styles.noteCard}>
            <Text style={styles.noteText}>
              {memory.memoryNote || <Text style={{ color: Colors.textMuted }}>No note yet — tap Edit to add one.</Text>}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Edit Sheet */}
      <BottomSheet
        visible={showEdit}
        onClose={() => setShowEdit(false)}
        paddingBottom={insets.bottom + 24}
      >
        {/* Header lives inside the scrollable area but at the top */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Edit Memory</Text>
          <TouchableOpacity onPress={() => setShowEdit(false)}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Restaurant name */}
        <Text style={styles.fieldLabel}>Restaurant Name</Text>
        <View style={styles.inputWrap}>
          <TextInput style={styles.input} value={editName} onChangeText={setEditName}
            placeholderTextColor={Colors.textMuted} autoCapitalize="words" />
        </View>

        {/* Price */}
        <Text style={styles.fieldLabel}>Price</Text>
        <View style={styles.chipSelectRow}>
          {PRICE_TIERS.map((p) => {
            const active = editPrice === p;
            return (
              <TouchableOpacity key={p}
                style={[styles.chipOption, active && { borderColor: PRICE_COLOR[p], backgroundColor: PRICE_BG[p] }]}
                onPress={() => setEditPrice(p)}>
                <Text style={[styles.chipOptionText, active && { color: PRICE_COLOR[p], fontWeight: '700' }]}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Eatery type — blue */}
        <Text style={styles.fieldLabel}>Type</Text>
        <View style={styles.chipSelectRow}>
          {EATERY_TYPES.map((e) => {
            const active = editEatery === e;
            return (
              <TouchableOpacity key={e}
                style={[styles.chipOption, active && { borderColor: Colors.tagEatery, backgroundColor: Colors.tagEateryBg }]}
                onPress={() => setEditEatery(e)}>
                <Text style={[styles.chipOptionText, active && { color: Colors.tagEatery, fontWeight: '600' }]}>
                  {eateryEmojis[e]} {e}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Occasion — purple */}
        <Text style={styles.fieldLabel}>Occasion</Text>
        <View style={styles.chipSelectRow}>
          {OCCASION_TAGS.map((o) => {
            const active = editOccasion === o;
            return (
              <TouchableOpacity key={o}
                style={[styles.chipOption, active && { borderColor: Colors.tagOccasion, backgroundColor: Colors.tagOccasionBg }]}
                onPress={() => setEditOccasion(o)}>
                <Text style={[styles.chipOptionText, active && { color: Colors.tagOccasion, fontWeight: '600' }]}>
                  {occasionEmojis[o]} {o}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Ratings */}
        <RatingPicker label="👅 Taste" value={editTaste} onChange={setEditTaste} />
        <RatingPicker label="✨ Vibe" value={editVibe} onChange={setEditVibe} />
        <RatingPicker label="💰 Value" value={editValue} onChange={setEditValue} />

        {/* Eat Again */}
        <Text style={styles.fieldLabel}>Eat Again?</Text>
        <View style={styles.chipSelectRow}>
          {([true, false] as const).map((v) => {
            const active = editEatAgain === v;
            const color = v ? Colors.ratingGreat : Colors.ratingPoor;
            const bg = v ? 'rgba(1,217,174,0.12)' : 'rgba(239,68,68,0.12)';
            return (
              <TouchableOpacity key={String(v)}
                style={[styles.chipOption, active && { borderColor: color, backgroundColor: bg }]}
                onPress={() => setEditEatAgain(v)}>
                <Text style={[styles.chipOptionText, active && { color, fontWeight: '700' }]}>
                  {v ? 'Yes!' : 'Nah'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* What I Had */}
        <Text style={styles.fieldLabel}>What I Had (comma separated)</Text>
        <View style={styles.inputWrap}>
          <TextInput style={styles.input} value={editWhatIHad} onChangeText={setEditWhatIHad}
            placeholder="Burger, Fries, Shake" placeholderTextColor={Colors.textMuted} />
        </View>

        {/* Squad */}
        <Text style={styles.fieldLabel}>The Squad (comma separated)</Text>
        <View style={styles.inputWrap}>
          <TextInput style={styles.input} value={editSquad} onChangeText={setEditSquad}
            placeholder="Keshav, Lulu" placeholderTextColor={Colors.textMuted} />
        </View>

        {/* Note */}
        <Text style={styles.fieldLabel}>Memory Note</Text>
        <View style={[styles.inputWrap, { height: 100, alignItems: 'flex-start', paddingVertical: 12 }]}>
          <TextInput style={[styles.input, { height: '100%', textAlignVertical: 'top' }]}
            value={editNote} onChangeText={setEditNote}
            placeholder="Write about this memory..." placeholderTextColor={Colors.textMuted} multiline />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  errorText: { color: Colors.textSecondary, fontSize: 16, textAlign: 'center', marginTop: 100 },
  backBtn: {
    position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  editBtn: {
    position: 'absolute', right: 60, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: {
    position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  headerLeft: { flex: 1, marginRight: 16 },
  name: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: Colors.textSecondary, fontSize: 14, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoText: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subScores: { gap: 4 },
  subScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subScoreEmoji: { fontSize: 12 },
  subScoreText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  sectionTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 },
  eatAgainRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  eatAgainBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  eatAgainText: { fontSize: 13, fontWeight: '600' },
  squadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  avatarStack: { flexDirection: 'row' },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.background },
  avatarInitial: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitialText: { color: '#000', fontSize: 12, fontWeight: '700' },
  avatarMore: { backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  avatarMoreText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '600' },
  squadNames: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  noteCard: { borderWidth: 1, borderColor: Colors.surfaceBorderLight, borderRadius: 12, padding: 16, marginBottom: 24 },
  noteText: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },

  // Sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20,
    maxHeight: '92%',
  },
  dragArea: { alignItems: 'center', paddingVertical: 14 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceBorderLight },
  // Fills the iOS bounce zone below the sheet so background never shows through
  sheetBottomFill: {
    position: 'absolute',
    bottom: -300,
    left: 0,
    right: 0,
    height: 320,
    backgroundColor: Colors.surface,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceLight, borderRadius: 12, paddingHorizontal: 14, height: 48, marginBottom: 16 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  chipSelectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chipOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.surfaceBorder },
  chipOptionText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  ratingGroup: { marginBottom: 16 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.surfaceBorder },
  ratingBtnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8 },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
