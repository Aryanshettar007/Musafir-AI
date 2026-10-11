import { ImageSource } from 'expo-image';

/**
 * Maps each voice model name to its avatar asset ID (1..9)
 * extracted directly from the voice model catalog.
 */
export const VOICE_AVATAR_MAP: Record<string, number> = {
  Kaveri: 1, Urmila: 1, Omkar: 1, Yukti: 1, Dhruva: 1,
  Trupti: 2, Jwala: 2, Asmita: 2, Varuni: 2, Falak: 2,
  Devika: 3, Chitra: 3, Trisha: 3, Saanvi: 3, Veera: 3,
  Pranav: 4, Ambuja: 4, Brinda: 4, Kavin: 4, Mehuli: 4,
  Shlok: 5, Deepak: 5, Vedika: 5, Reshma: 5, Zayan: 5,
  Girish: 6, Roopesh: 6, Noopur: 6, Riyaan: 6, Poorvi: 6,
  Nalini: 7, Vikrant: 7, Suhana: 7, Zahira: 7,
  Bhavna: 8, Hemraj: 8, Lehara: 8, Ishaan: 8,
  Yashvi: 9, Jalaj: 9, Lavanya: 9, Kirra: 9,
};

/**
 * Local bundled WebP avatar assets stored inside App/assets/images/voice-avatars/.
 * Bundling these directly in the App eliminates remote network latency and bucket download overhead.
 */
export const VOICE_AVATAR_IMAGES: Record<number, any> = {
  1: require('@/assets/images/voice-avatars/1.webp'),
  2: require('@/assets/images/voice-avatars/2.webp'),
  3: require('@/assets/images/voice-avatars/3.webp'),
  4: require('@/assets/images/voice-avatars/4.webp'),
  5: require('@/assets/images/voice-avatars/5.webp'),
  6: require('@/assets/images/voice-avatars/6.webp'),
  7: require('@/assets/images/voice-avatars/7.webp'),
  8: require('@/assets/images/voice-avatars/8.webp'),
  9: require('@/assets/images/voice-avatars/9.webp'),
};

/**
 * Returns the local bundled image source for a given voice name.
 * If voiceName is not mapped or missing, defaults to avatar 1.
 */
export function getVoiceAvatarSource(voiceName?: string | null): any {
  if (!voiceName) {
    return VOICE_AVATAR_IMAGES[1];
  }
  const avatarId = VOICE_AVATAR_MAP[voiceName] ?? 1;
  return VOICE_AVATAR_IMAGES[avatarId] ?? VOICE_AVATAR_IMAGES[1];
}
