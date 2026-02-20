import React from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, getScoreColor } from '@/theme/colors';
import type { Memory } from '@/data/mockData';
import { getRelativeTime } from '@/data/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - CARD_GAP) / 2;

interface MemoryCardProps {
  memory: Memory;
}

export default function MemoryCard({ memory }: MemoryCardProps) {
  const scoreColor = getScoreColor(memory.compositeScore);
  const hasPhoto = memory.photos.length > 0 && memory.photos[0];

  // Build location string — fall back gracefully when city/state are empty
  const locationParts = [memory.city, memory.state].filter(Boolean);
  const locationText =
    locationParts.length > 0 ? locationParts.join(', ') : memory.address || '';

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/entry/${memory.id}` as any)}
    >
      {hasPhoto ? (
        <Image
          source={{ uri: memory.photos[0] }}
          style={styles.image}
          contentFit="cover"
        />
      ) : (
        <View style={styles.photoPlaceholder}>
          <Text style={styles.photoPlaceholderEmoji}>🍽️</Text>
          <Text style={styles.photoPlaceholderText} numberOfLines={2}>
            {memory.restaurantName}
          </Text>
        </View>
      )}
      {/* Score badge — colored star + number on dark bg */}
      <View style={styles.scoreBadgeWrap}>
        <View style={styles.scoreBadge}>
          <Ionicons name="star" size={11} color={scoreColor} />
          <Text style={[styles.scoreText, { color: scoreColor }]}>
            {memory.compositeScore.toFixed(1)}
          </Text>
        </View>
      </View>
      {/* Bottom gradient + info */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.gradient}
      >
        <Text style={styles.name} numberOfLines={1}>
          {memory.restaurantName}
        </Text>
        <View style={styles.locationRow}>
          <Ionicons name="location-sharp" size={10} color="rgba(255,255,255,0.7)" />
          <Text style={styles.location} numberOfLines={1}>
            {locationText ? `${locationText} · ` : ''}{getRelativeTime(memory.date)}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.15,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: CARD_GAP,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  photoPlaceholderEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  photoPlaceholderText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  scoreBadgeWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 4,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '800',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 40,
    paddingBottom: 10,
    paddingHorizontal: 10,
  },
  name: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  location: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    flex: 1,
  },
});

export { CARD_GAP, CARD_PADDING };
