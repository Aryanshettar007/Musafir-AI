import { LANGUAGES, type LanguageId } from "../../catalog/languages";
import type { GeminiClient } from "../../clients/gemini";
import type { GnaniService } from "../../clients/gnaniQueue";
import type { MapsClient } from "../../clients/maps";
import { UpstreamError } from "../../clients/upstream";
import { AppError, notFound } from "../../errors";
import type { LatLng } from "../../geo";
import { checkScript, narrate } from "../../speech";
import { getProfile, type Identity } from "../user.service";
import { inspectAudio } from "./audio";
import {
  formatHistory,
  formatNearbyPlaces,
  formatPosition,
  formatSearchResults,
  formatTripContext,
  locateOnTrip,
  pickNeighbours,
  trimHistory,
  type Turn,
} from "./askContext";
import { loadNearbyPlaces, loadStoryTexts, loadTrip } from "./askData";
import { AnswerSchema, buildPrompt, buildSystem, DEFAULT_PLACES_QUERY, MAX_ANSWER_CHARS, maxAnswerWords, type Answer } from "./prompt";

export interface AskDeps {
  gemini: GeminiClient;
  gnani: GnaniService;
  maps: MapsClient;
  now?: () => number;
  // Where the language and voice defaults come from; the user's profile unless a script injects its own.
  loadProfile?: (identity: Identity) => Promise<{ language: LanguageId; voice: string }>;
}

export type Question = { kind: "text"; text: string } | { kind: "audio"; audio: Buffer };

export interface AskRequest {
  identity: Identity;
  question: Question;
  position: LatLng;
  heading?: number;
  tripId?: string;
  history: Turn[];
  language?: LanguageId;
}

export interface AskResult {
  transcript: string;
  answerText: string;
  language: LanguageId;
  voice: string;
  audio: { mimeType: "audio/mpeg"; base64: string; durationS: number };
  timingsMs: { stt: number; llm: number; tts: number; total: number };
  model: string; // for logs and the manual tester; not part of the HTTP response
}

export interface AskService {
  ask(req: AskRequest): Promise<AskResult>;
}

// Live answers must fail fast: a 429 asking for a long wait moves to the other model instead of sleeping.
const MAX_RETRY_DELAY_MS = 4_000;
const SEARCH_RADIUS_M = 10_000;
const SEARCH_RESULTS = 5;

