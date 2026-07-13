/**
 * DataContext — single source of truth for memories + want-to-try.
 *
 * Both lists are fetched once here and shared across every screen.
 * Any screen that calls useMemories() or useWantToTry() gets the same
 * state, so adding a memory in the Add tab is immediately visible in
 * the Library tab without a separate refetch.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Memory, Visit, WantToTryEntry, ImportQueueItem, RatingLevel, EateryType } from '@/data/mockData';
import { computeComposite, ratingToScore, determineTier, recalculateTierScores } from '@/data/mockData';

// ─── Row mappers ──────────────────────────────────────────────────
function rowToMemory(row: any): Memory {
  return {
    id: row.id,
    restaurantName: row.restaurant_name,
    priceTier: row.price_tier,
    eateryType: row.eatery_type,
    cuisineType: row.cuisine_type,
    address: row.address,
    city: row.city,
    state: row.state,
    latitude: row.latitude,
    longitude: row.longitude,
    date: row.date,
    photos: row.photos ?? [],
    whatIHad: row.what_i_had ?? [],
    occasionTag: row.occasion_tag,
    moodTag: row.mood_tag,
    tasteRating: row.taste_rating,
    vibeRating: row.vibe_rating,
    valueRating: row.value_rating,
    tasteScore: row.taste_score,
    vibeScore: row.vibe_score,
    valueScore: row.value_score,
    compositeScore: row.composite_score,
    eatAgain: row.eat_again,
    squad: row.squad ?? [],
    memoryNote: row.memory_note ?? '',
    isFavorite: row.is_favorite,
    visits: (row.visits ?? []) as Visit[],
    photoDates: row.photo_dates ?? {},
    tiedGroupId: row.tied_group_id ?? null,
    placeId: row.place_id ?? null,
    source: row.source ?? null,
    importBatchId: row.import_batch_id ?? null,
  };
}

function memoryToRow(memory: Omit<Memory, 'id'>, userId: string) {
  return {
    user_id: userId,
    restaurant_name: memory.restaurantName,
    price_tier: memory.priceTier,
    eatery_type: memory.eateryType,
    cuisine_type: memory.cuisineType,
    address: memory.address,
    city: memory.city,
    state: memory.state,
    latitude: memory.latitude,
    longitude: memory.longitude,
    date: memory.date,
    photos: memory.photos,
    what_i_had: memory.whatIHad,
    occasion_tag: memory.occasionTag,
    mood_tag: memory.moodTag,
    taste_rating: memory.tasteRating,
    vibe_rating: memory.vibeRating,
    value_rating: memory.valueRating,
    taste_score: memory.tasteScore,
    vibe_score: memory.vibeScore,
    value_score: memory.valueScore,
    composite_score: memory.compositeScore,
    eat_again: memory.eatAgain,
    squad: memory.squad,
    memory_note: memory.memoryNote,
    is_favorite: memory.isFavorite,
    visits: memory.visits ?? [],
    photo_dates: memory.photoDates ?? {},
    tied_group_id: memory.tiedGroupId ?? null,
    place_id: memory.placeId ?? null,
    source: memory.source ?? null,
    import_batch_id: memory.importBatchId ?? null,
  };
}

function rowToEntry(row: any): WantToTryEntry {
  return {
    id: row.id,
    restaurantName: row.restaurant_name,
    priceTier: row.price_tier,
    eateryType: row.eatery_type,
    cuisineType: row.cuisine_type,
    address: row.address,
    city: row.city,
    state: row.state,
    latitude: row.latitude,
    longitude: row.longitude,
    placeId: row.place_id ?? null,
  };
}

function rowToQueueItem(row: any): ImportQueueItem {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    placeId: row.place_id ?? null,
    category: row.category ?? '',
    prefillRating: row.prefill_rating ?? null,
    prefillNote: row.prefill_note ?? null,
    importBatchId: row.import_batch_id ?? null,
  };
}

// ─── Context types ────────────────────────────────────────────────
interface MemoriesContext {
  memories: Memory[];
  memoriesLoading: boolean;
  memoriesError: string | null;
  addMemory: (memory: Omit<Memory, 'id'>) => Promise<Memory>;
  addVisit: (memoryId: string, visit: Visit) => Promise<void>;
  updateMemory: (id: string, updates: Partial<Omit<Memory, 'id'>>) => Promise<void>;
  batchUpdateCompositeScores: (updates: { id: string; compositeScore: number; tiedGroupId?: string | null }[]) => Promise<void>;
  toggleFavorite: (id: string, current: boolean) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  refetchMemories: () => Promise<void>;
}

interface WantToTryContext {
  wantToTry: WantToTryEntry[];
  wttLoading: boolean;
  isBookmarked: (name: string, address: string) => boolean;
  toggleBookmark: (restaurant: {
    name: string;
    address: string;
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
    placeId?: string;
  }) => Promise<void>;
  addWantToTryBatch: (
    restaurants: {
      name: string;
      address: string;
      city?: string;
      state?: string;
      latitude?: number;
      longitude?: number;
      placeId?: string;
      cuisineType?: string;
    }[],
    importBatchId: string,
  ) => Promise<number>;
  refetchWantToTry: () => Promise<void>;
}

interface ImportQueueContext {
  importQueue: ImportQueueItem[];
  queueLoading: boolean;
  addImportQueueBatch: (
    rows: {
      name: string;
      address?: string;
      city?: string;
      state?: string;
      latitude?: number;
      longitude?: number;
      placeId?: string | null;
      category?: string;
      prefillRating?: number | null;
      prefillNote?: string | null;
    }[],
    importBatchId: string,
  ) => Promise<number>;
  removeQueueItem: (id: string) => Promise<void>;
  refetchImportQueue: () => Promise<void>;
}

type DataContextType = MemoriesContext & WantToTryContext & ImportQueueContext;

const DataContext = createContext<DataContextType>({} as DataContextType);

// ─── Provider ─────────────────────────────────────────────────────
export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, scorePreference } = useAuth();

  // ── Memories state ──
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);
  const [memoriesError, setMemoriesError] = useState<string | null>(null);

  const refetchMemories = useCallback(async () => {
    if (!user) return;
    setMemoriesLoading(true);
    setMemoriesError(null);
    try {
      const { data, error } = await supabase
        .from('memories')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;

      setMemories((data ?? []).map(rowToMemory));
    } catch (err: any) {
      setMemoriesError(err.message);
    } finally {
      setMemoriesLoading(false);
    }
  }, [user]);

  // Clear all state on logout, refetch on login
  useEffect(() => {
    if (user) {
      refetchMemories();
    } else {
      setMemories([]);
      setMemoriesLoading(false);
      setMemoriesError(null);
    }
  }, [refetchMemories, user]);

  const addMemory = useCallback(async (memory: Omit<Memory, 'id'>): Promise<Memory> => {
    if (!user) throw new Error('Not authenticated');
    const row = memoryToRow(memory, user.id);
    const { data, error } = await supabase
      .from('memories')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    const created = rowToMemory(data);
    // Prepend to shared state — all screens see it immediately
    setMemories((prev) => [created, ...prev]);

    // Record activity event (for friend feed + notifications)
    supabase.from('activity_events').insert({
      user_id: user.id,
      restaurant_name: memory.restaurantName,
      city: memory.city ?? '',
      event_type: 'new_memory',
    }).then(({ error: aeErr }) => {
      if (aeErr) console.warn('Activity event insert failed:', aeErr.message);
    });

    return created;
  }, [user]);

  const addVisit = useCallback(async (memoryId: string, visit: Visit) => {
    const memory = memories.find((m) => m.id === memoryId);
    if (!memory) throw new Error('Memory not found');

    const updatedVisits = [...(memory.visits ?? []), visit];

    // Recompute averaged scores: original first-visit + all rated return visits
    const originalTaste = ratingToScore(memory.tasteRating);
    const originalVibe = ratingToScore(memory.vibeRating);
    const originalValue = ratingToScore(memory.valueRating);

    const ratedVisits = updatedVisits.filter(
      (v) => v.tasteScore != null && v.vibeScore != null && v.valueScore != null
    );

    // Route visit photo to the main carousel with date metadata
    const updatedPhotos = [...memory.photos];
    const updatedPhotoDates = { ...(memory.photoDates ?? {}) };
    if (visit.photo) {
      updatedPhotos.push(visit.photo);
      updatedPhotoDates[visit.photo] = visit.date;
    }

    // Persist to DB — only update scores if this visit (or a prior one) has ratings.
    // An unrated check-in must not overwrite the ranked composite score.
    const row: Record<string, any> = {
      visits: updatedVisits,
      photos: updatedPhotos,
      photo_dates: updatedPhotoDates,
    };

    if (ratedVisits.length > 0) {
      const newTasteScore = Math.round((originalTaste + ratedVisits.reduce((s, v) => s + v.tasteScore!, 0)) / (1 + ratedVisits.length) * 10) / 10;
      const newVibeScore  = Math.round((originalVibe  + ratedVisits.reduce((s, v) => s + v.vibeScore!,  0)) / (1 + ratedVisits.length) * 10) / 10;
      const newValueScore = Math.round((originalValue + ratedVisits.reduce((s, v) => s + v.valueScore!, 0)) / (1 + ratedVisits.length) * 10) / 10;
      const newComposite  = computeComposite(newTasteScore, newVibeScore, newValueScore, scorePreference);
      row.taste_score     = newTasteScore;
      row.vibe_score      = newVibeScore;
      row.value_score     = newValueScore;
      row.composite_score = newComposite;
    }

    const { error } = await supabase.from('memories').update(row).eq('id', memoryId);
    if (error) throw error;

    // Update local state — same rule: scores only change if there are rated visits.
    setMemories((prev) =>
      prev.map((m) => {
        if (m.id !== memoryId) return m;
        const base = { ...m, visits: updatedVisits, photos: updatedPhotos, photoDates: updatedPhotoDates };
        if (ratedVisits.length > 0) {
          base.tasteScore     = row.taste_score;
          base.vibeScore      = row.vibe_score;
          base.valueScore     = row.value_score;
          base.compositeScore = row.composite_score;
        }
        return base;
      })
    );

    // Record activity event for return visit (friend feed + notifications)
    if (user) {
      supabase.from('activity_events').insert({
        user_id: user.id,
        restaurant_name: memory.restaurantName,
        city: memory.city ?? '',
        event_type: 'return_visit',
      }).then(({ error: aeErr }) => {
        if (aeErr) console.warn('Activity event insert failed:', aeErr.message);
      });
    }
  }, [memories, user, scorePreference]);

  const batchUpdateCompositeScores = useCallback(async (updates: { id: string; compositeScore: number; tiedGroupId?: string | null }[]) => {
    if (updates.length === 0) return;
    await Promise.all(
      updates.map(({ id, compositeScore, tiedGroupId }) => {
        const row: Record<string, any> = { composite_score: compositeScore };
        // Only write tied_group_id when explicitly provided (undefined = leave alone)
        if (tiedGroupId !== undefined) row.tied_group_id = tiedGroupId;
        return supabase.from('memories').update(row).eq('id', id);
      })
    );
    const updateMap = new Map(updates.map((u) => [u.id, u]));
    setMemories((prev) =>
      prev.map((m) => {
        const u = updateMap.get(m.id);
        if (!u) return m;
        return {
          ...m,
          compositeScore: u.compositeScore,
          ...(u.tiedGroupId !== undefined && { tiedGroupId: u.tiedGroupId }),
        };
      })
    );
  }, []);

  const updateMemory = useCallback(async (id: string, updates: Partial<Omit<Memory, 'id'>>) => {
    // Build a partial DB row from the camelCase updates
    const row: Record<string, any> = {};
    if (updates.restaurantName !== undefined) row.restaurant_name = updates.restaurantName;
    if (updates.priceTier !== undefined) row.price_tier = updates.priceTier;
    if (updates.eateryType !== undefined) row.eatery_type = updates.eateryType;
    if (updates.cuisineType !== undefined) row.cuisine_type = updates.cuisineType;
    if (updates.address !== undefined) row.address = updates.address;
    if (updates.city !== undefined) row.city = updates.city;
    if (updates.state !== undefined) row.state = updates.state;
    if (updates.date !== undefined) row.date = updates.date;
    if (updates.whatIHad !== undefined) row.what_i_had = updates.whatIHad;
    if (updates.occasionTag !== undefined) row.occasion_tag = updates.occasionTag;
    if (updates.moodTag !== undefined) row.mood_tag = updates.moodTag;
    if (updates.tasteRating !== undefined) row.taste_rating = updates.tasteRating;
    if (updates.vibeRating !== undefined) row.vibe_rating = updates.vibeRating;
    if (updates.valueRating !== undefined) row.value_rating = updates.valueRating;
    if (updates.tasteScore !== undefined) row.taste_score = updates.tasteScore;
    if (updates.vibeScore !== undefined) row.vibe_score = updates.vibeScore;
    if (updates.valueScore !== undefined) row.value_score = updates.valueScore;
    if (updates.compositeScore !== undefined) row.composite_score = updates.compositeScore;
    if (updates.eatAgain !== undefined) row.eat_again = updates.eatAgain;
    if (updates.squad !== undefined) row.squad = updates.squad;
    if (updates.memoryNote !== undefined) row.memory_note = updates.memoryNote;
    if (updates.isFavorite !== undefined) row.is_favorite = updates.isFavorite;
    if (updates.visits !== undefined) row.visits = updates.visits;
    if (updates.photoDates !== undefined) row.photo_dates = updates.photoDates;
    if (updates.tiedGroupId !== undefined) row.tied_group_id = updates.tiedGroupId;

    // If photos are being updated, find removed photos so we can delete them from storage
    let removedPhotoUrls: string[] = [];
    if (updates.photos !== undefined) {
      row.photos = updates.photos;
      const memory = memories.find((m) => m.id === id);
      if (memory) {
        const newPhotosSet = new Set(updates.photos);
        removedPhotoUrls = memory.photos.filter((url) => !newPhotosSet.has(url));
      }
    }

    const { error } = await supabase.from('memories').update(row).eq('id', id);
    if (error) throw error;
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );

    // Clean up removed photos from Supabase Storage
    if (removedPhotoUrls.length > 0) {
      const storagePaths = removedPhotoUrls
        .map((url) => {
          const marker = '/memory-photos/';
          const idx = url.indexOf(marker);
          return idx !== -1 ? url.slice(idx + marker.length) : null;
        })
        .filter(Boolean) as string[];
      if (storagePaths.length > 0) {
        supabase.storage.from('memory-photos').remove(storagePaths).catch((err) =>
          console.warn('Failed to delete removed photos from storage:', err)
        );
      }
    }
  }, [memories]);

  const toggleFavorite = useCallback(async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('memories')
      .update({ is_favorite: !current })
      .eq('id', id);
    if (error) throw error;
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isFavorite: !current } : m))
    );
  }, []);

  const deleteMemory = useCallback(async (id: string) => {
    // Find the memory first so we can delete its photos from Storage
    const memory = memories.find((m) => m.id === id);

    const { error } = await supabase.from('memories').delete().eq('id', id);
    if (error) throw error;

    setMemories((prev) => prev.filter((m) => m.id !== id));

    // Redistribute the remaining memories in the deleted memory's tier+eateryType group
    // so their scores fill the tier range evenly again.
    if (memory) {
      const tier = determineTier(memory.compositeScore);
      let peers = memories
        .filter((m) =>
          m.id !== id &&
          m.eateryType === memory.eateryType &&
          determineTier(m.compositeScore) === tier
        )
        .sort((a, b) => a.compositeScore - b.compositeScore);

      // If the deleted memory was tied with others, check if any tied group is
      // now down to a single member — those should be cleared (a tie of 1 is meaningless).
      const orphanedTiedIds = new Set<string>();
      if (memory.tiedGroupId) {
        const remainingInGroup = peers.filter((p) => p.tiedGroupId === memory.tiedGroupId);
        if (remainingInGroup.length === 1) {
          orphanedTiedIds.add(remainingInGroup[0].id);
        }
      }

      const updates = recalculateTierScores(
        peers.map((p) => ({
          id: p.id,
          tiedGroupId: orphanedTiedIds.has(p.id) ? null : p.tiedGroupId ?? null,
        })),
        tier,
      );

      if (updates.length > 0 || orphanedTiedIds.size > 0) {
        await Promise.all(
          updates.map(({ id: pid, compositeScore }) => {
            const row: Record<string, any> = { composite_score: compositeScore };
            if (orphanedTiedIds.has(pid)) row.tied_group_id = null;
            return supabase.from('memories').update(row).eq('id', pid);
          })
        );
        const scoreMap = new Map(updates.map((u) => [u.id, u.compositeScore]));
        setMemories((prev) =>
          prev.map((m) => {
            const newScore = scoreMap.get(m.id);
            if (newScore === undefined) return m;
            return {
              ...m,
              compositeScore: newScore,
              ...(orphanedTiedIds.has(m.id) && { tiedGroupId: null }),
            };
          })
        );
      }
    }

    // Collect ALL photo URLs: main photos + any visit photos
    const allPhotoUrls = new Set<string>(memory?.photos ?? []);
    (memory?.visits ?? []).forEach((v) => {
      if (v.photo) allPhotoUrls.add(v.photo);
    });

    if (allPhotoUrls.size > 0) {
      // Extract the storage path from each public URL
      // Public URLs look like: https://<project>.supabase.co/storage/v1/object/public/memory-photos/<userId>/<filename>
      const storagePaths = [...allPhotoUrls]
        .map((url) => {
          const marker = '/memory-photos/';
          const idx = url.indexOf(marker);
          return idx !== -1 ? url.slice(idx + marker.length) : null;
        })
        .filter(Boolean) as string[];

      if (storagePaths.length > 0) {
        try {
          await supabase.storage.from('memory-photos').remove(storagePaths);
        } catch (storageErr) {
          console.warn('Failed to delete photos from storage:', storageErr);
        }
      }
    }
  }, [memories]);

  // ── Want to Try state ──
  const [wantToTry, setWantToTry] = useState<WantToTryEntry[]>([]);
  const [wttLoading, setWttLoading] = useState(true);

  const refetchWantToTry = useCallback(async () => {
    if (!user) return;
    setWttLoading(true);
    try {
      const { data, error } = await supabase
        .from('want_to_try')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setWantToTry((data ?? []).map(rowToEntry));
    } catch (err) {
      console.error('Failed to fetch want-to-try list:', err);
    } finally {
      setWttLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      refetchWantToTry();
    } else {
      setWantToTry([]);
      setWttLoading(false);
    }
  }, [refetchWantToTry, user]);

  const isBookmarked = useCallback(
    (name: string, address: string) =>
      wantToTry.some((e) => e.restaurantName === name && e.address === address),
    [wantToTry]
  );

  const toggleBookmark = useCallback(
    async (restaurant: {
      name: string;
      address: string;
      city?: string;
      state?: string;
      latitude?: number;
      longitude?: number;
      placeId?: string;
    }) => {
      if (!user) return;
      const existing = wantToTry.find(
        (e) => e.restaurantName === restaurant.name && e.address === restaurant.address
      );
      if (existing) {
        // Optimistic remove — UI responds instantly, DB syncs in background
        setWantToTry((prev) => prev.filter((e) => e.id !== existing.id));
        supabase.from('want_to_try').delete().eq('id', existing.id).then(({ error }) => {
          if (error) {
            // Rollback on failure
            setWantToTry((prev) => [existing, ...prev]);
          }
        });
      } else {
        // Optimistic add with a temp ID — replaced with real row once DB responds
        const tempId = `temp-${Date.now()}`;
        const optimisticEntry: WantToTryEntry = {
          id: tempId,
          restaurantName: restaurant.name,
          priceTier: '$',
          eateryType: 'Restaurant',
          cuisineType: 'Restaurant',
          address: restaurant.address,
          city: restaurant.city ?? '',
          state: restaurant.state ?? '',
          latitude: restaurant.latitude ?? 0,
          longitude: restaurant.longitude ?? 0,
          placeId: restaurant.placeId ?? null,
        };
        setWantToTry((prev) => [optimisticEntry, ...prev]);
        supabase
          .from('want_to_try')
          .insert({
            user_id: user.id,
            restaurant_name: restaurant.name,
            price_tier: '$',
            eatery_type: 'Restaurant',
            cuisine_type: 'Restaurant',
            address: restaurant.address,
            city: restaurant.city ?? '',
            state: restaurant.state ?? '',
            latitude: restaurant.latitude ?? 0,
            longitude: restaurant.longitude ?? 0,
            place_id: restaurant.placeId ?? null,
          })
          .select()
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              // Swap temp entry with real DB row (gets the real UUID)
              setWantToTry((prev) =>
                prev.map((e) => (e.id === tempId ? rowToEntry(data) : e))
              );
            } else if (error) {
              // Rollback on failure
              setWantToTry((prev) => prev.filter((e) => e.id !== tempId));
            }
          });
      }
    },
    [user, wantToTry]
  );

  // Bulk insert for the import flow — one INSERT for the whole batch,
  // every row tagged with the import_batch_id so a bad import can be
  // undone with a single DELETE.
  const addWantToTryBatch = useCallback(
    async (
      restaurants: {
        name: string;
        address: string;
        city?: string;
        state?: string;
        latitude?: number;
        longitude?: number;
        placeId?: string;
        cuisineType?: string;
      }[],
      importBatchId: string,
    ): Promise<number> => {
      if (!user || restaurants.length === 0) return 0;
      const rows = restaurants.map((r) => ({
        user_id: user.id,
        restaurant_name: r.name,
        price_tier: '$',
        eatery_type: 'Restaurant',
        cuisine_type: r.cuisineType || 'Restaurant',
        address: r.address,
        city: r.city ?? '',
        state: r.state ?? '',
        latitude: r.latitude ?? 0,
        longitude: r.longitude ?? 0,
        place_id: r.placeId ?? null,
        import_batch_id: importBatchId,
      }));
      const { data, error } = await supabase.from('want_to_try').insert(rows).select();
      if (error) throw error;
      setWantToTry((prev) => [...(data ?? []).map(rowToEntry), ...prev]);
      return (data ?? []).length;
    },
    [user],
  );

  // ── Import queue ("been here" imports waiting to be rated) ──
  const [importQueue, setImportQueue] = useState<ImportQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);

  const refetchImportQueue = useCallback(async () => {
    if (!user) return;
    setQueueLoading(true);
    try {
      const { data, error } = await supabase
        .from('import_queue')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setImportQueue((data ?? []).map(rowToQueueItem));
    } catch (err) {
      console.warn('Failed to fetch import queue:', err);
    } finally {
      setQueueLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      refetchImportQueue();
    } else {
      setImportQueue([]);
      setQueueLoading(false);
    }
  }, [refetchImportQueue, user]);

  const addImportQueueBatch = useCallback(
    async (
      rows: {
        name: string;
        address?: string;
        city?: string;
        state?: string;
        latitude?: number;
        longitude?: number;
        placeId?: string | null;
        category?: string;
        prefillRating?: number | null;
        prefillNote?: string | null;
      }[],
      importBatchId: string,
    ): Promise<number> => {
      if (!user || rows.length === 0) return 0;
      const inserts = rows.map((r) => ({
        user_id: user.id,
        source: 'import',
        name: r.name,
        address: r.address ?? '',
        city: r.city ?? '',
        state: r.state ?? '',
        latitude: r.latitude ?? 0,
        longitude: r.longitude ?? 0,
        place_id: r.placeId ?? null,
        category: r.category ?? '',
        prefill_rating: r.prefillRating ?? null,
        prefill_note: r.prefillNote ?? null,
        import_batch_id: importBatchId,
      }));
      const { data, error } = await supabase.from('import_queue').insert(inserts).select();
      if (error) throw error;
      setImportQueue((prev) => [...(data ?? []).map(rowToQueueItem), ...prev]);
      return (data ?? []).length;
    },
    [user],
  );

  const removeQueueItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('import_queue').delete().eq('id', id);
    if (error) throw error;
    setImportQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  return (
    <DataContext.Provider
      value={{
        memories,
        memoriesLoading,
        memoriesError,
        addMemory,
        addVisit,
        updateMemory,
        batchUpdateCompositeScores,
        toggleFavorite,
        deleteMemory,
        refetchMemories,
        wantToTry,
        wttLoading,
        isBookmarked,
        toggleBookmark,
        addWantToTryBatch,
        refetchWantToTry,
        importQueue,
        queueLoading,
        addImportQueueBatch,
        removeQueueItem,
        refetchImportQueue,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

// ─── Convenience hooks (same API as before, no consumer changes) ──
export function useMemories() {
  const ctx = useContext(DataContext);
  return {
    memories: ctx.memories,
    loading: ctx.memoriesLoading,
    error: ctx.memoriesError,
    addMemory: ctx.addMemory,
    addVisit: ctx.addVisit,
    updateMemory: ctx.updateMemory,
    batchUpdateCompositeScores: ctx.batchUpdateCompositeScores,
    toggleFavorite: ctx.toggleFavorite,
    deleteMemory: ctx.deleteMemory,
    refetch: ctx.refetchMemories,
  };
}

export function useWantToTry() {
  const ctx = useContext(DataContext);
  return {
    entries: ctx.wantToTry,
    loading: ctx.wttLoading,
    isBookmarked: ctx.isBookmarked,
    toggleBookmark: ctx.toggleBookmark,
    addBatch: ctx.addWantToTryBatch,
    refetch: ctx.refetchWantToTry,
  };
}

export function useImportQueue() {
  const ctx = useContext(DataContext);
  return {
    queue: ctx.importQueue,
    loading: ctx.queueLoading,
    addBatch: ctx.addImportQueueBatch,
    remove: ctx.removeQueueItem,
    refetch: ctx.refetchImportQueue,
  };
}
