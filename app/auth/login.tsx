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
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/theme/colors';
import type { ScorePreference } from '@/data/mockData';

GoogleSignin.configure({
  iosClientId: '80221240861-u2rdcjl4145c1pe5ujqbm8v5b9vr4u0r.apps.googleusercontent.com',
});

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
  const [usernameInput, setUsernameInput] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [scorePref, setScorePref] = useState<ScorePreference>('food_first');

  const [loading, setLoading] = useState(false);

  // Clear everything when switching tabs
  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setFirstName('');
    setLastName('');
    setUsernameInput('');
    setPhone('');
    setScorePref('food_first');
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
      if (!usernameInput.trim()) {
        Alert.alert('Missing username', 'Please choose a username.');
        return;
      }
      if (usernameInput.trim().length < 3) {
        Alert.alert('Username too short', 'Username must be at least 3 characters.');
        return;
      }
      if (password.length < 6) {
        Alert.alert('Weak password', 'Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Passwords don\'t match', 'Please make sure both passwords match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
        const desiredUsername = usernameInput.trim().toLowerCase();

        // Check username availability BEFORE creating the account
        // Uses an RPC function (SECURITY DEFINER) so it works without auth
        const { data: isAvailable, error: rpcError } = await supabase.rpc(
          'check_username_available',
          { desired_username: desiredUsername },
        );
        if (rpcError) {
          console.error('Username check RPC error:', JSON.stringify(rpcError));
          throw new Error('Could not verify username availability. Please try again.');
        }
        if (isAvailable === false) {
          Alert.alert('Username Taken', 'That username is already in use. Please choose a different one.');
          setLoading(false);
          return;
        }

        // Username is available — now create the account
        // Redirect URL for the verification email — opens the app via deep link
        const redirectUrl = Linking.createURL('/');

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              display_name: displayName,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              phone: phone.trim(),
              username: desiredUsername,
              profile_completed: true,
            },
          },
        });
        if (error) throw error;

        // Store signup profile data so we can write it after email verification
        // (the user won't have a session until they verify, so RLS blocks writes now)
        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: data.user.id,
            display_name: displayName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
            username: desiredUsername,
            score_preference: scorePref,
          });
          if (profileError) {
            console.error('Profile upsert error (pre-verify):', JSON.stringify(profileError));
          }
        }

        Alert.alert(
          'Check your email',
          'We sent you a confirmation link. Tap it to verify and you\'ll be signed in automatically.',
          [{ text: 'OK' }]
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
          <Text style={styles.appName}>
            Aftertaste<Text style={styles.dot}>.</Text>
          </Text>
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
            <Text style={styles.usernameHint}>Friends can find you by your username</Text>

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
            <Text style={styles.sectionLabel}>HOW DO YOU JUDGE A PLACE?</Text>
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
            <Text style={styles.usernameHint}>You can't change this later — pick what feels right.</Text>
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

        {/* Confirm Password (signup only) */}
        {mode === 'signup' && (
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={Colors.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
          </View>
        )}

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

        {/* Google Sign In */}
        <TouchableOpacity
          style={styles.socialBtn}
          onPress={async () => {
            try {
              const response = await GoogleSignin.signIn();
              if (response.data?.idToken) {
                const { error } = await supabase.auth.signInWithIdToken({
                  provider: 'google',
                  token: response.data.idToken,
                });
                if (error) throw error;

                // Store Google name in user metadata for the complete-profile screen
                const googleName = response.data.user?.name ?? '';
                const googleGiven = response.data.user?.givenName ?? '';
                const googleFamily = response.data.user?.familyName ?? '';
                if (googleName) {
                  await supabase.auth.updateUser({
                    data: {
                      full_name: googleName,
                      first_name: googleGiven,
                      last_name: googleFamily,
                    },
                  });
                }
              } else {
                throw new Error('No ID token returned from Google.');
              }
            } catch (err: any) {
              if (err.code !== '12501') { // user cancelled
                Alert.alert('Google Sign In Error', err.message ?? 'Something went wrong.');
              }
            }
          }}
        >
          <Ionicons name="logo-google" size={20} color={Colors.textPrimary} />
          <Text style={styles.socialBtnText}>Continue with Google</Text>
        </TouchableOpacity>

        {/* Apple Sign In */}
        <TouchableOpacity
          style={styles.socialBtn}
          onPress={async () => {
            try {
              const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                  AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                  AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
              });
              if (credential.identityToken) {
                // Apple only sends name on first sign-in — capture it now
                const appleFirstName = credential.fullName?.givenName ?? '';
                const appleLastName = credential.fullName?.familyName ?? '';
                const appleName = [appleFirstName, appleLastName].filter(Boolean).join(' ');

                const { error } = await supabase.auth.signInWithIdToken({
                  provider: 'apple',
                  token: credential.identityToken,
                });
                if (error) throw error;

                // Store the name in user metadata since Apple won't send it again
                if (appleName) {
                  await supabase.auth.updateUser({
                    data: {
                      full_name: appleName,
                      first_name: appleFirstName,
                      last_name: appleLastName,
                    },
                  });
                }
              } else {
                throw new Error('No identity token returned from Apple.');
              }
            } catch (err: any) {
              if (err.code !== 'ERR_REQUEST_CANCELED') {
                Alert.alert('Apple Sign In Error', err.message ?? 'Something went wrong.');
              }
            }
          }}
        >
          <Ionicons name="logo-apple" size={20} color={Colors.textPrimary} />
          <Text style={styles.socialBtnText}>Continue with Apple</Text>
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
    marginBottom: 44,
    marginTop: 12,
  },
  appName: {
    fontSize: 52,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: -1.5,
  },
  dot: {
    color: Colors.primary,
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
  atPrefix: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 4,
  },
  usernameHint: {
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
    marginTop: 4,
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
  },
  socialBtnText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
});
