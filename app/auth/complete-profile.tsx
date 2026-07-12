import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/theme/colors';
import type { ScorePreference } from '@/data/mockData';

export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshScorePreference } = useAuth();

  // Pre-fill from provider metadata if available
  const meta = user?.user_metadata ?? {};
  const providerFirstName = meta.full_name?.split(' ')[0] ?? meta.first_name ?? '';
  const providerLastName = meta.full_name?.split(' ').slice(1).join(' ') ?? meta.last_name ?? '';

  const [firstName, setFirstName] = useState(providerFirstName);
  const [lastName, setLastName] = useState(providerLastName);
  const [usernameInput, setUsernameInput] = useState('');
  const [phone, setPhone] = useState('');
  const [scorePref, setScorePref] = useState<ScorePreference>('food_first');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!firstName.trim()) {
      Alert.alert('Missing name', 'Please enter your first name.');
      return;
    }
    if (!usernameInput.trim()) {
      Alert.alert('Missing username', 'Please choose a username.');
      return;
    }
    if (usernameInput.trim().length < 3) {
      Alert.alert('Username too short', 'Username must be at least 3 characters.');
      return;
    }

    setSaving(true);
    try {
      const desiredUsername = usernameInput.trim().toLowerCase();
      const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

      // Check username availability
      const { data: isAvailable, error: rpcError } = await supabase.rpc(
        'check_username_available',
        { desired_username: desiredUsername },
      );
      if (rpcError) throw new Error('Could not verify username availability.');
      if (isAvailable === false) {
        Alert.alert('Username Taken', 'That username is already in use. Please choose a different one.');
        setSaving(false);
        return;
      }

      // Create profile row
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user!.id,
        display_name: displayName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        username: desiredUsername,
        score_preference: scorePref,
      });
      if (profileError) throw profileError;

      // Make sure AuthContext picks up the new preference before the
      // user lands on the main app (where score-writing screens read it).
      await refreshScorePreference();

      // Update auth metadata (this triggers a session refresh via onAuthStateChange)
      // which causes _layout.tsx to re-check the profile
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          display_name: displayName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          profile_completed: true,
        },
      });
      if (updateError) throw updateError;
      // _layout.tsx will pick up the session change and redirect to (tabs)
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.outer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to Aftertaste</Text>
          <Text style={styles.subtitle}>Let's set up your profile</Text>
        </View>

        {/* First + Last name row */}
        <View style={styles.nameRow}>
          <View style={[styles.inputWrap, styles.nameInput]}>
            <Ionicons name="person-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="First name"
              placeholderTextColor={Colors.textMuted}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
          <View style={[styles.inputWrap, styles.nameInput]}>
            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor={Colors.textMuted}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Username */}
        <View style={styles.inputWrap}>
          <Text style={styles.atPrefix}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="Choose a username"
            placeholderTextColor={Colors.textMuted}
            value={usernameInput}
            onChangeText={(t) => setUsernameInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Text style={styles.hint}>Friends can find you by your username</Text>

        {/* Phone number */}
        <View style={styles.inputWrap}>
          <Ionicons name="call-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Phone number (optional)"
            placeholderTextColor={Colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
        </View>

        {/* Score preference */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>HOW DO YOU JUDGE A PLACE?</Text>
        <TouchableOpacity
          style={[styles.prefCard, scorePref === 'food_first' && styles.prefCardActive]}
          onPress={() => setScorePref('food_first')}
          activeOpacity={0.85}
        >
          <View style={styles.prefHeaderRow}>
            <Text style={styles.prefTitle}>Food First</Text>
            {scorePref === 'food_first' && (
              <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
            )}
          </View>
          <Text style={styles.prefBody}>
            Taste makes or breaks it for me — vibe and value are secondary.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.prefCard, scorePref === 'full_picture' && styles.prefCardActive]}
          onPress={() => setScorePref('full_picture')}
          activeOpacity={0.85}
        >
          <View style={styles.prefHeaderRow}>
            <Text style={styles.prefTitle}>Full Picture</Text>
            {scorePref === 'full_picture' && (
              <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
            )}
          </View>
          <Text style={styles.prefBody}>
            I care about the whole experience — food, atmosphere, and whether it was worth it.
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>You can't change this later — pick what feels right.</Text>

        {/* Email (read-only) */}
        <View style={[styles.inputWrap, { opacity: 0.5 }]}>
          <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
          <Text style={[styles.input, { color: Colors.textSecondary }]}>{user?.email}</Text>
        </View>
        <Text style={styles.hint}>Email from your {user?.app_metadata?.provider === 'apple' ? 'Apple' : 'Google'} account</Text>

        {/* Submit */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryBtnText}>Get Started</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
    marginTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nameInput: {
    flex: 1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  atPrefix: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 4,
  },
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 12,
    marginTop: -6,
    marginLeft: 4,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginLeft: 2,
  },
  prefCard: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  prefCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  prefHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  prefTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  prefBody: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
