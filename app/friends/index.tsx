import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, getAvatarColor } from '@/theme/colors';
import { useFriends } from '@/context/FriendsContext';
import type { FriendProfile, FriendActivity } from '@/data/mockData';

// ─── Helpers ─────────────────────────────────────────────────────
function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

type Tab = 'friends' | 'activity';

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const {
    friends,
    pendingIncoming,
    pendingOutgoing,
    activity,
    loading,
    acceptRequest,
    declineRequest,
    removeFriend,
    refetchActivity,
  } = useFriends();

  // Refresh activity feed every time screen is focused
  useFocusEffect(
    useCallback(() => {
      refetchActivity();
    }, [refetchActivity])
  );

  const [activeTab, setActiveTab] = useState<Tab>('activity');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleAccept = async (friendshipId: string) => {
    setProcessingId(friendshipId);
    try {
      await acceptRequest(friendshipId);
    } catch {
      Alert.alert('Error', 'Could not accept request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (friendshipId: string) => {
    setProcessingId(friendshipId);
    try {
      await declineRequest(friendshipId);
    } catch {
      Alert.alert('Error', 'Could not decline request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemove = (friend: FriendProfile) => {
    Alert.alert(
      'Remove Friend',
      `Remove ${friend.displayName} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriend(friend.id);
            } catch {
              Alert.alert('Error', 'Could not remove friend.');
            }
          },
        },
      ]
    );
  };

  // ─── Renderers ─────────────────────────────────────────────────

  const renderIncomingRequest = (item: typeof pendingIncoming[0]) => (
    <View style={styles.requestCard} key={item.id}>
      <View style={styles.requestAvatar}>
        <Text style={styles.requestAvatarText}>
          {getInitials(item.profile.displayName)}
        </Text>
      </View>
      <View style={styles.requestInfo}>
        <Text style={styles.requestName}>{item.profile.displayName}</Text>
        {item.profile.username && (
          <Text style={styles.requestUsername}>@{item.profile.username}</Text>
        )}
      </View>
      {processingId === item.id ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => handleAccept(item.id)}
          >
            <Ionicons name="checkmark" size={18} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={() => handleDecline(item.id)}
          >
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderFriend = ({ item }: { item: FriendProfile }) => (
    <View style={styles.friendRow}>
      <View style={[styles.friendAvatar, { backgroundColor: getAvatarColor(item.profileId) }]}>
        <Text style={styles.friendAvatarText}>
          {getInitials(item.displayName)}
        </Text>
      </View>
      <View style={styles.friendInfo}>
        <Text style={styles.friendName}>{item.displayName}</Text>
        {item.username && (
          <Text style={styles.friendUsername}>@{item.username}</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => handleRemove(item)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );

  const renderActivity = ({ item }: { item: FriendActivity }) => (
    <View style={styles.activityRow}>
      <View style={[styles.activityAvatarSmall, { backgroundColor: getAvatarColor(item.userId) }]}>
        <Text style={styles.activityAvatarText}>
          {getInitials(item.userDisplayName)}
        </Text>
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityText}>
          <Text style={styles.activityName}>{item.userDisplayName}</Text>
          {item.eventType === 'return_visit' ? ' went back to ' : ' ate at '}
          <Text style={styles.activityRestaurant}>{item.restaurantName}</Text>
        </Text>
        <Text style={styles.activityMeta}>
          {item.city ? `${item.city} \u00B7 ` : ''}{relativeTime(item.createdAt)}
        </Text>
      </View>
    </View>
  );

  // ─── Friends Tab content ───────────────────────────────────────

  type FriendsListItem =
    | { type: 'requests-header' }
    | { type: 'request'; data: typeof pendingIncoming[0] }
    | { type: 'pending-header' }
    | { type: 'pending'; data: typeof pendingOutgoing[0] }
    | { type: 'friends-header' }
    | { type: 'friend'; data: FriendProfile };

  const friendsListData: FriendsListItem[] = [
    ...(pendingIncoming.length > 0
      ? [{ type: 'requests-header' as const }, ...pendingIncoming.map(r => ({ type: 'request' as const, data: r }))]
      : []),
    ...(pendingOutgoing.length > 0
      ? [{ type: 'pending-header' as const }, ...pendingOutgoing.map(r => ({ type: 'pending' as const, data: r }))]
      : []),
    { type: 'friends-header' as const },
    ...friends.map(f => ({ type: 'friend' as const, data: f })),
  ];

  const renderFriendsItem = ({ item }: { item: FriendsListItem }) => {
    if (item.type === 'requests-header') {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Friend Requests</Text>
        </View>
      );
    }
    if (item.type === 'request') {
      return <View style={{ paddingHorizontal: 16 }}>{renderIncomingRequest(item.data)}</View>;
    }
    if (item.type === 'pending-header') {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending</Text>
        </View>
      );
    }
    if (item.type === 'pending') {
      const req = item.data;
      return (
        <View style={styles.friendRow}>
          <View style={[styles.friendAvatar, { opacity: 0.4 }]}>
            <Text style={styles.friendAvatarText}>
              {getInitials(req.profile.displayName)}
            </Text>
          </View>
          <View style={styles.friendInfo}>
            <Text style={[styles.friendName, { opacity: 0.5 }]}>
              {req.profile.displayName}
            </Text>
            <Text style={styles.friendUsername}>Request sent</Text>
          </View>
        </View>
      );
    }
    if (item.type === 'friends-header') {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Friends{friends.length > 0 ? ` (${friends.length})` : ''}
          </Text>
          {friends.length === 0 && !loading && (
            <Text style={styles.emptyText}>
              Add friends to see what they're eating!
            </Text>
          )}
        </View>
      );
    }
    if (item.type === 'friend') {
      return renderFriend({ item: item.data });
    }
    return null;
  };

  // ─── Activity Tab content ──────────────────────────────────────

  const renderActivityItem = ({ item }: { item: FriendActivity }) => renderActivity({ item });

  const ActivityEmpty = () => (
    <View style={styles.emptyWrap}>
      <Ionicons name="pulse-outline" size={40} color={Colors.textMuted} />
      <Text style={styles.emptyText}>
        {friends.length === 0
          ? 'Add friends to see their activity here.'
          : 'No activity yet. When friends log meals, it\'ll show up here.'}
      </Text>
    </View>
  );

  // ─── Render ────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friends</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/friends/add')}
        >
          <Ionicons name="person-add-outline" size={18} color={Colors.primary} />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'activity' && styles.tabActive]}
          onPress={() => setActiveTab('activity')}
        >
          <Ionicons
            name="pulse"
            size={16}
            color={activeTab === 'activity' ? Colors.textPrimary : Colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'activity' && styles.tabTextActive]}>
            Activity
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Ionicons
            name="people"
            size={16}
            color={activeTab === 'friends' ? Colors.textPrimary : Colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
            Friends{friends.length > 0 ? ` (${friends.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : activeTab === 'friends' ? (
        <FlatList
          data={friendsListData}
          keyExtractor={(_, i) => `f-${i}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={renderFriendsItem}
        />
      ) : (
        <FlatList
          data={activity}
          keyExtractor={(_, i) => `a-${i}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          renderItem={renderActivityItem}
          ListEmptyComponent={ActivityEmpty}
          ListHeaderComponent={
            activity.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  addBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.surface,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.textPrimary,
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sections
  section: { paddingHorizontal: 16, marginTop: 16, marginBottom: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
    lineHeight: 20,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },

  // Friend requests
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.purple,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  requestInfo: { flex: 1 },
  requestName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  requestUsername: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Friends list
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  friendInfo: { flex: 1 },
  friendName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  friendUsername: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },

  // Activity feed
  activityRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    alignItems: 'flex-start',
  },
  activityAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceBorderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  activityContent: { flex: 1 },
  activityText: {
    color: Colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  activityName: {
    fontWeight: '700',
  },
  activityRestaurant: {
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  activityMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
});
