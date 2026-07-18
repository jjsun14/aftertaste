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
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, getScoreColor } from '@/theme/colors';
import {
  occasionEmojis,
  eateryEmojis,
  determineTier,
  recalculateTierScores,
  computeComposite,
  ratingToScore,
  type OccasionTag,
  type EateryType,
  type RatingLevel,
  type Visit,
} from '@/data/mockData';
import BottomSheet from '@/components/shared/BottomSheet';
import { useMemories } from '@/context/DataContext';
import * as ImagePicker from 'expo-image-picker';
import { uploadPhoto } from '@/lib/uploadPhoto';
import { useAuth } from '@/context/AuthContext';
import RatingPills from '@/components/shared/RatingPills';
import { useFriends } from '@/context/FriendsContext';
import { getAvatarColor } from '@/theme/colors';
import PhotoCarousel from '@/components/shared/PhotoCarousel';
import TagChip from '@/components/shared/TagChip';
import ScoreBadge from '@/components/shared/ScoreBadge';

const OCCASION_TAGS: OccasionTag[] = [
  'Regular Meal', 'Date Night', 'Drinks', 'Friends Meal', 'Family Meal',
];
const EATERY_TYPES: EateryType[] = ['Restaurant', 'Fast Casual', 'Cafe', 'Bakery', 'Bar', 'Fine Dining', 'Dessert'];
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


