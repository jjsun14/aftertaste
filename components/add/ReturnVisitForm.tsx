import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/theme/colors';
import { getScoreColor } from '@/theme/colors';
import RatingPills from '@/components/shared/RatingPills';
import type { SearchResult, Memory, RatingLevel, Visit } from '@/data/mockData';
import { ratingToScore, computeComposite } from '@/data/mockData';
import { useAuth } from '@/context/AuthContext';

interface ReturnVisitFormProps {
  restaurant: SearchResult;
  existingMemory: Memory;
  onSave: (visit: Omit<Visit, 'id'>) => void;
  onCancel: () => void;
  saving: boolean;
}

export default function ReturnVisitForm({
  restaurant,
  existingMemory,
  onSave,
  onCancel,
  saving,
}: ReturnVisitFormProps) {
  const { scorePreference } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [foodItems, setFoodItems] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showRatings, setShowRatings] = useState(false);
  const [taste, setTaste] = useState<RatingLevel>('Great');
  const [vibe, setVibe] = useState<RatingLevel>('Great');
  const [value, setValue] = useState<RatingLevel>('Great');

  const visitCount = 1 + (existingMemory.visits?.length ?? 0);

  const handlePickPhoto = () => {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera access is required.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setPhoto(result.assets[0].uri);
          }
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Photo library access is required.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setPhoto(result.assets[0].uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSave = () => {
    const items = foodItems.split(',').map((s) => s.trim()).filter(Boolean);

    const visit: Omit<Visit, 'id'> = {
      date,
      whatIHad: items,
      photo: photo ?? undefined,
      note: note.trim() || undefined,
    };

    if (showRatings) {
      visit.tasteRating = taste;
      visit.vibeRating = vibe;
      visit.valueRating = value;
      visit.tasteScore = ratingToScore(taste);
      visit.vibeScore = ratingToScore(vibe);
      visit.valueScore = ratingToScore(value);
      visit.compositeScore = computeComposite(
        visit.tasteScore,
        visit.vibeScore,
        visit.valueScore,
        scorePreference,
      );
    }

    onSave(visit);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Return Visit</Text>
            <Text style={styles.headerSub}>{restaurant.name}</Text>
          </View>
          <View style={styles.visitBadge}>
            <Ionicons name="refresh" size={12} color={Colors.primary} />
            <Text style={styles.visitBadgeText}>Visit #{visitCount + 1}</Text>
          </View>
        </View>

        {/* Previous visit info */}
        <View style={styles.prevVisitCard}>
          <Text style={styles.prevVisitLabel}>Last visit</Text>
          <Text style={styles.prevVisitDate}>{existingMemory.date}</Text>
          <Text style={styles.prevVisitItems}>
            {existingMemory.whatIHad.join(', ')}
          </Text>
          <View style={styles.prevScoreRow}>
            <Text style={[styles.prevScore, { color: getScoreColor(existingMemory.compositeScore) }]}>
              {existingMemory.compositeScore.toFixed(1)}
            </Text>
            <Text style={styles.prevScoreLabel}>current score</Text>
          </View>
        </View>

        {/* Date */}
        <Text style={styles.sectionLabel}>DATE</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* What I Had */}
        <Text style={styles.sectionLabel}>WHAT I HAD</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={foodItems}
            onChangeText={setFoodItems}
            placeholder="Burrito Bowl, Chips & Guac..."
            placeholderTextColor={Colors.textMuted}
            autoCorrect={false}
          />
        </View>

        {/* Photo */}
        <Text style={styles.sectionLabel}>PHOTO (OPTIONAL)</Text>
        {photo ? (
          <TouchableOpacity onPress={() => setPhoto(null)} style={styles.photoPreview}>
            <Image source={{ uri: photo }} style={styles.photoImage} contentFit="cover" />
            <View style={styles.photoRemove}>
              <Ionicons name="close" size={16} color="#FFF" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto}>
            <Ionicons name="camera-outline" size={22} color={Colors.textSecondary} />
            <Text style={styles.photoBtnText}>Add photo</Text>
          </TouchableOpacity>
        )}

        {/* Note */}
        <Text style={styles.sectionLabel}>QUICK NOTE (OPTIONAL)</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="How was it this time?"
            placeholderTextColor={Colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Rate this visit toggle */}
        <TouchableOpacity
          style={styles.rateToggle}
          onPress={() => setShowRatings(!showRatings)}
        >
          <Ionicons
            name={showRatings ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.rateToggleText}>
            {showRatings ? 'Hide ratings' : 'Rate this visit'}
          </Text>
        </TouchableOpacity>

        {showRatings && (
          <View style={styles.ratingsSection}>
            <RatingPills label="Taste" value={taste} onChange={setTaste} />
            <RatingPills label="Vibe" value={vibe} onChange={setVibe} />
            <RatingPills label="Value" value={value} onChange={setValue} />
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>Save Return Visit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  headerInfo: { flex: 1 },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSub: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  visitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.primaryBg,
  },
  visitBadgeText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  prevVisitCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  prevVisitLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  prevVisitDate: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  prevVisitItems: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 10,
  },
  prevScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  prevScore: {
    fontSize: 20,
    fontWeight: '800',
  },
  prevScoreLabel: {
    color: Colors.textMuted,
    fontSize: 12,
  },

  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  inputWrap: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  input: {
    color: Colors.textPrimary,
    fontSize: 15,
  },
  noteInput: {
    height: 80,
  },

  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 16,
  },
  photoBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  photoPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  photoImage: {
    width: 80,
    height: 80,
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  rateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    paddingVertical: 8,
  },
  rateToggleText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  ratingsSection: {
    marginBottom: 8,
  },

  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
});
