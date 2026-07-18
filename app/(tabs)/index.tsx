import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Animated,
} from 'react-native';
import SignedImage from '@/components/shared/SignedImage';
import { Image } from 'expo-image';
import { staticMapUrl } from '@/lib/staticMap';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox, { MapView, Camera, ShapeSource, CircleLayer, SymbolLayer, MarkerView, LocationPuck } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { Colors, getScoreColor } from '@/theme/colors';
import { useMemories, useWantToTry } from '@/context/DataContext';
import type { Memory, WantToTryEntry } from '@/data/mockData';
import ScoreBadge from '@/components/shared/ScoreBadge';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

// ─── Score color expression (reused across layers) ─────────────────
// Thresholds match the tier system in data/mockData.ts (Great >= 7.0, Okay >= 4.0).
const SCORE_COLOR_EXPR: any = [
  'case',
  ['>=', ['get', 'score'], 7.0], Colors.ratingGreat,
  ['>=', ['get', 'score'], 4.0], Colors.ratingOkay,
  Colors.ratingPoor,
];

// ─── Cluster color: based on average score of clustered points ─────
const CLUSTER_AVG_SCORE: any = ['/', ['get', 'totalScore'], ['get', 'point_count']];
const CLUSTER_COLOR_EXPR: any = [
  'case',
  ['>=', CLUSTER_AVG_SCORE, 7.0], Colors.ratingGreat,
  ['>=', CLUSTER_AVG_SCORE, 4.0], Colors.ratingOkay,
  Colors.ratingPoor,
];

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
          scoreLabel: m.compositeScore.toFixed(1),
          name: m.restaurantName,
        },
      })),
  };
}

// ─── Zoom-dependent sizing for want-to-try pins ─────────────────
// Discrete buckets so we only re-render when the zoom crosses a threshold
const WTT_SIZES = [
  { pin: 10, icon: 5, stroke: 0.8 },   // zoom < 5   (far out)
  { pin: 14, icon: 7, stroke: 1 },     // zoom 5–9
  { pin: 18, icon: 10, stroke: 1.5 },  // zoom 10–13
  { pin: 22, icon: 12, stroke: 2 },    // zoom ≥ 14  (close up)
];

function zoomToBucket(zoom: number): number {
  if (zoom < 5) return 0;
  if (zoom < 10) return 1;
  if (zoom < 14) return 2;
  return 3;
}

function selectedGeoJSON(memory: Memory): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: memory.id,
        geometry: {
          type: 'Point',
          coordinates: [memory.longitude, memory.latitude],
        },
        properties: {
          id: memory.id,
          score: memory.compositeScore,
        },
      },
    ],
  };
}

// ── City chips: far-zoom view (below CHIP_ZOOM, pins are replaced by
// named per-metro chips — "Miami · 27" — colored by average score) ──
const CHIP_ZOOM = 6;

interface CityChip {
  key: string;
  label: string;
  count: number;
  avgScore: number;
  center: [number, number];
  bounds: { ne: [number, number]; sw: [number, number] };
}

function buildCityChips(memories: Memory[]): CityChip[] {
  // ~1.5° grid merges suburbs into one metro chip (Davie + Miami + Boca
  // become one), while separate trips stay separate.
  const groups = new Map<string, Memory[]>();
  for (const m of memories) {
    if (!m.latitude || !m.longitude) continue;
    const key = `${Math.round(m.latitude / 1.5)}:${Math.round(m.longitude / 1.5)}`;
    const arr = groups.get(key);
    if (arr) arr.push(m);
    else groups.set(key, [m]);
  }

  return [...groups.entries()].map(([key, ms]) => {
    // Label: the most common city name in the group
    const freq = new Map<string, number>();
    for (const m of ms) {
      if (m.city) freq.set(m.city, (freq.get(m.city) ?? 0) + 1);
    }
    let label = '';
    let best = 0;
    for (const [city, n] of freq) {
      if (n > best) { label = city; best = n; }
    }
    if (!label) label = ms[0].state || '';

    const lats = ms.map((m) => m.latitude);
    const lngs = ms.map((m) => m.longitude);
    return {
      key,
      label,
      count: ms.length,
      avgScore: ms.reduce((s, m) => s + m.compositeScore, 0) / ms.length,
      center: [
        lngs.reduce((a, b) => a + b, 0) / lngs.length,
        lats.reduce((a, b) => a + b, 0) / lats.length,
      ] as [number, number],
      bounds: {
        ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
        sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
      },
    };
  });
}