// ── Main screen ──────────────────────────────────────────────────────────────
export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { memories, updateMemory, deleteMemory, addVisit, batchUpdateCompositeScores } = useMemories();
  const { friends } = useFriends();
  const { user, scorePreference } = useAuth();
  const memory = memories.find((m) => m.id === id);

  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState<'$' | '$$' | '$$$' | '$$$$'>('$');
  const [editEatery, setEditEatery] = useState<EateryType>('Restaurant');
  const [editOccasion, setEditOccasion] = useState<OccasionTag>('Regular Meal');
  const [editTaste, setEditTaste] = useState<RatingLevel>('Great');
  const [editVibe, setEditVibe] = useState<RatingLevel>('Great');
  const [editValue, setEditValue] = useState<RatingLevel>('Great');
  const [editEatAgain, setEditEatAgain] = useState(true);
  const [editWhatIHad, setEditWhatIHad] = useState('');
  const [editSquadNames, setEditSquadNames] = useState('');
  const [editSquadFriends, setEditSquadFriends] = useState<{ profileId: string; displayName: string }[]>([]);
  const [editDate, setEditDate] = useState('');
  const [editDateObj, setEditDateObj] = useState(new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editNote, setEditNote] = useState('');
  const [editNewPhotos, setEditNewPhotos] = useState<string[]>([]);
  const [editExistingPhotos, setEditExistingPhotos] = useState<string[]>([]);

  // Return visit state
  const [showReturnVisit, setShowReturnVisit] = useState(false);
  const [rvSaving, setRvSaving] = useState(false);
  const [rvDate, setRvDate] = useState('');
  const [rvDateObj, setRvDateObj] = useState(new Date());
  const [showRvDatePicker, setShowRvDatePicker] = useState(false);
  const [rvFoodItems, setRvFoodItems] = useState('');
  const [rvPhoto, setRvPhoto] = useState<string | null>(null);
  const [rvNote, setRvNote] = useState('');
  const [rvShowRatings, setRvShowRatings] = useState(false);
  const [rvTaste, setRvTaste] = useState<RatingLevel>('Great');
  const [rvVibe, setRvVibe] = useState<RatingLevel>('Great');
  const [rvValue, setRvValue] = useState<RatingLevel>('Great');
  const [showAllVisits, setShowAllVisits] = useState(false);

  if (!memory) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Memory not found</Text>
      </View>
    );
  }

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
  };

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

  const toggleEditFriend = (friend: { profileId: string; displayName: string }) => {
    setEditSquadFriends((prev) => {
      const exists = prev.some((f) => f.profileId === friend.profileId);
      if (exists) return prev.filter((f) => f.profileId !== friend.profileId);
      return [...prev, friend];
    });
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

    // Split existing squad into app friends (matched by profileId) vs free-text names
    const friendIds = new Set(friends.map((f) => f.profileId));
    const matchedFriends: { profileId: string; displayName: string }[] = [];
    const freeTextNames: string[] = [];
    memory.squad.forEach((s) => {
      const bareId = s.id?.replace('sq-friend-', '') ?? '';
      if (bareId && friendIds.has(bareId)) {
        matchedFriends.push({ profileId: bareId, displayName: s.name });
      } else {
        freeTextNames.push(s.name);
      }
    });
    setEditSquadFriends(matchedFriends);
    setEditSquadNames(freeTextNames.join(', '));

    setEditDate(memory.date);
    // Parse YYYY-MM-DD into a local Date object
    const [y, m, d] = memory.date.split('-').map(Number);
    setEditDateObj(new Date(y, m - 1, d));
    setShowEditDatePicker(false);
    setEditNote(memory.memoryNote);
    setEditExistingPhotos([...memory.photos]);
    setEditNewPhotos([]);
    setShowEdit(true);
  };

  const handleEditPickPhoto = () => {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
          if (!result.canceled && result.assets[0]) setEditNewPhotos((prev) => [...prev, result.assets[0].uri]);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
          if (!result.canceled && result.assets[0]) setEditNewPhotos((prev) => [...prev, result.assets[0].uri]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const originalTaste = ratingToScore(editTaste);
      const originalVibe = ratingToScore(editVibe);
      const originalValue = ratingToScore(editValue);

      // Recompute averaged scores if there are rated return visits
      const ratedVisits = (memory.visits ?? []).filter(
        (v) => v.tasteScore != null && v.vibeScore != null && v.valueScore != null
      );

      let tasteScore = originalTaste;
      let vibeScore = originalVibe;
      let valueScore = originalValue;

      if (ratedVisits.length > 0) {
        const totalCount = 1 + ratedVisits.length;
        tasteScore = Math.round((originalTaste + ratedVisits.reduce((s, v) => s + v.tasteScore!, 0)) / totalCount * 10) / 10;
        vibeScore = Math.round((originalVibe + ratedVisits.reduce((s, v) => s + v.vibeScore!, 0)) / totalCount * 10) / 10;
        valueScore = Math.round((originalValue + ratedVisits.reduce((s, v) => s + v.valueScore!, 0)) / totalCount * 10) / 10;
      }

      // Build squad from selected friends + free-text names
      const friendSquad = editSquadFriends.map((f) => ({
        id: `sq-friend-${f.profileId}`,
        name: f.displayName,
        avatar: '',
      }));
      const freeSquad = editSquadNames
        .split(',').map((n) => n.trim()).filter(Boolean)
        .map((name, i) => ({ id: `sq-${i}`, name, avatar: '' }));
      const squad = [...friendSquad, ...freeSquad];

      // Upload any new photos added during edit
      let uploadedUrls: string[] = [];
      if (editNewPhotos.length > 0 && user) {
        const results = await Promise.all(
          editNewPhotos.map((uri) => uploadPhoto(uri, user.id).catch(() => null))
        );
        uploadedUrls = results.filter((url): url is string => url !== null);
      }

      // Merge existing + newly uploaded photos
      const mergedPhotos = [...editExistingPhotos, ...uploadedUrls];
      const mergedPhotoDates = { ...(memory.photoDates ?? {}) };
      for (const url of uploadedUrls) {
        mergedPhotoDates[url] = editDate.trim();
      }

      // Detect what changed — used to decide whether to re-rank afterwards.
      const ratingsChanged =
        editTaste !== memory.tasteRating ||
        editVibe !== memory.vibeRating ||
        editValue !== memory.valueRating;
      const eateryChanged = editEatery !== memory.eateryType;

      const newComposite = ratingsChanged
        ? computeComposite(tasteScore, vibeScore, valueScore, scorePreference)
        : memory.compositeScore;

      const oldTier = determineTier(memory.compositeScore);
      const newTier = determineTier(newComposite);
      const groupChanged = eateryChanged || oldTier !== newTier;

      // If the memory is leaving its current peer group, redistribute the
      // remaining members so their scores fill the tier range evenly.
      if (groupChanged) {
        const oldPeers = memories
          .filter((m) =>
            m.id !== memory.id &&
            m.eateryType === memory.eateryType &&
            determineTier(m.compositeScore) === oldTier
          )
          .sort((a, b) => a.compositeScore - b.compositeScore);
        const peerUpdates = recalculateTierScores(
          oldPeers.map((p) => ({ id: p.id, tiedGroupId: p.tiedGroupId ?? null })),
          oldTier,
        );
        if (peerUpdates.length > 0) {
          await batchUpdateCompositeScores(peerUpdates);
        }
      }

      const updates: Partial<Omit<typeof memory, 'id'>> = {
        restaurantName: editName.trim(),
        date: editDate.trim(),
        priceTier: editPrice,
        eateryType: editEatery,
        cuisineType: memory.cuisineType,
        occasionTag: editOccasion,
        eatAgain: editEatAgain,
        whatIHad: editWhatIHad.split(',').map((s) => s.trim()).filter(Boolean),
        squad,
        memoryNote: editNote.trim(),
        photos: mergedPhotos,
        photoDates: mergedPhotoDates,
        // Rating fields and compositeScore are excluded when ratings changed —
        // they're written only after the user completes re-rank so that
        // abandoning re-rank leaves the old ranked score intact.
        ...(!ratingsChanged && {
          tasteRating: editTaste, vibeRating: editVibe, valueRating: editValue,
          tasteScore, vibeScore, valueScore,
        }),
      };

      await updateMemory(id!, updates);
      setShowEdit(false);

      if (ratingsChanged || eateryChanged) {
        router.push({
          pathname: '/rerank/[id]',
          params: {
            id: id!,
            preliminaryScore: String(newComposite),
            // Pending rating values — written to DB only when rerank completes.
            pendingTaste: editTaste,
            pendingVibe: editVibe,
            pendingValue: editValue,
            pendingTasteScore: String(tasteScore),
            pendingVibeScore: String(vibeScore),
            pendingValueScore: String(valueScore),
          },
        } as any);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  // ── Return visit helpers ──
  const openReturnVisit = () => {
    const now = new Date();
    setRvDate(now.toISOString().split('T')[0]);
    setRvDateObj(now);
    setShowRvDatePicker(false);
    setRvFoodItems('');
    setRvPhoto(null);
    setRvNote('');
    setRvShowRatings(false);
    setRvTaste('Great');
    setRvVibe('Great');
    setRvValue('Great');
    setShowReturnVisit(true);
  };

  const handleRvPickPhoto = () => {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
          if (!result.canceled && result.assets[0]) setRvPhoto(result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
          if (!result.canceled && result.assets[0]) setRvPhoto(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSaveReturnVisit = async () => {
    const items = rvFoodItems.split(',').map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) { Alert.alert('What did you have?', 'Add at least one food item.'); return; }
    setRvSaving(true);
    try {
      let photoUrl: string | undefined;
      if (rvPhoto && user) {
        try { photoUrl = await uploadPhoto(rvPhoto, user.id); } catch { photoUrl = undefined; }
      }
      const visit: Visit = {
        id: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: rvDate,
        whatIHad: items,
        photo: photoUrl,
        note: rvNote.trim() || undefined,
      };
      if (rvShowRatings) {
        visit.tasteRating = rvTaste;
        visit.vibeRating = rvVibe;
        visit.valueRating = rvValue;
        visit.tasteScore = ratingToScore(rvTaste);
        visit.vibeScore = ratingToScore(rvVibe);
        visit.valueScore = ratingToScore(rvValue);
        visit.compositeScore = computeComposite(visit.tasteScore, visit.vibeScore, visit.valueScore, scorePreference);
      }
      await addVisit(id!, visit);
      setShowReturnVisit(false);
      // A rated return visit averages new sub-scores into the memory and
      // overwrites the composite with the raw formula — drop into re-rank
      // so it gets placed against peers again.
      if (rvShowRatings) {
        router.push({ pathname: '/rerank/[id]', params: { id: id! } } as any);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save return visit.');
    } finally {
      setRvSaving(false);
    }
  };

  const totalVisits = 1 + (memory.visits?.length ?? 0);

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
          <PhotoCarousel
            photos={memory.photos}
            height={380}
            photoDates={memory.photoDates}
            mapFallback={
              memory.latitude && memory.longitude
                ? { latitude: memory.latitude, longitude: memory.longitude }
                : undefined
            }
          />
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
              <Text style={styles.subtitle}>{memory.priceTier} · {memory.cuisineType || memory.eateryType}</Text>
              <TouchableOpacity
                style={styles.infoRow}
                activeOpacity={0.7}
                onPress={() => router.navigate({ pathname: '/(tabs)', params: { focusMemory: memory.id } } as any)}
              >
                <Ionicons name="location-sharp" size={13} color={Colors.purple} />
                <Text style={styles.infoText} numberOfLines={1}>{memory.address}</Text>
              </TouchableOpacity>
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

          {/* Visit History — below the note */}
          {(memory.visits?.length ?? 0) > 0 && (() => {
            const allVisits = [
              { _idx: 0, id: 'original', date: memory.date, whatIHad: memory.whatIHad, note: memory.memoryNote, compositeScore: computeComposite(ratingToScore(memory.tasteRating), ratingToScore(memory.vibeRating), ratingToScore(memory.valueRating), scorePreference), isOriginal: true },
              ...(memory.visits ?? []).map((v, i) => ({ ...v, _idx: i + 1, isOriginal: false })),
            ].sort((a, b) => a.date > b.date ? -1 : a.date < b.date ? 1 : b._idx - a._idx);
            const recent3 = allVisits.slice(0, 3);
            return (
              <>
                <Text style={styles.sectionTitle}>RECENT VISITS · {totalVisits} total</Text>
                {recent3.map((v) => (
                  <View key={v.id} style={styles.compactVisit}>
                    <Text style={styles.compactVisitDate}>{formatDate(v.date)}</Text>
                    <Text style={styles.compactVisitFood} numberOfLines={1}>
                      {v.whatIHad.length > 0 ? v.whatIHad.join(', ') : v.isOriginal ? 'First visit' : 'Went again'}
                    </Text>
                    {v.compositeScore != null && (
                      <View style={styles.compactVisitScore}>
                        <Ionicons name="star" size={10} color={getScoreColor(v.compositeScore)} />
                        <Text style={[styles.compactVisitScoreText, { color: getScoreColor(v.compositeScore) }]}>{v.compositeScore.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                ))}

                {allVisits.length > 3 && (
                  <TouchableOpacity style={styles.viewAllBtn} onPress={() => setShowAllVisits(true)}>
                    <Text style={styles.viewAllBtnText}>View all {allVisits.length} visits</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
                <View style={styles.visitHistoryBottom} />
              </>
            );
          })()}

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

        {/* Date */}
        <Text style={styles.fieldLabel}>Date</Text>
        <TouchableOpacity
          style={styles.editDateRow}
          onPress={() => setShowEditDatePicker(!showEditDatePicker)}
          activeOpacity={0.7}
        >
          <View style={styles.editDateIconWrap}>
            <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
          </View>
          <Text style={styles.editDateText}>
            {editDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          {editDate === new Date().toISOString().split('T')[0] && (
            <View style={styles.editTodayBadge}>
              <Text style={styles.editTodayBadgeText}>Today</Text>
            </View>
          )}
          <Ionicons
            name={showEditDatePicker ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Colors.textMuted}
          />
        </TouchableOpacity>
        {showEditDatePicker && (
          <View style={styles.editDatePickerWrap}>
            <DateTimePicker
              value={editDateObj}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              themeVariant="dark"
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                if (date) {
                  setEditDateObj(date);
                  setEditDate(date.toISOString().split('T')[0]);
                }
                if (Platform.OS === 'android') setShowEditDatePicker(false);
              }}
            />
          </View>
        )}

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

        {/* Squad — friend picker + free text */}
        <Text style={styles.fieldLabel}>The Squad</Text>
        {friends.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.friendChipScroll}>
            {friends.map((friend) => {
              const selected = editSquadFriends.some((f) => f.profileId === friend.profileId);
              const avatarBg = getAvatarColor(friend.profileId);
              const initials = friend.displayName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
              return (
                <TouchableOpacity
                  key={friend.profileId}
                  style={[styles.friendChip, selected && styles.friendChipSelected]}
                  onPress={() => toggleEditFriend({ profileId: friend.profileId, displayName: friend.displayName })}
                >
                  <View style={[styles.friendChipAvatar, { backgroundColor: avatarBg }]}>
                    <Text style={styles.friendChipInitials}>{initials}</Text>
                  </View>
                  <Text style={[styles.friendChipName, selected && styles.friendChipNameSelected]}>
                    {friend.displayName.split(' ')[0]}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        <View style={styles.inputWrap}>
          <TextInput style={styles.input} value={editSquadNames} onChangeText={setEditSquadNames}
            placeholder={friends.length > 0 ? 'Anyone else? Type names...' : 'Keshav, Lulu, Marcus...'}
            placeholderTextColor={Colors.textMuted} />
        </View>

        {/* Note */}
        <Text style={styles.fieldLabel}>Memory Note</Text>
        <View style={[styles.inputWrap, { height: 100, alignItems: 'flex-start', paddingVertical: 12 }]}>
          <TextInput style={[styles.input, { height: '100%', textAlignVertical: 'top' }]}
            value={editNote} onChangeText={setEditNote}
            placeholder="Write about this memory..." placeholderTextColor={Colors.textMuted} multiline />
        </View>

        {/* Photos */}
        <Text style={styles.fieldLabel}>Photos</Text>
        <View style={styles.editPhotoRow}>
          {editExistingPhotos.map((uri, i) => (
            <TouchableOpacity
              key={`existing-${i}`}
              onPress={() => setEditExistingPhotos((prev) => prev.filter((_, idx) => idx !== i))}
              style={[styles.rvPhotoPreview, { marginBottom: 0 }]}
            >
              <Image source={{ uri }} style={styles.rvPhotoImage} contentFit="cover" />
              <View style={styles.rvPhotoRemove}>
                <Ionicons name="close" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>
          ))}
          {editNewPhotos.map((uri, i) => (
            <TouchableOpacity
              key={`new-${i}`}
              onPress={() => setEditNewPhotos((prev) => prev.filter((_, idx) => idx !== i))}
              style={[styles.rvPhotoPreview, { marginBottom: 0 }]}
            >
              <Image source={{ uri }} style={styles.rvPhotoImage} contentFit="cover" />
              <View style={styles.rvPhotoRemove}>
                <Ionicons name="close" size={14} color="#FFF" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.rvPhotoBtn} onPress={handleEditPickPhoto}>
          <Ionicons name="camera-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.rvPhotoBtnText}>Add photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={saving}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </BottomSheet>

      {/* Return Visit Sheet */}
      <BottomSheet
        visible={showReturnVisit}
        onClose={() => setShowReturnVisit(false)}
        paddingBottom={insets.bottom + 24}
      >
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>Return Visit</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>{memory.restaurantName}</Text>
          </View>
          <View style={styles.rvVisitBadge}>
            <Ionicons name="refresh" size={12} color={Colors.primary} />
            <Text style={styles.rvVisitBadgeText}>Visit #{totalVisits + 1}</Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Date</Text>
        <TouchableOpacity
          style={styles.editDateRow}
          onPress={() => setShowRvDatePicker(!showRvDatePicker)}
          activeOpacity={0.7}
        >
          <View style={styles.editDateIconWrap}>
            <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
          </View>
          <Text style={styles.editDateText}>
            {rvDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          {rvDate === new Date().toISOString().split('T')[0] && (
            <View style={styles.editTodayBadge}>
              <Text style={styles.editTodayBadgeText}>Today</Text>
            </View>
          )}
          <Ionicons
            name={showRvDatePicker ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={Colors.textMuted}
          />
        </TouchableOpacity>
        {showRvDatePicker && (
          <View style={styles.editDatePickerWrap}>
            <DateTimePicker
              value={rvDateObj}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              themeVariant="dark"
              onChange={(_event: DateTimePickerEvent, date?: Date) => {
                if (date) {
                  setRvDateObj(date);
                  setRvDate(date.toISOString().split('T')[0]);
                }
                if (Platform.OS === 'android') setShowRvDatePicker(false);
              }}
            />
          </View>
        )}

        <Text style={styles.fieldLabel}>What I Had (comma separated)</Text>
        <View style={styles.inputWrap}>
          <TextInput style={styles.input} value={rvFoodItems} onChangeText={setRvFoodItems}
            placeholder="Burrito Bowl, Chips & Guac..." placeholderTextColor={Colors.textMuted} />
        </View>

        <Text style={styles.fieldLabel}>Photo (optional)</Text>
        {rvPhoto ? (
          <TouchableOpacity onPress={() => setRvPhoto(null)} style={styles.rvPhotoPreview}>
            <Image source={{ uri: rvPhoto }} style={styles.rvPhotoImage} contentFit="cover" />
            <View style={styles.rvPhotoRemove}>
              <Ionicons name="close" size={14} color="#FFF" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.rvPhotoBtn} onPress={handleRvPickPhoto}>
            <Ionicons name="camera-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.rvPhotoBtnText}>Add photo</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.fieldLabel}>Quick Note (optional)</Text>
        <View style={[styles.inputWrap, { height: 80, alignItems: 'flex-start', paddingVertical: 12 }]}>
          <TextInput style={[styles.input, { height: '100%', textAlignVertical: 'top' }]}
            value={rvNote} onChangeText={setRvNote}
            placeholder="How was it this time?" placeholderTextColor={Colors.textMuted} multiline />
        </View>

        <TouchableOpacity style={styles.rvRateToggle} onPress={() => setRvShowRatings(!rvShowRatings)}>
          <Ionicons name={rvShowRatings ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.primary} />
          <Text style={styles.rvRateToggleText}>{rvShowRatings ? 'Hide ratings' : 'Rate this visit'}</Text>
        </TouchableOpacity>

        {rvShowRatings && (
          <View style={{ marginBottom: 8 }}>
            <RatingPills label="Taste" value={rvTaste} onChange={setRvTaste} />
            <RatingPills label="Vibe" value={rvVibe} onChange={setRvVibe} />
            <RatingPills label="Value" value={rvValue} onChange={setRvValue} />
          </View>
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveReturnVisit} disabled={rvSaving}>
          {rvSaving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save Return Visit</Text>}
        </TouchableOpacity>
      </BottomSheet>

      {/* View All Visits Sheet */}
      <BottomSheet
        visible={showAllVisits}
        onClose={() => setShowAllVisits(false)}
        paddingBottom={insets.bottom + 24}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>All Visits ({totalVisits})</Text>
          <TouchableOpacity onPress={() => setShowAllVisits(false)}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* All visits sorted newest first */}
        {(() => {
          const origScore = computeComposite(ratingToScore(memory.tasteRating), ratingToScore(memory.vibeRating), ratingToScore(memory.valueRating), scorePreference);
          const allItems: { _idx: number; id: string; date: string; whatIHad: string[]; note?: string; compositeScore?: number; isOriginal: boolean }[] = [
            { _idx: 0, id: 'original', date: memory.date, whatIHad: memory.whatIHad, note: memory.memoryNote, compositeScore: origScore, isOriginal: true },
            ...(memory.visits ?? []).map((v, i) => ({ _idx: i + 1, id: v.id, date: v.date, whatIHad: v.whatIHad, note: v.note, compositeScore: v.compositeScore, isOriginal: false })),
          ].sort((a, b) => a.date > b.date ? -1 : a.date < b.date ? 1 : b._idx - a._idx);
          return allItems.map((v) => (
            <View key={v.id} style={styles.allVisitItem}>
              <View style={[styles.allVisitDot, !v.isOriginal && styles.allVisitDotReturn]} />
              <View style={styles.allVisitContent}>
                <Text style={styles.allVisitDate}>{formatDate(v.date)}</Text>
                <Text style={styles.allVisitFood}>
                  {v.whatIHad.length > 0 ? v.whatIHad.join(', ') : v.isOriginal ? 'First visit' : 'Went again'}
                </Text>
                {v.note ? <Text style={styles.allVisitNote} numberOfLines={2}>{v.note}</Text> : null}
              </View>
              {v.compositeScore != null && (
                <View style={styles.allVisitScoreWrap}>
                  <Ionicons name="star" size={10} color={getScoreColor(v.compositeScore)} />
                  <Text style={[styles.allVisitScore, { color: getScoreColor(v.compositeScore) }]}>{v.compositeScore.toFixed(1)}</Text>
                </View>
              )}
            </View>
          ));
        })()}
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
  subtitle: { color: Colors.textSecondary, fontSize: 14, marginBottom: 6 },
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
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceLight, borderRadius: 12, paddingHorizontal: 14, height: 48, marginBottom: 16, borderWidth: 1, borderColor: Colors.surfaceBorderLight },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  chipSelectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chipOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.surfaceBorderLight, backgroundColor: Colors.surfaceLight },
  chipOptionText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  ratingGroup: { marginBottom: 16 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.surfaceBorderLight, backgroundColor: Colors.surfaceLight },
  ratingBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8 },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },

  // Friend picker chips in edit sheet
  friendChipScroll: { marginBottom: 10 },
  friendChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.surfaceBorderLight,
    backgroundColor: Colors.surfaceLight, marginRight: 8,
  },
  friendChipSelected: {
    borderColor: Colors.primary, backgroundColor: Colors.primaryBg,
  },
  friendChipAvatar: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  friendChipInitials: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  friendChipName: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  friendChipNameSelected: { color: Colors.primary, fontWeight: '600' },

  // Compact Visit List (recent 3)
  compactVisit: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorderLight,
  },
  compactVisitDate: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', width: 80 },
  compactVisitFood: { flex: 1, color: Colors.textPrimary, fontSize: 13 },
  compactVisitScore: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  compactVisitScoreText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },

  // View All Button
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 12, marginBottom: 8,
  },
  viewAllBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  visitHistoryBottom: { marginBottom: 32 },

  // View All Visits Sheet
  allVisitItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorderLight,
  },
  allVisitDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.textSecondary, marginTop: 5,
  },
  allVisitDotReturn: { backgroundColor: Colors.textMuted },
  allVisitContent: { flex: 1 },
  allVisitDate: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  allVisitFood: { color: Colors.textSecondary, fontSize: 13 },
  allVisitNote: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  allVisitScoreWrap: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  allVisitScore: { fontSize: 13, fontWeight: '700' },

  // Return Visit Sheet extras
  rvVisitBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: Colors.primaryBg,
  },
  rvVisitBadgeText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
  rvPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.surfaceLight, borderWidth: 1, borderColor: Colors.surfaceBorderLight,
    borderRadius: 12, paddingVertical: 14, marginBottom: 16,
  },
  rvPhotoBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },
  editPhotoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  rvPhotoPreview: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', marginBottom: 16 },
  rvPhotoImage: { width: 64, height: 64 },
  rvPhotoRemove: {
    position: 'absolute', top: 3, right: 3,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  rvRateToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, paddingVertical: 4 },
  rvRateToggleText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },

  // Date picker (edit + return visit)
  editDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 10,
  },
  editDateIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editDateText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  editTodayBadge: {
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  editTodayBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  editDatePickerWrap: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorderLight,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
});
