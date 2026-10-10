import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import {
  GENDERS,
  INTERESTS,
  PREFERRED_LANGUAGES,
} from '@/constants/onboarding';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

const STORAGE_KEY = '@musafir_user_profile';

type ModalType = 'name' | 'age' | 'gender' | 'language' | 'interests' | null;

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logOut } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Profile states
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Male');
  const [age, setAge] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Adventure & Trekking',
    'Food & Culinary',
  ]);

  // Modal editor states
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [tempName, setTempName] = useState('');
  const [tempAge, setTempAge] = useState('');
  const [tempGender, setTempGender] = useState('');
  const [tempLanguage, setTempLanguage] = useState('');
  const [tempInterests, setTempInterests] = useState<string[]>([]);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Load profile from AsyncStorage on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.name) setName(parsed.name);
          if (parsed.gender) setGender(parsed.gender);
          if (parsed.age) setAge(parsed.age);
          if (parsed.preferredAudio) setPreferredLanguage(parsed.preferredAudio);
          if (Array.isArray(parsed.interests)) setSelectedInterests(parsed.interests);
        } else if (user?.displayName) {
          setName(user.displayName);
        }
      } catch (err) {
        console.warn('Error loading user profile:', err);
      }
    };

    loadProfile();
  }, [user]);

  // Save profile changes to AsyncStorage
  const persistProfile = async (updated: {
    name?: string;
    gender?: string;
    age?: string;
    preferredLanguage?: string;
    selectedInterests?: string[];
  }) => {
    const updatedData = {
      name: (updated.name !== undefined ? updated.name : name).trim(),
      gender: updated.gender !== undefined ? updated.gender : gender,
      age: (updated.age !== undefined ? updated.age : age).trim(),
      preferredAudio:
        updated.preferredLanguage !== undefined
          ? updated.preferredLanguage
          : preferredLanguage,
      interests:
        updated.selectedInterests !== undefined
          ? updated.selectedInterests
          : selectedInterests,
    };

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.warn('Error saving profile:', err);
    }
  };

  // Open modal handlers
  const openModal = (type: ModalType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'name') setTempName(name);
    if (type === 'age') setTempAge(age);
    if (type === 'gender') setTempGender(gender);
    if (type === 'language') setTempLanguage(preferredLanguage);
    if (type === 'interests') setTempInterests([...selectedInterests]);
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  // Save modal handler
  const handleSaveModal = async () => {
    if (activeModal === 'name') {
      setName(tempName);
      await persistProfile({ name: tempName });
    } else if (activeModal === 'age') {
      setAge(tempAge);
      await persistProfile({ age: tempAge });
    } else if (activeModal === 'gender') {
      setGender(tempGender);
      await persistProfile({ gender: tempGender });
    } else if (activeModal === 'language') {
      setPreferredLanguage(tempLanguage);
      await persistProfile({ preferredLanguage: tempLanguage });
    } else if (activeModal === 'interests') {
      setSelectedInterests(tempInterests);
      await persistProfile({ selectedInterests: tempInterests });
    }
    closeModal();
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of Musafir AI?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoggingOut(true);
              await logOut();
              router.replace('/(auth)/login');
            } catch {
              Alert.alert('Error', 'Failed to log out. Please try again.');
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  // Color variables
  const mutedText = isDark ? '#A1A1AA' : '#71717A';
  const rowBorder = isDark ? '#27272A' : '#E4E4E7';
  const chevronColor = isDark ? '#71717A' : '#A1A1AA';
  const inputBg = isDark ? '#27272A' : '#F4F4F5';

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 50) + 20,
            paddingBottom: Math.max(insets.bottom, 24) + 84,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* SCREEN TITLE */}
        <View style={styles.screenHeader}>
          <ThemedText style={styles.screenTitle}>Settings</ThemedText>
          {user?.email ? (
            <ThemedText style={[styles.screenSubtitle, { color: mutedText }]}>
              {user.email}
            </ThemedText>
          ) : null}
        </View>

        {/* SECTION: PERSONAL INFO (CLEAN ROWS, NO BOXES) */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: mutedText }]}>
            Personal Info
          </ThemedText>

          {/* Full Name Row */}
          <Pressable
            onPress={() => openModal('name')}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: rowBorder },
              pressed && styles.rowPressed,
            ]}>
            <ThemedText style={styles.rowLabel}>Full Name</ThemedText>
            <View style={styles.rowRight}>
              <ThemedText
                style={[
                  styles.rowValue,
                  { color: name.trim() ? (isDark ? '#FAFAFA' : '#18181B') : mutedText },
                ]}
                numberOfLines={1}>
                {name.trim() || 'Add name'}
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={chevronColor} />
            </View>
          </Pressable>

          {/* Age Row */}
          <Pressable
            onPress={() => openModal('age')}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: rowBorder },
              pressed && styles.rowPressed,
            ]}>
            <ThemedText style={styles.rowLabel}>Age</ThemedText>
            <View style={styles.rowRight}>
              <ThemedText
                style={[
                  styles.rowValue,
                  { color: age.trim() ? (isDark ? '#FAFAFA' : '#18181B') : mutedText },
                ]}>
                {age.trim() ? `${age.trim()} yrs` : 'Add age'}
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={chevronColor} />
            </View>
          </Pressable>

          {/* Gender Row */}
          <Pressable
            onPress={() => openModal('gender')}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: rowBorder },
              pressed && styles.rowPressed,
            ]}>
            <ThemedText style={styles.rowLabel}>Gender</ThemedText>
            <View style={styles.rowRight}>
              <ThemedText
                style={[
                  styles.rowValue,
                  { color: isDark ? '#FAFAFA' : '#18181B' },
                ]}>
                {gender}
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={chevronColor} />
            </View>
          </Pressable>
        </View>

        {/* SECTION: PREFERENCES (CLEAN ROWS, NO BOXES) */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: mutedText }]}>
            Preferences
          </ThemedText>

          {/* Preferred Audio Row */}
          <Pressable
            onPress={() => openModal('language')}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: rowBorder },
              pressed && styles.rowPressed,
            ]}>
            <ThemedText style={styles.rowLabel}>Audio Language</ThemedText>
            <View style={styles.rowRight}>
              <ThemedText
                style={[
                  styles.rowValue,
                  { color: isDark ? '#FAFAFA' : '#18181B' },
                ]}>
                {preferredLanguage}
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={chevronColor} />
            </View>
          </Pressable>

          {/* Travel Interests Row */}
          <Pressable
            onPress={() => openModal('interests')}
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: rowBorder },
              pressed && styles.rowPressed,
            ]}>
            <ThemedText style={styles.rowLabel}>Travel Interests</ThemedText>
            <View style={styles.rowRight}>
              <ThemedText
                style={[
                  styles.rowValue,
                  { color: selectedInterests.length > 0 ? (isDark ? '#FAFAFA' : '#18181B') : mutedText },
                ]}
                numberOfLines={1}>
                {selectedInterests.length > 0
                  ? `${selectedInterests.length} selected`
                  : 'Select'}
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={chevronColor} />
            </View>
          </Pressable>
        </View>

        {/* LOGOUT AT THE BOTTOM */}
        <View style={styles.logoutContainer}>
          <Button
            variant="outline"
            size="lg"
            isLoading={isLoggingOut}
            onPress={handleLogout}
            style={[
              styles.logoutButton,
              { borderColor: isDark ? '#3F3F46' : '#E4E4E7' },
            ]}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <ThemedText style={styles.logoutButtonText}>Log Out</ThemedText>
          </Button>

          <ThemedText style={[styles.versionText, { color: isDark ? '#52525B' : '#A1A1AA' }]}>
            Musafir AI • v1.0.0
          </ThemedText>
        </View>
      </ScrollView>

      {/* SHADCN-STYLE EDIT MODAL */}
      <Modal
        visible={activeModal !== null}
        animationType="slide"
        transparent
        onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={closeModal} />

          <View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                paddingBottom: Math.max(insets.bottom, 20) + 12,
              },
            ]}>
            <View style={styles.handle} />

            {/* MODAL: FULL NAME */}
            {activeModal === 'name' && (
              <View style={styles.modalBody}>
                <ThemedText style={styles.modalTitle}>Full Name</ThemedText>
                <ThemedText style={[styles.modalSub, { color: mutedText }]}>
                  Your name is used for audio greetings and journey logs.
                </ThemedText>

                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: inputBg,
                      color: isDark ? '#FAFAFA' : '#18181B',
                    },
                  ]}
                  value={tempName}
                  onChangeText={setTempName}
                  placeholder="Enter full name"
                  placeholderTextColor={mutedText}
                  autoFocus
                  autoCapitalize="words"
                />

                <Button variant="default" size="lg" onPress={handleSaveModal}>
                  Save Name
                </Button>
              </View>
            )}

            {/* MODAL: AGE */}
            {activeModal === 'age' && (
              <View style={styles.modalBody}>
                <ThemedText style={styles.modalTitle}>Age</ThemedText>
                <ThemedText style={[styles.modalSub, { color: mutedText }]}>
                  Helps curate relevant places and cultural stories.
                </ThemedText>

                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: inputBg,
                      color: isDark ? '#FAFAFA' : '#18181B',
                    },
                  ]}
                  value={tempAge}
                  onChangeText={setTempAge}
                  placeholder="Enter age"
                  placeholderTextColor={mutedText}
                  keyboardType="numeric"
                  maxLength={3}
                  autoFocus
                />

                <Button variant="default" size="lg" onPress={handleSaveModal}>
                  Save Age
                </Button>
              </View>
            )}

            {/* MODAL: GENDER */}
            {activeModal === 'gender' && (
              <View style={styles.modalBody}>
                <ThemedText style={styles.modalTitle}>Select Gender</ThemedText>
                <ScrollView style={styles.optionList}>
                  {GENDERS.map((g) => {
                    const isSelected = tempGender === g;
                    return (
                      <Pressable
                        key={g}
                        onPress={() => setTempGender(g)}
                        style={[
                          styles.optionRow,
                          { borderBottomColor: rowBorder },
                        ]}>
                        <ThemedText
                          style={[
                            styles.optionLabel,
                            isSelected && { fontWeight: '700' },
                          ]}>
                          {g}
                        </ThemedText>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={isDark ? '#FAFAFA' : '#18181B'}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Button variant="default" size="lg" onPress={handleSaveModal}>
                  Done
                </Button>
              </View>
            )}

            {/* MODAL: AUDIO LANGUAGE */}
            {activeModal === 'language' && (
              <View style={styles.modalBody}>
                <ThemedText style={styles.modalTitle}>Audio Language</ThemedText>
                <ThemedText style={[styles.modalSub, { color: mutedText }]}>
                  Language used for GPS-triggered creator audio guides.
                </ThemedText>

                <ScrollView style={[styles.optionList, { maxHeight: 260 }]}>
                  {PREFERRED_LANGUAGES.map((lang) => {
                    const isSelected = tempLanguage === lang;
                    return (
                      <Pressable
                        key={lang}
                        onPress={() => setTempLanguage(lang)}
                        style={[
                          styles.optionRow,
                          { borderBottomColor: rowBorder },
                        ]}>
                        <ThemedText
                          style={[
                            styles.optionLabel,
                            isSelected && { fontWeight: '700' },
                          ]}>
                          {lang}
                        </ThemedText>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={isDark ? '#FAFAFA' : '#18181B'}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Button variant="default" size="lg" onPress={handleSaveModal}>
                  Save Language
                </Button>
              </View>
            )}

            {/* MODAL: TRAVEL INTERESTS */}
            {activeModal === 'interests' && (
              <View style={styles.modalBody}>
                <ThemedText style={styles.modalTitle}>Travel Interests</ThemedText>
                <ThemedText style={[styles.modalSub, { color: mutedText }]}>
                  Pick interests to personalize story discovery along your drive.
                </ThemedText>

                <ScrollView style={[styles.optionList, { maxHeight: 280 }]}>
                  {INTERESTS.map((interest) => {
                    const isSelected = tempInterests.includes(interest);
                    return (
                      <Pressable
                        key={interest}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setTempInterests((prev) =>
                            prev.includes(interest)
                              ? prev.filter((i) => i !== interest)
                              : [...prev, interest]
                          );
                        }}
                        style={[
                          styles.optionRow,
                          { borderBottomColor: rowBorder },
                        ]}>
                        <ThemedText
                          style={[
                            styles.optionLabel,
                            isSelected && { fontWeight: '700' },
                          ]}>
                          {interest}
                        </ThemedText>
                        {isSelected && (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color={isDark ? '#FAFAFA' : '#18181B'}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Button variant="default" size="lg" onPress={handleSaveModal}>
                  Save Interests ({tempInterests.length})
                </Button>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },

  // Screen Header
  screenHeader: {
    paddingBottom: 24,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  screenSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },

  // Sections
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // Clean Rows (Zero outer boxes)
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '55%',
  },
  rowValue: {
    fontSize: 15,
  },

  // Logout at Bottom
  logoutContainer: {
    marginTop: 12,
    alignItems: 'center',
    gap: 16,
  },
  logoutButton: {
    width: '100%',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutButtonText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
  versionText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Bottom Sheet Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8E8E93',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalBody: {
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  modalSub: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: -8,
  },
  textInput: {
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  optionList: {
    maxHeight: 220,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLabel: {
    fontSize: 16,
  },
});
