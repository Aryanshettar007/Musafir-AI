import { z } from "zod";
import { DEFAULT_INTERESTS, INTEREST_IDS, type InterestId } from "../catalog/interests";
import { DEFAULT_LANGUAGE, LANGUAGE_IDS, type LanguageId } from "../catalog/languages";
import { DEFAULT_MUSIC_MODE, GENDER_IDS, MUSIC_MODE_IDS, AGE_RANGE_IDS, type GenderId, type MusicModeId, type AgeRangeId } from "../catalog/profile";
import { RECOMMENDED_VOICES, findVoice, type VoiceGender } from "../catalog/voices";
import { badRequest } from "../errors";

// What the app may send for PUT /me (all optional, so "Skip for now" works) and PATCH /me.
// strict(): unknown keys are rejected so a misspelt field fails loudly instead of being silently dropped.
export const ProfileInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(60).optional(),
  gender: z.enum(GENDER_IDS).optional(),
  age: z.union([z.number().int().min(1).max(120), z.enum(AGE_RANGE_IDS)]).optional(),
  language: z.enum(LANGUAGE_IDS).optional(),
  voiceGender: z.enum(["male", "female"]).optional(),
  voice: z.string().optional(),
  interests: z.array(z.enum(INTEREST_IDS)).min(1).optional(),
  musicMode: z.enum(MUSIC_MODE_IDS).optional(),
  moods: z.array(z.string()).optional(),
});

export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export interface Profile {
  name?: string;
  gender: GenderId;
  age?: number | AgeRangeId;
  language: LanguageId;
  voiceGender: VoiceGender;
  voice: string;
  interests: InterestId[];
  moods?: InterestId[];
  musicMode: MusicModeId;
}

/**
 * Applies `input` on top of `existing` (PATCH) or on top of defaults (PUT, existing = null) and keeps the narrator
 * voice consistent:
 * - voice given, voiceGender not: voiceGender follows the voice.
 * - voiceGender given (or language changed) without a voice: pick the recommended voice, unless the user had
 *   hand-picked a non-default voice that still fits.
 * - voice and voiceGender must agree.
 */
import mongoose from "mongoose";
import { CustomVoice } from "../models/customVoice.model";

export async function resolveProfile(existing: Profile | null, input: ProfileInput, userId?: string): Promise<Profile> {
  const gender = input.gender ?? existing?.gender ?? "unspecified";
  const language = input.language ?? existing?.language ?? DEFAULT_LANGUAGE;

  let voice = input.voice;
  let voiceGender = input.voiceGender;

  if (voice !== undefined) {
    const found = findVoice(voice);
    if (found) {
      if (voiceGender !== undefined && voiceGender !== found.gender) {
        throw badRequest("VOICE_GENDER_MISMATCH", `${voice} is a ${found.gender} voice, not ${voiceGender}.`);
      }
      voiceGender = found.gender;
    } else {
      let customVoice: { name: string; gender: string } | null = null;
      if (mongoose.connection.readyState === 1) {
        const query = userId ? { userId, name: voice } : { name: voice };
        customVoice = await CustomVoice.findOne(query).lean();
      }
      if (!customVoice) {
        throw badRequest("UNKNOWN_VOICE", `Unknown voice "${voice}". See GET /voices.`);
      }
      voiceGender = (customVoice.gender as VoiceGender) || voiceGender || "male";
    }
  } else {
    voiceGender ??= existing?.voiceGender ?? (gender === "female" ? "female" : "male");
    voice = keepOrRecommend(existing, language, voiceGender);
  }

  const resolvedFromMoods = input.moods
    ? (input.moods.filter((m) => (INTEREST_IDS as readonly string[]).includes(m)) as InterestId[])
    : undefined;
  const resolvedInterests = input.interests ?? (resolvedFromMoods && resolvedFromMoods.length > 0 ? resolvedFromMoods : undefined);
  const finalInterests = resolvedInterests ? [...new Set(resolvedInterests)] : (existing?.interests ?? [...DEFAULT_INTERESTS]);

  return {
    name: input.name ?? existing?.name,
    gender,
    ...(existing && !("age" in existing) && input.age === undefined ? {} : { age: input.age ?? existing?.age }),
    language,
    voiceGender,
    voice,
    interests: finalInterests,
    musicMode: input.musicMode ?? existing?.musicMode ?? DEFAULT_MUSIC_MODE,
  };
}

// Keep a voice the user chose themselves if it still matches the gender; otherwise use our recommended default,
// so a user who never customised moves from Deepak (English) to Girish when they switch to Kannada.
function keepOrRecommend(existing: Profile | null, language: LanguageId, voiceGender: VoiceGender): string {
  if (existing && existing.voiceGender === voiceGender) {
    const wasDefault = RECOMMENDED_VOICES[existing.language]?.[existing.voiceGender] === existing.voice;
    if (!wasDefault && existing.voice) return existing.voice;
  }
  return RECOMMENDED_VOICES[language][voiceGender];
}
