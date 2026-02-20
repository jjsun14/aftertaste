import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/theme/colors';

type TagVariant = 'eatery' | 'occasion' | 'mood' | 'food';

interface TagChipProps {
  label: string;
  emoji?: string;
  variant?: TagVariant;
  selected?: boolean;
}

const variantStyles: Record<TagVariant, { bg: string; text: string }> = {
  eatery: { bg: Colors.tagEateryBg, text: Colors.tagEatery },
  occasion: { bg: Colors.tagOccasionBg, text: Colors.tagOccasion },
  mood: { bg: Colors.tagMoodBg, text: Colors.tagMood },
  food: { bg: Colors.surfaceLight, text: Colors.textPrimary },
};

export default function TagChip({ label, emoji, variant = 'food', selected = true }: TagChipProps) {
  const colors = selected ? variantStyles[variant] : { bg: Colors.surface, text: Colors.textSecondary };

  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      {emoji && <Text style={styles.emoji}>{emoji}</Text>}
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  emoji: {
    fontSize: 14,
    marginRight: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
