import { api } from '@/services/api';

export interface CatalogLanguage {
  id: string;
  label: string;
}

export interface VoiceModel {
  name: string;
  gender: 'male' | 'female';
  recommended: boolean;
  demoUrl: string | null;
  avatarUrl?: string | null;
}

export interface CatalogInterest {
  id: string;
  label: string;
}

export interface CatalogDefaults {
  language: string;
  interests: string[];
  musicMode: string;
}

export interface CatalogData {
  genders: string[];
  ageRanges?: { id: string; label: string }[];
  languages: CatalogLanguage[];
  interests: CatalogInterest[];
  musicModes: string[];
  defaults: CatalogDefaults;
}

// Built-in fallback languages matching backend catalog
export const FALLBACK_LANGUAGES: CatalogLanguage[] = [
  { id: 'en-IN', label: 'English' },
  { id: 'hi-IN', label: 'Hindi' },
  { id: 'hi-en', label: 'Hinglish (Hindi + English)' },
  { id: 'kn-IN', label: 'Kannada' },
  { id: 'ta-IN', label: 'Tamil' },
  { id: 'te-IN', label: 'Telugu' },
  { id: 'ml-IN', label: 'Malayalam' },
  { id: 'mr-IN', label: 'Marathi' },
  { id: 'bn-IN', label: 'Bengali' },
  { id: 'gu-IN', label: 'Gujarati' },
  { id: 'pa-IN', label: 'Punjabi' },
];

// Built-in fallback interests matching backend catalog
export const FALLBACK_INTERESTS: CatalogInterest[] = [
  { id: 'history', label: 'History' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'spirituality', label: 'Spirituality' },
  { id: 'food', label: 'Food' },
  { id: 'nature', label: 'Nature' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'art-culture', label: 'Art & Culture' },
  { id: 'legends', label: 'Legends' },
  { id: 'cinema', label: 'Cinema' },
];

// Fallback recommended voices per language
export const RECOMMENDED_VOICES_MAP: Record<string, { male: string; female: string }> = {
  'en-IN': { male: 'Deepak', female: 'Nalini' },
  'hi-IN': { male: 'Deepak', female: 'Nalini' },
  'hi-en': { male: 'Deepak', female: 'Nalini' },
  'kn-IN': { male: 'Girish', female: 'Nalini' },
  'ta-IN': { male: 'Girish', female: 'Asmita' },
  'te-IN': { male: 'Girish', female: 'Lavanya' },
  'ml-IN': { male: 'Riyaan', female: 'Reshma' },
  'mr-IN': { male: 'Ishaan', female: 'Zahira' },
  'bn-IN': { male: 'Dhruva', female: 'Kirra' },
  'gu-IN': { male: 'Veera', female: 'Falak' },
  'pa-IN': { male: 'Zayan', female: 'Mehuli' },
};

