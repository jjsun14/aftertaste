import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/theme/colors';
import { eateryEmojis } from '@/data/mockData';
import type { WantToTryEntry } from '@/data/mockData';
import { useWantToTry } from '@/context/DataContext';

interface WantToTryListProps {
  entries: WantToTryEntry[];
}

export default function WantToTryList({ entries }: WantToTryListProps) {
  const { toggleBookmark } = useWantToTry();

  return (
    <View style={styles.container}>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name="location-outline" size={20} color={Colors.textSecondary} />
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{entry.restaurantName}</Text>
            <Text style={styles.details}>
              {entry.priceTier} · {entry.cuisineType}
            </Text>
            <View style={styles.locationRow}>
              <Ionicons name="location-sharp" size={11} color={Colors.primary} />
              <Text style={styles.address} numberOfLines={1}>
                {entry.address}
              </Text>
            </View>
          </View>
          <View style={styles.right}>
            <Text style={styles.emoji}>{eateryEmojis[entry.eateryType]}</Text>
            <TouchableOpacity
              onPress={() => toggleBookmark({ name: entry.restaurantName, address: entry.address, latitude: entry.latitude, longitude: entry.longitude })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="bookmark" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  details: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  address: {
    color: Colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  right: {
    alignItems: 'center',
    gap: 6,
    marginLeft: 12,
  },
  emoji: {
    fontSize: 16,
  },
});
