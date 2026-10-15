import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  mapLanguageToLabel,
  normalizeInterestIds,
  updateProfileOnBackend,
  syncUserSignIn,
} from '@/services/user-service';
import { DEFAULT_INTERESTS } from '@/constants/onboarding';
import { useAuth } from '@/context/auth-context';

const STORAGE_KEY = '@musafir_user_profile';

export interface PreferencesContextType {
  preferredAudio: string;
  voiceGender: 'male' | 'female';
  voice: string;
  selectedMoods: string[];
  setAudioPreference: (selection: {
    language: string;
    voiceGender: 'male' | 'female';
    voice: string;
  }) => Promise<void>;
  setMoodPreferences: (moods: string[]) => Promise<void>;
  refreshPreferences: () => Promise<void>;
  isLoading: boolean;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [preferredAudio, setPreferredAudio] = useState<string>('English');
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [voice, setVoice] = useState<string>('Nalini');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([...DEFAULT_INTERESTS]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Refresh preferences from local storage and normalize
  const refreshPreferences = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.preferredAudio) {
          setPreferredAudio(mapLanguageToLabel(data.preferredAudio));
        }
        if (data.voiceGender === 'male' || data.voiceGender === 'female') {
          setVoiceGender(data.voiceGender);
        }
        if (data.voice && typeof data.voice === 'string') {
          setVoice(data.voice);
        }
        if (Array.isArray(data.interests)) {
          setSelectedMoods(normalizeInterestIds(data.interests));
        }
      }
    } catch (err) {
      console.warn('[PreferencesContext] Failed to refresh preferences from storage:', err);
    }
  }, []);

  // Update Audio Preference (language, gender, voice model)
  const setAudioPreference = useCallback(
    async (selection: { language: string; voiceGender: 'male' | 'female'; voice: string }) => {
      // 1. Immediately update React state for instant responsiveness in all screens
      const normalizedLang = mapLanguageToLabel(selection.language);
      setPreferredAudio(normalizedLang);
      setVoiceGender(selection.voiceGender);
      setVoice(selection.voice);

      // 2. Persist to AsyncStorage
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : {};
        const updated = {
          ...existing,
          preferredAudio: normalizedLang,
          voiceGender: selection.voiceGender,
          voice: selection.voice,
        };
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

        // 3. Sync to backend asynchronously
        updateProfileOnBackend({
          preferredAudio: normalizedLang,
          voiceGender: selection.voiceGender,
          voice: selection.voice,
        }).catch((err) => {
          console.warn('[PreferencesContext] Backend profile sync error (audio):', err);
        });
      } catch (err) {
        console.warn('[PreferencesContext] Error saving audio preferences to storage:', err);
      }
    },
    []
  );

  // Update Mood / Interests Preference
  const setMoodPreferences = useCallback(async (moods: string[]) => {
    // 1. Immediately update React state
    const normalized = normalizeInterestIds(moods);
    setSelectedMoods(normalized);

    // 2. Persist to AsyncStorage
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : {};
      const updated = {
        ...existing,
        interests: normalized,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // 3. Sync to backend asynchronously
      updateProfileOnBackend({
        interests: normalized,
      }).catch((err) => {
        console.warn('[PreferencesContext] Backend profile sync error (moods):', err);
      });
    } catch (err) {
      console.warn('[PreferencesContext] Error saving mood preferences to storage:', err);
    }
  }, []);

  // Initial load and backend sync whenever user logs in or mounts
  useEffect(() => {
    let isMounted = true;

    async function initializePreferences() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && isMounted) {
          const data = JSON.parse(raw);
          if (data.preferredAudio) {
            setPreferredAudio(mapLanguageToLabel(data.preferredAudio));
          }
          if (data.voiceGender === 'male' || data.voiceGender === 'female') {
            setVoiceGender(data.voiceGender);
          }
          if (data.voice && typeof data.voice === 'string') {
            setVoice(data.voice);
          }
          if (Array.isArray(data.interests)) {
            setSelectedMoods(normalizeInterestIds(data.interests));
          }
        }

        // Background sync with backend /me profile if authenticated
        try {
          const backendRes = await syncUserSignIn();
          if (backendRes.hasProfile && backendRes.profile && isMounted) {
            const p = backendRes.profile;
            if (p.language) {
              const lang = mapLanguageToLabel(p.language);
              setPreferredAudio(lang);
            }
            if (p.voiceGender === 'male' || p.voiceGender === 'female') {
              setVoiceGender(p.voiceGender);
            }
            if (p.voice) {
              setVoice(p.voice);
            }
            if (Array.isArray(p.interests)) {
              setSelectedMoods(normalizeInterestIds(p.interests));
            }
          }
        } catch {
          // Non-critical background sync
        }
      } catch (err) {
        console.warn('[PreferencesContext] Error initializing preferences:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initializePreferences();

    return () => {
      isMounted = false;
    };
  }, [user]);

  return (
    <PreferencesContext.Provider
      value={{
        preferredAudio,
        voiceGender,
        voice,
        selectedMoods,
        setAudioPreference,
        setMoodPreferences,
        refreshPreferences,
        isLoading,
      }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextType {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
