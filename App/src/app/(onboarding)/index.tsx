import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect, Select } from '@/components/ui/select';
import { auth } from '@/config/firebase';
import {
  GENDERS,
  INTERESTS,
  PREFERRED_LANGUAGES,
} from '@/constants/onboarding';
import { useAuth } from '@/context/auth-context';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [gender, setGender] = useState('Male');
  const [age, setAge] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Adventure & Trekking',
    'Food & Culinary',
  ]);

  // Log Firebase ID Token as soon as the Onboarding screen mounts
  useEffect(() => {
    const logIdToken = async () => {
      try {
        const currentUser = user || auth.currentUser;
        if (currentUser) {
          const token = await currentUser.getIdToken();
          console.log('[Onboarding Screen Mount] Firebase UID:', currentUser.uid);
          console.log('[Onboarding Screen Mount] Firebase ID Token:\n', token);
        } else {
          console.log('[Onboarding Screen Mount] No authenticated user found.');
        }
      } catch (err) {
        console.error('[Onboarding Screen Mount] Error fetching Firebase ID Token:', err);
      }
    };

    logIdToken();
  }, [user]);

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((item) => item !== interest)
        : [...prev, interest]
    );
  };

  const handleComplete = async () => {
    let idToken: string | null = null;
    try {
      const currentUser = user || auth.currentUser;
      if (currentUser) {
        idToken = await currentUser.getIdToken();
      }
    } catch (err) {
      console.warn('[Onboarding Complete] Error fetching Firebase ID Token:', err);
    }

    const onboardingData = {
      name: name.trim(),
      gender,
      age: age.trim(),
      preferredAudio: preferredLanguage,
      interests: selectedInterests,
    };

    try {
      await AsyncStorage.setItem('@musafir_user_profile', JSON.stringify(onboardingData));
    } catch (storageErr) {
      console.warn('[Onboarding Complete] Error saving to AsyncStorage:', storageErr);
    }

    console.log('[Onboarding Completed] User Profile Data:', onboardingData);
    console.log('[Onboarding Completed] Firebase ID Token:\n', idToken);

    router.replace('/(tabs)');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.formContainer}>
              {/* Header */}
              <View style={styles.header}>
                <ThemedText type="subtitle" style={styles.title}>
                  Tell us about you
                </ThemedText>
                <ThemedText themeColor="textSecondary" type="small" style={styles.description}>
                  Personalize your Musafir AI travel companion
                </ThemedText>
              </View>

              <View style={styles.fields}>
                {/* Full Name */}
                <Input
                  label="Full Name"
                  placeholder="e.g. Alex Traveler"
                  value={name}
                  onChangeText={setName}
                />

                {/* Gender Dropdown */}
                <Select
                  label="Gender"
                  title="Select Gender"
                  placeholder="Select gender"
                  value={gender}
                  options={GENDERS}
                  onSelect={setGender}
                />

                {/* Age */}
                <Input
                  label="Age"
                  placeholder="e.g. 24"
                  keyboardType="numeric"
                  maxLength={3}
                  value={age}
                  onChangeText={setAge}
                />

                {/* Preferred Audio Dropdown */}
                <Select
                  label="Preferred Audio"
                  title="Select Preferred Audio"
                  placeholder="Select preferred audio"
                  value={preferredLanguage}
                  options={PREFERRED_LANGUAGES}
                  onSelect={setPreferredLanguage}
                />

                {/* Interests Dropdown (Multi-select) */}
                <MultiSelect
                  label="Interests"
                  title="Select Interests"
                  placeholder="Select your travel interests"
                  values={selectedInterests}
                  options={INTERESTS}
                  onToggle={toggleInterest}
                />

                {/* Actions */}
                <Button
                  variant="default"
                  size="default"
                  onPress={handleComplete}
                  style={styles.submitButton}>
                  Continue to Musafir AI →
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onPress={handleComplete}
                  style={styles.skipButton}>
                  <ThemedText themeColor="textSecondary" type="small">
                    Skip for now
                  </ThemedText>
                </Button>
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
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  fields: {
    gap: 16,
  },
  submitButton: {
    marginTop: 8,
  },
  skipButton: {
    marginTop: -8,
  },
});
