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
import { supabase } from '@/lib/supabase';
import { Colors } from '@/theme/colors';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // Shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Signup-only fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(false);

  // Clear everything when switching tabs
  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setFirstName('');
    setLastName('');
    setPhone('');
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }

    if (mode === 'signup') {
      if (!firstName.trim()) {
        Alert.alert('Missing name', 'Please enter your first name.');
        return;
      }
      if (password.length < 6) {
        Alert.alert('Weak password', 'Password must be at least 6 characters.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              phone: phone.trim(),
            },
          },
        });
        if (error) throw error;

        // Also write to profiles table
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            display_name: displayName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
          });
        }

        Alert.alert(
          'Check your email',
          'We sent you a confirmation link. Please verify your email then log in.',
          [{ text: 'OK', onPress: () => switchMode('login') }]
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // AuthContext picks up session change → _layout.tsx redirects to tabs
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
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
        {/* Logo / Title */}
        <View style={styles.header}>
          <Text style={styles.logo}>🍽️</Text>
          <Text style={styles.appName}>Food Journey</Text>
          <Text style={styles.tagline}>Your personal food memory journal</Text>
        </View>

        {/* Mode toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'login' && styles.toggleActive]}
            onPress={() => switchMode('login')}
          >
            <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>
              Log In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'signup' && styles.toggleActive]}
            onPress={() => switchMode('signup')}
          >
            <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextActive]}>
              Sign Up
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Sign up extra fields ── */}
        {mode === 'signup' && (
          <>
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
          </>
        )}

        {/* Email */}
        <View style={styles.inputWrap}>
          <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
        </View>

        {/* Password */}
        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={mode === 'signup' ? 'Password (min. 6 characters)' : 'Password'}
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleEmailAuth} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {mode === 'login' ? 'Log In' : 'Create Account'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social — stubbed until dev build */}
        <TouchableOpacity style={styles.socialBtn} disabled>
          <Ionicons name="logo-google" size={20} color={Colors.textSecondary} />
          <Text style={styles.socialBtnText}>Continue with Google</Text>
          <Text style={styles.comingSoon}>Dev build</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.socialBtn} disabled>
          <Ionicons name="logo-apple" size={20} color={Colors.textSecondary} />
          <Text style={styles.socialBtnText}>Continue with Apple</Text>
          <Text style={styles.comingSoon}>Dev build</Text>
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
  },
  logo: {
    fontSize: 52,
    marginBottom: 12,
  },
  appName: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: '#000',
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
  eyeBtn: {
    padding: 4,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
    opacity: 0.5,
  },
  socialBtnText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  comingSoon: {
    fontSize: 11,
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
