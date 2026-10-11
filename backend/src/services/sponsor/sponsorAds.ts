import type { LanguageId } from "../../catalog/languages";
import { findVoice } from "../../catalog/voices";
import type { GeminiClient } from "../../clients/gemini";
import type { GnaniService } from "../../clients/gnaniQueue";
import type { Storage } from "../../clients/storage";
import { Sponsor, type SponsorAd } from "../../models/sponsor.model";
import { narrate } from "../../speech";
import { AD_MAX_SECONDS, AD_MIN_SECONDS, adSchema, buildAdPrompt, checkAd } from "./adPrompt";

export class SponsorAdError extends Error {
  constructor(
    readonly code: "UNKNOWN_SPONSOR" | "UNKNOWN_VOICE",
    message: string,
  ) {
    super(message);
    this.name = "SponsorAdError";
  }
}

export interface SponsorAds {
  // The cached ad for (sponsor, language, voice); generated (Gemini script + Gnani voice + storage) on first use.
  ensureAd(sponsorSlug: string, language: LanguageId, voice: string): Promise<SponsorAd>;
}

export interface SponsorAdsDeps {
  gemini: GeminiClient;
  gnani: GnaniService;
  storage: Storage;
  now?: () => Date;
}

export const adStorageKey = (slug: string, language: LanguageId, voice: string) => `ads/${slug}/${language}/${voice}.mp3`;

export function createSponsorAds(deps: SponsorAdsDeps): SponsorAds {
  const now = deps.now ?? (() => new Date());
  // Concurrent callers for the same ad share one generation (the guarded $push below covers other processes).
  const inFlight = new Map<string, Promise<SponsorAd>>();

  const findAd = async (slug: string, language: LanguageId, voice: string): Promise<SponsorAd | null> => {
    const doc = await Sponsor.findOne({ slug }, { ads: { $elemMatch: { language, voice } } }).lean();
    return (doc?.ads?.[0] as SponsorAd | undefined) ?? null;
  };

  async function generate(slug: string, language: LanguageId, voice: string): Promise<SponsorAd> {
    const sponsor = await Sponsor.findOne({ slug }, { ads: 0 }).lean();
    if (!sponsor) throw new SponsorAdError("UNKNOWN_SPONSOR", `Unknown sponsor: ${slug}`);

    const { system, prompt } = buildAdPrompt({ brief: { name: sponsor.name, ...sponsor.brief }, language });
    const { value } = await deps.gemini.generateJson({
      purpose: "sponsor-ad",
      system,
      prompt,
      schema: adSchema,
      language,
      validate: (ad) => checkAd(ad, language),
    });

    const narration = await narrate(deps.gnani, { text: value.script, voice, language, priority: "background" });
    if (narration.durationS < AD_MIN_SECONDS || narration.durationS > AD_MAX_SECONDS) {
      // Word counts are only a proxy; the real duration tells us when a language's words-per-minute is off.
      console.warn(
        `[sponsor] ${slug} ${language}/${voice} ad is ${narration.durationS.toFixed(1)} s (target ${AD_MIN_SECONDS} to ${AD_MAX_SECONDS} s)`,
      );
    }
    const storageKey = adStorageKey(slug, language, voice);
    // Known limit: two processes generating the same ad at the same moment both write this key, so the stored mp3
    // can be the other writer's take (same sponsor, language and voice, a slightly different script). Accepted for
    // the demo; the record itself is never duplicated.
    await deps.storage.put(storageKey, narration.audio, "audio/mpeg");

    const ad: SponsorAd = {
      language,
      voice,
      title: value.title,
      script: value.script,
      storageKey,
      bytes: narration.bytes,
      durationS: narration.durationS,
      createdAt: now(),
    };
    // Only push if nobody else has added this (language, voice) meanwhile.
    const res = await Sponsor.updateOne(
      { slug, ads: { $not: { $elemMatch: { language, voice } } } },
      { $push: { ads: ad } },
    );
    if (res.modifiedCount === 0) return (await findAd(slug, language, voice)) ?? ad;
    return ad;
  }

  return {
    async ensureAd(slug, language, voice) {
      // Fail before spending Gemini quota on a voice Gnani would reject.
      if (!findVoice(voice)) throw new SponsorAdError("UNKNOWN_VOICE", `Unknown voice: ${voice}`);
      const cached = await findAd(slug, language, voice);
      if (cached) return cached;
      const key = `${slug}|${language}|${voice}`;
      let pending = inFlight.get(key);
      if (!pending) {
        pending = generate(slug, language, voice).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return pending;
    },
  };
}
