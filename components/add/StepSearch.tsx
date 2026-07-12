import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { type SearchResult, type Memory } from '@/data/mockData';
import { useMemories, useWantToTry } from '@/context/DataContext';
import { searchFoursquarePlaces } from '@/lib/foursquare';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const SEARCH_BOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';

interface LocationSuggestion {
  mapbox_id: string;
  name: string;
  context: string; // full formatted address shown in dropdown
}

function makeSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function searchLocations(query: string, sessionToken: string): Promise<LocationSuggestion[]> {
  if (!query.trim() || !MAPBOX_TOKEN) return [];
  const params = new URLSearchParams({
    q: query,
    access_token: MAPBOX_TOKEN,
    session_token: sessionToken,
    types: 'country,region,postcode,place,locality,neighborhood,address,street',
    limit: '5',
    language: 'en',
  });
  try {
    const res = await fetch(`${SEARCH_BOX_BASE}/suggest?${params}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.suggestions ?? []).map((s: any) => ({
      mapbox_id: s.mapbox_id,
      name: s.name,
      context: s.full_address ?? s.place_formatted ?? s.name,
    }));
  } catch {
    return [];
  }
}

async function retrieveLocation(
  mapbox_id: string,
  sessionToken: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  if (!MAPBOX_TOKEN) return null;
  const params = new URLSearchParams({ access_token: MAPBOX_TOKEN, session_token: sessionToken });
  try {
    const res = await fetch(`${SEARCH_BOX_BASE}/retrieve/${mapbox_id}?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    const feature = json.features?.[0];
    if (!feature) return null;
    const [lng, lat] = feature.geometry.coordinates;
    const label =
      feature.properties.full_address ??
      feature.properties.place_formatted ??
      feature.properties.name;
    return { lat, lng, label };
  } catch {
    return null;
  }
}

type SearchTab = 'all' | 'visited';

interface StepSearchProps {
  onSelect: (result: SearchResult) => void;
  onReturnVisit?: (result: SearchResult, existingMemory: Memory) => void;
  onQuickCheckin?: (existingMemory: Memory) => void;
}

export default function StepSearch({ onSelect, onReturnVisit, onQuickCheckin }: StepSearchProps) {
  const [query, setQuery] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('Current Location');
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const locationInputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);
  const sessionTokenRef = useRef<string>(makeSessionToken());
  // Increments per search; lets late responses from older searches be ignored
  const searchIdRef = useRef(0);

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

  // Debounced location autocomplete — fires 300ms after typing in location input
  useEffect(() => {
    if (!editingLocation || !locationInput.trim()) {
      setLocationSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const suggestions = await searchLocations(locationInput, sessionTokenRef.current);
      setLocationSuggestions(suggestions);
    }, 300);
    return () => clearTimeout(timer);
  }, [locationInput, editingLocation]);

  // Debounced search — fires 400ms after query or location changes.
  // Visited/bookmarked flags are applied at render time, so toggling a
  // bookmark or adding a memory never re-runs the network search.
  useEffect(() => {
    if (!query.trim() && !userLocation) {
      setResults([]);
      setSearchError(null);
      return;
    }

    const searchId = ++searchIdRef.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const found = await searchFoursquarePlaces(
          query.trim(),
          userLocation?.lat ?? null,
          userLocation?.lng ?? null,
        );
        // Typed and browse searches take different numbers of round-trips,
        // so an older response can land after a newer one — drop it.
        if (searchId !== searchIdRef.current) return;
        setResults(found);
      } catch (err: any) {
        if (searchId !== searchIdRef.current) return;
        setSearchError(err.message ?? 'Search failed');
        setResults([]);
      } finally {
        if (searchId === searchIdRef.current) setSearching(false);
      }
    }, query.trim() ? 400 : 0); // no debounce for initial location load

    return () => clearTimeout(timer);
  }, [query, userLocation]);

  const requestCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLabel('Set location');
        setEditingLocation(true);
        return;
      }
      // Try last known location first for an instant result
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        setUserLocation({ lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude });
        setLocationLabel('Current Location');
        setActiveTab('all');
        setLocationLoading(false);
        // Quietly upgrade to fresh GPS in the background
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then((fresh) => {
          setUserLocation({ lat: fresh.coords.latitude, lng: fresh.coords.longitude });
        }).catch(() => {});
        return;
      }
      // No cached location — get fresh (use Balanced for speed, upgrade after)
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setLocationLabel('Current Location');
      setActiveTab('all');
      // Upgrade to high accuracy in background
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then((fresh) => {
        setUserLocation({ lat: fresh.coords.latitude, lng: fresh.coords.longitude });
      }).catch(() => {});
    } catch {
      setLocationLabel('Set location');
      setEditingLocation(true);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleLocationSubmit = async () => {
    const input = locationInput.trim();
    if (!input) return;
    Keyboard.dismiss();
    setEditingLocation(false);
    setLocationLoading(true);
    setSearchError(null);
    try {
      const suggestions = await searchLocations(input, sessionTokenRef.current);
      if (!suggestions.length) {
        Alert.alert('Location not found', `Couldn't find "${input}". Try a different format.`);
        setEditingLocation(true);
        return;
      }
      const place = await retrieveLocation(suggestions[0].mapbox_id, sessionTokenRef.current);
      if (!place) {
        Alert.alert('Location not found', `Couldn't resolve "${input}". Try a different format.`);
        setEditingLocation(true);
        return;
      }
      sessionTokenRef.current = makeSessionToken();
      setUserLocation({ lat: place.lat, lng: place.lng });
      setLocationLabel(suggestions[0].context || input);
      setLocationInput('');
      setActiveTab('all');
    } catch (err: any) {
      Alert.alert('Location error', err.message ?? 'Could not find that location.');
      setEditingLocation(true);
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSelectSuggestion = useCallback(async (suggestion: LocationSuggestion) => {
    Keyboard.dismiss();
    setLocationSuggestions([]);
    setEditingLocation(false);
    setLocationInput('');
    setLocationLoading(true);
    try {
      const place = await retrieveLocation(suggestion.mapbox_id, sessionTokenRef.current);
      if (place) {
        sessionTokenRef.current = makeSessionToken();
        setUserLocation({ lat: place.lat, lng: place.lng });
        setLocationLabel(suggestion.context || suggestion.name);
        setActiveTab('all');
      }
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const handleLocationPillTap = () => {
    sessionTokenRef.current = makeSessionToken();
    setLocationInput('');
    setEditingLocation(true);
    setTimeout(() => locationInputRef.current?.focus(), 100);
  };

  const handleUseGPS = async () => {
    setEditingLocation(false);
    setLocationInput('');
    await requestCurrentLocation();
  };

  // Apply visited/bookmarked flags at render time, then filter by tab
  const displayedResults = useMemo(() => {
    const flagged = results.map((r) => ({
      ...r,
      isVisited: visitedNames.has(r.name),
      isBookmarked: bookmarkedNames.has(r.name),
    }));
    if (activeTab === 'visited') return flagged.filter((r) => r.isVisited);
    return flagged;
  }, [results, activeTab, visitedNames, bookmarkedNames]);

  // Scroll back to top when a new search lands (raw results, not the
  // flagged view — a bookmark toggle shouldn't jump the list to the top)
  useEffect(() => {
    if (results.length > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [results]);

  const renderItem = ({ item }: { item: SearchResult }) => {
    const bookmarked = isBookmarked(item.name, item.address);
    return (
      <TouchableOpacity
        style={styles.resultRow}
        onPress={() => {
          Keyboard.dismiss();
          // Check for matches — exact (same name+address) or name-only (chain at different location)
          const exactMatch = memories.find(
            (m) => m.restaurantName.toLowerCase() === item.name.toLowerCase()
              && m.address === item.address
          );
          const nameOnlyMatch = !exactMatch && memories.find(
            (m) => m.restaurantName.toLowerCase() === item.name.toLowerCase()
              && m.address !== item.address
          );

          if (exactMatch && onReturnVisit) {
            // Same restaurant, same address — Went Again vs Tried Something New
            Alert.alert(
              'Been here before!',
              `You've visited ${item.name} ${1 + (exactMatch.visits?.length ?? 0)} time${(exactMatch.visits?.length ?? 0) > 0 ? 's' : ''}.`,
              [
                { text: 'Went Again', onPress: () => onQuickCheckin?.(exactMatch) },
                { text: 'Tried Something New', onPress: () => onReturnVisit(item, exactMatch) },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          } else if (nameOnlyMatch && onReturnVisit) {
            // Same name, different address — chain location
            Alert.alert(
              'Looks familiar!',
              `You've been to ${item.name} at a different location.`,
              [
                { text: 'Return Visit', onPress: () => onReturnVisit(item, nameOnlyMatch) },
                { text: 'New Location', onPress: () => onSelect(item) },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          } else {
            onSelect(item);
          }
        }}
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

      {/* Location autocomplete suggestions */}
      {editingLocation && locationSuggestions.length > 0 && (
        <View style={styles.suggestionsWrap}>
          {locationSuggestions.map((s) => (
            <TouchableOpacity
              key={s.mapbox_id}
              style={styles.suggestionRow}
              onPress={() => handleSelectSuggestion(s)}
            >
              <Ionicons name="location-outline" size={16} color={Colors.purple} />
              <Text style={styles.suggestionText} numberOfLines={1}>{s.context}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.tabRow}>
        {(['all', 'visited'] as SearchTab[]).map((tab) => (
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
        ref={listRef}
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
  suggestionsWrap: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.purple,
    borderRadius: 12,
    marginBottom: 12,
    marginTop: -4,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  suggestionText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 13,
  },
});
