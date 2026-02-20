import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/theme/colors';
import type { RatingLevel } from '@/data/mockData';

interface RatingPillsProps {
  label: string;
  value: RatingLevel;
  onChange?: (value: RatingLevel) => void;
  readonly?: boolean;
}

const levels: { key: RatingLevel; color: string }[] = [
  { key: 'Great', color: Colors.ratingGreat },
  { key: 'Okay', color: Colors.ratingOkay },
  { key: 'Poor', color: Colors.ratingPoor },
];

export default function RatingPills({ label, value, onChange, readonly }: RatingPillsProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>
      <View style={styles.pills}>
        {levels.map(({ key, color }) => {
          const isActive = value === key;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.pill,
                isActive && { backgroundColor: color },
              ]}
              onPress={() => !readonly && onChange?.(key)}
              activeOpacity={readonly ? 1 : 0.7}
              disabled={readonly}
            >
              <Text
                style={[
                  styles.pillText,
                  !isActive && { color: Colors.textSecondary },
                  isActive && styles.pillTextActive,
                ]}
              >
                {key}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    width: 60,
  },
  pills: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'flex-start',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
});
