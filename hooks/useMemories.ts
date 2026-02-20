import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Memory, SquadMember } from '@/data/mockData';

// ─── DB row → Memory type ─────────────────────────────────────────
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

// ─── Memory type → DB insert row ─────────────────────────────────
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

// ─── Hook ─────────────────────────────────────────────────────────
export function useMemories() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('memories')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setMemories((data ?? []).map(rowToMemory));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Add a new memory — returns the created memory or throws
  const addMemory = useCallback(
    async (memory: Omit<Memory, 'id'>): Promise<Memory> => {
      if (!user) throw new Error('Not authenticated');
      const row = memoryToRow(memory, user.id);
      const { data, error } = await supabase
        .from('memories')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      const created = rowToMemory(data);
      setMemories((prev) => [created, ...prev]);
      return created;
    },
    [user]
  );

  // Toggle favorite
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

  // Delete a memory
  const deleteMemory = useCallback(async (id: string) => {
    const { error } = await supabase.from('memories').delete().eq('id', id);
    if (!error) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
    }
  }, []);

  return { memories, loading, error, addMemory, toggleFavorite, deleteMemory, refetch: fetchMemories };
}
