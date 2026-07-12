/**
 * Import flow, phase 1a (spec: docs/import-spec.md).
 * Paste any list → parse → resolve against Foursquare → review matches →
 * add to Want to Try. Every created row carries an import_batch_id.
 */
import React, { useState, useRef, useEffect } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { Colors } from '@/theme/colors';
import { useMemories, useWantToTry } from '@/context/DataContext';
import { parseImportText, type ParsedRow } from '@/lib/importParse';
import { resolveRows, normalizeName, type ResolvedRow } from '@/lib/importResolve';
import { searchFoursquarePlaces } from '@/lib/foursquare';
import {
  makeSessionToken,
  searchLocations,
  retrieveLocation,
  type LocationSuggestion,
} from '@/lib/mapboxLocation';
import type { SearchResult } from '@/data/mockData';

type Phase = 'input' | 'preview' | 'resolving' | 'review' | 'done';

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const { memories } = useMemories();
  const { entries: wantToTry, addBatch } = useWantToTry();

  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<{ row: ParsedRow; kept: boolean }[]>([]);
  const [resolved, setResolved] = useState<ResolvedRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const [addedCount, setAddedCount] = useState(0);

  // ── Batch location bias ──
  const [bias, setBias] = useState<{ lat: number; lng: number } | null>(null);
  const [biasLabel, setBiasLabel] = useState('Anywhere');
  const [editingBias, setEditingBias] = useState(false);
  const [biasInput, setBiasInput] = useState('');
  const [biasSuggestions, setBiasSuggestions] = useState<LocationSuggestion[]>([]);
  const sessionTokenRef = useRef(makeSessionToken());

  // Default the bias to GPS if permission is already granted (no prompt)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getLastKnownPositionAsync();
        if (loc) {
          setBias({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          setBiasLabel('Current Location');
        }
      } catch { /* bias stays null */ }
    })();
  }, []);

  // Debounced bias autocomplete
  useEffect(() => {
    if (!editingBias || !biasInput.trim()) {
      setBiasSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setBiasSuggestions(await searchLocations(biasInput, sessionTokenRef.current, bias));
    }, 300);
    return () => clearTimeout(timer);
  }, [biasInput, editingBias, bias]);

  const pickBiasSuggestion = async (s: LocationSuggestion) => {
    Keyboard.dismiss();
    setBiasSuggestions([]);
    setEditingBias(false);
    setBiasInput('');
    const place = await retrieveLocation(s.mapbox_id, sessionTokenRef.current);
    sessionTokenRef.current = makeSessionToken();
    if (place) {
      setBias({ lat: place.lat, lng: place.lng });
      setBiasLabel(s.context || s.name);
    }
  };

  // ── Parse → preview (no network yet) ──
  const handleFindPlaces = () => {
    Keyboard.dismiss();
    const rows = parseImportText(text);
    if (rows.length === 0) {
      Alert.alert('Nothing to import', 'Paste a list with one place per line, or spreadsheet cells.');
      return;
    }
    if (rows.length > 300) {
      Alert.alert('Too many rows', `Found ${rows.length} places — imports are capped at 300 per batch. Split the list and run it twice.`);
      return;
    }
    setParsed(rows.map((row) => ({ row, kept: true })));
    setPhase('preview');
  };

  const toggleParsedRow = (index: number) => {
    setParsed((prev) => prev.map((p, i) => (i === index ? { ...p, kept: !p.kept } : p)));
  };

  const keptRows = parsed.filter((p) => p.kept).map((p) => p.row);

  // ── Resolve the kept rows against Foursquare ──
  const handleStartMatching = async () => {
    const rows = keptRows;
    if (rows.length === 0) return;

    const existingKeys = new Set<string>([
      ...memories.map((m) => normalizeName(m.restaurantName)),
      ...wantToTry.map((e) => normalizeName(e.restaurantName)),
    ]);
    const existingFsqIds = new Set<string>(
      [...memories.map((m) => m.fsqPlaceId), ...wantToTry.map((e) => e.fsqPlaceId)]
        .filter((id): id is string => !!id),
    );

    setPhase('resolving');
    setProgress({ done: 0, total: rows.length });
    try {
      const results = await resolveRows(rows, bias, existingKeys, existingFsqIds, (done, total) =>
        setProgress({ done, total }),
      );
      setResolved(results);
      setPhase('review');
    } catch (err: any) {
      Alert.alert('Could not match places', err.message ?? 'Something went wrong.');
      setPhase('preview');
    }
  };

  // ── Review actions ──
  const toggleExcluded = (index: number) => {
    setResolved((prev) =>
      prev.map((r, i) => (i === index ? { ...r, excluded: !r.excluded } : r)),
    );
  };

  const chooseCandidate = (index: number, candidate: SearchResult) => {
    setResolved((prev) =>
      prev.map((r, i) => (i === index ? { ...r, chosen: candidate, excluded: false } : r)),
    );
  };

  const retryRow = async (index: number, newQuery: string) => {
    const q = newQuery.trim();
    if (!q) return;
    try {
      const results = await searchFoursquarePlaces(q, bias?.lat ?? null, bias?.lng ?? null);
      setResolved((prev) =>
        prev.map((r, i) => {
          if (i !== index) return r;
          const candidates = results.slice(0, 3);
          return {
            ...r,
            row: { ...r.row, name: q },
            candidates,
            chosen: candidates.length === 1 ? candidates[0] : null,
            status: candidates.length > 0 ? 'pick' : 'attention',
          };
        }),
      );
    } catch (err: any) {
      Alert.alert('Search failed', err.message ?? 'Try again.');
    }
  };

  const included = resolved.filter((r) => !r.excluded && r.chosen);

  const handleImport = async () => {
    if (included.length === 0) return;
    setSaving(true);
    try {
      const batchId = Crypto.randomUUID();
      const count = await addBatch(
        included.map((r) => ({
          name: r.chosen!.name,
          address: r.chosen!.address,
          city: r.chosen!.city,
          state: r.chosen!.state,
          latitude: r.chosen!.latitude,
          longitude: r.chosen!.longitude,
          fsqPlaceId: r.chosen!.id,
          cuisineType: r.chosen!.category,
        })),
        batchId,
      );
      setAddedCount(count);
      setPhase('done');
    } catch (err: any) {
      Alert.alert('Import failed', err.message ?? 'Nothing was saved.');
    } finally {
      setSaving(false);
    }
  };

  // ── Row renderer ──
  const renderRow = ({ item, index }: { item: ResolvedRow; index: number }) => {
    if (item.status === 'duplicate') {
      return (
        <View style={[styles.rowCard, styles.rowDim]}>
          <Ionicons name="copy-outline" size={18} color={Colors.textMuted} />
          <View style={styles.rowInfo}>
            <Text style={styles.rowName}>{item.chosen?.name ?? item.row.name}</Text>
            <Text style={styles.rowSub}>Already in your library or list</Text>
          </View>
        </View>
      );
    }

    if (item.status === 'attention') {
      return <AttentionRow item={item} onRetry={(q) => retryRow(index, q)} />;
    }

    if (item.status === 'pick' && !item.chosen) {
      return (
        <View style={styles.rowCard}>
          <Ionicons name="help-circle-outline" size={18} color={Colors.ratingOkay} />
          <View style={styles.rowInfo}>
            <Text style={styles.rowName}>{item.row.name}</Text>
            <Text style={styles.rowSub}>Which one?</Text>
            {item.candidates.map((c) => (
              <TouchableOpacity key={c.id} style={styles.candidateRow} onPress={() => chooseCandidate(index, c)}>
                <Ionicons name="location-outline" size={13} color={Colors.purple} />
                <Text style={styles.candidateText} numberOfLines={1}>
                  {c.name} · {c.address}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    // confirmed, or pick with a chosen candidate
    return (
      <TouchableOpacity style={[styles.rowCard, item.excluded && styles.rowDim]} onPress={() => toggleExcluded(index)}>
        <Ionicons
          name={item.excluded ? 'ellipse-outline' : 'checkmark-circle'}
          size={20}
          color={item.excluded ? Colors.textMuted : Colors.primary}
        />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{item.chosen!.name}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {[item.chosen!.category, item.chosen!.address].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Phases ──
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 12 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Import Places</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {phase === 'input' && (
        <View style={styles.body}>
          <Text style={styles.hint}>
            Paste your list — from Notes, a text, or cells copied out of a spreadsheet. One place per line. (CSV / Excel file upload coming soon.)
          </Text>
          <TextInput
            style={styles.pasteBox}
            multiline
            placeholder={'Katz\'s Delicatessen\nCarbone - amazing pasta\nSiroo Juk Story (Ellicott City)'}
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            textAlignVertical="top"
          />

          {/* Batch location bias */}
          {editingBias ? (
            <View>
              <View style={styles.biasInputWrap}>
                <Ionicons name="location-outline" size={16} color={Colors.purple} />
                <TextInput
                  style={styles.biasInput}
                  placeholder="City these places are in..."
                  placeholderTextColor={Colors.textMuted}
                  value={biasInput}
                  onChangeText={setBiasInput}
                  autoFocus
                  autoCorrect={false}
                />
              </View>
              {biasSuggestions.map((s) => (
                <TouchableOpacity key={s.mapbox_id} style={styles.suggestionRow} onPress={() => pickBiasSuggestion(s)}>
                  <Ionicons name="location-outline" size={14} color={Colors.purple} />
                  <Text style={styles.suggestionText} numberOfLines={1}>{s.context}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <TouchableOpacity style={styles.biasPill} onPress={() => setEditingBias(true)}>
              <Ionicons name="location" size={14} color={Colors.purple} />
              <Text style={styles.biasPillText} numberOfLines={1}>
                Area (optional, for lines without a city): {biasLabel}
              </Text>
              <Ionicons name="pencil-outline" size={13} color={Colors.textMuted} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.primaryBtn, !text.trim() && styles.primaryBtnDisabled]}
            disabled={!text.trim()}
            onPress={handleFindPlaces}
          >
            <Text style={styles.primaryBtnText}>Find my places</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'preview' && (
        <View style={styles.body}>
          <Text style={styles.hint}>
            Found {keptRows.length} place{keptRows.length === 1 ? '' : 's'} — tap anything that
            isn&apos;t a restaurant to remove it. Nothing is searched yet.
          </Text>
          <FlatList
            data={parsed}
            keyExtractor={(item, i) => `${i}-${item.row.raw}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[styles.rowCard, !item.kept && styles.rowDim]}
                onPress={() => toggleParsedRow(index)}
              >
                <Ionicons
                  name={item.kept ? 'checkmark-circle' : 'close-circle-outline'}
                  size={20}
                  color={item.kept ? Colors.primary : Colors.textMuted}
                />
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, !item.kept && styles.rowStruck]}>{item.row.name}</Text>
                  {(item.row.note || item.row.city) && (
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[item.row.city, item.row.note].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, keptRows.length === 0 && styles.primaryBtnDisabled, { marginBottom: insets.bottom + 8 }]}
            disabled={keptRows.length === 0}
            onPress={handleStartMatching}
          >
            <Text style={styles.primaryBtnText}>Match {keptRows.length} place{keptRows.length === 1 ? '' : 's'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'resolving' && (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.resolvingText}>
            Matching {progress.done} of {progress.total}...
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }]}
            />
          </View>
        </View>
      )}

      {phase === 'review' && (
        <View style={styles.body}>
          <Text style={styles.hint}>
            {included.length} ready · {resolved.filter((r) => r.status === 'pick' && !r.chosen).length} to choose ·{' '}
            {resolved.filter((r) => r.status === 'attention').length} unmatched ·{' '}
            {resolved.filter((r) => r.status === 'duplicate').length} already saved
          </Text>
          <FlatList
            data={resolved}
            renderItem={renderRow}
            keyExtractor={(item, i) => `${i}-${item.row.raw}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          />
          <TouchableOpacity
            style={[styles.primaryBtn, (included.length === 0 || saving) && styles.primaryBtnDisabled, { marginBottom: insets.bottom + 8 }]}
            disabled={included.length === 0 || saving}
            onPress={handleImport}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryBtnText}>
                Add {included.length} to Want to Try
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {phase === 'done' && (
        <View style={styles.centerWrap}>
          <Ionicons name="checkmark-circle" size={52} color={Colors.primary} />
          <Text style={styles.doneTitle}>{addedCount} places added!</Text>
          <Text style={styles.hint}>Waiting in your Want to Try list.</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              router.back();
              router.navigate('/(tabs)/library' as any);
            }}
          >
            <Text style={styles.primaryBtnText}>See the list</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Unmatched row with editable retry ──────────────────────────────
function AttentionRow({ item, onRetry }: { item: ResolvedRow; onRetry: (q: string) => void }) {
  const [query, setQuery] = useState(item.row.name);
  return (
    <View style={styles.rowCard}>
      <Ionicons name="alert-circle-outline" size={18} color={Colors.ratingPoor} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowSub}>No match found — edit and retry:</Text>
        <View style={styles.retryRow}>
          <TextInput
            style={styles.retryInput}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            placeholderTextColor={Colors.textMuted}
          />
          <TouchableOpacity style={styles.retryBtn} onPress={() => onRetry(query)}>
            <Ionicons name="search" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
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
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: '800' },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, paddingHorizontal: 16 },
  hint: { color: Colors.textSecondary, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  pasteBox: {
    minHeight: 160,
    maxHeight: 260,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    padding: 14,
    color: Colors.textPrimary,
    fontSize: 14,
    marginBottom: 12,
  },
  biasPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.purple,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  biasPillText: { flex: 1, color: Colors.purple, fontSize: 13, fontWeight: '500' },
  biasInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.purple,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  biasInput: { flex: 1, color: Colors.textPrimary, fontSize: 13 },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  suggestionText: { flex: 1, color: Colors.textSecondary, fontSize: 13 },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  resolvingText: { color: Colors.textSecondary, fontSize: 14 },
  progressTrack: {
    width: '100%', height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceLight, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  doneTitle: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowDim: { opacity: 0.45 },
  rowInfo: { flex: 1 },
  rowName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  rowStruck: { textDecorationLine: 'line-through', color: Colors.textMuted },
  rowSub: { color: Colors.textSecondary, fontSize: 12 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  candidateText: { flex: 1, color: Colors.textSecondary, fontSize: 12 },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  retryInput: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Colors.textPrimary,
    fontSize: 13,
  },
  retryBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
});
