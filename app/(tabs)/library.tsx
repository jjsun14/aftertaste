import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  PanResponder,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/theme/colors';
import { useMemories } from '@/context/DataContext';
import { useWantToTry } from '@/context/DataContext';
import MemoryGrid from '@/components/library/MemoryGrid';
import WantToTryList from '@/components/library/WantToTryList';
import type { EateryType } from '@/data/mockData';

type LibraryTab = 'all' | 'wantToTry';
type SortOption = 'newest' | 'score_high' | 'score_low' | 'oldest';

const EATERY_TYPES: EateryType[] = ['Restaurant', 'Bar', 'Cafe', 'Bakery', 'Dessert'];
const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  score_high: 'Score: High → Low',
  score_low: 'Score: Low → High',
};

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<LibraryTab>('all');

  // Drag-to-dismiss for filter sheet
  const filterSheetY = useRef(new Animated.Value(0)).current;
  const filterPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => { if (gs.dy > 0) filterSheetY.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(filterSheetY, { toValue: 800, duration: 200, useNativeDriver: true })
            .start(() => { filterSheetY.setValue(0); setShowFilterSheet(false); });
        } else {
          Animated.spring(filterSheetY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Filter state
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [selectedEatery, setSelectedEatery] = useState<EateryType | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const { memories, loading: memoriesLoading } = useMemories();
  const { entries: wantToTryEntries, loading: wttLoading } = useWantToTry();

  // Derive unique cities from real memories
  const cities = useMemo(() => {
    const set = new Set<string>();
    memories.forEach((m) => { if (m.city) set.add(m.city); });
    return Array.from(set).sort();
  }, [memories]);

  // Apply all filters + sort
  const filteredMemories = useMemo(() => {
    let list = [...memories];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.restaurantName.toLowerCase().includes(q) ||
          m.whatIHad.some((item) => item.toLowerCase().includes(q))
      );
    }

    if (selectedEatery) {
      list = list.filter((m) => m.eateryType === selectedEatery);
    }

    if (selectedCity) {
      list = list.filter((m) => m.city === selectedCity);
    }

    switch (sortBy) {
      case 'newest':  list.sort((a, b) => b.date.localeCompare(a.date)); break;
      case 'oldest':  list.sort((a, b) => a.date.localeCompare(b.date)); break;
      case 'score_high': list.sort((a, b) => b.compositeScore - a.compositeScore); break;
      case 'score_low':  list.sort((a, b) => a.compositeScore - b.compositeScore); break;
    }

    return list;
  }, [memories, search, selectedEatery, selectedCity, sortBy]);

  const activeFilterCount =
    (selectedEatery ? 1 : 0) + (selectedCity ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0);

  const clearFilters = () => {
    setSelectedEatery(null);
    setSelectedCity(null);
    setSortBy('newest');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Memories</Text>
        {activeTab === 'all' && (
          <TouchableOpacity
            style={styles.searchIconBtn}
            onPress={() => { setShowSearch(!showSearch); if (showSearch) setSearch(''); }}
          >
            <Ionicons name={showSearch ? 'close' : 'search'} size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search bar */}
      {activeTab === 'all' && showSearch && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search restaurants or food..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['all', 'wantToTry'] as LibraryTab[]).map((key) => (
          <TouchableOpacity key={key} style={styles.tab} onPress={() => setActiveTab(key)}>
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
              {key === 'all' ? 'All Entries' : 'Want to Try'}
            </Text>
            {activeTab === key && <View style={styles.underline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter bar */}
      {activeTab === 'all' && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterIconBtn, activeFilterCount > 0 && styles.filterIconBtnActive]}
            onPress={() => setShowFilterSheet(true)}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={activeFilterCount > 0 ? Colors.primary : Colors.textSecondary}
            />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <TouchableOpacity
              style={[styles.filterChip, sortBy !== 'newest' && styles.filterChipActive]}
              onPress={() => setShowFilterSheet(true)}
            >
              <Ionicons name="swap-vertical" size={13} color={sortBy !== 'newest' ? Colors.primary : Colors.textSecondary} />
              <Text style={[styles.filterChipText, sortBy !== 'newest' && styles.filterChipTextActive]}>
                {SORT_LABELS[sortBy]}
              </Text>
            </TouchableOpacity>

            {selectedEatery && (
              <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]} onPress={() => setSelectedEatery(null)}>
                <Text style={[styles.filterChipText, styles.filterChipTextActive]}>{selectedEatery}</Text>
                <Ionicons name="close" size={12} color={Colors.primary} />
              </TouchableOpacity>
            )}

            {selectedCity && (
              <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]} onPress={() => setSelectedCity(null)}>
                <Text style={[styles.filterChipText, styles.filterChipTextActive]}>{selectedCity}</Text>
                <Ionicons name="close" size={12} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {/* Content */}
      {activeTab === 'all' ? (
        memoriesLoading ? (
          <View style={styles.centeredWrap}><ActivityIndicator color={Colors.primary} /></View>
        ) : filteredMemories.length === 0 ? (
          <View style={styles.centeredWrap}>
            <Ionicons name="restaurant-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No memories found</Text>
            {activeFilterCount > 0 && (
              <TouchableOpacity onPress={clearFilters}>
                <Text style={styles.clearText}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <MemoryGrid memories={filteredMemories} />
          </ScrollView>
        )
      ) : wttLoading ? (
        <View style={styles.centeredWrap}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <WantToTryList entries={wantToTryEntries} />
        </ScrollView>
      )}

      {/* Filter bottom sheet */}
      <Modal visible={showFilterSheet} transparent animationType="slide" onRequestClose={() => setShowFilterSheet(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setShowFilterSheet(false)} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: filterSheetY }] }]}>
          {/* Drag handle — pan responder ONLY here so it doesn't fight ScrollViews */}
          <View {...filterPanResponder.panHandlers} style={styles.dragArea}>
            <View style={styles.sheetHandle} />
          </View>

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filter & Sort</Text>
            <TouchableOpacity onPress={clearFilters}>
              <Text style={styles.sheetClear}>Clear all</Text>
            </TouchableOpacity>
          </View>

          {/* Sort */}
          <Text style={styles.sheetSection}>SORT BY</Text>
          <View style={styles.sheetOptions}>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.sheetOption}
                onPress={() => setSortBy(opt)}
              >
                <Text style={[styles.sheetOptionText, sortBy === opt && styles.sheetOptionTextActive]}>
                  {SORT_LABELS[opt]}
                </Text>
                {sortBy === opt && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Eatery Type */}
          <Text style={styles.sheetSection}>EATERY TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sheetChipRow}>
            {EATERY_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.sheetChip, selectedEatery === type && styles.sheetChipActive]}
                onPress={() => setSelectedEatery(selectedEatery === type ? null : type)}
              >
                <Text style={[styles.sheetChipText, selectedEatery === type && styles.sheetChipTextActive]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* City */}
          {cities.length > 0 && (
            <>
              <Text style={styles.sheetSection}>LOCATION</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sheetChipRow}>
                {cities.map((city) => (
                  <TouchableOpacity
                    key={city}
                    style={[styles.sheetChip, selectedCity === city && styles.sheetChipActive]}
                    onPress={() => setSelectedCity(selectedCity === city ? null : city)}
                  >
                    <Text style={[styles.sheetChipText, selectedCity === city && styles.sheetChipTextActive]}>
                      {city}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <TouchableOpacity
            style={[styles.applyBtn, { marginBottom: insets.bottom + 16 }]}
            onPress={() => setShowFilterSheet(false)}
          >
            <Text style={styles.applyBtnText}>
              Show {filteredMemories.length} result{filteredMemories.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>

          {/* Solid fill so the bounce zone never reveals the background */}
          <View style={styles.sheetBottomFill} />
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: { color: Colors.textPrimary, fontSize: 30, fontWeight: '800' },
  searchIconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceLight, borderRadius: 12,
    marginHorizontal: 16, marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 24, marginBottom: 16 },
  tab: { paddingBottom: 10 },
  tabText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '500' },
  tabTextActive: { color: Colors.textPrimary, fontWeight: '600' },
  underline: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, backgroundColor: Colors.primary, borderRadius: 1,
  },
  filterRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 10, marginBottom: 16,
  },
  filterIconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center',
  },
  filterIconBtnActive: { backgroundColor: Colors.primaryBg },
  filterBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 10, fontWeight: '700', color: '#000' },
  chipScroll: { flex: 1 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: Colors.surfaceLight,
    marginRight: 8, gap: 5,
  },
  filterChipActive: { backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primary },
  filterChipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  filterChipTextActive: { color: Colors.primary, fontWeight: '600' },
  scrollContent: { paddingBottom: 20 },
  centeredWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: Colors.textSecondary, fontSize: 15 },
  clearText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 0,
  },
  dragArea: { alignItems: 'center', paddingVertical: 14 },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorderLight,
  },
  sheetBottomFill: {
    position: 'absolute', bottom: -200, left: 0, right: 0,
    height: 220, backgroundColor: Colors.surface,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  sheetClear: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  sheetSection: {
    fontSize: 11, fontWeight: '700', color: Colors.textSecondary,
    letterSpacing: 0.8, marginBottom: 10, marginTop: 4,
  },
  sheetOptions: { marginBottom: 20 },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  sheetOptionText: { fontSize: 15, color: Colors.textSecondary },
  sheetOptionTextActive: { color: Colors.primary, fontWeight: '600' },
  sheetChipRow: { marginBottom: 20 },
  sheetChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceLight, borderWidth: 1,
    borderColor: Colors.surfaceBorder, marginRight: 8,
  },
  sheetChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  sheetChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  sheetChipTextActive: { color: Colors.primary, fontWeight: '600' },
  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  applyBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
