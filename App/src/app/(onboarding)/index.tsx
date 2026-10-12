import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  AGE_RANGES,
  DEFAULT_AGE_RANGE,
  DEFAULT_INTERESTS,
  GENDERS,
  INTERESTS,
} from '@/constants/onboarding';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { sendOnboardingToBackend } from '@/services/user-service';

const STORAGE_KEY = '@musafir_user_profile';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [name, setName] = useState(user?.displayName || '');
  const [gender, setGender] = useState('Male');
  const [age, setAge] = useState<string>(DEFAULT_AGE_RANGE);
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [voice, setVoice] = useState('Nalini');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    ...DEFAULT_INTERESTS,
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Dynamic Uber palette
  const colors = {
    bg: isDark ? '#000000' : '#FFFFFF',
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    primaryButtonBg: isDark ? '#FFFFFF' : '#000000',
    primaryButtonText: isDark ? '#000000' : '#FFFFFF',
    errorBg: isDark ? '#2D1414' : '#FEE2E2',
    errorText: '#EF4444',
  };

  const toggleInterest = (interest: string) => {
    if (validationError) setValidationError(null);
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((item) => item !== interest)
        : [...prev, interest]
    );
  };

  const handleComplete = async () => {
    const trimmedName = name.trim();
    const selectedAge = age.trim();

    // Strict validation: ALL fields compulsory
    if (!trimmedName) {
      setValidationError('Please enter your full name.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!selectedAge) {
      setValidationError('Please select your age range.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!gender) {
      setValidationError('Please select your gender.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!preferredLanguage) {
      setValidationError('Please select your preferred audio language.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!selectedInterests || selectedInterests.length === 0) {
      setValidationError('Please select at least one travel interest.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      setIsSubmitting(true);
      setValidationError(null);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const currentUser = user || auth.currentUser;
      if (currentUser && trimmedName) {
        try {
          await updateProfile(currentUser, { displayName: trimmedName });
        } catch {
          // Non-critical
        }
      }

      const onboardingData = {
        name: trimmedName,
        gender,
        age: selectedAge,
        preferredAudio: preferredLanguage,
        voiceGender,
        voice,
        interests: selectedInterests,
      };

      // 1. Save locally to AsyncStorage
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(onboardingData));
      } catch (storageErr) {
        console.warn('[Onboarding Complete] Error saving to AsyncStorage:', storageErr);
      }

      // 2. Send request to Backend (PUT /me) with Firebase ID Token attached
      try {
        await sendOnboardingToBackend(onboardingData);
        console.log('[Onboarding Complete] Successfully saved profile to backend.');
      } catch (backendErr) {
        console.warn('[Onboarding Complete] Error syncing with backend:', backendErr);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err) {
      console.error('[Onboarding Complete] Error:', err);
      router.replace('/(tabs)');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormFilled =
    name.trim().length > 0 &&
    age.trim().length > 0 &&
    Boolean(gender) &&
    Boolean(preferredLanguage) &&
    selectedInterests.length > 0;

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.formContainer}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Tell us about you
                </Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  Personalize your Musafir AI travel companion. All fields are required.
                </Text>
              </View>

              {/* Validation Error Banner */}
              {validationError && (
                <View style={[styles.errorBanner, { backgroundColor: colors.errorBg }]}>
                  <Ionicons name="alert-circle" size={18} color={colors.errorText} />
                  <Text style={[styles.errorBannerText, { color: colors.errorText }]}>
                    {validationError}
                  </Text>
                </View>
              )}

              {/* Compulsory Form Rows */}
              <View style={styles.fields}>
                <InputRow
                  label="Name *"
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="e.g. Alex Traveler"
                  autoCapitalize="words"
                  returnKeyType="done"
                />

                <SelectRow
                  label="Age *"
                  title="Select Age Range"
                  value={age}
                  options={AGE_RANGES}
                  onSelect={(val) => {
                    setAge(val);
                    if (validationError) setValidationError(null);
                  }}
                />

                <SelectRow
                  label="Gender *"
                  title="Select Gender"
                  value={gender}
                  options={GENDERS}
                  onSelect={(val) => {
                    setGender(val);
                    if (validationError) setValidationError(null);
                  }}
                />

                <AudioLanguageRow
                  label="Audio Language *"
                  language={preferredLanguage}
                  voiceGender={voiceGender}
                  voice={voice}
                  onConfirm={(sel) => {
                    setPreferredLanguage(sel.language);
                    setVoiceGender(sel.voiceGender);
                    setVoice(sel.voice);
                    if (validationError) setValidationError(null);
                  }}
                />

                <MultiSelectRow
                  label="Interests *"
                  title="Travel Interests"
                  values={selectedInterests}
                  options={INTERESTS}
                  onToggle={toggleInterest}
                />

                {/* Submit Action */}
                <View style={styles.actions}>
                  <Pressable
                    onPress={handleComplete}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.submitButton,
                      {
                        backgroundColor: colors.primaryButtonBg,
                        opacity: isSubmitting ? 0.7 : !isFormFilled ? 0.6 : pressed ? 0.85 : 1,
                      },
                    ]}>
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={colors.primaryButtonText} />
                    ) : (
                      <Text style={[styles.submitButtonText, { color: colors.primaryButtonText }]}>
                        Continue to Musafir AI →
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    gap: 24,
  },
  header: {
    gap: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorBannerText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  fields: {
    gap: 2,
  },
  actions: {
    marginTop: 24,
    alignItems: 'center',
  },
  submitButton: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
