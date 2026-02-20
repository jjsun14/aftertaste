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
import type { Memory, WantToTryEntry } from '@/data/mockData';
import { seedMemoriesIfEmpty } from '@/lib/seedMemories';

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
  };
}

// ─── Context types ────────────────────────────────────────────────
interface MemoriesContext {
  memories: Memory[];
  memoriesLoading: boolean;
  memoriesError: string | null;
  addMemory: (memory: Omit<Memory, 'id'>) => Promise<Memory>;
  updateMemory: (id: string, updates: Partial<Omit<Memory, 'id'>>) => Promise<void>;
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
  }) => Promise<void>;
  refetchWantToTry: () => Promise<void>;
}

type DataContextType = MemoriesContext & WantToTryContext;

const DataContext = createContext<DataContextType>({} as DataContextType);

// ─── Provider ─────────────────────────────────────────────────────
export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

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

      // Auto-seed 4 sample memories for brand-new users
      if ((data ?? []).length === 0) {
        const seeded = await seedMemoriesIfEmpty(user.id);
        if (seeded) {
          // Re-fetch after seeding so we get the real rows with UUIDs
          const { data: seededData, error: seededError } = await supabase
            .from('memories')
            .select('*')
            .order('date', { ascending: false });
          if (!seededError) {
            setMemories((seededData ?? []).map(rowToMemory));
            return;
          }
        }
      }

      setMemories((data ?? []).map(rowToMemory));
    } catch (err: any) {
      setMemoriesError(err.message);
    } finally {
      setMemoriesLoading(false);
    }
  }, [user]);

  useEffect(() => { refetchMemories(); }, [refetchMemories]);

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
    return created;
  }, [user]);

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

    const { error } = await supabase.from('memories').update(row).eq('id', id);
    if (!error) {
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    }
  }, []);

  const toggleFavorite = useCallback(async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('memories')
      .update({ is_favorite: !current })
      .eq('id', id);
    if (!error) {
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isFavorite: !current } : m))
      );
    }
  }, []);

  const deleteMemory = useCallback(async (id: string) => {
    // Find the memory first so we can delete its photos from Storage
    const memory = memories.find((m) => m.id === id);

    const { error } = await supabase.from('memories').delete().eq('id', id);
    if (error) return;

    setMemories((prev) => prev.filter((m) => m.id !== id));

    // Delete any associated photos from Supabase Storage (fire and forget)
    const photoUrls = memory?.photos ?? [];
    if (photoUrls.length > 0) {
      // Extract the storage path from the public URL
      // Public URLs look like: https://<project>.supabase.co/storage/v1/object/public/memory-photos/<userId>/<filename>
      const storagePaths = photoUrls
        .map((url) => {
          const marker = '/memory-photos/';
          const idx = url.indexOf(marker);
          return idx !== -1 ? url.slice(idx + marker.length) : null;
        })
        .filter(Boolean) as string[];

      if (storagePaths.length > 0) {
        supabase.storage.from('memory-photos').remove(storagePaths);
      }
    }
  }, [memories]);

  // ── Want to Try state ──
  const [wantToTry, setWantToTry] = useState<WantToTryEntry[]>([]);
  const [wttLoading, setWttLoading] = useState(true);

  const refetchWantToTry = useCallback(async () => {
    if (!user) return;
    setWttLoading(true);
    const { data } = await supabase
      .from('want_to_try')
      .select('*')
      .order('created_at', { ascending: false });
    setWantToTry((data ?? []).map(rowToEntry));
    setWttLoading(false);
  }, [user]);

  useEffect(() => { refetchWantToTry(); }, [refetchWantToTry]);

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

  return (
    <DataContext.Provider
      value={{
        memories,
        memoriesLoading,
        memoriesError,
        addMemory,
        updateMemory,
        toggleFavorite,
        deleteMemory,
        refetchMemories,
        wantToTry,
        wttLoading,
        isBookmarked,
        toggleBookmark,
        refetchWantToTry,
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
    updateMemory: ctx.updateMemory,
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
    refetch: ctx.refetchWantToTry,
  };
}
