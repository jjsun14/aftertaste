import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, getScoreColor } from '@/theme/colors';
import { useAuth } from '@/context/AuthContext';
import { useMemories } from '@/context/DataContext';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { memories, loading } = useMemories();

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
  const [saving, setSaving] = useState(false);

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
      setShowEditSheet(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
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

  // Stats
  const totalMemories = memories.length;
  const avgScore =
    totalMemories > 0
      ? memories.reduce((sum, m) => sum + m.compositeScore, 0) / totalMemories
      : 0;
  const citiesVisited = new Set(memories.map((m) => m.city).filter(Boolean)).size;

  const cuisineCounts: Record<string, number> = {};
  memories.forEach((m) => { cuisineCounts[m.cuisineType] = (cuisineCounts[m.cuisineType] ?? 0) + 1; });
  const topCuisine = Object.entries(cuisineCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

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
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.memberSince}>
            Member since{' '}
            {new Date(user?.created_at ?? Date.now()).toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{loading ? '—' : totalMemories}</Text>
            <Text style={styles.statLabel}>Memories</Text>
          </View>
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

        {/* Insights */}
        <Text style={styles.sectionTitle}>Your Tastes</Text>
        <View style={styles.insightRow}>
          <View style={styles.insightCard}>
            <Ionicons name="restaurant-outline" size={20} color={Colors.primary} />
            <Text style={styles.insightLabel}>Top Cuisine</Text>
            <Text style={styles.insightValue}>{loading ? '—' : topCuisine}</Text>
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
            onPress={() =>
              Alert.alert('Notifications', 'Push notifications will be available in a future update.')
            }
          >
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
      </ScrollView>

      {/* Edit Profile sheet */}
      <Modal
        visible={showEditSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditSheet(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowEditSheet(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 20 },
  avatarWrap: { alignItems: 'center', marginBottom: 32 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#000' },
  displayName: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  memberSince: { fontSize: 13, color: Colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
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
  menuDivider: { height: 1, backgroundColor: Colors.surfaceBorder, marginLeft: 16 },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)', borderRadius: 14, paddingVertical: 16,
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: Colors.ratingPoor },
  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.surfaceBorderLight, alignSelf: 'center', marginBottom: 16,
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
  emailNote: { fontSize: 12, color: Colors.textMuted, marginBottom: 16, marginTop: -4 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