// ── Animation polish ──────────────────────────────────────────────
/** Soft expanding ring behind the selected pin (native-driver loop). */
function PulsingRing({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1600, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.7] });
  const opacity = anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.22, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulseRing, { borderColor: color, opacity, transform: [{ scale }] }]}
    />
  );
}

/** Springs its content up from the bottom edge when it mounts. */
function SlideUpCard({ children, style }: { children: React.ReactNode; style?: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 70 }).start();
  }, [anim]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Default center: continental US
const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283];
const DEFAULT_ZOOM = 3.5;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { focusMemory, focusWtt } = useLocalSearchParams<{ focusMemory?: string; focusWtt?: string }>();
  const { memories, loading } = useMemories();
  const { entries: wantToTryEntries } = useWantToTry();
  const cameraRef = useRef<Camera>(null);
  const shapeSourceRef = useRef<ShapeSource>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [selectedWtt, setSelectedWtt] = useState<WantToTryEntry | null>(null);
  const [locating, setLocating] = useState(false);
  const [didInitialFit, setDidInitialFit] = useState(false);
  const [wttBucket, setWttBucket] = useState(() => zoomToBucket(DEFAULT_ZOOM));
  const [farView, setFarView] = useState(DEFAULT_ZOOM < CHIP_ZOOM);
  const [mapReady, setMapReady] = useState(false);

  // Request location permission on mount so the user puck appears
  useEffect(() => {
    Location.requestForegroundPermissionsAsync();
  }, []);

  // Delay map rendering by one frame so the native view is ready before
  // JS tries to wire up event handlers (fixes "Could not find view with tag" crash).
  useEffect(() => {
    const id = requestAnimationFrame(() => setMapReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const geojson = useMemo(() => memoriesToGeoJSON(memories), [memories]);
  const cityChips = useMemo(() => buildCityChips(memories), [memories]);
  const uniqueCities = useMemo(
    () => new Set(memories.map(m => m.city).filter(Boolean)).size,
    [memories]
  );
  const wttSize = WTT_SIZES[wttBucket];
  const selectedGeojson = useMemo(
    () => (selectedMemory ? selectedGeoJSON(selectedMemory) : null),
    [selectedMemory]
  );

  // ── Auto-fit camera to memories on first load ──
  useEffect(() => {
    if (loading || didInitialFit || memories.length === 0) return;
    setDidInitialFit(true);

    // Small delay to let the map finish initializing, then fit all pins
    const timer = setTimeout(() => {
      const withCoords = memories.filter((m) => m.latitude && m.longitude);
      if (withCoords.length === 0) return;

      if (withCoords.length === 1) {
        const m = withCoords[0];
        cameraRef.current?.setCamera({
          centerCoordinate: [m.longitude, m.latitude],
          zoomLevel: 12,
          animationDuration: 800,
          animationMode: 'flyTo',
        });
        return;
      }

      const lons = withCoords.map((m) => m.longitude);
      const lats = withCoords.map((m) => m.latitude);
      cameraRef.current?.fitBounds(
        [Math.max(...lons), Math.max(...lats)],
        [Math.min(...lons), Math.min(...lats)],
        [60, 60, 60, 60],
        800
      );
    }, 400);

    return () => clearTimeout(timer);
  }, [loading, memories, didInitialFit]);

  // ── Focus a specific memory (navigated from detail screen) ──
  useEffect(() => {
    if (!focusMemory || loading || memories.length === 0) return;
    const found = memories.find((m) => m.id === focusMemory);
    if (!found) return;

    setSelectedMemory(found);
    setTimeout(() => {
      cameraRef.current?.setCamera({
        centerCoordinate: [found.longitude, found.latitude],
        zoomLevel: 14,
        animationDuration: 600,
        animationMode: 'flyTo',
      });
    }, 300);
  }, [focusMemory, loading, memories]);

  // ── Focus a want-to-try pin (navigated from library) ──
  useEffect(() => {
    if (!focusWtt || wantToTryEntries.length === 0) return;
    const found = wantToTryEntries.find((e) => e.id === focusWtt);
    if (!found || !found.latitude || !found.longitude) return;

    setSelectedMemory(null);
    setSelectedWtt(found);
    setTimeout(() => {
      cameraRef.current?.setCamera({
        centerCoordinate: [found.longitude, found.latitude],
        zoomLevel: 14,
        animationDuration: 600,
        animationMode: 'flyTo',
      });
    }, 300);
  }, [focusWtt, wantToTryEntries]);

  // ── Tap a pin (or a cluster — zooms to where it splits apart) ──
  const handlePinPress = useCallback(
    async (event: any) => {
      const feature = event.features?.[0];
      if (!feature) return;

      if (feature.properties?.cluster) {
        // getClusterExpansionZoom can hang and never settle — race it
        // against a short timeout so the camera always moves.
        let expansionZoom: number | undefined;
        try {
          expansionZoom = await Promise.race<number | undefined>([
            shapeSourceRef.current?.getClusterExpansionZoom(feature) ?? Promise.resolve(undefined),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 350)),
          ]);
        } catch {
          // fall through to a fixed zoom bump
        }
        cameraRef.current?.setCamera({
          centerCoordinate: feature.geometry?.coordinates,
          zoomLevel: Math.min((expansionZoom ?? 13) + 0.3, 16),
          animationDuration: 500,
          animationMode: 'flyTo',
        });
        return;
      }

      const id = feature.properties?.id;
      const found = memories.find((m) => m.id === id);
      if (!found) return;

      setSelectedMemory(found);
      setSelectedWtt(null);

      cameraRef.current?.setCamera({
        centerCoordinate: [found.longitude, found.latitude],
        zoomLevel: 13,
        animationDuration: 500,
        animationMode: 'flyTo',
      });
    },
    [memories]
  );

  // ── Track zoom for want-to-try pin sizing (discrete buckets)
  //    and for the far-zoom city-chip view ──
  const handleCameraChanged = useCallback((state: any) => {
    const zoom = state.properties?.zoom;
    if (zoom == null) return;
    const bucket = zoomToBucket(zoom);
    setWttBucket((prev) => (prev !== bucket ? bucket : prev));
    const far = zoom < CHIP_ZOOM;
    setFarView((prev) => (prev !== far ? far : prev));
  }, []);

  // ── Tap a city chip → fly into that city ──
  // Direct setCamera with a span-derived zoom (fitBounds proved
  // unreliable when invoked from a MarkerView touch).
  const handleChipPress = useCallback((chip: CityChip) => {
    setSelectedMemory(null);
    setSelectedWtt(null);
    const span = Math.max(
      chip.bounds.ne[0] - chip.bounds.sw[0],
      chip.bounds.ne[1] - chip.bounds.sw[1],
      0.005,
    );
    const zoom = Math.max(8, Math.min(12.5, Math.log2(360 / span) - 1));
    cameraRef.current?.setCamera({
      centerCoordinate: chip.center,
      zoomLevel: zoom,
      animationDuration: 700,
      animationMode: 'flyTo',
    });
  }, []);

  // ── My location button ──
  const handleMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      cameraRef.current?.setCamera({
        centerCoordinate: [loc.coords.longitude, loc.coords.latitude],
        zoomLevel: 12,
        animationDuration: 800,
        animationMode: 'flyTo',
      });
    } finally {
      setLocating(false);
    }
  }, []);

  // ── Zoom out to show all pins at near-max zoom ──
  const handleZoomOut = useCallback(() => {
    setSelectedMemory(null);
    setSelectedWtt(null);
    cameraRef.current?.setCamera({
      centerCoordinate: DEFAULT_CENTER,
      zoomLevel: 2,
      animationDuration: 800,
      animationMode: 'flyTo',
    });
  }, []);

  return (
    <View style={styles.container}>
      {/* ── Map ── */}
      {mapReady && (
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL="mapbox://styles/mapbox/dark-v11"
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onCameraChanged={handleCameraChanged}
        onPress={() => { setSelectedMemory(null); setSelectedWtt(null); }}
      >
        <Camera
          ref={cameraRef}
          centerCoordinate={DEFAULT_CENTER}
          zoomLevel={DEFAULT_ZOOM}
          minZoomLevel={2}
          animationMode="flyTo"
          animationDuration={0}
        />

        {/* ── Pin layers ── */}
        {geojson.features.length > 0 && (
          <ShapeSource
            id="memories"
            ref={shapeSourceRef}
            shape={geojson}
            onPress={handlePinPress}
            hitbox={{ width: 44, height: 44 }}
            cluster
            clusterRadius={25}
            clusterMaxZoomLevel={13}
            clusterProperties={{
              // Sum of member scores → CLUSTER_COLOR_EXPR divides by count
              totalScore: [['+', ['accumulated'], ['get', 'totalScore']], ['get', 'score']],
            }}
          >
            {/* Cluster: soft tier-colored ring + solid circle + count.
                Tight radius means these only appear where dots overlap. */}
            <CircleLayer
              id="cluster-ring"
              minZoomLevel={CHIP_ZOOM}
              filter={['has', 'point_count'] as any}
              style={{
                // Zoom-scaled so continent view gets compact circles
                circleRadius: [
                  'interpolate', ['linear'], ['zoom'],
                  3, ['step', ['get', 'point_count'], 12, 10, 14, 25, 16],
                  13, ['step', ['get', 'point_count'], 18, 10, 21, 25, 24],
                ],
                circleColor: CLUSTER_COLOR_EXPR,
                circleOpacity: 0.22,
                circlePitchAlignment: 'map',
              }}
            />
            <CircleLayer
              id="cluster-circles"
              minZoomLevel={CHIP_ZOOM}
              filter={['has', 'point_count'] as any}
              style={{
                circleRadius: [
                  'interpolate', ['linear'], ['zoom'],
                  3, ['step', ['get', 'point_count'], 9, 10, 11, 25, 13],
                  13, ['step', ['get', 'point_count'], 13, 10, 16, 25, 19],
                ],
                circleColor: CLUSTER_COLOR_EXPR,
                circleStrokeWidth: 2,
                circleStrokeColor: '#FFFFFF',
                circlePitchAlignment: 'map',
              }}
            />
            <SymbolLayer
              id="cluster-counts"
              minZoomLevel={CHIP_ZOOM}
              filter={['has', 'point_count'] as any}
              style={{
                textField: ['get', 'point_count_abbreviated'],
                textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                textSize: ['interpolate', ['linear'], ['zoom'], 3, 10, 13, 12],
                textColor: '#0B1120',
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />

            {/* Individual memory dots (unclustered) */}
            <CircleLayer
              id="memory-circles"
              minZoomLevel={CHIP_ZOOM}
              filter={['!', ['has', 'point_count']] as any}
              style={{
                circleRadius: [
                  'interpolate', ['linear'], ['zoom'],
                  2, 4,
                  6, 6,
                  10, 10,
                  15, 14,
                ],
                circleColor: SCORE_COLOR_EXPR,
                circleStrokeWidth: [
                  'interpolate', ['linear'], ['zoom'],
                  2, 1,
                  10, 2,
                  15, 2.5,
                ],
                circleStrokeColor: '#FFFFFF',
                circleSortKey: ['get', 'score'],
                circlePitchAlignment: 'map',
              }}
            />
            {/* Score inside the dot once it's big enough to carry it */}
            <SymbolLayer
              id="memory-scores"
              filter={['!', ['has', 'point_count']] as any}
              minZoomLevel={10}
              style={{
                textField: ['get', 'scoreLabel'],
                textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                textSize: ['interpolate', ['linear'], ['zoom'], 10, 7.5, 15, 10],
                textColor: '#0B1120',
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
            {/* Restaurant name under the dot at street zoom; labels
                auto-hide instead of colliding in dense areas */}
            <SymbolLayer
              id="memory-names"
              filter={['!', ['has', 'point_count']] as any}
              minZoomLevel={13}
              style={{
                textField: ['get', 'name'],
                textFont: ['DIN Pro Medium', 'Arial Unicode MS Regular'],
                textSize: 11,
                textColor: '#FFFFFF',
                textHaloColor: 'rgba(0,0,0,0.85)',
                textHaloWidth: 1.2,
                textAnchor: 'top',
                textOffset: [0, 1.1],
                textMaxWidth: 8,
              }}
            />
          </ShapeSource>
        )}

        {/* ── Want to try pins (purple + bookmark — zoom-responsive sizing;
               hidden at far zoom where city chips take over) ── */}
        {!farView && wantToTryEntries
          .filter((e) => e.latitude && e.longitude)
          .map((entry) => (
            <MarkerView
              key={entry.id}
              coordinate={[entry.longitude, entry.latitude]}
              anchor={{ x: 0.5, y: 0.5 }}
              allowOverlapWithPuck
            >
              <TouchableOpacity
                style={[
                  styles.wttPin,
                  {
                    width: wttSize.pin,
                    height: wttSize.pin,
                    borderRadius: wttSize.pin / 2,
                    borderWidth: wttSize.stroke,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedMemory(null);
                  setSelectedWtt(entry);
                  cameraRef.current?.setCamera({
                    centerCoordinate: [entry.longitude, entry.latitude],
                    zoomLevel: 13,
                    animationDuration: 500,
                    animationMode: 'flyTo',
                  });
                }}
              >
                <Ionicons name="bookmark" size={wttSize.icon} color="#FFFFFF" />
              </TouchableOpacity>
            </MarkerView>
          ))}

        {/* ── City chips (far zoom only — replace the pin layers) ── */}
        {farView &&
          cityChips.map((chip) => (
            <MarkerView
              key={chip.key}
              coordinate={chip.center}
              anchor={{ x: 0.5, y: 0.5 }}
              allowOverlapWithPuck
            >
              <Pressable
                style={({ pressed }) => [styles.cityChip, pressed && { opacity: 0.8 }]}
                hitSlop={10}
                onPress={() => handleChipPress(chip)}
              >
                <View
                  style={[styles.cityChipDot, { backgroundColor: getScoreColor(chip.avgScore) }]}
                />
                {!!chip.label && <Text style={styles.cityChipName}>{chip.label}</Text>}
                <Text style={styles.cityChipCount}>{chip.count}</Text>
              </Pressable>
            </MarkerView>
          ))}

        {/* ── Current location puck ── */}
        <LocationPuck
          puckBearing="heading"
          puckBearingEnabled
          scale={['interpolate', ['linear'], ['zoom'], 2, 0.4, 8, 0.6, 14, 0.85, 20, 1.0]}
          pulsing={{ isEnabled: true, color: '#2A3A4E', radius: 30 }}
        />

        {/* ── Pulsing ring behind the selected pin ── */}
        {selectedMemory && !!selectedMemory.latitude && !!selectedMemory.longitude && (
          <MarkerView
            coordinate={[selectedMemory.longitude, selectedMemory.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlapWithPuck
          >
            <View pointerEvents="none" style={styles.pulseWrap}>
              <PulsingRing color={getScoreColor(selectedMemory.compositeScore)} />
            </View>
          </MarkerView>
        )}
        {selectedWtt && !selectedMemory && !!selectedWtt.latitude && !!selectedWtt.longitude && (
          <MarkerView
            coordinate={[selectedWtt.longitude, selectedWtt.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlapWithPuck
          >
            <View pointerEvents="none" style={styles.pulseWrap}>
              <PulsingRing color={Colors.purple} />
            </View>
          </MarkerView>
        )}

        {/* ── Selected pin highlight ── */}
        {selectedGeojson && (
          <ShapeSource id="selected-memory" shape={selectedGeojson}>
            {/* Outer glow pulse */}
            <CircleLayer
              id="selected-glow"
              style={{
                circleRadius: [
                  'interpolate', ['linear'], ['zoom'],
                  2, 10,
                  10, 18,
                  15, 24,
                ],
                circleColor: SCORE_COLOR_EXPR,
                circleOpacity: 0.2,
              }}
            />
            {/* Selected dot — slightly larger */}
            <CircleLayer
              id="selected-circle"
              style={{
                circleRadius: [
                  'interpolate', ['linear'], ['zoom'],
                  2, 6,
                  10, 11,
                  15, 14,
                ],
                circleColor: SCORE_COLOR_EXPR,
                circleStrokeWidth: 2.5,
                circleStrokeColor: '#FFFFFF',
              }}
            />
          </ShapeSource>
        )}
      </MapView>
      )}

      {/* ── Top header badge ── */}
      {!loading && memories.length > 0 && (
        <View style={[styles.headerBadge, { top: insets.top + 8 }]}>
          <Text style={styles.headerBadgeText}>
            {memories.length} {memories.length === 1 ? 'place' : 'places'}
            {' · '}
            {uniqueCities} {uniqueCities === 1 ? 'city' : 'cities'}
          </Text>
        </View>
      )}

      {/* ── Empty state ── */}
      {!loading && memories.length === 0 && (
        <View style={[styles.emptyState, { top: insets.top + 8 }]}>
          <Text style={styles.emptyStateText}>Log a meal to start your food passport</Text>
        </View>
      )}

      {/* ── Bottom-right controls ── */}
      <View style={styles.controls} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={handleMyLocation}
          activeOpacity={0.8}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="locate" size={20} color={Colors.primary} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlBtn}
          onPress={handleZoomOut}
          activeOpacity={0.8}
        >
          <Ionicons name="expand-outline" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Selected memory card ── */}
      {selectedMemory && (
        <SlideUpCard key={selectedMemory.id} style={[styles.cardWrap, { bottom: 12 }]}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.95}
          onPress={() => {
            setSelectedMemory(null);
            router.push(`/entry/${selectedMemory.id}` as any);
          }}
        >
          {selectedMemory.photos[0] ? (
            <SignedImage
              uri={selectedMemory.photos[0]}
              style={styles.cardImage}
              contentFit="cover"
            />
          ) : selectedMemory.latitude && selectedMemory.longitude ? (
            <Image
              source={{
                uri: staticMapUrl(selectedMemory.latitude, selectedMemory.longitude, {
                  width: 64,
                  height: 64,
                  zoom: 15.5,
                }),
              }}
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
              <Ionicons name="location-sharp" size={11} color={Colors.purple} />
              <Text style={styles.cardAddress} numberOfLines={1}>
                {[selectedMemory.city, selectedMemory.state].filter(Boolean).join(', ') || selectedMemory.address}
              </Text>
            </View>
          </View>

          <View style={styles.cardRight}>
            <ScoreBadge score={selectedMemory.compositeScore} size="large" />
            <Ionicons
              name="chevron-forward"
              size={14}
              color={Colors.textMuted}
              style={{ marginTop: 4 }}
            />
          </View>
        </TouchableOpacity>
        </SlideUpCard>
      )}

      {/* ── Selected want-to-try card ── */}
      {selectedWtt && !selectedMemory && (
        <SlideUpCard key={selectedWtt.id} style={[styles.cardWrap, { bottom: 12 }]}>
        <View style={styles.card}>
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="bookmark" size={24} color={Colors.purple} />
          </View>

          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>
              {selectedWtt.restaurantName}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {selectedWtt.eateryType}
            </Text>
            <View style={styles.cardLocation}>
              <Ionicons name="location-sharp" size={11} color={Colors.purple} />
              <Text style={styles.cardAddress} numberOfLines={1}>
                {[selectedWtt.city, selectedWtt.state].filter(Boolean).join(', ') || selectedWtt.address}
              </Text>
            </View>
          </View>

          <View style={styles.wttBadge}>
            <Ionicons name="bookmark" size={14} color={Colors.purple} />
            <Text style={styles.wttBadgeText}>Want to Try</Text>
          </View>
        </View>
        </SlideUpCard>
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

  // ── Bottom-right controls ──
  controls: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    gap: 8,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  // ── Selected pin card ──
  cardWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  pulseWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
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
    shadowOpacity: 0.3,
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
  // ── City chips (far zoom) ──
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(20, 27, 45, 0.92)',
    borderWidth: 1,
    borderColor: Colors.surfaceBorderLight,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  cityChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cityChipName: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  cityChipCount: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  wttPin: {
    backgroundColor: Colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 1.5,
    elevation: 2,
  },
  wttBadge: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.purpleBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  wttBadgeText: {
    color: Colors.purple,
    fontSize: 9,
    fontWeight: '700',
  },

  // ── Header badge ──
  headerBadge: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  headerBadgeText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Empty state ──
  emptyState: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  emptyStateText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Loading ──
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
