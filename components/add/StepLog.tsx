import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/theme/colors';
import RatingPills from '@/components/shared/RatingPills';
import {
  occasionEmojis,
  eateryEmojis,
  type RatingLevel,
  type OccasionTag,
  type EateryType,
  type SearchResult,
} from '@/data/mockData';

const occasions: OccasionTag[] = [
  'Quick Bite', 'Date Night', 'Drinks', 'Travel',
  'Celebration', 'Regular Meal', 'Special Moment',
];

const eateryTypes: EateryType[] = [
  'Restaurant', 'Bar', 'Cafe', 'Bakery', 'Dessert',
];

export interface LogFormData {
  foodItems: string;
  occasion: OccasionTag;
  eateryType: EateryType;
  taste: RatingLevel;
  vibe: RatingLevel;
  value: RatingLevel;
  eatAgain: boolean;
  note: string;
  squadNames: string; // comma-separated free text for now
  photos: string[];   // local file:// URIs; uploaded to URLs in add.tsx before saving
}

interface StepLogProps {
  restaurant: SearchResult;
  onNext: () => void;
  onBack: () => void;
  onDataChange: (data: LogFormData) => void;
}

export default function StepLog({ restaurant, onNext, onBack, onDataChange }: StepLogProps) {
  const [foodItems, setFoodItems] = useState('');
  const [occasion, setOccasion] = useState<OccasionTag>('Quick Bite');
  const [eateryType, setEateryType] = useState<EateryType>('Restaurant');
  const [taste, setTaste] = useState<RatingLevel>('Great');
  const [vibe, setVibe] = useState<RatingLevel>('Okay');
  const [value, setValue] = useState<RatingLevel>('Okay');
  const [eatAgain, setEatAgain] = useState(true);
  const [note, setNote] = useState('');
  const [squadNames, setSquadNames] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [showSquad, setShowSquad] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  // Notify parent whenever any field changes
  useEffect(() => {
    onDataChange({ foodItems, occasion, eateryType, taste, vibe, value, eatAgain, note, squadNames, photos });
  }, [foodItems, occasion, eateryType, taste, vibe, value, eatAgain, note, squadNames, photos]);

  const handleShowNote = () => {
    setShowNote(!showNote);
    if (!showNote) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  };

  const handleRemovePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  };

  const handleAddPhoto = () => {
    Alert.alert(
      'Add Photo',
      'Choose how to add a photo',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Camera access is required to take photos.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotos((prev) => [...prev, result.assets[0].uri]);
            }
          },
        },
        {
          text: 'Choose from Library',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission needed', 'Photo library access is required to select photos.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsMultipleSelection: true,
              selectionLimit: 5,
              quality: 0.8,
            });
            if (!result.canceled) {
              const uris = result.assets.map((a) => a.uri);
              setPhotos((prev) => [...prev, ...uris]);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo thumbnails */}
        {photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.thumbRow}
          >
            {photos.map((uri) => (
              <View key={uri} style={styles.photoThumb}>
                <Image source={{ uri }} style={styles.thumbImg} />
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() => handleRemovePhoto(uri)}
                >
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Photo upload area */}
        <TouchableOpacity style={styles.photoUpload} onPress={handleAddPhoto}>
          <Ionicons name="camera-outline" size={36} color={Colors.textSecondary} />
          <Text style={styles.photoUploadText}>
            {photos.length === 0
              ? 'Capture the food and vibe'
              : `${photos.length} photo${photos.length > 1 ? 's' : ''} added — tap to add more`}
          </Text>
        </TouchableOpacity>

        {/* Restaurant card */}
        <View style={styles.restaurantCard}>
          <View style={styles.restaurantInfo}>
            <Text style={styles.restaurantName}>{restaurant.name}</Text>
            <Text style={styles.restaurantSub}>$ | Pizza Restaurant</Text>
            <View style={styles.addressRow}>
              <Ionicons name="location-sharp" size={12} color={Colors.primary} />
              <Text style={styles.addressText}>{restaurant.address}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.pencilBtn} onPress={onBack}>
            <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* What did you eat? */}
        <Text style={styles.sectionLabel}>WHAT DID YOU EAT?</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Pizza, Garlic Knots...."
          placeholderTextColor={Colors.textMuted}
          value={foodItems}
          onChangeText={setFoodItems}
        />

        {/* Occasion */}
        <Text style={styles.sectionLabel}>WHATS THE OCCASION?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {occasions.map((occ) => (
            <TouchableOpacity
              key={occ}
              style={[styles.chip, occasion === occ && styles.chipActiveOccasion]}
              onPress={() => setOccasion(occ)}
            >
              <Text style={styles.chipEmoji}>{occasionEmojis[occ]}</Text>
              <Text style={[styles.chipText, occasion === occ && styles.chipTextActive]}>
                {occ}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Eatery type */}
        <Text style={styles.sectionLabel}>TYPE OF EATERY?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {eateryTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.chip, eateryType === type && styles.chipActiveEatery]}
              onPress={() => setEateryType(type)}
            >
              <Text style={styles.chipEmoji}>{eateryEmojis[type]}</Text>
              <Text style={[styles.chipText, eateryType === type && styles.chipTextActive]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Ratings */}
        <Text style={styles.sectionLabel}>HOW WAS IT?</Text>
        <RatingPills label="Taste" value={taste} onChange={setTaste} />
        <RatingPills label="Vibe" value={vibe} onChange={setVibe} />
        <RatingPills label="Value" value={value} onChange={setValue} />

        {/* Eat Again */}
        <View style={styles.eatAgainRow}>
          <Text style={styles.eatAgainLabel}>Eat Again?</Text>
          <TouchableOpacity
            style={[styles.eatAgainToggle, eatAgain && styles.eatAgainToggleActive]}
            onPress={() => setEatAgain(!eatAgain)}
          >
            <Ionicons
              name={eatAgain ? 'checkmark-circle' : 'close-circle'}
              size={20}
              color={eatAgain ? Colors.primary : Colors.ratingPoor}
            />
            <Text style={[styles.eatAgainText, { color: eatAgain ? Colors.primary : Colors.ratingPoor }]}>
              {eatAgain ? 'Yes!' : 'Nah'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Who did you go with? */}
        <TouchableOpacity
          style={styles.expandRow}
          onPress={() => setShowSquad(!showSquad)}
        >
          <Ionicons name="people-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.expandText}>Who did you go with?</Text>
          <Ionicons name={showSquad ? 'chevron-down' : 'chevron-forward'} size={18} color={Colors.textSecondary} />
        </TouchableOpacity>

        {showSquad && (
          <TextInput
            style={styles.textInput}
            placeholder="Keshav, Lulu, Marcus..."
            placeholderTextColor={Colors.textMuted}
            value={squadNames}
            onChangeText={setSquadNames}
            autoFocus
          />
        )}

        {/* Add Notes */}
        <TouchableOpacity
          style={styles.expandRow}
          onPress={handleShowNote}
        >
          <Ionicons name="create-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.expandText}>Add Notes</Text>
          <Ionicons
            name={showNote ? 'chevron-down' : 'chevron-forward'}
            size={18}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>

        {showNote && (
          <TextInput
            style={[styles.textInput, styles.noteInput]}
            placeholder="Write a memory..."
            placeholderTextColor={Colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            autoFocus
            onFocus={() => {
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
            }}
          />
        )}

        {/* Next button */}
        <View style={styles.nextRow}>
          <TouchableOpacity style={styles.nextBtn} onPress={onNext}>
            <Ionicons name="arrow-forward" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1 },
  container: { flex: 1 },
  thumbRow: { marginBottom: 12 },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    position: 'relative',
  },
  thumbImg: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  photoUpload: {
    borderWidth: 2,
    borderColor: Colors.surfaceBorderLight,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  photoUploadText: { color: Colors.textSecondary, fontSize: 14, marginTop: 8 },
  restaurantCard: {
    position: 'relative',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    padding: 14,
    paddingRight: 40,
    marginBottom: 20,
  },
  restaurantInfo: { flex: 1 },
  pencilBtn: { position: 'absolute', top: 12, right: 12 },
  restaurantName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  restaurantSub: { color: Colors.textSecondary, fontSize: 13, marginBottom: 4 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressText: { color: Colors.textSecondary, fontSize: 12 },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 20,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  chipScroll: { marginBottom: 20 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginRight: 8,
    gap: 6,
  },
  chipActiveOccasion: { backgroundColor: Colors.tagOccasionBg, borderColor: Colors.tagOccasion },
  chipActiveEatery: { backgroundColor: Colors.blueBg, borderColor: Colors.blue },
  chipEmoji: { fontSize: 14 },
  chipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: Colors.textPrimary, fontWeight: '600' },
  eatAgainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  eatAgainLabel: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  eatAgainToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  eatAgainToggleActive: { backgroundColor: Colors.primaryBg },
  eatAgainText: { fontSize: 14, fontWeight: '600' },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 10,
  },
  expandText: { flex: 1, color: Colors.textSecondary, fontSize: 14 },
  nextRow: { alignItems: 'flex-end', marginTop: 10 },
  nextBtn: {
    width: 56,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
