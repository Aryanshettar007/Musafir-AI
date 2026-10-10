import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect, Select } from '@/components/ui/select';
import {
  GENDERS,
  INTERESTS,
  PREFERRED_LANGUAGES,
} from '@/constants/onboarding';

export default function OnboardingScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [gender, setGender] = useState('Male');
  const [age, setAge] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Adventure & Trekking',
    'Food & Culinary',
  ]);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((item) => item !== interest)
        : [...prev, interest]
    );
  };

  const handleComplete = () => {
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

                {/* Connect Spotify Button */}
                <View style={styles.sectionGroup}>
                  <ThemedText type="small" style={styles.sectionLabel}>
                    Music & Vibes
                  </ThemedText>
                  <Pressable
                    onPress={() => setIsSpotifyConnected(!isSpotifyConnected)}
                    style={({ pressed }) => [
                      styles.spotifyButton,
                      isSpotifyConnected && styles.spotifyButtonConnected,
                      pressed && styles.pressed,
                    ]}>
                    <Image
                      source={require('@/assets/images/spotify-logo.png')}
                      style={styles.spotifyLogo}
                      contentFit="contain"
                    />
                    <Text
                      style={[
                        styles.spotifyText,
                        isSpotifyConnected && styles.spotifyTextConnected,
                      ]}>
                      {isSpotifyConnected ? 'Spotify Connected ✓' : 'Connect Spotify'}
                    </Text>
                  </Pressable>
                </View>

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
  sectionGroup: {
    gap: 6,
  },
  sectionLabel: {
    fontWeight: '500',
    fontSize: 14,
  },
  spotifyButton: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1DB954',
    backgroundColor: '#1DB95415',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  spotifyButtonConnected: {
    backgroundColor: '#1DB95428',
    borderColor: '#1DB954',
  },
  spotifyLogo: {
    width: 22,
    height: 22,
  },
  spotifyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1DB954',
  },
  spotifyTextConnected: {
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  submitButton: {
    marginTop: 8,
  },
  skipButton: {
    marginTop: -8,
  },
});
