import { z } from "zod";
import type { InterestId } from "../catalog/interests";
import { LANGUAGES, type LanguageId } from "../catalog/languages";
import type { GeminiClient } from "../clients/gemini";
import { checkScript, LANGUAGE_STYLES, wordBudget } from "../speech";
import { EPISODE_FACTS_CHARS, FACTS_MAX_CHARS } from "./rules";
import type { Focus, Side } from "./types";

// No .transform(): this schema is sent to Gemini as JSON schema.
export const StorySchema = z.object({
  title: z.string().min(1).describe("Short title of the place or topic, in the target language"),
  script: z.string().min(1).describe("The narration exactly as it should be spoken"),
  factsUsed: z.array(z.string()).describe("Each factual claim in the script, copied from the provided FACTS in English"),
});
export type StoryDraft = z.infer<typeof StorySchema>;

// Persona from spike 2 (radio jockey for people in a car). Distances are never spoken (trip spec S1): the trigger
// point decides when the story plays, so "two kilometres ahead" would be wrong whenever the car is faster or slower.
const SYSTEM = `You are "Musafir", a warm, witty radio-jockey style narrator riding along on an Indian road trip.
You speak to people in a moving car, so:
- Speak naturally, short sentences, no lists, no markdown, no emojis, no stage directions.
- Write every number, year and unit as spoken words (for example "seventeen ninety-nine"). Never use digits, and never write "km".
- Never mention distances or how far away something is ("ahead", "coming up" is fine). The story plays just before the place.
- The FACTS are in English. Write the title and the script in the LANGUAGE given below, translating the facts. Never answer in English unless that is the LANGUAGE.
- Use ONLY facts from the FACTS section. Never invent dates, names, numbers or claims. If unsure, leave it out.
- End with one practical tip or a hook that makes them want to look out the window.`;

export interface PlaceFacts {
  name: string;
  // "poi" and "food" places may have no article of their own; towns and regions always do.
  kind: "poi" | "food" | "town" | "region";
  facts?: string;
}

export interface WriteRequest {
  type: "trip-intro" | "story" | "food" | "town-welcome" | "episode" | "long-form";
  language: LanguageId;
  // The narrating voice: its speaking speed sets the word budget.
  voice?: string;
  focus: Focus;
  side: Side;
  targetSeconds: number;
  interests: readonly InterestId[];
  places: readonly PlaceFacts[];
  // trip-intro only: the trip itself is the subject.
  tripFacts?: string;
}

export interface WrittenStory extends StoryDraft {
  model: string;
  words: number;
  budget: number;
}

export const countWords = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const TASK: Record<WriteRequest["type"], string> = {
  "trip-intro": "Welcome the listener to this road trip: say where from and to, how long the drive takes, mention a taste of what they will hear on the way, and set a friendly mood.",
  story: "Tell the story of this place.",
  food: "Tell the listener about this food stop and the local food it is known for.",
  "town-welcome": "Welcome the listener to this town: what it is known for and one thing worth noticing as they drive through.",
  episode: "Tell one flowing story about this group of places that lie close together, visiting them in the order given.",
  "long-form": "Tell a longer, relaxed story about this area for a stretch of road with nothing else to see.",
};

const languageLabel = (id: LanguageId) => LANGUAGES.find((l) => l.id === id)?.label ?? id;

export function buildPrompt(req: WriteRequest): string {
  const budget = wordBudget(req.language, req.targetSeconds, req.voice);
  const perPlace = req.type === "episode" ? EPISODE_FACTS_CHARS : FACTS_MAX_CHARS;
  const withFacts = req.places.filter((p) => p.facts);
  const area = req.places.filter((p) => !p.facts);
  const side =
    req.side === "none"
      ? "Do not say which side of the road anything is on."
      : `The place is on the ${req.side} side of the road; say so once, naturally ("on your ${req.side}").`;

  const factsBlock = req.tripFacts
    ? `FACTS (the trip):\n"""\n${req.tripFacts}\n"""`
    : withFacts.map((p) => `FACTS about ${p.name} (English, from Wikipedia):\n"""\n${(p.facts ?? "").slice(0, perPlace)}\n"""`).join("\n\n");

  // A place with no article of its own: its neighbours' facts carry the story and the place is only named.
  const areaNote = area.length
    ? `\nNOTE: ${area.map((p) => p.name).join(", ")} ${area.length > 1 ? "have" : "has"} no article of its own. Name ${area.length > 1 ? "them" : "it"} as a well-known local stop, ` +
      `invent nothing about ${area.length > 1 ? "them" : "it"}, and keep the story about the area the FACTS describe.\n`
    : "";

  return `TASK: ${TASK[req.type]}
${req.places.length ? `PLACES: ${req.places.map((p) => p.name).join("; ")}\n` : ""}SIDE: ${side}
LISTENER INTERESTS: ${req.interests.join(", ")}${req.focus !== "general" ? ` (lean this story towards ${req.focus})` : ""}.
LANGUAGE: ${languageLabel(req.language)} (${LANGUAGE_STYLES[req.language].script} script). ${LANGUAGE_STYLES[req.language].guide}
LENGTH: about ${budget} words (that is about ${req.targetSeconds} seconds when spoken). Stay between ${Math.ceil(budget * 0.6)} and ${Math.floor(budget * 1.3)} words.
${areaNote}
${factsBlock}`;
}

// Gemini writes {title, script, factsUsed}; the script check (digits, "km", stray scripts, script ratio, word budget)
// feeds problems back to the client so it retries, then falls to flash (see GeminiClient.generateJson).
export async function writeStory(gemini: GeminiClient, req: WriteRequest): Promise<WrittenStory> {
  const budget = wordBudget(req.language, req.targetSeconds, req.voice);
  const res = await gemini.generateJson({
    purpose: "story",
    system: SYSTEM,
    prompt: buildPrompt(req),
    schema: StorySchema,
    language: req.language,
    validate: (v) => checkScript(v.script, req.language, { wordBudget: budget }),
  });
  return { ...res.value, model: res.model, words: countWords(res.value.script), budget };
}
