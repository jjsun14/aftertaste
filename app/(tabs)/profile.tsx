import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  PanResponder,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, getScoreColor, getAvatarColor } from '@/theme/colors';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useMemories } from '@/context/DataContext';
import { useFriends } from '@/context/FriendsContext';
import { supabase } from '@/lib/supabase';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/notifications';

function BottomSheet({
  visible, onClose, children, paddingBottom,
}: {
  visible: boolean; onClose: () => void;
  children: React.ReactNode; paddingBottom: number;
}) {
  const sheetY = useRef(new Animated.Value(0)).current;

  const scrollOffset = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      // Steal from the ScrollView only when it's at the top and the
      // finger is clearly pulling down — otherwise scrolling wins.
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        scrollOffset.current <= 1 && gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 5 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) sheetY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Animated.timing(sheetY, { toValue: 800, duration: 200, useNativeDriver: true })
            .start(() => { sheetY.setValue(0); onClose(); });
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}
        >
          <View style={styles.dragArea}>
            <View style={styles.sheetHandle} />
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom }}
            onScroll={(e) => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
          >
            {children}
          </ScrollView>
          <View style={styles.sheetBottomFill} />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut, deleteAccount } = useAuth();
  const { memories, loading } = useMemories();
  const { friends, username, setUsername: saveUsername, pendingIncoming } = useFriends();

  // Profile fields from user_metadata
  const meta = user?.user_metadata ?? {};
  const [firstName, setFirstName] = useState<string>(meta.first_name ?? '');
  const [lastName, setLastName] = useState<string>(meta.last_name ?? '');
  const [phone, setPhone] = useState<string>(meta.phone ?? '');

  // Edit sheet state
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete account state
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Notification & privacy preferences state
  const [showNotifSheet, setShowNotifSheet] = useState(false);
  const [notifFriendActivity, setNotifFriendActivity] = useState(true);
  const [notifFriendRequests, setNotifFriendRequests] = useState(true);
  const [shareActivity, setShareActivity] = useState(true);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    const m = user?.user_metadata ?? {};
    setFirstName(m.first_name ?? '');
    setLastName(m.last_name ?? '');
    setPhone(m.phone ?? '');
  }, [user]);

  const openEdit = () => {
    setEditFirst(firstName);
    setEditLast(lastName);
    setEditPhone(phone);
    setEditUsername(username ?? '');
    setShowEditSheet(true);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const displayName = [editFirst.trim(), editLast.trim()].filter(Boolean).join(' ');
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: displayName,
          first_name: editFirst.trim(),
          last_name: editLast.trim(),
          phone: editPhone.trim(),
        },
      });
      if (error) throw error;
      await supabase.from('profiles').upsert({
        id: user!.id,
        display_name: displayName,
        first_name: editFirst.trim(),
        last_name: editLast.trim(),
        phone: editPhone.trim(),
      });
      setFirstName(editFirst.trim());
      setLastName(editLast.trim());
      setPhone(editPhone.trim());

      // Save username if changed
      if (editUsername.trim() && editUsername.trim() !== (username ?? '')) {
        try {
          await saveUsername(editUsername.trim());
        } catch (usernameErr: any) {
          if (usernameErr.message?.includes('duplicate') || usernameErr.message?.includes('unique')) {
            Alert.alert('Username Taken', 'That username is already in use. Try another one.');
            return;
          }
        }
      }

      setShowEditSheet(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const openNotifSheet = async () => {
    setShowNotifSheet(true);
    setNotifLoading(true);
    try {
      const prefs = await getNotificationPreferences();
      setNotifFriendActivity(prefs.friendActivity);
      setNotifFriendRequests(prefs.friendRequests);
      setShareActivity(prefs.shareActivity);
    } catch (err) {
      console.error('Failed to load notification prefs:', err);
    } finally {
      setNotifLoading(false);
    }
  };

  const toggleNotifPref = async (
    key: 'friendActivity' | 'friendRequests' | 'shareActivity',
    value: boolean
  ) => {
    const updated = {
      friendActivity: key === 'friendActivity' ? value : notifFriendActivity,
      friendRequests: key === 'friendRequests' ? value : notifFriendRequests,
      shareActivity: key === 'shareActivity' ? value : shareActivity,
    };
    if (key === 'friendActivity') setNotifFriendActivity(value);
    if (key === 'friendRequests') setNotifFriendRequests(value);
    if (key === 'shareActivity') setShareActivity(value);

    try {
      await updateNotificationPreferences(updated);
    } catch (err) {
      console.error('Failed to save notification pref:', err);
      // Revert on error
      if (key === 'friendActivity') setNotifFriendActivity(!value);
      if (key === 'friendRequests') setNotifFriendRequests(!value);
      if (key === 'shareActivity') setShareActivity(!value);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    setDeleteConfirmText('');
    setShowDeleteSheet(true);
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not delete account.');
    } finally {
      setDeleting(false);
      setShowDeleteSheet(false);
    }
  };

  // Derived display values
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') ||
    user?.email?.split('@')[0] ||
    'You';

  const initials =
    firstName && lastName
      ? (firstName[0] + lastName[0]).toUpperCase()
      : firstName
        ? firstName.slice(0, 2).toUpperCase()
        : (user?.email ?? 'ME').slice(0, 2).toUpperCase();

  const avatarColor = getAvatarColor(user?.id ?? 'default');

  // Stats
  const totalMemories = memories.length;
  const totalVisits = memories.reduce(
    (sum, m) => sum + 1 + (m.visits?.length ?? 0),
    0
  );
  const uniqueRestaurants = new Set(
    memories.map((m) => m.restaurantName.toLowerCase().trim())
  ).size;
  const avgScore =
    totalMemories > 0
      ? memories.reduce((sum, m) => sum + m.compositeScore, 0) / totalMemories
      : 0;
  const citiesVisited = new Set(memories.map((m) => m.city).filter(Boolean)).size;

  const topSpotsCount = memories.filter((m) => m.compositeScore >= 7.0).length;

  const cityCounts: Record<string, number> = {};
  memories.forEach((m) => { if (m.city) cityCounts[m.city] = (cityCounts[m.city] ?? 0) + 1; });
  const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + name */}
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.nameBlock}>
            <Text style={styles.displayName}>{displayName}</Text>
            {username && (
              <View style={styles.usernameBadge}>
                <Text style={styles.usernameLabel}>@{username}</Text>
              </View>
            )}
          </View>
          <Text style={styles.memberSince}>
            Joined{' '}
            {new Date(user?.created_at ?? Date.now()).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            })}
          </Text>
        </View>

        {/* Stats — 2×2 grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statsGridRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{loading ? '—' : totalVisits}</Text>
              <Text style={styles.statLabel}>Total Visits</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.primary }]}>
                {loading ? '—' : uniqueRestaurants}
              </Text>
              <Text style={styles.statLabel}>Restaurants</Text>
            </View>
          </View>
          <View style={styles.statsGridRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: getScoreColor(avgScore) }]}>
                {loading ? '—' : avgScore.toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>Avg Score</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.purple }]}>
                {loading ? '—' : citiesVisited}
              </Text>
              <Text style={styles.statLabel}>Cities</Text>
            </View>
          </View>
        </View>

        {/* Insights */}
        <Text style={styles.sectionTitle}>Your Tastes</Text>
        <View style={styles.insightRow}>
          <View style={styles.insightCard}>
            <Ionicons name="star-outline" size={20} color={Colors.primary} />
            <Text style={styles.insightLabel}>Elite & Great</Text>
            <Text style={styles.insightValue}>{loading ? '—' : topSpotsCount}</Text>
          </View>
          <View style={styles.insightCard}>
            <Ionicons name="location-outline" size={20} color={Colors.purple} />
            <Text style={styles.insightLabel}>Top City</Text>
            <Text style={styles.insightValue}>{loading ? '—' : topCity}</Text>
          </View>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuRow} onPress={openEdit}>
            <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.menuText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/friends' as any)}
          >
            <Ionicons name="people-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.menuText}>
              Friends{friends.length > 0 ? ` (${friends.length})` : ''}
            </Text>
            <View style={styles.menuRight}>
              {pendingIncoming.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingIncoming.length}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => router.push('/import' as any)}
          >
            <Ionicons name="download-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.menuText}>Import Places</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={openNotifSheet}>
            <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.menuText}>Notifications</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() =>
              Alert.alert(
                'Privacy',
                'Your data is private and never shared. All memories are tied to your account and protected by row-level security in our database.'
              )
            }
          >
            <Ionicons name="shield-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.menuText}>Privacy</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={Colors.ratingPoor} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount}>
          <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.deleteAccountText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile sheet */}
      <BottomSheet
        visible={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        paddingBottom={insets.bottom + 24}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={() => setShowEditSheet(false)}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.nameRow}>
          <View style={[styles.inputWrap, { flex: 1 }]}>
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={Colors.textMuted}
              value={editFirst}
              onChangeText={setEditFirst}
              autoCapitalize="words"
            />
          </View>
          <View style={[styles.inputWrap, { flex: 1 }]}>
            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor={Colors.textMuted}
              value={editLast}
              onChangeText={setEditLast}
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.inputWrap}>
          <Ionicons name="call-outline" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={Colors.textMuted}
            value={editPhone}
            onChangeText={setEditPhone}
            keyboardType="phone-pad"
          />
        </View>

        <Text style={styles.fieldLabel}>Username</Text>
        <View style={styles.usernameInputWrap}>
          <View style={styles.atBadge}>
            <Text style={styles.atBadgeText}>@</Text>
          </View>
          <TextInput
            style={styles.usernameField}
            placeholder="your_username"
            placeholderTextColor={Colors.textMuted}
            value={editUsername}
            onChangeText={(t) => setEditUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Text style={styles.emailNote}>Friends can find you by username</Text>

        <View style={[styles.inputWrap, { opacity: 0.5 }]}>
          <Ionicons name="mail-outline" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
          <Text style={[styles.input, { color: Colors.textSecondary }]}>{user?.email}</Text>
        </View>
        <Text style={styles.emailNote}>Email cannot be changed here</Text>

        <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </BottomSheet>

      {/* Notification Preferences sheet */}
      <BottomSheet
        visible={showNotifSheet}
        onClose={() => setShowNotifSheet(false)}
        paddingBottom={insets.bottom + 24}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Notifications & Privacy</Text>
          <TouchableOpacity onPress={() => setShowNotifSheet(false)}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {notifLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
        ) : (
          <>
            <View style={styles.notifRow}>
              <View style={styles.notifInfo}>
                <Ionicons name="restaurant-outline" size={18} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifLabel}>Friend Activity</Text>
                  <Text style={styles.notifDesc}>Get notified when friends log meals</Text>
                </View>
              </View>
              <Switch
                value={notifFriendActivity}
                onValueChange={(v) => toggleNotifPref('friendActivity', v)}
                trackColor={{ false: Colors.surfaceBorderLight, true: Colors.primaryDim }}
                thumbColor={notifFriendActivity ? Colors.primary : Colors.textMuted}
              />
            </View>

            <View style={styles.notifDivider} />

            <View style={styles.notifRow}>
              <View style={styles.notifInfo}>
                <Ionicons name="people-outline" size={18} color={Colors.purple} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifLabel}>Friend Requests</Text>
                  <Text style={styles.notifDesc}>Get notified on new friend requests</Text>
                </View>
              </View>
              <Switch
                value={notifFriendRequests}
                onValueChange={(v) => toggleNotifPref('friendRequests', v)}
                trackColor={{ false: Colors.surfaceBorderLight, true: Colors.primaryDim }}
                thumbColor={notifFriendRequests ? Colors.primary : Colors.textMuted}
              />
            </View>

            <View style={styles.notifDivider} />

            <View style={styles.notifRow}>
              <View style={styles.notifInfo}>
                <Ionicons name="eye-off-outline" size={18} color={Colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifLabel}>Share My Activity</Text>
                  <Text style={styles.notifDesc}>Let friends see when you log meals</Text>
                </View>
              </View>
              <Switch
                value={shareActivity}
                onValueChange={(v) => toggleNotifPref('shareActivity', v)}
                trackColor={{ false: Colors.surfaceBorderLight, true: Colors.primaryDim }}
                thumbColor={shareActivity ? Colors.primary : Colors.textMuted}
              />
            </View>

            <Text style={styles.notifFooter}>
              Notifications are sent via Expo Push. You can also control notifications in your device settings.
            </Text>
          </>
        )}
      </BottomSheet>

      {/* Delete Account confirmation sheet */}
      <BottomSheet
        visible={showDeleteSheet}
        onClose={() => setShowDeleteSheet(false)}
        paddingBottom={insets.bottom + 24}
      >
        <Text style={styles.sheetTitle}>Delete Account</Text>
        <Text style={styles.deleteWarning}>
          This will permanently delete your account and all your data — memories, photos, friends. This cannot be undone.
        </Text>
        <Text style={styles.deletePrompt}>
          Type <Text style={styles.deletePromptBold}>{username || user?.email?.split('@')[0] || 'delete'}</Text> to confirm:
        </Text>
        <TextInput
          style={styles.deleteInput}
          value={deleteConfirmText}
          onChangeText={setDeleteConfirmText}
          placeholder="Type to confirm..."
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[
            styles.deleteConfirmBtn,
            deleteConfirmText !== (username || user?.email?.split('@')[0] || 'delete') && styles.deleteConfirmBtnDisabled,
          ]}
          onPress={confirmDeleteAccount}
          disabled={deleteConfirmText !== (username || user?.email?.split('@')[0] || 'delete') || deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.deleteConfirmBtnText}>Permanently Delete Account</Text>
          )}
        </TouchableOpacity>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20 },
  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.purple,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  nameBlock: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 4, flexWrap: 'wrap', justifyContent: 'center',
  },
  displayName: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  usernameBadge: {
    backgroundColor: Colors.surfaceLight, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  usernameLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  memberSince: { fontSize: 12, color: Colors.textMuted },
  statsGrid: { gap: 10, marginBottom: 28 },
  statsGridRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.surfaceBorder, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  statLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase',
  },
  insightRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  insightCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.surfaceBorder, borderRadius: 14, padding: 16, gap: 6,
  },
  insightLabel: { fontSize: 12, color: Colors.textSecondary },
  insightValue: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  menuCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: 14, marginBottom: 28, overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16, gap: 12,
  },
  menuText: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    backgroundColor: Colors.primary,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#000', fontSize: 11, fontWeight: '700' },
  menuDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginLeft: 16 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)', borderRadius: 14, paddingVertical: 16,
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: Colors.ratingPoor },
  deleteAccountBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, marginTop: 12, marginBottom: 20,
  },
  deleteAccountText: { fontSize: 13, color: Colors.textMuted },
  deleteWarning: {
    color: Colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20,
  },
  deletePrompt: { color: Colors.textPrimary, fontSize: 14, marginBottom: 10 },
  deletePromptBold: { fontWeight: '700', color: Colors.ratingPoor },
  deleteInput: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: Colors.textPrimary, fontSize: 15, marginBottom: 16,
  },
  deleteConfirmBtn: {
    backgroundColor: Colors.ratingPoor, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  deleteConfirmBtnDisabled: { opacity: 0.3 },
  deleteConfirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12,
  },
  dragArea: {
    paddingTop: 8, paddingBottom: 4, alignItems: 'center',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorderLight, alignSelf: 'center', marginBottom: 16,
  },
  sheetBottomFill: {
    height: 220, backgroundColor: Colors.surface,
    position: 'absolute', bottom: -220, left: 0, right: 0,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  nameRow: { flexDirection: 'row', gap: 10 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceLight, borderRadius: 12,
    paddingHorizontal: 14, height: 52, marginBottom: 12,
  },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  fieldLabel: {
    fontSize: 13, fontWeight: '600', color: Colors.textSecondary,
    marginBottom: 6, marginTop: 4,
  },
  usernameInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceLight, borderRadius: 12,
    height: 52, marginBottom: 12, overflow: 'hidden',
  },
  atBadge: {
    backgroundColor: Colors.primaryBg, paddingHorizontal: 14,
    height: '100%', justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderRightColor: Colors.surfaceBorder,
  },
  atBadgeText: {
    color: Colors.primary, fontSize: 16, fontWeight: '700',
  },
  usernameField: {
    flex: 1, color: Colors.textPrimary, fontSize: 15, paddingHorizontal: 14,
  },
  emailNote: { fontSize: 12, color: Colors.textMuted, marginBottom: 16, marginTop: -4 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  // Notification prefs
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  notifInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  notifLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  notifDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  notifDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  notifFooter: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 17,
  },
});
