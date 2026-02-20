import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox, { MapView, Camera, ShapeSource, SymbolLayer, Images } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { Colors, getScoreBgColor } from '@/theme/colors';
import { useMemories } from '@/context/DataContext';
import type { Memory } from '@/data/mockData';
import ScoreBadge from '@/components/shared/ScoreBadge';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

// ─── GeoJSON helpers ──────────────────────────────────────────────
function memoriesToGeoJSON(memories: Memory[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: memories
      .filter((m) => m.latitude && m.longitude)
      .map((m) => ({
        type: 'Feature',
        id: m.id,
        geometry: {
          type: 'Point',
          coordinates: [m.longitude, m.latitude],
        },
        properties: {
          id: m.id,
          score: m.compositeScore,
          name: m.restaurantName,
          pinColor: getScoreBgColor(m.compositeScore),
        },
      })),
  };
}

// Default center: continental US
const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283];
const DEFAULT_ZOOM = 3.5;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { memories, loading } = useMemories();
  const cameraRef = useRef<Camera>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [locating, setLocating] = useState(false);

  const geojson = memoriesToGeoJSON(memories);

  // ── Tap a pin ──
  const handlePinPress = useCallback(
    (event: any) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const id = feature.properties?.id;
      const found = memories.find((m) => m.id === id);
      if (!found) return;

      setSelectedMemory(found);

      // Fly to pin
      cameraRef.current?.flyTo(
        [found.longitude, found.latitude],
        400
      );
    },
    [memories]
  );

  // ── My location button ──
  const handleMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      cameraRef.current?.flyTo(
        [loc.coords.longitude, loc.coords.latitude],
        600
      );
      cameraRef.current?.zoomTo(12, 600);
    } finally {
      setLocating(false);
    }
  }, []);

  // ── Fit all pins ──
  const handleFitAll = useCallback(() => {
    if (memories.length === 0) return;
    setSelectedMemory(null);

    if (memories.length === 1) {
      const m = memories[0];
      cameraRef.current?.flyTo([m.longitude, m.latitude], 400);
      cameraRef.current?.zoomTo(12, 400);
      return;
    }

    const lons = memories.map((m) => m.longitude);
    const lats = memories.map((m) => m.latitude);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    cameraRef.current?.fitBounds(
      [maxLon, maxLat],
      [minLon, minLat],
      [80, 80, 180, 80],
      600
    );
  }, [memories]);

  return (
    <View style={styles.container}>
      {/* ── Map ── */}
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL="mapbox://styles/mapbox/dark-v11"
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onPress={() => setSelectedMemory(null)}
      >
        <Camera
          ref={cameraRef}
          centerCoordinate={DEFAULT_CENTER}
          zoomLevel={DEFAULT_ZOOM}
          animationMode="flyTo"
          animationDuration={0}
        />

        {/* Pin layer */}
        {geojson.features.length > 0 && (
          <ShapeSource
            id="memories"
            shape={geojson}
            onPress={handlePinPress}
            hitbox={{ width: 44, height: 44 }}
          >
            <SymbolLayer
              id="memory-pins"
              style={{
                iconImage: 'mapbox://sprites/mapbox/dark-v11/restaurant-15',
                iconSize: 1.4,
                iconColor: [
                  'case',
                  ['>=', ['get', 'score'], 7.5], Colors.ratingGreat,
                  ['>=', ['get', 'score'], 5.0], Colors.ratingOkay,
                  Colors.ratingPoor,
                ],
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
                textField: ['get', 'name'],
                textSize: 11,
                textColor: Colors.textPrimary,
                textOffset: [0, 1.4],
                textAnchor: 'top',
                textOptional: true,
                textHaloColor: Colors.background,
                textHaloWidth: 1.5,
              }}
            />
          </ShapeSource>
        )}
      </MapView>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}
            pointerEvents="box-none">
        <Text style={styles.headerTitle}>Food Journey</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleFitAll}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Controls ── */}
      <View style={styles.controls} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleMyLocation}
          activeOpacity={0.8}
          disabled={locating}
        >
          {locating
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Ionicons name="locate" size={20} color={Colors.primary} />
          }
        </TouchableOpacity>
      </View>

      {/* ── Memory count badge ── */}
      {!loading && memories.length > 0 && (
        <View style={[styles.countBadge, { bottom: insets.bottom + 88 }]}>
          <Ionicons name="restaurant" size={12} color={Colors.primary} />
          <Text style={styles.countText}>
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
          </Text>
        </View>
      )}

      {/* ── Selected pin card ── */}
      {selectedMemory && (
        <TouchableOpacity
          style={[styles.cardOverlay, { paddingBottom: insets.bottom + 88 }]}
          activeOpacity={1}
          onPress={() => setSelectedMemory(null)}
        >
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.95}
            onPress={() => {
              setSelectedMemory(null);
              router.push(`/entry/${selectedMemory.id}` as any);
            }}
          >
            {selectedMemory.photos[0] ? (
              <Image
                source={{ uri: selectedMemory.photos[0] }}
                style={styles.cardImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Ionicons name="restaurant" size={24} color={Colors.textMuted} />
              </View>
            )}

            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>
                {selectedMemory.restaurantName}
              </Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {selectedMemory.priceTier} · {selectedMemory.cuisineType}
              </Text>
              <View style={styles.cardLocation}>
                <Ionicons name="location-sharp" size={11} color={Colors.primary} />
                <Text style={styles.cardAddress} numberOfLines={1}>
                  {selectedMemory.city}, {selectedMemory.state}
                </Text>
              </View>
            </View>

            <View style={styles.cardRight}>
              <ScoreBadge score={selectedMemory.compositeScore} size="large" />
              <Ionicons
                name="chevron-forward"
                size={14}
                color={Colors.textMuted}
                style={{ marginTop: 6 }}
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    right: 16,
    top: '45%',
    gap: 8,
  },
  countBadge: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cardImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  cardImagePlaceholder: {
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  cardLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardAddress: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  cardRight: {
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
