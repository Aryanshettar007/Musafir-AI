import { Types } from "mongoose";
import type { InterestId } from "../../catalog/interests";
import type { LanguageId } from "../../catalog/languages";
import type { GeminiClient } from "../../clients/gemini";
import type { GnaniService } from "../../clients/gnaniQueue";
import type { Storage } from "../../clients/storage";
import { Place } from "../../models/place.model";
import { Story, type StoryDoc } from "../../models/story.model";
import type { ItemType } from "../../models/trip.model";
import { cacheKey } from "../../pipeline/cacheKey";
import { PROMPT_VERSION } from "../../pipeline/rules";
import type { Focus, Side } from "../../pipeline/types";
import { writeStory, type PlaceFacts } from "../../pipeline/write";
import { narrate } from "../../speech";

export type StoryRow = StoryDoc & { _id: Types.ObjectId };

export interface StoryRequest {
  tripId: string;
  userId?: string;
  type: Exclude<ItemType, "sponsored">;
  placeIds: Types.ObjectId[];
  language: LanguageId;
  voice: string;
  focus: Focus;
  side: Side;
  targetSeconds: number;
  interests: readonly InterestId[];
  // trip-intro only.
  tripFacts?: string;
}

export interface ProducedStory {
  story: StoryRow;
  cached: boolean;
  // Present when this call wrote the story (not on a cache hit).
  detail?: { model: string; words: number; budget: number; ms: number };
}

export interface StoryProducerDeps {
  gemini: GeminiClient;
  gnani: GnaniService;
  storage: Storage;
}

const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === 11000;

// Cache first (decision D2), then Gemini writes and Gnani narrates. A story document is inserted only once its audio
// is uploaded, so a half-built story never appears in the cache. Identical keys in flight share one promise.
export function createStoryProducer(deps: StoryProducerDeps) {
  const inFlight = new Map<string, Promise<ProducedStory>>();

  async function create(key: string, req: StoryRequest): Promise<ProducedStory> {
    const started = performance.now();
    // Place order is the item's order (episodes tell their places in route order).
    const rows = await Place.find({ _id: { $in: req.placeIds } }).lean();
    const places: PlaceFacts[] = req.placeIds.flatMap((id) => {
      const row = rows.find((r) => r._id.equals(id));
      return row ? [{ name: row.name, kind: row.kind, facts: row.facts?.text }] : [];
    });
    if (req.type !== "trip-intro" && !places.some((p) => p.facts)) throw new Error("No facts for this item: refusing to write without them");

    const written = await writeStory(deps.gemini, {
      type: req.type, language: req.language, voice: req.voice, focus: req.focus, side: req.side, targetSeconds: req.targetSeconds,
      interests: req.interests, places, tripFacts: req.tripFacts,
    });
    const audio = await narrate(deps.gnani, { text: written.script, voice: req.voice, language: req.language, priority: "background", userId: req.userId });
    const _id = new Types.ObjectId();
    const storageKey = `stories/${req.language}/${_id}.mp3`;
    await deps.storage.put(storageKey, audio.audio, "audio/mpeg");
    try {
      const doc = await Story.create({
        _id, cacheKey: key, type: req.type, placeIds: req.placeIds, language: req.language, voice: req.voice, focus: req.focus, side: req.side,
        title: written.title, script: written.script, factsUsed: written.factsUsed,
        audio: { storageKey, bytes: audio.bytes, durationS: audio.durationS },
        models: { llm: written.model, tts: "timbre-v2.5" }, promptVersion: PROMPT_VERSION,
      });
      return { story: doc.toObject() as StoryRow, cached: false, detail: { model: written.model, words: written.words, budget: written.budget, ms: Math.round(performance.now() - started) } };
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Another process won the race: use its story (our uploaded file is an orphan, harmless).
      const winner = await Story.findOne({ cacheKey: key }).lean();
      if (!winner) throw e;
      return { story: winner as StoryRow, cached: true };
    }
  }

  return {
    async produce(req: StoryRequest): Promise<ProducedStory> {
      const key = cacheKey({ ...req, placeIds: req.placeIds.map(String) });
      const running = inFlight.get(key);
      if (running) return running;
      const job = (async () => {
        const hit = await Story.findOne({ cacheKey: key }).lean();
        if (hit) return { story: hit as StoryRow, cached: true };
        return create(key, req);
      })();
      inFlight.set(key, job);
      try {
        return await job;
      } finally {
        inFlight.delete(key);
      }
    },
  };
}

export type StoryProducer = ReturnType<typeof createStoryProducer>;
