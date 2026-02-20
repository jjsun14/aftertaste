import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getScoreBgColor } from '@/theme/colors';

interface ScoreBadgeProps {
  score: number;
  size?: 'small' | 'large';
}

export default function ScoreBadge({ score, size = 'small' }: ScoreBadgeProps) {
  const isLarge = size === 'large';
  const bgColor = getScoreBgColor(score);

  return (
    <View style={[styles.badge, isLarge && styles.badgeLarge, { backgroundColor: bgColor }]}>
      {!isLarge && (
        <Ionicons name="star" size={10} color="#fff" style={styles.star} />
      )}
      <Text style={[styles.text, isLarge && styles.textLarge]}>
        {score.toFixed(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  star: {
    marginRight: 3,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  textLarge: {
    fontSize: 20,
    fontWeight: '800',
  },
});
