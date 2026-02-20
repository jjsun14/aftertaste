import React from 'react';
import { View, StyleSheet } from 'react-native';
import MemoryCard, { CARD_GAP, CARD_PADDING } from './MemoryCard';
import type { Memory } from '@/data/mockData';

interface MemoryGridProps {
  memories: Memory[];
}

export default function MemoryGrid({ memories }: MemoryGridProps) {
  // Build rows of 2
  const rows: Memory[][] = [];
  for (let i = 0; i < memories.length; i += 2) {
    rows.push(memories.slice(i, i + 2));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: CARD_PADDING,
  },
  row: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
});
