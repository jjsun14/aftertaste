import { useEffect, useRef, useState } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { Colors } from '@/theme/colors';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DataProvider } from '@/context/DataContext';
import { FriendsProvider } from '@/context/FriendsContext';
import { supabase, handleAuthDeepLink } from '@/lib/supabase';
import {
  registerForPushNotifications,
  setupNotificationHandlers,
} from '@/lib/notifications';

// Inner component so it can consume AuthContext
function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const notifCleanup = useRef<(() => void) | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);

  // Check if social sign-in user has completed their profile
  useEffect(() => {
    if (!session) {
      setProfileChecked(true);
      setNeedsProfile(false);
      return;
    }

    const provider = session.user?.app_metadata?.provider;
    const profileCompleted = session.user?.user_metadata?.profile_completed;

    // Email users complete profile during signup, social users might not have
    if (provider === 'email' || profileCompleted) {
      setNeedsProfile(false);
      setProfileChecked(true);
      return;
    }

    // Check if profile row exists for social sign-in users
    supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data?.username) {
          setNeedsProfile(false);
        } else {
          setNeedsProfile(true);
        }
        setProfileChecked(true);
      });
  }, [session]);

  useEffect(() => {
    if (loading || !profileChecked) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!session && !inAuthGroup) {
      // Not logged in — send to login
      router.replace('/auth/login');
    } else if (session && needsProfile && segments[1] !== 'complete-profile') {
      // Logged in but needs to complete profile
      router.replace('/auth/complete-profile');
    } else if (session && !needsProfile && inAuthGroup) {
      // Logged in with complete profile but still on auth screen — send to app
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, profileChecked, needsProfile]);

  // Handle deep links from email verification — auto sign-in
  useEffect(() => {
    // Handle URL that opened the app
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthDeepLink(url);
    });
    // Handle URLs while app is running
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleAuthDeepLink(url);
    });
    return () => sub.remove();
  }, []);

  // Register for push notifications when authenticated
  useEffect(() => {
    if (!session) return;

    registerForPushNotifications().catch(console.error);
    notifCleanup.current = setupNotificationHandlers();

    return () => {
      notifCleanup.current?.();
    };
  }, [session]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="entry/[id]"
          options={{
            animation: 'fade',
            animationDuration: 200,
          }}
        />
        <Stack.Screen
          name="rerank/[id]"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen name="friends/index" />
        <Stack.Screen name="friends/add" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <DataProvider>
        <FriendsProvider>
          <RootLayoutNav />
        </FriendsProvider>
      </DataProvider>
    </AuthProvider>
  );
}
