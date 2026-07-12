import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { DEFAULT_SCORE_PREFERENCE, type ScorePreference } from '@/data/mockData';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  scorePreference: ScorePreference;
  refreshScorePreference: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  scorePreference: DEFAULT_SCORE_PREFERENCE,
  refreshScorePreference: async () => {},
  signOut: async () => {},
  deleteAccount: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [scorePreference, setScorePreference] = useState<ScorePreference>(DEFAULT_SCORE_PREFERENCE);

  const loadScorePreference = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('score_preference')
      .eq('id', userId)
      .single();
    if (data?.score_preference === 'food_first' || data?.score_preference === 'full_picture') {
      setScorePreference(data.score_preference);
    } else {
      setScorePreference(DEFAULT_SCORE_PREFERENCE);
    }
  }, []);

  const refreshScorePreference = useCallback(async () => {
    if (session?.user) await loadScorePreference(session.user.id);
  }, [session, loadScorePreference]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) loadScorePreference(session.user.id);
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setLoading(false);

      // After email verification or first sign-in, ensure profile row exists
      // (the signup profile upsert may have failed because user had no session yet)
      if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        const meta = session.user.user_metadata;
        if (meta?.profile_completed && meta?.username) {
          const displayName = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || meta.display_name || '';
          await supabase.from('profiles').upsert({
            id: session.user.id,
            display_name: displayName,
            first_name: meta.first_name ?? '',
            last_name: meta.last_name ?? '',
            phone: meta.phone ?? '',
            username: meta.username,
          }, { onConflict: 'id' }).then(({ error }) => {
            if (error) console.error('Profile ensure error:', error.message);
          });
        }
        loadScorePreference(session.user.id);
      } else if (!session) {
        setScorePreference(DEFAULT_SCORE_PREFERENCE);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadScorePreference]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const deleteAccount = async () => {
    const userId = session?.user?.id;
    if (!userId) throw new Error('Not signed in');

    // Delete photos from Supabase Storage (folder is named by userId)
    const { data: files } = await supabase.storage
      .from('memory-photos')
      .list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      await supabase.storage.from('memory-photos').remove(paths);
    }

    // Delete user data from all tables (RLS ensures only own data)
    await supabase.from('activity_events').delete().eq('user_id', userId);
    await supabase.from('memories').delete().eq('user_id', userId);
    await supabase.from('want_to_try').delete().eq('user_id', userId);
    await supabase.from('push_tokens').delete().eq('user_id', userId);
    await supabase.from('notification_preferences').delete().eq('user_id', userId);
    await supabase.from('friendships').delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    await supabase.from('profiles').delete().eq('id', userId);

    // Delete the auth user (requires SECURITY DEFINER function in Supabase)
    await supabase.rpc('delete_own_account');

    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        scorePreference,
        refreshScorePreference,
        signOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
