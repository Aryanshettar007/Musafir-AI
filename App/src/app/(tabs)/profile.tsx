import React, { useCallback, useEffect, useState } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { updateProfile } from 'firebase/auth';

import { ThemedView } from '@/components/themed-view';
import { LegalLinks } from '@/components/legal-links';
import { DeleteAccountModal } from '@/components/ui/delete-account-modal';
import { AudioLanguageRow } from '@/components/ui/audio-language-sheet';
import { MoodSelectRow } from '@/components/ui/mood-select-sheet';
import {
  InputRow,
  SelectRow,
} from '@/components/ui/sheet-select';
import { auth } from '@/config/firebase';
import {
  AGE_RANGES,
  GENDERS,
} from '@/constants/onboarding';
import { BottomTabInset } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { usePreferences } from '@/context/preferences-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  updateProfileOnBackend,
  syncUserSignIn,
  mapLanguageToLabel,
  normalizeInterestIds,
  mapAgeToRange,
} from '@/services/user-service';
import { clearAllOfflineTripData, getOfflineStorageUsage } from '@/services/trip-service';

const STORAGE_KEY = '@musafir_user_profile';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logOut } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // User Preferences (synced globally with Home Screen via PreferencesContext)
  const {
    preferredAudio,
    voiceGender,
    voice,
    selectedMoods,
    setAudioPreference,
    setMoodPreferences,
    refreshPreferences,
  } = usePreferences();

  // Profile / Onboarding State
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Male');
  const [age, setAge] = useState('');

  // UI state
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [offlineStorageText, setOfflineStorageText] = useState<string>('0 B');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Re-sync preferences on focus to ensure Profile stays 100% in sync with Home
  useFocusEffect(
    useCallback(() => {
      refreshPreferences();
    }, [refreshPreferences])
  );

  // Sync /profile/delete-account URL on web when modal opens/closes
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.location.pathname.endsWith('/delete-account')) {
        setShowDeleteModal(true);
      }

      const handlePopState = () => {
        if (window.location.pathname.endsWith('/delete-account')) {
          setShowDeleteModal(true);
        } else {
          setShowDeleteModal(false);
        }
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, []);

  const handleOpenDeleteModal = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setShowDeleteModal(true);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState(null, '', '/profile/delete-account');
    }
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.location.pathname.includes('/delete-account')) {
        window.history.pushState(null, '', '/profile');
      }
    }
  };

  const handleDeleteSuccess = () => {
    setShowDeleteModal(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/profile');
    }
    router.replace('/(auth)/login');
  };

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
          if (data.age) setAge(mapAgeToRange(data.age));
        } else if (user?.displayName) {
          setName(user.displayName);
        }

        // Also attempt background sync with backend /me profile if available
        try {
          const backendRes = await syncUserSignIn();
          if (backendRes.hasProfile && backendRes.profile) {
            const p = backendRes.profile;
            if (p.age !== undefined && p.age !== null) setAge(mapAgeToRange(p.age));
          }
        } catch {
          // Non-critical background sync
        }
      } catch (err) {
        console.warn('[Profile] Failed to load user profile:', err);
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
        interests: selectedMoods,
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
        console.warn('[Profile] Error syncing profile with backend:', backendErr);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      console.error('[Profile] Error saving profile:', err);
      Alert.alert('Error', 'Unable to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };



  // Calculate storage usage on mount and after actions
  const refreshStorageUsage = useCallback(async () => {
    try {
      const usage = await getOfflineStorageUsage();
      setOfflineStorageText(usage.formatted);
    } catch {
      setOfflineStorageText('0 B');
    }
  }, []);

  useEffect(() => {
    refreshStorageUsage();
  }, [refreshStorageUsage]);

  // Clear offline storage handler
  const performClearOffline = async () => {
    try {
      setIsClearingCache(true);
      await clearAllOfflineTripData();
      await refreshStorageUsage();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Storage Cleared', 'Offline trips and audio have been deleted.');
      } else {
        window.alert('Offline trips and audio have been deleted.');
      }
    } catch (err) {
      console.error('[Profile] Error clearing offline data:', err);
      if (Platform.OS !== 'web') {
        Alert.alert('Error', 'Could not clear offline storage.');
      } else {
        window.alert('Could not clear offline storage.');
      }
    } finally {
      setIsClearingCache(false);
    }
  };

  const handleClearOfflinePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert(
        'Clear Offline Storage',
        `This will delete all offline audio downloads and cached trips (${offlineStorageText}) from your device.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear Data',
            style: 'destructive',
            onPress: performClearOffline,
          },
        ]
      );
    } else {
      const confirmed = window.confirm(
        `This will delete all offline audio downloads and cached trips (${offlineStorageText}) from your device. Continue?`
      );
      if (confirmed) {
        performClearOffline();
      }
    }
  };

  // Logout handler: clears all offline trip data and signs out
  const performLogout = async () => {
    try {
      setIsLoggingOut(true);
      // Clear offline trips, audio downloads, and cached storage on logout
      await clearAllOfflineTripData();
      await logOut();
      router.replace('/(auth)/login');
    } catch (err) {
      console.error('[Profile] Logout error:', err);
      if (Platform.OS !== 'web') {
        Alert.alert('Logout Error', 'Could not sign out. Please check your connection.');
      } else {
        window.alert('Could not sign out. Please check your connection.');
      }
      setIsLoggingOut(false);
    }
  };

  const handleLogoutPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        'Log Out',
        'Are you sure you want to log out? All offline trip data and audio downloads will be cleared from this device.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log Out',
            style: 'destructive',
            onPress: performLogout,
          },
        ],
        { cancelable: true }
      );
    } else {
      const confirmed = window.confirm(
        'Are you sure you want to log out? All offline trip data and audio downloads will be cleared from this device.'
      );
      if (confirmed) {
        performLogout();
      }
    }
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
              <Text style={[styles.title, { color: colors.textPrimary }]}>Profile</Text>
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

            <SelectRow
              label="Age"
              title="Select Age Range"
              value={age}
              options={AGE_RANGES}
              onSelect={setAge}
            />

            <SelectRow
              label="Gender"
              title="Select Gender"
              value={gender}
              options={GENDERS}
              onSelect={setGender}
            />

            <AudioLanguageRow
              label="Audio Model"
              language={preferredAudio}
              voiceGender={voiceGender}
              voice={voice}
              onConfirm={async (sel) => {
                await setAudioPreference(sel);
              }}
            />

            <MoodSelectRow
              label="Mood"
              selectedMoods={selectedMoods}
              onApply={async (moods) => {
                await setMoodPreferences(moods);
              }}
            />

            {/* Save Button */}
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

            {/* Bottom Section: App Info & Action Buttons */}
            <View style={styles.bottomSection}>
              {/* Dual Action Buttons: Clear Offline Storage & Logout */}
              <View style={styles.dualButtonsRow}>
                {/* Clear Offline Storage Button */}
                <Pressable
                  onPress={handleClearOfflinePress}
                  disabled={isClearingCache}
                  style={({ pressed }) => [
                    styles.dualButton,
                    {
                      backgroundColor: colors.logoutBg,
                      borderColor: isDark ? '#2A2A2E' : '#E5E5EA',
                      borderWidth: 1,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  {isClearingCache ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <View style={styles.dualButtonContent}>
                      <Ionicons name="trash-outline" size={16} color={colors.textPrimary} />
                      <Text
                        style={[styles.dualButtonText, { color: colors.textPrimary }]}
                        numberOfLines={1}>
                        Clear ({offlineStorageText})
                      </Text>
                    </View>
                  )}
                </Pressable>

                {/* Logout Button */}
                <Pressable
                  onPress={handleLogoutPress}
                  disabled={isLoggingOut}
                  style={({ pressed }) => [
                    styles.dualButton,
                    {
                      backgroundColor: isDark ? '#2D1414' : '#FEE2E2',
                      borderColor: isDark ? '#5A2020' : '#FECACA',
                      borderWidth: 1,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  {isLoggingOut ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <View style={styles.dualButtonContent}>
                      <Ionicons name="log-out-outline" size={17} color="#EF4444" />
                      <Text
                        style={[styles.dualButtonText, { color: '#EF4444', fontWeight: '700' }]}
                        numberOfLines={1}>
                        Log Out
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>

              {/* App Info & Legal Links */}
              <View style={[styles.appInfoRow, { borderTopColor: colors.divider }]}>
                <Text style={[styles.appInfoText, { color: colors.textSecondary }]}>
                  Musafir AI • v1.0.0
                </Text>
                <LegalLinks variant="compact">
                  <Text style={[styles.bullet, { color: isDark ? '#48484A' : '#C7C7CC' }]}>•</Text>
                  <Pressable
                    onPress={handleOpenDeleteModal}
                    accessibilityRole="button"
                    accessibilityLabel="Delete Account"
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    style={({ pressed }) => pressed && { opacity: 0.6 }}>
                    <Text
                      style={[
                        styles.deleteAccountLinkText,
                        { color: isDark ? '#D1D1D6' : '#2C2C2E' },
                      ]}>
                      Delete Account
                    </Text>
                  </Pressable>
                </LegalLinks>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Delete Account Modal */}
      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={handleCloseDeleteModal}
        onSuccess={handleDeleteSuccess}
      />
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
    gap: 8,
  },
  appInfoText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dualButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dualButton: {
    flex: 1,
    height: 50,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dualButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  dualButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  bullet: {
    fontSize: 12,
    fontWeight: '600',
  },
  deleteAccountLinkText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
});
