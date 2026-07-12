// Supabase Edge Function: send-friend-request-notification
// Called directly from the client when a friend request is sent or accepted.
// Sends an Expo push notification to the recipient.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  try {
    const { type, requester_id, addressee_id, friendship_id } = await req.json();

    if (!type || (type !== 'sent' && type !== 'accepted')) {
      return new Response(
        JSON.stringify({ error: 'type must be "sent" or "accepted"' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let notifyUserId: string;   // user to receive the push
    let senderUserId: string;   // user whose name appears in the message

    if (type === 'sent') {
      // Notify the addressee that someone wants to be friends
      if (!requester_id || !addressee_id) {
        return new Response(
          JSON.stringify({ error: 'requester_id and addressee_id required for type "sent"' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      notifyUserId = addressee_id;
      senderUserId = requester_id;
    } else {
      // type === 'accepted' — notify the requester their request was accepted
      if (!friendship_id) {
        return new Response(
          JSON.stringify({ error: 'friendship_id required for type "accepted"' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const { data: friendship, error: fErr } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('id', friendship_id)
        .single();
      if (fErr || !friendship) {
        return new Response(
          JSON.stringify({ error: 'Friendship not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      notifyUserId = friendship.requester_id;   // tell the person who asked
      senderUserId = friendship.addressee_id;   // the one who accepted
    }

    // Check recipient's notification preference for friend_requests
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('friend_requests')
      .eq('user_id', notifyUserId)
      .single();

    // Default is true — only skip if explicitly disabled
    if (prefs?.friend_requests === false) {
      return new Response(
        JSON.stringify({ message: 'User has friend request notifications disabled' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get sender's display name
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', senderUserId)
      .single();
    const senderName = senderProfile?.display_name || 'Someone';

    // Get recipient's push token
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', notifyUserId);

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No push token for recipient' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = type === 'sent'
      ? `${senderName} sent you a friend request`
      : `${senderName} accepted your friend request`;

    const pushMessages = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title: 'Aftertaste',
      body,
      data: { type: 'friend_request' },
    }));

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(pushMessages),
    });

    return new Response(
      JSON.stringify({ message: `Sent friend request notification (${type})` }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending friend request notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
