import { INTERESTS, DEFAULT_INTERESTS } from "../catalog/interests";
import { DEFAULT_LANGUAGE, LANGUAGES, type LanguageId } from "../catalog/languages";
import { DEFAULT_MUSIC_MODE, GENDERS, MUSIC_MODES, AGE_RANGES, DEFAULT_AGE_RANGE } from "../catalog/profile";
import { VOICES, isRecommended, type VoiceGender } from "../catalog/voices";
import type { Storage } from "../clients/storage";
import { VoiceDemo } from "../models/voiceDemo.model";

// Everything the onboarding screen needs to render its pickers. The app should read these instead of hardcoding.
export function getCatalog() {
  return {
    genders: GENDERS,
    ageRanges: AGE_RANGES,
    languages: LANGUAGES.map(({ id, label }) => ({ id, label })),
    interests: INTERESTS,
    musicModes: MUSIC_MODES,
    defaults: { language: DEFAULT_LANGUAGE, interests: DEFAULT_INTERESTS, musicMode: DEFAULT_MUSIC_MODE },
  };
}

import { CustomVoice } from "../models/customVoice.model";

export interface VoiceDto {
  name: string;
  gender: VoiceGender;
  recommended: boolean;
  // null when no clip has been uploaded for this voice and language yet.
  demoUrl: string | null;
  avatarUrl: string | null;
  isCustom?: boolean;
  id?: string;
}

// Voices for the picker: recommended first, then alphabetical.
export function buildVoiceList(
  language: LanguageId,
  gender: VoiceGender | undefined,
  demoUrls: ReadonlyMap<string, string>,
  avatarUrls: ReadonlyMap<string, string> = new Map(),
): VoiceDto[] {
  return VOICES.filter((v) => !gender || v.gender === gender)
    .map((v) => ({
      name: v.name,
      gender: v.gender,
      recommended: isRecommended(v.name, language),
      demoUrl: demoUrls.get(v.name) ?? null,
      avatarUrl: avatarUrls.get(v.name) ?? null,
    }))
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name));
}

export async function listVoices(
  language: LanguageId,
  gender: VoiceGender | undefined,
  storage: Storage,
  userId?: string,
  baseUrl?: string
): Promise<VoiceDto[]> {
  const demos = await VoiceDemo.find({ language, ...(gender && { gender }) }, { voice: 1, storageKey: 1 }).lean();
  const urls = new Map(await Promise.all(demos.map(async (d) => [d.voice, await storage.url(d.storageKey)] as const)));

  const matchingVoices = VOICES.filter((v) => !gender || v.gender === gender);
  const avatarUrls = new Map(
    await Promise.all(
      matchingVoices.map(async (v) => [v.name, await storage.url(`voice-avatars/${v.name}.webp`)] as const)
    )
  );

  const catalogVoices = buildVoiceList(language, gender, urls, avatarUrls);

  if (!userId) {
    return catalogVoices;
  }

  const customDocs = await CustomVoice.find({ userId })
    .sort({ createdAt: -1 })
    .lean();

  const customVoices: VoiceDto[] = await Promise.all(
    customDocs.map(async (cv) => {
      const demoKey =
        cv.demoStorageKeys instanceof Map
          ? cv.demoStorageKeys.get(language)
          : (cv.demoStorageKeys as any)?.[language];

      let demoUrl: string | null = null;
      if (demoKey) {
        demoUrl = await storage.url(demoKey);
      } else if (baseUrl) {
        demoUrl = `${baseUrl.replace(/\/+$/, "")}/voices/custom/${cv._id.toString()}/demo?language=${language}`;
      } else if (cv.demoStorageKey) {
        demoUrl = await storage.url(cv.demoStorageKey);
      }

      return {
        name: cv.name,
        gender: cv.gender as VoiceGender,
        recommended: false,
        demoUrl,
        avatarUrl: cv.avatarStorageKey ? await storage.url(cv.avatarStorageKey) : null,
        isCustom: true,
        id: cv._id.toString(),
      };
    })
  );

  // Custom voices should be on top
  return [...customVoices, ...catalogVoices];
}
