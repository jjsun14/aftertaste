/**
 * FriendsContext — manages friendships, friend activity feed, and username.
 *
 * Follows the same Provider / hook pattern as DataContext.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { FriendProfile, FriendActivity } from '@/data/mockData';

// ─── Types ───────────────────────────────────────────────────────
interface FriendRequest {
  id: string;
  profile: FriendProfile;
  createdAt: string;
}

interface FriendsContextType {
  // Data
  friends: FriendProfile[];
  pendingIncoming: FriendRequest[];
  pendingOutgoing: FriendRequest[];
  activity: FriendActivity[];
  loading: boolean;

  // Profile fields
  username: string | null;
  friendCode: string | null;

  // Actions
  sendRequest: (addresseeId: string) => Promise<void>;
  acceptRequest: (friendshipId: string) => Promise<void>;
  declineRequest: (friendshipId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  searchByUsername: (query: string) => Promise<FriendProfile[]>;
  findByFriendCode: (code: string) => Promise<FriendProfile | null>;
  setUsername: (username: string) => Promise<void>;
  refetch: () => Promise<void>;
  refetchActivity: () => Promise<void>;
}

const FriendsCtx = createContext<FriendsContextType>({} as FriendsContextType);

// ─── Row mapper ──────────────────────────────────────────────────
function rowToFriendProfile(row: any, myUserId: string, friendshipId: string): FriendProfile {
  // The profile could be the requester or addressee — pick the one that isn't us
  const profile = row;
  return {
    id: friendshipId,
    profileId: profile.id,
    displayName: profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'User',
    username: profile.username ?? null,
    firstName: profile.first_name ?? '',
    lastName: profile.last_name ?? '',
    friendCode: profile.friend_code ?? '',
  };
}

// ─── Provider ────────────────────────────────────────────────────
export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<FriendRequest[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<FriendRequest[]>([]);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsernameState] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState<string | null>(null);

  // ── Fetch profile fields (username, friend_code) ──
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('username, friend_code')
      .eq('id', user.id)
      .single();
    if (data) {
      setUsernameState(data.username ?? null);
      setFriendCode(data.friend_code ?? null);
    }
  }, [user]);

  // ── Fetch all friendships ──
  const refetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get all friendships where we're involved
      const { data: rows, error } = await supabase
        .from('friendships')
        .select('*')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (error) throw error;
      const allRows = rows ?? [];

      // Gather profile IDs we need to look up
      const profileIds = new Set<string>();
      allRows.forEach((r) => {
        profileIds.add(r.requester_id === user.id ? r.addressee_id : r.requester_id);
      });

      // Batch fetch profiles
      let profileMap: Record<string, any> = {};
      if (profileIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, first_name, last_name, username, friend_code')
          .in('id', Array.from(profileIds));
        (profiles ?? []).forEach((p) => { profileMap[p.id] = p; });
      }

      const accepted: FriendProfile[] = [];
      const incoming: FriendRequest[] = [];
      const outgoing: FriendRequest[] = [];

      allRows.forEach((row) => {
        const otherUserId = row.requester_id === user.id ? row.addressee_id : row.requester_id;
        const profile = profileMap[otherUserId];
        if (!profile) return;

        const fp = rowToFriendProfile(profile, user.id, row.id);

        if (row.status === 'accepted') {
          accepted.push(fp);
        } else if (row.status === 'pending') {
          const request: FriendRequest = { id: row.id, profile: fp, createdAt: row.created_at };
          if (row.addressee_id === user.id) {
            incoming.push(request);
          } else {
            outgoing.push(request);
          }
        }
        // 'declined' rows are ignored
      });

      setFriends(accepted);
      setPendingIncoming(incoming);
      setPendingOutgoing(outgoing);
    } catch (err) {
      console.error('FriendsContext fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Fetch friend activity feed ──
  const refetchActivity = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_friend_activity', {
        requesting_user: user.id,
      });
      if (error) throw error;
      setActivity(
        (data ?? []).map((r: any) => ({
          restaurantName: r.restaurant_name,
          city: r.city ?? '',
          date: r.date,
          eventType: r.event_type ?? 'new_memory',
          userDisplayName: r.user_display_name,
          userId: r.user_id,
          createdAt: r.created_at,
        }))
      );
    } catch (err) {
      console.error('Activity fetch error:', err);
    }
  }, [user]);

  // ── Initial load ──
  useEffect(() => {
    if (user) {
      fetchProfile();
      refetch();
      refetchActivity();
    } else {
      setFriends([]);
      setPendingIncoming([]);
      setPendingOutgoing([]);
      setActivity([]);
      setUsernameState(null);
      setFriendCode(null);
    }
  }, [user, fetchProfile, refetch, refetchActivity]);

  // ── Actions ────────────────────────────────────────────────────

  const sendRequest = useCallback(async (addresseeId: string) => {
    if (!user) return;
    if (!username) throw new Error('You need to set a username before adding friends.');

    // Check if a reverse request already exists (they sent us one)
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .eq('requester_id', addresseeId)
      .eq('addressee_id', user.id)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'pending') {
        // They already sent us a request — just accept it instead of creating a duplicate
        await supabase
          .from('friendships')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        await refetch();
        await refetchActivity();
        return;
      }
      if (existing.status === 'accepted') {
        // Already friends
        return;
      }
    }

    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: addresseeId,
    });
    if (error) throw error;
    await refetch();
    // Notify the addressee — fire-and-forget, don't block on push delivery
    supabase.functions.invoke('send-friend-request-notification', {
      body: { type: 'sent', requester_id: user.id, addressee_id: addresseeId },
    }).catch(() => {});
  }, [user, username, refetch, refetchActivity]);

  const acceptRequest = useCallback(async (friendshipId: string) => {
    if (!user) return;

    // Get the friendship row to find the other user
    const { data: row } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('id', friendshipId)
      .single();

    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', friendshipId);
    if (error) throw error;

    // Delete any reverse friendship row to prevent duplicates
    // (e.g. if both users sent requests to each other)
    if (row) {
      await supabase
        .from('friendships')
        .delete()
        .eq('requester_id', row.addressee_id)
        .eq('addressee_id', row.requester_id);
    }

    await refetch();
    await refetchActivity();
    // Notify the original requester that their request was accepted
    supabase.functions.invoke('send-friend-request-notification', {
      body: { type: 'accepted', friendship_id: friendshipId },
    }).catch(() => {});
  }, [user, refetch, refetchActivity]);

  const declineRequest = useCallback(async (friendshipId: string) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', friendshipId);
    if (error) throw error;
    await refetch();
  }, [refetch]);

  const removeFriend = useCallback(async (friendshipId: string) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);
    if (error) throw error;
    await refetch();
  }, [refetch]);

  const searchByUsername = useCallback(async (query: string): Promise<FriendProfile[]> => {
    if (!user || !query.trim()) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, first_name, last_name, username, friend_code')
      .eq('username', query.trim().toLowerCase())
      .neq('id', user.id)
      .limit(10);
    if (error) {
      console.error('searchByUsername error:', error.message, error.details);
      throw new Error(error.message);
    }
    return (data ?? []).map((p) => ({
      id: '',
      profileId: p.id,
      displayName: p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'User',
      username: p.username ?? null,
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      friendCode: p.friend_code ?? '',
    }));
  }, [user]);

  const findByFriendCode = useCallback(async (code: string): Promise<FriendProfile | null> => {
    if (!user || !code.trim()) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, first_name, last_name, username, friend_code')
      .ilike('friend_code', code.trim())
      .neq('id', user.id)
      .maybeSingle();
    if (error) {
      console.error('findByFriendCode error:', error.message, error.details);
      throw new Error(error.message);
    }
    if (!data) return null;
    return {
      id: '',
      profileId: data.id,
      displayName: data.display_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || 'User',
      username: data.username ?? null,
      firstName: data.first_name ?? '',
      lastName: data.last_name ?? '',
      friendCode: data.friend_code ?? '',
    };
  }, [user]);

  const setUsername = useCallback(async (newUsername: string) => {
    if (!user) return;
    const trimmed = newUsername.trim().toLowerCase();

    // Use upsert so the profile row is created if it doesn't exist yet
    const meta = user.user_metadata ?? {};
    const displayName = meta.display_name || [meta.first_name, meta.last_name].filter(Boolean).join(' ') || '';
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        username: trimmed,
        display_name: displayName,
        first_name: meta.first_name ?? '',
        last_name: meta.last_name ?? '',
      }, { onConflict: 'id' });
    if (error) throw error;
    setUsernameState(trimmed);

    // Re-fetch profile to pick up the auto-generated friend_code
    await fetchProfile();
  }, [user, fetchProfile]);

  return (
    <FriendsCtx.Provider
      value={{
        friends,
        pendingIncoming,
        pendingOutgoing,
        activity,
        loading,
        username,
        friendCode,
        sendRequest,
        acceptRequest,
        declineRequest,
        removeFriend,
        searchByUsername,
        findByFriendCode,
        setUsername,
        refetch,
        refetchActivity,
      }}
    >
      {children}
    </FriendsCtx.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────
export function useFriends() {
  return useContext(FriendsCtx);
}
