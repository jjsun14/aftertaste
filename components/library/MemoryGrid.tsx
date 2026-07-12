import React from 'react';
import { View, StyleSheet } from 'react-native';
import MemoryCard, { CARD_GAP, CARD_PADDING } from './MemoryCard';
import type { Memory } from '@/data/mockData';

export interface GroupedMemory {
  memory: Memory;        // representative memory (most recent)
  visitCount: number;    // total visits across all locations
  overrideScore: number; // averaged composite score
}

interface MemoryGridProps {
  memories?: Memory[];
  groups?: GroupedMemory[];
}

export default function MemoryGrid({ memories, groups }: MemoryGridProps) {
  // If groups are provided, use them; otherwise fall back to flat memory list
  const items: GroupedMemory[] = groups
    ? groups
    : (memories ?? []).map((m) => ({ memory: m, visitCount: 1, overrideScore: m.compositeScore }));

  // Build rows of 2
  const rows: GroupedMemory[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((item) => (
            <MemoryCard
              key={item.memory.id}
              memory={item.memory}
              visitCount={item.visitCount}
              overrideScore={item.overrideScore}
            />
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
