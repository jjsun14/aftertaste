import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors } from '@/theme/colors';
import { type SearchResult } from '@/data/mockData';
import { useMemories, useWantToTry } from '@/context/DataContext';
import { searchFoursquarePlaces } from '@/lib/foursquare';

type SearchTab = 'all' | 'nearby' | 'visited';

interface StepSearchProps {
  onSelect: (result: SearchResult) => void;
}

export default function StepSearch({ onSelect }: StepSearchProps) {
  const [query, setQuery] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('nearby');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('Current Location');
  const locationInputRef = useRef<TextInput>(null);

  const { isBookmarked, toggleBookmark, entries: wantToTryEntries } = useWantToTry();
  const { memories } = useMemories();

  const visitedNames = useMemo(
    () => new Set(memories.map((m) => m.restaurantName)),
    [memories]
  );
  const bookmarkedNames = useMemo(
    () => new Set(wantToTryEntries.map((e) => e.restaurantName)),
    [wantToTryEntries]
  );

  // On mount, immediately request location and load nearby restaurants
  useEffect(() => {
    requestCurrentLocation();
  }, []);

  // Debounced search — fires 400ms after query or location changes
  useEffect(() => {
    if (!query.trim() && !userLocation) {
      setResults([]);
      setSearchError(null);
      return;
    }

    const searchQuery = query.trim() || 'restaurant';
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const found = await searchFoursquarePlaces(
          searchQuery,
          userLocation?.lat ?? null,
          userLocation?.lng ?? null,
          visitedNames,
          bookmarkedNames,
        );
        setResults(found);
      } catch (err: any) {
        setSearchError(err.message ?? 'Search failed');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, query.trim() ? 400 : 0); // no debounce for initial location load

    return () => clearTimeout(timer);
  }, [query, userLocation, visitedNames, bookmarkedNames]);

  const requestCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Permission denied — fall back to no location, let user type one
        setLocationLabel('Set location');
        setEditingLocation(true);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setLocationLabel('Current Location');
      setActiveTab('nearby');
    } catch {
      setLocationLabel('Set location');
      setEditingLocation(true);
    } finally {
      setLocationLoading(false);
    }
  };

  // Geocode a typed city/address
  const handleLocationSubmit = async () => {
    const input = locationInput.trim();
    if (!input) return;
    Keyboard.dismiss();
    setEditingLocation(false);
    setLocationLoading(true);
    setSearchError(null);
    try {
      const geocoded = await Location.geocodeAsync(input);
      if (!geocoded || geocoded.length === 0) {
        Alert.alert('Location not found', `Couldn't find "${input}". Try a city name.`);
        setEditingLocation(true);
        return;
      }
      const { latitude, longitude } = geocoded[0];
      setUserLocation({ lat: latitude, lng: longitude });
      setLocationLabel(input);
      setActiveTab('nearby');
    } catch (err: any) {
      Alert.alert('Location error', err.message ?? 'Could not find that location.');
      setEditingLocation(true);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleLocationPillTap = () => {
    setLocationInput('');
    setEditingLocation(true);
    setTimeout(() => locationInputRef.current?.focus(), 100);
  };

  const handleUseGPS = async () => {
    setEditingLocation(false);
    setLocationInput('');
    await requestCurrentLocation();
  };

  // Filter results based on active tab
  const displayedResults = useMemo(() => {
    if (activeTab === 'visited') return results.filter((r) => r.isVisited);
    return results;
  }, [results, activeTab]);

  const renderItem = ({ item }: { item: SearchResult }) => {
    const bookmarked = isBookmarked(item.name, item.address);
    return (
      <TouchableOpacity
        style={styles.resultRow}
        onPress={() => { Keyboard.dismiss(); onSelect(item); }}
      >
        <View style={styles.leftCol}>
          <Ionicons name="location-outline" size={20} color={Colors.textSecondary} />
          {!!item.distance && <Text style={styles.distance}>{item.distance}</Text>}
        </View>

        <View style={styles.resultInfo}>
          <Text style={styles.resultName}>{item.name}</Text>
          <Text style={styles.resultAddress} numberOfLines={1}>{item.address}</Text>
        </View>

        <View style={styles.resultRight}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              toggleBookmark({
                name: item.name,
                address: item.address,
                latitude: item.latitude,
                longitude: item.longitude,
              });
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={bookmarked ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={bookmarked ? Colors.primary : Colors.textSecondary}
            />
          </TouchableOpacity>
          {item.isVisited && (
            <Ionicons name="checkmark" size={16} color={Colors.primary} style={{ marginTop: 4 }} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Restaurant search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search restaurants..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
        />
        {searching && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {/* Location row */}
      {editingLocation ? (
        <View style={styles.locationRow}>
          <View style={styles.locationInputWrap}>
            <Ionicons name="location-outline" size={18} color={Colors.purple} />
            <TextInput
              ref={locationInputRef}
              style={styles.locationInput}
              placeholder="City or address..."
              placeholderTextColor={Colors.textMuted}
              value={locationInput}
              onChangeText={setLocationInput}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleLocationSubmit}
              autoFocus
            />
            {locationInput.trim().length > 0 && (
              <TouchableOpacity onPress={handleLocationSubmit}>
                <Ionicons name="arrow-forward-circle" size={22} color={Colors.purple} />
              </TouchableOpacity>
            )}
          </View>
          {/* GPS button */}
          <TouchableOpacity style={styles.gpsBtn} onPress={handleUseGPS} disabled={locationLoading}>
            {locationLoading ? (
              <ActivityIndicator size="small" color={Colors.purple} />
            ) : (
              <Ionicons name="navigate" size={18} color={Colors.purple} />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* Active location pill — tap to edit */
        <TouchableOpacity style={styles.locationPill} onPress={handleLocationPillTap}>
          {locationLoading ? (
            <ActivityIndicator size="small" color={Colors.purple} />
          ) : (
            <Ionicons name="location" size={16} color={Colors.purple} />
          )}
          <Text style={styles.locationPillText} numberOfLines={1}>
            {locationLoading ? 'Getting location...' : locationLabel}
          </Text>
          <Ionicons name="pencil-outline" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      )}

      <View style={styles.tabRow}>
        {(['all', 'nearby', 'visited'] as SearchTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error state */}
      {searchError && <Text style={styles.errorText}>{searchError}</Text>}

      {/* Empty states */}
      {!searching && !searchError && displayedResults.length === 0 && !locationLoading && (
        <Text style={styles.emptyText}>
          {activeTab === 'visited'
            ? 'No visited restaurants found'
            : 'No results found'}
        </Text>
      )}

      <FlatList
        data={displayedResults}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
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
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  locationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  locationInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.purple,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  locationInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  gpsBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.purple,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  locationPillText: {
    flex: 1,
    color: Colors.purple,
    fontSize: 14,
    fontWeight: '500',
  },
  tabRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  tabActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  tabText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },
  errorText: {
    color: Colors.ratingPoor,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  leftCol: { alignItems: 'center', width: 44, marginRight: 8 },
  distance: { color: Colors.textMuted, fontSize: 11, fontWeight: '500', marginTop: 2 },
  resultInfo: { flex: 1 },
  resultName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  resultAddress: { color: Colors.textSecondary, fontSize: 12 },
  resultRight: { alignItems: 'center', marginLeft: 10 },
});