// Fallback voices list (Gnani Timbre v2.5 models)
export const FALLBACK_VOICES: Array<{ name: string; gender: 'male' | 'female' }> = [
  { name: 'Ambuja', gender: 'female' },
  { name: 'Asmita', gender: 'female' },
  { name: 'Bhavna', gender: 'female' },
  { name: 'Brinda', gender: 'female' },
  { name: 'Chitra', gender: 'female' },
  { name: 'Deepak', gender: 'male' },
  { name: 'Devika', gender: 'female' },
  { name: 'Dhruva', gender: 'male' },
  { name: 'Falak', gender: 'female' },
  { name: 'Girish', gender: 'male' },
  { name: 'Hemraj', gender: 'male' },
  { name: 'Ishaan', gender: 'male' },
  { name: 'Jalaj', gender: 'male' },
  { name: 'Jwala', gender: 'female' },
  { name: 'Kaveri', gender: 'female' },
  { name: 'Kavin', gender: 'male' },
  { name: 'Kirra', gender: 'female' },
  { name: 'Lavanya', gender: 'female' },
  { name: 'Lehara', gender: 'female' },
  { name: 'Mehuli', gender: 'female' },
  { name: 'Nalini', gender: 'female' },
  { name: 'Noopur', gender: 'female' },
  { name: 'Omkar', gender: 'male' },
  { name: 'Poorvi', gender: 'female' },
  { name: 'Pranav', gender: 'male' },
  { name: 'Reshma', gender: 'female' },
  { name: 'Riyaan', gender: 'male' },
  { name: 'Roopesh', gender: 'male' },
  { name: 'Saanvi', gender: 'female' },
  { name: 'Shlok', gender: 'male' },
  { name: 'Suhana', gender: 'female' },
  { name: 'Trisha', gender: 'female' },
  { name: 'Trupti', gender: 'female' },
  { name: 'Urmila', gender: 'female' },
  { name: 'Varuni', gender: 'female' },
  { name: 'Vedika', gender: 'female' },
  { name: 'Veera', gender: 'male' },
  { name: 'Vikrant', gender: 'male' },
  { name: 'Yashvi', gender: 'female' },
  { name: 'Yukti', gender: 'female' },
  { name: 'Zahira', gender: 'female' },
  { name: 'Zayan', gender: 'male' },
];

import {
  VOICE_AVATAR_MAP,
  VOICE_AVATAR_IMAGES,
  getVoiceAvatarSource,
} from '@/constants/voice-avatars';

export {
  VOICE_AVATAR_MAP,
  VOICE_AVATAR_IMAGES,
  getVoiceAvatarSource,
};

/**
 * Generate fallback voices when backend is offline
 */
export function getFallbackVoices(languageId: string, gender?: 'male' | 'female'): VoiceModel[] {
  const rec = RECOMMENDED_VOICES_MAP[languageId] || RECOMMENDED_VOICES_MAP['en-IN'];
  const targetRec = gender === 'male' ? rec.male : rec.female;

  return FALLBACK_VOICES.filter((v) => !gender || v.gender === gender)
    .map((v) => ({
      name: v.name,
      gender: v.gender,
      recommended: v.name === targetRec,
      demoUrl: null,
      avatarUrl: `https://voice-mfe.gnani.ai/assets/images/voiceAvatars/${VOICE_AVATAR_MAP[v.name] || 1}.webp`,
    }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name));
}

/**
 * Fetches catalog options (languages, default options) from backend GET /catalog
 */
export async function fetchCatalog(): Promise<CatalogData> {
  try {
    const res = await api.get<{ success: boolean; data: CatalogData }>('/catalog');
    if (res?.data?.languages?.length) {
      return res.data;
    }
  } catch (err) {
    console.warn('[CatalogService] Failed to fetch catalog from backend, using fallback:', err);
  }

  return {
    genders: ['male', 'female', 'unspecified'],
    languages: FALLBACK_LANGUAGES,
    interests: FALLBACK_INTERESTS,
    musicModes: ['rj', 'duck-only', 'off'],
    defaults: {
      language: 'en-IN',
      interests: ['history', 'food'],
      musicMode: 'rj',
    },
  };
}

/**
 * Fetches available voice models from backend GET /voices?language=...&gender=...
 */
export async function fetchVoices(
  languageId: string,
  gender?: 'male' | 'female'
): Promise<VoiceModel[]> {
  try {
    const params = new URLSearchParams();
    if (languageId) params.append('language', languageId);
    if (gender) params.append('gender', gender);

    const queryString = params.toString();
    const url = `/voices${queryString ? `?${queryString}` : ''}`;

    const res = await api.get<{ success: boolean; data: VoiceModel[] }>(url);
    if (Array.isArray(res?.data) && res.data.length > 0) {
      return res.data;
    }
  } catch (err) {
    console.warn('[CatalogService] Failed to fetch voices from backend, using fallback:', err);
  }

  // Graceful fallback
  return getFallbackVoices(languageId, gender);
}
