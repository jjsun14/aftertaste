import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions, get Expo push token,
 * and save it to the push_tokens table in Supabase.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check / request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permission not granted');
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#01D9AE',
    });
  }

  try {
    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId
    });
    const token = tokenData.data;

    // Save token to Supabase
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('push_tokens').upsert(
        {
          user_id: user.id,
          token,
          platform: Platform.OS as 'ios' | 'android',
        },
        { onConflict: 'user_id,token' }
      );
    }

    return token;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Set up notification response listener — navigates to friends
 * screen when a notification is tapped.
 *
 * Returns a cleanup function to remove the listener.
 */
export function setupNotificationHandlers(): () => void {
  // When user taps a notification, navigate to friends activity
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;

      // Navigate based on notification type
      if (data?.type === 'friend_request') {
        router.push('/friends' as any);
      } else {
        // Default: go to friends activity feed
        router.push('/friends' as any);
      }
    }
  );

  // Return cleanup function
  return () => {
    responseSubscription.remove();
  };
}

/**
 * Fetch notification preferences for the current user.
 */
export async function getNotificationPreferences(): Promise<{
  friendActivity: boolean;
  friendRequests: boolean;
  shareActivity: boolean;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { friendActivity: true, friendRequests: true, shareActivity: true };

  const { data } = await supabase
    .from('notification_preferences')
    .select('friend_activity, friend_requests, share_activity')
    .eq('user_id', user.id)
    .single();

  if (!data) {
    // No preferences saved yet — defaults are true
    return { friendActivity: true, friendRequests: true, shareActivity: true };
  }

  return {
    friendActivity: data.friend_activity,
    friendRequests: data.friend_requests,
    shareActivity: data.share_activity ?? true,
  };
}

/**
 * Update notification preferences for the current user.
 */
export async function updateNotificationPreferences(prefs: {
  friendActivity: boolean;
  friendRequests: boolean;
  shareActivity: boolean;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('notification_preferences').upsert({
    user_id: user.id,
    friend_activity: prefs.friendActivity,
    friend_requests: prefs.friendRequests,
    share_activity: prefs.shareActivity,
  });
}
