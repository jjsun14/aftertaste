import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Share,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Colors } from '@/theme/colors';
import { useFriends } from '@/context/FriendsContext';
import type { FriendProfile } from '@/data/mockData';

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function AddFriendScreen() {
  const insets = useSafeAreaInsets();
  const { friendCode, username, friends, pendingOutgoing, sendRequest, findByFriendCode, searchByUsername } = useFriends();

  const [searchQuery, setSearchQuery] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Track which profiles already have a relationship
  const existingIds = new Set([
    ...friends.map((f) => f.profileId),
    ...pendingOutgoing.map((r) => r.profile.profileId),
  ]);

  // ── Search by username (debounced via onSubmit) ──
  const handleSearch = useCallback(async () => {
    Keyboard.dismiss();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const results = await searchByUsername(searchQuery.trim());
      setSearchResults(results);
    } catch (err: any) {
      Alert.alert('Search Error', err.message || 'Search failed. Try again.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchByUsername]);

  // ── Lookup by friend code ──
  const handleCodeLookup = useCallback(async () => {
    Keyboard.dismiss();
    if (!codeInput.trim()) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const found = await findByFriendCode(codeInput.trim());
      if (found) {
        setSearchResults([found]);
      } else {
        Alert.alert('Not Found', 'No user found with that friend code.');
        setSearchResults([]);
      }
    } catch (err: any) {
      Alert.alert('Lookup Error', err.message || 'Lookup failed. Try again.');
    } finally {
      setSearching(false);
    }
  }, [codeInput, findByFriendCode]);

  // ── Send friend request ──
  const handleSendRequest = async (profile: FriendProfile) => {
    if (!username) {
      Alert.alert('Username Required', 'Please set a username in your profile before adding friends.');
      return;
    }
    setSendingId(profile.profileId);
    try {
      await sendRequest(profile.profileId);
      Alert.alert('Request Sent!', `Friend request sent to ${profile.displayName}.`);
    } catch (err: any) {
      if (err.message?.includes('duplicate')) {
        Alert.alert('Already Sent', 'A friend request already exists.');
      } else if (err.message?.includes('username')) {
        Alert.alert('Username Required', err.message);
      } else {
        Alert.alert('Error', 'Could not send request. Try again.');
      }
    } finally {
      setSendingId(null);
    }
  };

  // ── Copy friend code ──
  const handleCopyCode = async () => {
    if (friendCode) {
      await Clipboard.setStringAsync(friendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Share friend code ──
  const handleShareCode = async () => {
    if (friendCode) {
      await Share.share({
        message: `Add me on Aftertaste! My friend code is: ${friendCode}`,
      });
    }
  };

  const renderResult = ({ item }: { item: FriendProfile }) => {
    const alreadyAdded = existingIds.has(item.profileId);
    const isSending = sendingId === item.profileId;

    return (
      <View style={styles.resultRow}>
        <View style={styles.resultAvatar}>
          <Text style={styles.resultAvatarText}>
            {getInitials(item.displayName)}
          </Text>
        </View>
        <View style={styles.resultInfo}>
          <Text style={styles.resultName}>{item.displayName}</Text>
          {item.username && (
            <Text style={styles.resultUsername}>@{item.username}</Text>
          )}
        </View>
        {alreadyAdded ? (
          <View style={styles.addedBadge}>
            <Ionicons name="checkmark" size={14} color={Colors.primary} />
            <Text style={styles.addedText}>Added</Text>
          </View>
        ) : isSending ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <TouchableOpacity
            style={styles.addFriendBtn}
            onPress={() => handleSendRequest(item)}
          >
            <Ionicons name="person-add" size={16} color="#000" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Friend</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.profileId}
        renderItem={renderResult}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <>
            {/* Search by username */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Search by Username</Text>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={Colors.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Enter a username..."
                  placeholderTextColor={Colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                {searching && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>
            </View>

            {/* Friend code lookup */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Enter a Friend Code</Text>
              <View style={styles.codeInputRow}>
                <View style={styles.codeInputWrap}>
                  <TextInput
                    style={styles.codeInput}
                    placeholder="e.g. a3f8b2c1"
                    placeholderTextColor={Colors.textMuted}
                    value={codeInput}
                    onChangeText={setCodeInput}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                    onSubmitEditing={handleCodeLookup}
                  />
                </View>
                <TouchableOpacity style={styles.lookupBtn} onPress={handleCodeLookup}>
                  <Ionicons name="arrow-forward" size={18} color="#000" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Search results label */}
            {searchResults.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Results</Text>
              </View>
            )}

            {/* No results */}
            {!searching && hasSearched && searchResults.length === 0 && (
              <View style={styles.noResultsBanner}>
                <Ionicons name="alert-circle" size={20} color={Colors.ratingPoor} />
                <Text style={styles.noResultsText}>
                  No users found. Make sure they've set a username.
                </Text>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          <>
            {/* Your friend code */}
            <View style={[styles.section, { marginTop: 32 }]}>
              <Text style={styles.sectionTitle}>Your Friend Code</Text>
              <View style={styles.yourCodeCard}>
                <Text style={styles.yourCodeText}>{friendCode ?? '...'}</Text>
                <View style={styles.codeActions}>
                  <TouchableOpacity style={styles.codeActionBtn} onPress={handleCopyCode}>
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy-outline'}
                      size={18}
                      color={copied ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[styles.codeActionText, copied && { color: Colors.primary }]}>
                      {copied ? 'Copied!' : 'Copy'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.codeActionBtn} onPress={handleShareCode}>
                    <Ionicons name="share-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.codeActionText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.codeHint}>
                Share this code with friends so they can add you.
              </Text>
            </View>
          </>
        }
      />
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

  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
  },

  // Code input
  codeInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  codeInputWrap: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  codeInput: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  lookupBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Results
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  resultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  resultInfo: { flex: 1 },
  resultName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  resultUsername: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  addFriendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.primaryBg,
  },
  addedText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  noResultsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  noResultsText: {
    flex: 1,
    color: Colors.ratingPoor,
    fontSize: 14,
    fontWeight: '600',
  },

  // Your code
  yourCodeCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 16,
  },
  yourCodeText: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 3,
    fontFamily: 'monospace',
  },
  codeActions: {
    flexDirection: 'row',
    gap: 16,
  },
  codeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
  },
  codeActionText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  codeHint: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
});
