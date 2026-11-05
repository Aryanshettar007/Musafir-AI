import { z } from "zod";
import type { InterestId } from "../catalog/interests";
import { LANGUAGES, type LanguageId } from "../catalog/languages";
import type { GeminiClient } from "../clients/gemini";
import { checkScript, LANGUAGE_STYLES, PROMPT_LENGTH_BIAS, spellOutNumbers, wordBudget } from "../speech";
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
- Use ONLY facts from the FACTS section, except for a KNOWN PLACE (see the prompt). Never invent dates, names, numbers or claims. If unsure, leave it out.
- This is one segment of a show that is already running. Only the trip intro greets the listener: every other story starts straight with the place, never with a greeting ("hello", "hey folks", "namaskara", "welcome"). Make the first line different every time: a question, a surprising fact, or something to spot out of the window.
- End with one practical tip or a hook that makes them want to look out the window.`;

// Greetings a story other than the trip intro must not open with. Each story is written on its own, so without the rule
// and this check every one began "Namaskara snehitare" / "Hey folks" as if the show were starting again.
const GREETINGS = [
  "hey", "hello", "hi", "hiya", "namaste", "namaskar", "namaskara", "namaskaram", "vanakkam", "dear friends", "my friends", "folks",
  "ನಮಸ್ಕಾರ", "ಸ್ನೇಹಿತರೇ", "ಸ್ನೇಹಿತರೆ", "ಹಲೋ", "ಹಾಯ್", "नमस्ते", "नमस्कार", "दोस्तों", "हेलो", "வணக்கம்", "నమస్కారం", "నమస్తే",
  "നമസ്കാരം", "নমস্কার", "নমস্তে", "નમસ્તે", "નમસ્કાર", "ਨਮਸਤੇ", "ਸਤ ਸ੍ਰੀ ਅਕਾਲ",
];
const WELCOMES = ["welcome", "ಸ್ವಾಗತ", "स्वागत", "வரவேற்", "స్వాగతం", "സ്വാഗതം", "স্বাগত", "સ્વાગત", "ਸਵਾਗਤ"];

// The first few words of a script that should start mid-show. A town-welcome may welcome the listener to the town.
export function openingProblems(script: string, type: WriteRequest["type"]): string[] {
  if (type === "trip-intro") return [];
  const opening = script.split(/\s+/).slice(0, 4).join(" ").toLowerCase().replace(/[.,!?;:'"“”‘’-]/g, " ");
  const words = type === "town-welcome" ? GREETINGS : [...GREETINGS, ...WELCOMES];
  const hit = words.find((w) => (/^[a-z ]+$/.test(w) ? new RegExp(`(^|\\s)${w}(\\s|$)`).test(opening) : opening.includes(w)));
  return hit ? [`The script opens with a greeting ("${hit}"). Only the trip intro greets; start straight with the place.`] : [];
}

export interface PlaceFacts {
  name: string;
  // "poi" and "food" places may have no article of their own; towns and regions always do.
  kind: "poi" | "food" | "town" | "region";
  facts?: string;
  // What Google says about a place without an article: its kind and how popular it is ("South Indian restaurant,
  // very popular: tens of thousands of reviews"). Lets a food stop stay the subject of its own story.
  card?: string;
  // No article, but famous enough (KNOWN_MIN_RATINGS) for Gemini to write from what it knows for certain.
  known?: boolean;
}

// The place card from the Google snapshot stored with the place. Popularity in words, not counts: the script must not
// carry digits, and the exact count changes daily.
export function placeCard(primaryType: string | null | undefined, ratings: number | null | undefined): string | undefined {
  if (!primaryType) return undefined;
  const kind = primaryType.replace(/_/g, " ");
  const n = ratings ?? 0;
  const popularity = n >= 10_000 ? "hugely popular, with tens of thousands of reviews" : n >= 1_000 ? "popular, with thousands of reviews" : "a local favourite";
  return `${kind[0].toUpperCase()}${kind.slice(1)}; ${popularity}`;
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

// Only an almost-empty script is retried.
const MIN_WORDS = 15;
const tooShort = (script: string) => (countWords(script) < MIN_WORDS ? [`The script has only ${countWords(script)} words; write a full story of at least ${MIN_WORDS} words.`] : []);

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
  const known = req.places.filter((p) => !p.facts && p.known);
  const area = req.places.filter((p) => !p.facts && !p.known);
  const side =
    req.side === "none"
      ? "Do not say which side of the road anything is on."
      : `The place is on the ${req.side} side of the road; say so once, naturally ("on your ${req.side}").`;

  // Numbers and units are spelled out here, so the model translates words and never has digits or "km" to copy.
  const factsBlock = req.tripFacts
    ? `FACTS (the trip):\n"""\n${spellOutNumbers(req.tripFacts)}\n"""`
    : withFacts.map((p) => `FACTS about ${p.name} (English, from Wikipedia):\n"""\n${spellOutNumbers((p.facts ?? "").slice(0, perPlace))}\n"""`).join("\n\n");

  // A famous place no article matched (Cubbon Park, Vidyarthi Bhavan). Compared on ten Bengaluru places, flash-lite was
  // right on the famous ones and vague or wrong on minor ones, so only famous places get here, with a strict rule.
  const knownNote = known
    .map((p) =>
      `\nKNOWN PLACE: ${p.name}${p.card ? ` (from Google: ${spellOutNumbers(p.card)})` : ""}. There are no FACTS for it. Use only facts about it that you are ` +
      `certain of: well-documented history, who built or founded it, what it is famous for. Never guess dates, names or numbers; if you ` +
      `are not sure of something, leave it out and keep that part general.${req.type === "food" ? " Make it the subject and the title." : ""}\n`)
    .join("");

  // A place with no article of its own: its neighbours' facts carry the story and the place is only named. A food stop
  // stays the subject (title included) with its place card; the area's facts only add colour. Without this the
  // Brahmins' Coffee Bar story came out titled and written about the neighbourhood, Hanumanthanagar.
  const cards = area.filter((p) => p.card).map((p) => `PLACE CARD for ${p.name} (from Google): ${spellOutNumbers(p.card ?? "")}.`).join("\n");
  const foodStop = req.type === "food" ? area[0] : undefined;
  const areaNote = foodStop
    ? `\nNOTE: ${foodStop.name} has no article of its own. Make it the subject and the title: name it, say what kind of place it is and how ` +
      `popular it is from its PLACE CARD, and invent nothing about it (no dishes, history or prices of its own). Use the area FACTS only ` +
      `for the local food the area is known for or one line of local colour.\n${cards}\n`
    : area.length
      ? `\nNOTE: ${area.map((p) => p.name).join(", ")} ${area.length > 1 ? "have" : "has"} no article of its own. Name ${area.length > 1 ? "them" : "it"} as a well-known local stop, ` +
        `invent nothing about ${area.length > 1 ? "them" : "it"}, and keep the story about the area the FACTS describe.\n${cards ? `${cards}\n` : ""}`
      : "";

  return `TASK: ${TASK[req.type]}
