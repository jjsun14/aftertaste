// Supabase Edge Function: send-friend-notification
// Triggered by a Postgres trigger on memories INSERT.
// Sends Expo push notifications to the user's friends.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Quirky notification message templates
const TEMPLATES = {
  repeatVisit: [
    (name: string, restaurant: string) => `${name} is back at ${restaurant}... again`,
    (name: string, restaurant: string) => `${name} just can't quit ${restaurant}`,
    (name: string, restaurant: string) => `${name} is a regular at ${restaurant} now`,
  ],
  highScore: [
    (name: string, restaurant: string) => `${name} just found a gem at ${restaurant}!`,
    (name: string, restaurant: string) => `${name} is raving about ${restaurant}`,
  ],
  lowScore: [
    (name: string, restaurant: string) => `${name} had a rough one at ${restaurant}...`,
    (name: string, restaurant: string) => `${name} won't be going back to ${restaurant}`,
  ],
  generic: [
    (name: string, restaurant: string) => `${name} just ate at ${restaurant}`,
    (name: string, restaurant: string) => `${name} logged a new food memory at ${restaurant}`,
    (name: string, restaurant: string) => `${name} tried ${restaurant}`,
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildMessage(
  displayName: string,
  restaurantName: string,
  eventType?: string,
  compositeScore?: number
): string {
  if (eventType === 'return_visit') {
    return pickRandom(TEMPLATES.repeatVisit)(displayName, restaurantName);
  }
  if (compositeScore != null && compositeScore >= 8.0) {
    return pickRandom(TEMPLATES.highScore)(displayName, restaurantName);
  }
  if (compositeScore != null && compositeScore <= 4) {
    return pickRandom(TEMPLATES.lowScore)(displayName, restaurantName);
  }
  return pickRandom(TEMPLATES.generic)(displayName, restaurantName);
}

Deno.serve(async (req) => {
  try {
    const { user_id, restaurant_name, composite_score, event_type } = await req.json();

    if (!user_id || !restaurant_name) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id or restaurant_name' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Get the user's display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user_id)
      .single();

    const displayName = profile?.display_name || 'Someone';

    // 2. Find accepted friends
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user_id},addressee_id.eq.${user_id}`)
      .eq('status', 'accepted');

    if (!friendships || friendships.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No friends to notify' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get friend IDs
    const friendIds = friendships.map((f) =>
      f.requester_id === user_id ? f.addressee_id : f.requester_id
    );

    // 3. Filter by notification preferences (friend_activity = true)
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('user_id, friend_activity')
      .in('user_id', friendIds);

    // Friends with no preferences row default to true
    const prefsMap = new Map(prefs?.map((p) => [p.user_id, p.friend_activity]) ?? []);
    const notifiableFriends = friendIds.filter((id) => {
      const pref = prefsMap.get(id);
      return pref === undefined || pref === true; // default to true
    });

    if (notifiableFriends.length === 0) {
      return new Response(
        JSON.stringify({ message: 'All friends have activity notifications disabled' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Build notification message
    const message = buildMessage(
      displayName,
      restaurant_name,
      event_type,
      composite_score
    );

    // 5. Get push tokens for notifiable friends
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', notifiableFriends);

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No push tokens found for friends' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Send via Expo Push API
    const pushMessages = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title: 'Aftertaste',
      body: message,
      data: { type: 'friend_activity', user_id, restaurant_name },
    }));

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(pushMessages),
    });

    const pushResult = await pushResponse.json();

    return new Response(
      JSON.stringify({
        message: `Sent ${pushMessages.length} notification(s)`,
        body: message,
        pushResult,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending notifications:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
