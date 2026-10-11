import { api } from '@/services/api';

export interface OnboardingFormValues {
  name?: string;
  gender?: string;
  age?: string | number;
  preferredAudio?: string;
  voiceGender?: 'male' | 'female';
  voice?: string;
  interests?: string[];
}

export interface BackendProfileInput {
  name?: string;
  gender?: 'male' | 'female' | 'unspecified';
  age?: number;
  language?: string;
  interests?: string[];
  musicMode?: 'rj' | 'duck-only' | 'off';
  voiceGender?: 'male' | 'female';
  voice?: string;
}

export interface BackendProfile {
  name?: string;
  gender: 'male' | 'female' | 'unspecified';
  age?: number;
  language: string;
  voiceGender: 'male' | 'female';
  voice: string;
  interests: string[];
  musicMode: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Maps UI Gender selection to backend Gender ID.
 */
function mapGender(gender?: string): 'male' | 'female' | 'unspecified' | undefined {
  if (!gender) return undefined;
  const lower = gender.toLowerCase();
  if (lower === 'male') return 'male';
  if (lower === 'female') return 'female';
  return 'unspecified';
}

/**
 * Maps UI Language selection to Gnani TTS Language ID.
 */
export function mapLanguage(lang?: string): string {
  if (!lang) return 'en-IN';
  const mapping: Record<string, string> = {
    English: 'en-IN',
    Hindi: 'hi-IN',
    'Hinglish (Hindi + English)': 'hi-en',
    Hinglish: 'hi-en',
    Kannada: 'kn-IN',
    Tamil: 'ta-IN',
    Telugu: 'te-IN',
    Malayalam: 'ml-IN',
    Marathi: 'mr-IN',
    Bengali: 'bn-IN',
    Gujarati: 'gu-IN',
    Punjabi: 'pa-IN',
    'en-IN': 'en-IN',
    'hi-IN': 'hi-IN',
    'hi-en': 'hi-en',
    'kn-IN': 'kn-IN',
    'ta-IN': 'ta-IN',
    'te-IN': 'te-IN',
    'ml-IN': 'ml-IN',
    'mr-IN': 'mr-IN',
    'bn-IN': 'bn-IN',
    'gu-IN': 'gu-IN',
    'pa-IN': 'pa-IN',
  };
  return mapping[lang] || 'en-IN';
}

/**
 * Maps Gnani TTS Language ID to readable label.
 */
export function mapLanguageToLabel(langId?: string): string {
  if (!langId) return 'English';
  const mapping: Record<string, string> = {
    'en-IN': 'English',
    'hi-IN': 'Hindi',
    'hi-en': 'Hinglish (Hindi + English)',
    'kn-IN': 'Kannada',
    'ta-IN': 'Tamil',
    'te-IN': 'Telugu',
    'ml-IN': 'Malayalam',
    'mr-IN': 'Marathi',
    'bn-IN': 'Bengali',
    'gu-IN': 'Gujarati',
    'pa-IN': 'Punjabi',
  };
  return mapping[langId] || langId;
}

/**
 * Maps UI Interests selection to valid backend Interest IDs.
 */
function mapInterests(interests?: string[]): string[] {
  if (!interests || interests.length === 0) return ['history', 'food'];

  const mapping: Record<string, string> = {
    'Adventure & Trekking': 'adventure',
    'Heritage & History': 'history',
    'Food & Culinary': 'food',
    'Nature & Wildlife': 'nature',
    'Beaches & Islands': 'nature',
    'Photography': 'art-culture',
    'Nightlife & Social': 'cinema',
    'Wellness & Yoga': 'spirituality',
    'Art & Museums': 'art-culture',
    'Road Trips': 'adventure',
    'Budget Backpacking': 'adventure',
    'Luxury & Resorts': 'history',
    // In case backend IDs were already passed:
    history: 'history',
    architecture: 'architecture',
    spirituality: 'spirituality',
    food: 'food',
    nature: 'nature',
    adventure: 'adventure',
    'art-culture': 'art-culture',
    legends: 'legends',
    cinema: 'cinema',
  };

  const mapped = interests.map((i) => mapping[i] || 'history');
  return [...new Set(mapped)];
}

/**
 * Converts form values to the backend-compatible ProfileInput payload.
 */
export function formatProfileForBackend(form: OnboardingFormValues): BackendProfileInput {
  const payload: BackendProfileInput = {};

  if (form.name && form.name.trim()) {
    payload.name = form.name.trim();
  }

  const gender = mapGender(form.gender);
  if (gender) {
    payload.gender = gender;
  }

  if (form.age !== undefined && form.age !== '') {
    const parsedAge = typeof form.age === 'number' ? form.age : parseInt(form.age, 10);
    if (!isNaN(parsedAge) && parsedAge >= 1 && parsedAge <= 120) {
      payload.age = parsedAge;
    }
  }

  if (form.preferredAudio) {
    payload.language = mapLanguage(form.preferredAudio);
  }

  if (form.voiceGender) {
    const vg = form.voiceGender.toLowerCase();
    if (vg === 'male' || vg === 'female') {
      payload.voiceGender = vg;
    }
  }

  if (form.voice && form.voice.trim()) {
    payload.voice = form.voice.trim();
  }

  if (form.interests && form.interests.length > 0) {
    payload.interests = mapInterests(form.interests);
  }

  return payload;
}

/**
 * Called after sign-in / sign-up to notify the backend and verify the user.
 * Sends GET /me with the Firebase ID token.
 */
export async function syncUserSignIn(): Promise<{ hasProfile: boolean; profile?: BackendProfile }> {
  try {
    const res = await api.get<{ success: boolean; data: BackendProfile }>('/me');
    return { hasProfile: true, profile: res.data };
  } catch (err: any) {
    // 404 PROFILE_NOT_FOUND means the user is authenticated in Firebase but hasn't onboarded in MongoDB yet
    if (err?.message?.includes('No profile yet') || err?.message?.includes('PROFILE_NOT_FOUND')) {
      return { hasProfile: false };
    }
    // Return gracefully if offline
    console.warn('[syncUserSignIn] Backend sync status:', err?.message);
    return { hasProfile: false };
  }
}

/**
 * Called after the user completes onboarding.
 * Sends PUT /me to create/replace their profile in the backend MongoDB.
 */
export async function sendOnboardingToBackend(
  form: OnboardingFormValues
): Promise<{ success: boolean; profile?: BackendProfile }> {
  const payload = formatProfileForBackend(form);
  console.log('[sendOnboardingToBackend] Sending payload to backend PUT /me:', payload);

  const res = await api.put<{ success: boolean; data: BackendProfile }>('/me', payload);
  return { success: res.success, profile: res.data };
}

/**
 * Called when editing existing profile in settings.
 * Sends PATCH /me to update fields in the backend.
 * If the user hasn't completed onboarding yet in MongoDB, gracefully falls back to PUT /me (upsert).
 */
export async function updateProfileOnBackend(
  form: OnboardingFormValues
): Promise<{ success: boolean; profile?: BackendProfile }> {
  const payload = formatProfileForBackend(form);
  console.log('[updateProfileOnBackend] Sending payload to backend:', payload);

  try {
    const res = await api.patch<{ success: boolean; data: BackendProfile }>('/me', payload);
    console.log('[updateProfileOnBackend] Successfully updated profile via PATCH /me');
    return { success: res.success, profile: res.data };
  } catch (err: any) {
    if (
      err?.message?.includes('No profile yet') ||
      err?.message?.includes('PROFILE_NOT_FOUND')
    ) {
      console.log('[updateProfileOnBackend] Profile not in DB yet, creating via PUT /me...');
      const res = await api.put<{ success: boolean; data: BackendProfile }>('/me', payload);
      console.log('[updateProfileOnBackend] Successfully created profile via PUT /me');
      return { success: res.success, profile: res.data };
    }
    throw err;
  }
}
