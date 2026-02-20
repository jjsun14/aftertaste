import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { WantToTryEntry } from '@/data/mockData';

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

export function useWantToTry() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<WantToTryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('want_to_try')
      .select('*')
      .order('created_at', { ascending: false });
    setEntries((data ?? []).map(rowToEntry));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  // Check if a restaurant is already bookmarked by name+address
  const isBookmarked = useCallback(
    (name: string, address: string) =>
      entries.some(
        (e) => e.restaurantName === name && e.address === address
      ),
    [entries]
  );

  // Toggle — add if not present, remove if present
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

      const existing = entries.find(
        (e) =>
          e.restaurantName === restaurant.name &&
          e.address === restaurant.address
      );

      if (existing) {
        // Remove
        await supabase.from('want_to_try').delete().eq('id', existing.id);
        setEntries((prev) => prev.filter((e) => e.id !== existing.id));
      } else {
        // Add — use sensible defaults for fields StepSearch doesn't have
        const { data, error } = await supabase
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
          .single();
        if (!error && data) {
          setEntries((prev) => [rowToEntry(data), ...prev]);
        }
      }
    },
    [user, entries]
  );

  return { entries, loading, isBookmarked, toggleBookmark, refetch: fetch };
}
