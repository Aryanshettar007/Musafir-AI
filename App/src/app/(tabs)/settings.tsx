import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { updateProfile } from 'firebase/auth';

import { ThemedView } from '@/components/themed-view';
import { AudioLanguageRow } from '@/components/ui/audio-language-sheet';
import {
  InputRow,
  MultiSelectRow,
  SelectRow,
} from '@/components/ui/sheet-select';
import { auth } from '@/config/firebase';
import {
  GENDERS,
  INTERESTS,
} from '@/constants/onboarding';
import { BottomTabInset } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { updateProfileOnBackend, syncUserSignIn, mapLanguageToLabel } from '@/services/user-service';

const STORAGE_KEY = '@musafir_user_profile';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logOut } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Profile / Onboarding State
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Male');
  const [age, setAge] = useState('');
  const [preferredAudio, setPreferredAudio] = useState('English');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [voice, setVoice] = useState('Nalini');
  const [interests, setInterests] = useState<string[]>([
    'Adventure & Trekking',
    'Food & Culinary',
  ]);

  // UI state
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Load existing onboarding / profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.name) setName(data.name);
          else if (user?.displayName) setName(user.displayName);

          if (data.gender) setGender(data.gender);
          if (data.age) setAge(data.age);
          if (data.preferredAudio) setPreferredAudio(mapLanguageToLabel(data.preferredAudio));
          if (data.voiceGender) setVoiceGender(data.voiceGender);
          if (data.voice) setVoice(data.voice);
          if (Array.isArray(data.interests)) setInterests(data.interests);
        } else if (user?.displayName) {
          setName(user.displayName);
        }

        // Also attempt background sync with backend /me profile if available
        try {
          const backendRes = await syncUserSignIn();
          if (backendRes.hasProfile && backendRes.profile) {
            const p = backendRes.profile;
            if (p.language) setPreferredAudio(mapLanguageToLabel(p.language));
            if (p.voiceGender) setVoiceGender(p.voiceGender);
            if (p.voice) setVoice(p.voice);
          }
        } catch {
          // Non-critical background sync
        }
      } catch (err) {
        console.warn('[Settings] Failed to load user profile:', err);
      } finally {
        setLoadingInitial(false);
      }
    };

    loadProfile();
  }, [user]);

  // Save changes handler
  const handleSave = async () => {
    try {
      setIsSaving(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const profilePayload = {
        name: name.trim(),
        gender,
        age: age.trim(),
        preferredAudio,
        voiceGender,
        voice,
        interests,
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profilePayload));

      // Sync display name with Firebase if available
      if (auth.currentUser && name.trim()) {
        try {
          await updateProfile(auth.currentUser, { displayName: name.trim() });
        } catch {
          // Non-critical, ignore if offline
        }
      }

      // Sync updated profile with backend (PATCH /me) with Firebase ID token
      try {
        await updateProfileOnBackend(profilePayload);
      } catch (backendErr) {
        console.warn('[Settings] Error syncing profile with backend:', backendErr);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      console.error('[Settings] Error saving profile:', err);
      Alert.alert('Error', 'Unable to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle single interest in multi-select
  const toggleInterest = (item: string) => {
    setInterests((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  // Logout handler with Uber-style confirmation dialog
  const handleLogoutPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of Musafir AI?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoggingOut(true);
              await logOut();
              router.replace('/(auth)/login');
            } catch (err) {
              console.error('[Settings] Logout error:', err);
              Alert.alert('Logout Error', 'Could not sign out. Please check your connection.');
              setIsLoggingOut(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Dynamic Uber-themed palette
  const colors = {
    bg: isDark ? '#000000' : '#FFFFFF',
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
    avatarBg: isDark ? '#1C1C1E' : '#F3F3F3',
    primaryButtonBg: isDark ? '#FFFFFF' : '#000000',
    primaryButtonText: isDark ? '#000000' : '#FFFFFF',
    logoutBg: isDark ? '#161618' : '#F6F6F6',
  };

  // User initials for minimalist avatar
  const getInitials = () => {
    if (name.trim()) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name.trim().slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'M';
  };

  if (loadingInitial) {
    return (
      <ThemedView style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="small" color={colors.textPrimary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.bg }]}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + BottomTabInset + 32 },
            ]}>
            {/* Header Title */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Account</Text>
            </View>

            {/* Profile Overview (Uber-style flat layout, no box wrapper) */}
            <View style={[styles.profileOverview, { borderBottomColor: colors.divider }]}>
              <View style={[styles.avatar, { backgroundColor: colors.avatarBg }]}>
                <Text style={[styles.avatarText, { color: colors.textPrimary }]}>
                  {getInitials()}
                </Text>
              </View>
              <View style={styles.profileMeta}>
                <Text style={[styles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {name.trim() || 'Musafir Traveler'}
                </Text>
                <Text style={[styles.profileEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                  {user?.email || 'Logged in user'}
                </Text>
              </View>
            </View>

            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                PROFILE DETAILS
              </Text>
            </View>

            {/* Reusable Form Rows */}
            <InputRow
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              autoCapitalize="words"
              returnKeyType="done"
            />

            <InputRow
              label="Age"
              value={age}
              onChangeText={setAge}
              placeholder="e.g. 25"
              keyboardType="numeric"
              maxLength={3}
              returnKeyType="done"
            />

            <SelectRow
              label="Gender"
              title="Select Gender"
              value={gender}
              options={GENDERS}
              onSelect={setGender}
            />

            <AudioLanguageRow
              label="Audio Language"
              language={preferredAudio}
              voiceGender={voiceGender}
              voice={voice}
              onConfirm={(sel) => {
                setPreferredAudio(sel.language);
                setVoiceGender(sel.voiceGender);
                setVoice(sel.voice);
              }}
            />

            <MultiSelectRow
              label="Interests"
              title="Travel Interests"
              values={interests}
              options={INTERESTS}
              onToggle={toggleInterest}
            />

            {/* Save Button (Uber high-contrast solid button) */}
            <View style={styles.actionSection}>
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                style={({ pressed }) => [
                  styles.saveButton,
                  {
                    backgroundColor: isSaved
                      ? '#10b981'
                      : colors.primaryButtonBg,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.primaryButtonText} />
                ) : isSaved ? (
                  <View style={styles.buttonContentRow}>
                    <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />
                    <Text style={[styles.saveButtonText, { color: '#FFFFFF' }]}>Saved</Text>
                  </View>
                ) : (
                  <Text style={[styles.saveButtonText, { color: colors.primaryButtonText }]}>
                    Save Changes
                  </Text>
                )}
              </Pressable>
            </View>

            {/* Bottom Section: App Info & Logout Button */}
            <View style={styles.bottomSection}>
              <View style={[styles.appInfoRow, { borderTopColor: colors.divider }]}>
                <Text style={[styles.appInfoText, { color: colors.textSecondary }]}>
                  Musafir AI • v1.0.0
                </Text>
              </View>

              {/* Logout Button */}
              <Pressable
                onPress={handleLogoutPress}
                disabled={isLoggingOut}
                style={({ pressed }) => [
                  styles.logoutButton,
                  {
                    backgroundColor: colors.logoutBg,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}>
                {isLoggingOut ? (
                  <ActivityIndicator size="small" color="#e11900" />
                ) : (
                  <View style={styles.logoutContent}>
                    <Ionicons name="log-out-outline" size={18} color="#e11900" />
                    <Text style={styles.logoutText}>Log Out</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    paddingVertical: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  profileOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  profileMeta: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 13,
  },
  sectionHeader: {
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  actionSection: {
    marginTop: 24,
  },
  saveButton: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  bottomSection: {
    marginTop: 40,
    gap: 16,
  },
  appInfoRow: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  appInfoText: {
    fontSize: 12,
    fontWeight: '500',
  },
  logoutButton: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: {
    color: '#e11900',
    fontSize: 15,
    fontWeight: '600',
  },
});