${req.places.length ? `PLACES: ${req.places.map((p) => p.name).join("; ")}\n` : ""}SIDE: ${side}
LISTENER INTERESTS: ${req.interests.join(", ")}${req.focus !== "general" ? ` (lean this story towards ${req.focus})` : ""}. Bring an interest in only where this place really relates to it: no food tips in a story that is not about food.
LANGUAGE: ${languageLabel(req.language)} (${LANGUAGE_STYLES[req.language].script} script). ${LANGUAGE_STYLES[req.language].guide}
LENGTH: about ${Math.round(budget * (PROMPT_LENGTH_BIAS[req.language] ?? 1))} words (that is about ${req.targetSeconds} seconds when spoken). Stay between ${Math.ceil(budget * 0.6)} and ${Math.floor(budget * 1.3)} words.
${areaNote}${knownNote}
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
    // The title is shown and stored too: unchecked, Kannada trips got "श्री कांतिरवा स्टेडियम" and "ವಿದyarthi Bhavan".
    validate: (v) => [
      // Length is not checked: the prompt asks for the budget, but a shorter or longer story is still a good story
      // (flash-lite often writes about half in South Indian languages and every rejection costs a slow call).
      ...checkScript(v.script, req.language),
      ...tooShort(v.script),
      ...checkScript(v.title, req.language).map((p) => `Title: ${p}`),
      ...openingProblems(v.script, req.type),
    ],
  });
  return { ...res.value, model: res.model, words: countWords(res.value.script), budget };
}