// Everything is read-only and nothing is stored. Logs carry lengths and timings only, never transcripts or answers.
export function createAskService(deps: AskDeps): AskService {
  const now = deps.now ?? (() => performance.now());

  return {
    async ask(req) {
      const started = now();
      const history = trimHistory(req.history);

      // Profile and trip first: a bad trip id must not cost a Gnani call.
      const profile = await (deps.loadProfile ?? getProfile)(req.identity);
      const trip = req.tripId ? await loadTrip(req.identity.uid, req.tripId) : null;
      if (req.tripId && !trip) throw notFound("TRIP_NOT_FOUND", "No such trip for this user.");
      const language = req.language ?? (trip?.language as LanguageId | undefined) ?? profile.language;
      const voice = trip?.voice ?? profile.voice;

      // 1. Speech to text.
      let transcript: string;
      let sttMs = 0;
      if (req.question.kind === "text") {
        transcript = req.question.text.trim();
      } else {
        const info = await inspectAudio(req.question.audio);
        const t = now();
        const stt = await deps.gnani.stt(
          { audio: req.question.audio, filename: info.filename, mimeType: info.mimeType, languageCode: sttLanguage(language) },
          { priority: "interactive" },
        );
        sttMs = now() - t;
        transcript = stt.transcript.trim();
      }
      if (!transcript) throw new AppError(422, "NOTHING_HEARD", "Couldn't make out the question. Try again.");

      // 2. Context (read-only).
      const llmStart = now();
      const where = formatPosition(req.position, req.heading, trip !== null);
      const sections = [where];
      let route;
      if (trip) {
        const pos = locateOnTrip(trip, req.position);
        route = pos.routeIndex;
        const { previous, next } = pickNeighbours(trip.items, pos.doneM);
        const storyIds = [...previous, ...next].flatMap((i) => (i.storyId ? [i.storyId.toString()] : []));
        sections.push(formatTripContext(trip, pos, await loadStoryTexts(storyIds)));
      }
      const nearby = await loadNearbyPlaces(req.position);
      sections.push(formatNearbyPlaces(nearby, req.position, route));
      const context = sections.join("\n");

      // 3. Answer, with one Places lookup when the model says it needs nearby places.
      const system = buildSystem(language);
      const historyText = formatHistory(history);
      const ask = (prompt: string, final: boolean) =>
        deps.gemini.generateJson({
          purpose: "ask",
          system,
          prompt,
          schema: AnswerSchema,
          language,
          maxRetryDelayMs: MAX_RETRY_DELAY_MS,
          priority: "interactive",
          // A first pass that asks for a places lookup is a placeholder that is never spoken: don't spend retries on it.
          validate: (a) => (final || a.missingData !== "nearby_places" ? validateAnswer(a, language) : []),
        });

      let result = await ask(buildPrompt({ context, history: historyText, question: transcript }), false);
      let toolUsed = false;
      if (result.value.missingData === "nearby_places") {
        toolUsed = true;
        const query = result.value.placesQuery?.trim() || DEFAULT_PLACES_QUERY;
        const searchResults = await searchPlaces(deps.maps, query, req.position, route);
        result = await ask(buildPrompt({ context, history: historyText, question: transcript, searchResults }), true);
      }
      const llmMs = now() - llmStart;
      const answerText = result.value.answer.trim();

      // 4. Text to speech.
      const ttsStart = now();
      const narration = await narrate(deps.gnani, { text: answerText, voice, language, priority: "interactive" });
      const ttsMs = now() - ttsStart;

      const timingsMs = {
        stt: Math.round(sttMs),
        llm: Math.round(llmMs),
        tts: Math.round(ttsMs),
        total: Math.round(now() - started),
      };
      console.log(
        `[ask] language=${language} trip=${trip ? "yes" : "no"} model=${result.model} tool=${toolUsed ? "places" : "none"} ` +
          `questionChars=${transcript.length} answerChars=${answerText.length} audioS=${narration.durationS.toFixed(1)} ` +
          `stt=${timingsMs.stt}ms llm=${timingsMs.llm}ms tts=${timingsMs.tts}ms total=${timingsMs.total}ms`,
      );
      return {
        transcript,
        answerText,
        language,
        voice,
        audio: { mimeType: "audio/mpeg", base64: narration.audio.toString("base64"), durationS: Math.round(narration.durationS * 10) / 10 },
        timingsMs,
        model: result.model,
      };
    },
  };
}

const sttLanguage = (language: LanguageId) => LANGUAGES.find((l) => l.id === language)?.sttLanguage ?? "en-IN";

// Chatbot sign-offs that make a car voice drag on ("Let me know if you would like to explore more...").
const SIGN_OFF = /\b(let me know|feel free to|anything else|happy to help|hope (this|that) helps)\b/i;

function validateAnswer(a: Answer, language: LanguageId): string[] {
  const problems = checkScript(a.answer, language);
  if (!a.answer.trim()) problems.push("The answer is empty.");
  // Tokens with a letter or number, as in checkScript's word count.
  const words = a.answer.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const maxWords = maxAnswerWords(language);
  if (words > maxWords || a.answer.length > MAX_ANSWER_CHARS) {
    problems.push(`The answer has ${words} words; it must be at most ${maxWords} words in at most three short sentences.`);
  }
  const signOff = SIGN_OFF.exec(a.answer);
  if (signOff) problems.push(`Remove the closing offer ("${signOff[0]}..."): answer and stop.`);
  return problems;
}

// A Places failure must not fail the question: the model is told the lookup was unavailable and says so.
async function searchPlaces(maps: MapsClient, query: string, position: LatLng, route: Parameters<typeof formatSearchResults>[3]): Promise<string> {
  try {
    const { places } = await maps.searchText({ query, bias: { center: position, radiusM: SEARCH_RADIUS_M }, pageSize: SEARCH_RESULTS });
    return formatSearchResults(query, places.slice(0, SEARCH_RESULTS), position, route);
  } catch (e) {
    if (!(e instanceof UpstreamError)) throw e;
    console.warn(`[ask] places search failed: ${e.message}`);
    return `PLACES SEARCH "${query}": the lookup is unavailable right now. Tell the passenger you could not check nearby places just now.`;
  }
}
