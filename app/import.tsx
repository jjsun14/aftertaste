/**
 * Import flow, phase 1a (spec: docs/import-spec.md).
 * Paste any list → parse → resolve against Google Places → review matches →
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
import {
  resolveRows,
  normalizeName,
  classifyCandidates,
  geocodeCity,
  type ResolvedRow,
  type Coords,
} from '@/lib/importResolve';
import { searchGooglePlaces, ensureResolved } from '@/lib/googlePlaces';
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
  const cityCacheRef = useRef(new Map<string, Coords | null>());

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

  // ── Resolve the kept rows against Google Places ──
  // Incremental: going back to preview and forward again re-resolves
  // NOTHING that's already matched — deselected rows are dropped from the
  // review, newly (re)selected rows are the only ones that hit the API.
  const handleStartMatching = async () => {
    const rows = keptRows;
    if (rows.length === 0) return;

    const alreadyResolved = new Map(resolved.map((r) => [normalizeName(r.row.name), r]));
    const newRows = rows.filter((r) => !alreadyResolved.has(normalizeName(r.name)));
    const keptKeys = new Set(rows.map((r) => normalizeName(r.name)));

    // Nothing new — just prune deselected rows and show the review again
    if (newRows.length === 0 && resolved.length > 0) {
      setResolved((prev) => prev.filter((r) => keptKeys.has(normalizeName(r.row.name))));
      setPhase('review');
      return;
    }

    const existingKeys = new Set<string>([
      ...memories.map((m) => normalizeName(m.restaurantName)),
      ...wantToTry.map((e) => normalizeName(e.restaurantName)),
    ]);
    const existingPlaceIds = new Set<string>(
      [...memories.map((m) => m.placeId), ...wantToTry.map((e) => e.placeId)]
        .filter((id): id is string => !!id),
    );

    setPhase('resolving');
    setProgress({ done: 0, total: newRows.length });
    try {
      const fresh = await resolveRows(newRows, bias, biasLabel, existingKeys, existingPlaceIds, (done, total) =>
        setProgress({ done, total }),
      );
      // Merge: surviving previous work + newly resolved, in kept order
      const freshByKey = new Map(fresh.map((r) => [normalizeName(r.row.name), r]));
      const merged = rows
        .map((r) => alreadyResolved.get(normalizeName(r.name)) ?? freshByKey.get(normalizeName(r.name)))
        .filter((r): r is ResolvedRow => !!r);
      setResolved(merged);
      setPhase('review');
    } catch (err: any) {
      Alert.alert('Could not match places', err.message ?? 'Something went wrong.');
      setPhase('preview');
    }
  };

  const handleClose = () => {
    const hasWork = phase === 'preview' || phase === 'resolving' || phase === 'review';
    if (!hasWork) {
      router.back();
      return;
    }
    Alert.alert('Discard this import?', 'Your matched places will be lost.', [
      { text: 'Keep working', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
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

  // Re-search one row with an edited name and/or an edited location
  // ("zipcode or a city or anything like regular search").
  const researchRow = async (
    index: number,
    opts: { name?: string; locationText?: string },
  ) => {
    const current = resolved[index];
    const name = (opts.name ?? current.row.name).trim();
    if (!name) return;

    let rowBias = current.bias ?? bias;
    let label = current.locationLabel;
    if (opts.locationText?.trim()) {
      const coords = await geocodeCity(opts.locationText, cityCacheRef.current, bias);
      if (!coords) {
        Alert.alert('Location not found', `Couldn't find "${opts.locationText}". Try a city or zip code.`);
        return;
      }
      rowBias = coords;
      label = opts.locationText.trim();
    }

    try {
      const results = await searchGooglePlaces(name, rowBias?.lat ?? null, rowBias?.lng ?? null);
      const { candidates, topScore, isChain } = classifyCandidates(name, results, rowBias);
      setResolved((prev) =>
        prev.map((r, i) => {
          if (i !== index) return r;
          const confirmed = candidates.length > 0 && topScore >= 0.85 && !isChain;
          return {
            ...r,
            row: { ...r.row, name },
            candidates,
            chosen: confirmed ? candidates[0] : null,
            status: candidates.length === 0 ? 'attention' : confirmed ? 'confirmed' : 'pick',
            locationLabel: label,
            bias: rowBias,
            excluded: false,
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
      // Autocomplete-fallback candidates carry no coordinates — resolve
      // them (one details call each) before writing rows.
      const places = await Promise.all(
        included.map((r) =>
          r.chosen!.latitude === undefined ? ensureResolved(r.chosen!) : Promise.resolve(r.chosen!),
        ),
      );
      const count = await addBatch(
        places.map((p) => ({
          name: p.name,
          address: p.address,
          city: p.city,
          state: p.state,
          latitude: p.latitude,
          longitude: p.longitude,
          placeId: p.id,
          cuisineType: p.category,
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
  const renderRow = ({ item, index }: { item: ResolvedRow; index: number }) => (
    <ReviewRow
      item={item}
      onToggleExcluded={() => toggleExcluded(index)}
      onChoose={(c) => chooseCandidate(index, c)}
      onResearch={(opts) => researchRow(index, opts)}
    />
  );

  // ── Phases ──
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 12 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {(phase === 'preview' || phase === 'review') && (
            <TouchableOpacity
              style={[styles.closeBtn, { marginRight: 10 }]}
              onPress={() => setPhase(phase === 'review' ? 'preview' : 'input')}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>Import Places</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
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
              <Text style={styles.biasPillLabel} numberOfLines={1}>
                {biasLabel === 'Anywhere' ? (
                  'Where are most of these places located?'
                ) : (
                  <>
                    Most places are near:{' '}
                    <Text style={styles.biasPillValue}>
                      {biasLabel.replace(/, United States$/, '')}
                    </Text>
                  </>
                )}
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
                      {[item.row.city && `📍 ${item.row.city}`, item.row.note]
                        .filter(Boolean)
                        .join('  ·  ')}
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

// ── One review row: match + searched-location, both editable ───────
function ReviewRow({
  item,
  onToggleExcluded,
  onChoose,
  onResearch,
}: {
  item: ResolvedRow;
  onToggleExcluded: () => void;
  onChoose: (c: SearchResult) => void;
  onResearch: (opts: { name?: string; locationText?: string }) => void;
}) {
  const [editingLoc, setEditingLoc] = useState(false);
  const [locInput, setLocInput] = useState('');
  const [nameInput, setNameInput] = useState(item.row.name);

  const submitLocation = () => {
    if (!locInput.trim()) return;
    setEditingLoc(false);
    onResearch({ locationText: locInput });
    setLocInput('');
  };

  // "Searched near X" line, editable on every row type
  const locationLine = editingLoc ? (
    <View style={styles.retryRow}>
      <TextInput
        style={styles.retryInput}
        value={locInput}
        onChangeText={setLocInput}
        placeholder="City or zip code..."
        placeholderTextColor={Colors.textMuted}
        autoCorrect={false}
        autoFocus
        onSubmitEditing={submitLocation}
      />
      <TouchableOpacity style={styles.retryBtn} onPress={submitLocation}>
        <Ionicons name="arrow-forward" size={16} color={Colors.purple} />
      </TouchableOpacity>
    </View>
  ) : (
    <TouchableOpacity style={styles.locLine} onPress={() => setEditingLoc(true)}>
      <Ionicons name="location-outline" size={12} color={Colors.purple} />
      <Text style={styles.locLineText} numberOfLines={1}>near {item.locationLabel}</Text>
      <Ionicons name="pencil-outline" size={11} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  // Remove/restore control shown on every row
  const removeBtn = (
    <TouchableOpacity onPress={onToggleExcluded} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Ionicons
        name={item.excluded ? 'add-circle-outline' : 'close'}
        size={18}
        color={item.excluded ? Colors.primary : Colors.textMuted}
      />
    </TouchableOpacity>
  );

  if (item.status === 'duplicate') {
    return (
      <View style={[styles.rowCard, item.excluded && styles.rowDim]}>
        <Ionicons name="copy-outline" size={18} color={Colors.textMuted} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{item.chosen?.name ?? item.row.name}</Text>
          <Text style={styles.rowSub}>Already in your library or list{item.excluded ? '' : ' — importing anyway'}</Text>
        </View>
        {removeBtn}
      </View>
    );
  }

  if (item.status === 'attention') {
    return (
      <View style={styles.rowCard}>
        <Ionicons name="alert-circle-outline" size={18} color={Colors.ratingPoor} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowSub}>No match found — edit the name or location:</Text>
          <View style={styles.retryRow}>
            <TextInput
              style={styles.retryInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoCorrect={false}
              placeholderTextColor={Colors.textMuted}
            />
            <TouchableOpacity style={styles.retryBtn} onPress={() => onResearch({ name: nameInput })}>
              <Ionicons name="search" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          {locationLine}
        </View>
        {removeBtn}
      </View>
    );
  }

  if (item.status === 'pick' && !item.chosen) {
    return (
      <View style={styles.rowCard}>
        <Ionicons name="help-circle-outline" size={18} color={Colors.ratingOkay} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName}>{item.row.name}</Text>
          <Text style={styles.rowSub}>Which location?</Text>
          {item.candidates.map((c) => (
            <TouchableOpacity key={c.id} style={styles.candidateRow} onPress={() => onChoose(c)}>
              <Ionicons name="location-outline" size={13} color={Colors.purple} />
              <View style={{ flex: 1 }}>
                <Text style={styles.candidateName}>{c.name}{c.distance ? `  ·  ${c.distance}` : ''}</Text>
                <Text style={styles.candidateText} numberOfLines={2}>{c.address}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {locationLine}
        </View>
        {removeBtn}
      </View>
    );
  }

  // confirmed, or pick with a chosen candidate
  return (
    <View style={[styles.rowCard, item.excluded && styles.rowDim]}>
      <Ionicons
        name={item.excluded ? 'ellipse-outline' : 'checkmark-circle'}
        size={20}
        color={item.excluded ? Colors.textMuted : Colors.primary}
      />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{item.chosen!.name}</Text>
        <Text style={styles.rowSub} numberOfLines={2}>
          {[item.chosen!.category, item.chosen!.address].filter(Boolean).join(' · ')}
        </Text>
        {locationLine}
      </View>
      {removeBtn}
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
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  locLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  locLineText: { color: Colors.purple, fontSize: 11, fontWeight: '500', maxWidth: 220 },
  candidateName: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
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
  biasPillLabel: { flex: 1, color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  biasPillValue: { color: Colors.purple, fontWeight: '600' },
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
