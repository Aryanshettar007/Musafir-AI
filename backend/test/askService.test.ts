import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "../src/clients/upstream";
import { Place } from "../src/models/place.model";
import { createAskService, type AskRequest } from "../src/services/ask/ask.service";
import { AnswerSchema } from "../src/services/ask/prompt";
import { clearCollections, startMongo, stopMongo } from "./helpers/mongo";
import { fakeGemini, fakeGnani, fakeMaps, SHORT_MP3, SHORT_WEBM } from "./helpers/fakes";
import { answer, makePlace, makeProfile, makeTrip, MID } from "./askFixtures";

beforeAll(async () => {
  await startMongo();
  await Place.init();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(stopMongo);
beforeEach(async () => {
  await clearCollections();
  await makeProfile("u1", { language: "kn-IN" });
});

const identity = { uid: "u1" };
const base = (over: Partial<AskRequest> = {}): AskRequest => ({
  identity,
  question: { kind: "text", text: "What is this fort?" },
  position: MID,
  history: [],
  ...over,
});

const setup = (script: Parameters<typeof fakeGemini>[0], opts: { transcript?: string; maps?: ReturnType<typeof fakeMaps> } = {}) => {
  const gemini = fakeGemini(script);
  const gnani = fakeGnani({ transcript: opts.transcript });
  const maps = opts.maps ?? fakeMaps();
  return { gemini, gnani, maps, service: createAskService({ gemini, gnani, maps }) };
};

const KN = "ಇದು ಹಳೆಯ ಕೋಟೆ.";

async function docCounts() {
  const counts: Record<string, number> = {};
  for (const [name, c] of Object.entries(mongoose.connection.collections)) counts[name] = await c.countDocuments();
  return counts;
}

describe("ask service: text path without a trip", () => {
  it("answers in the profile's language and voice, with interactive TTS and no STT", async () => {
    const { service, gemini, gnani } = setup([answer(KN)]);
    const r = await service.ask(base());
    expect(r).toMatchObject({ transcript: "What is this fort?", answerText: KN, language: "kn-IN", voice: "Girish" });
    expect(r.audio).toMatchObject({ mimeType: "audio/mpeg" });
    expect(r.audio.durationS).toBeGreaterThan(1);
    expect(Buffer.from(r.audio.base64, "base64").equals(SHORT_MP3)).toBe(true);
    expect(r.timingsMs.stt).toBe(0);
    expect(r.timingsMs.total).toBeGreaterThanOrEqual(r.timingsMs.llm);
    expect(gnani.calls).toEqual([{ kind: "tts", priority: "interactive", text: KN, voice: "Girish", language: "kn-IN" }]);
    expect(gemini.calls).toHaveLength(1);
    expect(gemini.calls[0]).toMatchObject({ purpose: "ask", language: "kn-IN", maxRetryDelayMs: 4000 });
    expect(gemini.calls[0].prompt).toContain("POSITION: latitude 12.4500");
    expect(gemini.calls[0].prompt).not.toContain("TRIP:");
  });

  it("lets the request override the language", async () => {
    const { service, gnani } = setup([answer("It is an old fort.")]);
    const r = await service.ask(base({ language: "en-IN" }));
    expect(r.language).toBe("en-IN");
    expect(gnani.calls[0]).toMatchObject({ language: "en-IN" });
  });

  it("puts nearby places from the database and the conversation into the prompt", async () => {
    await makePlace("Ranganathittu", { lat: 12.46, lng: 76.69 }, "A bird sanctuary on the Cauvery.");
    await makePlace("Far away", { lat: 13.5, lng: 77.5 });
    const { service, gemini } = setup([answer(KN)]);
    await service.ask(base({ history: [{ q: "hi", a: "hello" }], heading: 0 }));
    const prompt = gemini.calls[0].prompt;
    expect(prompt).toContain("Ranganathittu");
    expect(prompt).toContain("A bird sanctuary on the Cauvery.");
    expect(prompt).not.toContain("Far away");
    expect(prompt).toContain("Passenger: hi");
    expect(prompt).toContain("heading north");
  });

  it("needs a profile", async () => {
    const { service } = setup([answer(KN)]);
    await expect(service.ask(base({ identity: { uid: "nobody" } }))).rejects.toMatchObject({ status: 404, code: "PROFILE_NOT_FOUND" });
  });
});

describe("ask service: audio path", () => {
  it("transcribes with the language's STT code through the interactive queue", async () => {
    const { service, gnani } = setup([answer(KN)], { transcript: "  ಈ ಕೋಟೆ ಯಾಕೆ ಫೇಮಸ್  " });
    const r = await service.ask(base({ question: { kind: "audio", audio: SHORT_MP3 } }));
    expect(r.transcript).toBe("ಈ ಕೋಟೆ ಯಾಕೆ ಫೇಮಸ್");
    expect(gnani.calls.map((c) => [c.kind, c.priority])).toEqual([["stt", "interactive"], ["tts", "interactive"]]);
  });

  it("transcribes Hinglish as Hindi", async () => {
    const gnani = fakeGnani();
    const seen: string[] = [];
    const original = gnani.stt;
    gnani.stt = async (req, o) => {
      seen.push(req.languageCode);
      return original(req, o);
    };
    const service = createAskService({ gemini: fakeGemini([answer("Yeh purana qila hai.")]), gnani, maps: fakeMaps() });
    await service.ask(base({ language: "hi-en", question: { kind: "audio", audio: SHORT_MP3 } }));
    expect(seen).toEqual(["hi-IN"]);
  });

  it("returns NOTHING_HEARD for an empty transcript without calling Gemini or TTS", async () => {
    const { service, gemini, gnani } = setup([answer(KN)], { transcript: "   " });
    await expect(service.ask(base({ question: { kind: "audio", audio: SHORT_MP3 } }))).rejects.toMatchObject({ status: 422, code: "NOTHING_HEARD" });
    expect(gemini.calls).toHaveLength(0);
    expect(gnani.calls.map((c) => c.kind)).toEqual(["stt"]);
  });

  it("rejects audio over 25 seconds before any Gnani call", async () => {
    const { service, gnani } = setup([answer(KN)]);
    const long = Buffer.concat(Array.from({ length: 8 }, () => SHORT_MP3));
    await expect(service.ask(base({ question: { kind: "audio", audio: long } }))).rejects.toMatchObject({ status: 422, code: "AUDIO_TOO_LONG" });
    expect(gnani.calls).toHaveLength(0);
  });

  it("converts webm audio to mp3 before calling Gnani STT", async () => {
    const gnani = fakeGnani();
    let sentMime: string | undefined;
    let sentFile: string | undefined;
    const original = gnani.stt;
    gnani.stt = async (req, o) => {
      sentMime = req.mimeType;
      sentFile = req.filename;
      return original(req, o);
    };
    const service = createAskService({ gemini: fakeGemini([answer(KN)]), gnani, maps: fakeMaps() });
    const r = await service.ask(base({ question: { kind: "audio", audio: SHORT_WEBM } }));
    expect(r.answerText).toBe(KN);
    expect(sentMime).toBe("audio/mpeg");
    expect(sentFile).toBe("question.mp3");
  });

  it("rejects bytes that are not audio", async () => {
    const { service } = setup([answer(KN)]);
    await expect(service.ask(base({ question: { kind: "audio", audio: Buffer.from("not audio at all") } }))).rejects.toMatchObject({
      status: 415,
      code: "UNSUPPORTED_AUDIO",
    });
  });
});

describe("ask service: with a trip", () => {
  it("uses the trip's language and voice and describes the route and neighbouring stories", async () => {
    const trip = await makeTrip("u1", { language: "en-IN", voice: "Deepak" });
    const { service, gemini, gnani } = setup([answer("It is a famous old fort.")]);
    const r = await service.ask(base({ tripId: trip._id.toString() }));
    expect(r).toMatchObject({ language: "en-IN", voice: "Deepak" });
    expect(gnani.calls[0]).toMatchObject({ voice: "Deepak", language: "en-IN" });
    const prompt = gemini.calls[0].prompt;
    expect(prompt).toContain("heading to Mysuru");
    expect(prompt).toContain("The old fort"); // story text loaded from the stories collection
    expect(prompt).toContain("Hot idlis");
    expect(prompt).not.toContain("Buy things"); // sponsored items stay out of the answer context
    expect(prompt).not.toContain("Pending one");
    // Already played (its trigger is behind the car) although the sanctuary itself is still ahead.
    expect(prompt).toMatch(/JUST PASSED[^\n]*\n(- [^\n]*\n)*- \[story\] "Bird sanctuary" \(right side, 1\.\d kilometres ahead\)[^\n]*\nCOMING UP/);
  });

  it("returns TRIP_NOT_FOUND for another user's trip, without calling Gnani or Gemini", async () => {
    const trip = await makeTrip("someone-else");
    const { service, gemini, gnani } = setup([answer(KN)]);
    await expect(service.ask(base({ tripId: trip._id.toString(), question: { kind: "audio", audio: SHORT_MP3 } }))).rejects.toMatchObject({
      status: 404,
      code: "TRIP_NOT_FOUND",
    });
    expect(gemini.calls).toHaveLength(0);
    expect(gnani.calls).toHaveLength(0);
  });

  it("returns TRIP_NOT_FOUND for an unknown trip id", async () => {
    const { service } = setup([answer(KN)]);
    await expect(service.ask(base({ tripId: "0123456789abcdef01234567" }))).rejects.toMatchObject({ code: "TRIP_NOT_FOUND" });
  });
});

describe("ask service: Places tool loop", () => {
  const found = { id: "g1", name: "Hotel Kamat", location: { lat: 12.46, lng: 76.69 }, types: [], userRatingCount: 340 };

  it("searches once when the model asks for nearby places, then answers from the results", async () => {
    const searchText = vi.fn(async () => ({ places: [found] }));
    const trip = await makeTrip("u1", { language: "en-IN" });
    const { service, gemini, gnani } = setup(
      [answer("Let me check.", { missingData: "nearby_places", placesQuery: "veg restaurants" }), answer("Try Hotel Kamat on the right.")],
      { maps: fakeMaps({ searchText }) },
    );
    const r = await service.ask(base({ tripId: trip._id.toString(), question: { kind: "text", text: "where should we stop for food?" } }));
    expect(r.answerText).toBe("Try Hotel Kamat on the right.");
    expect(searchText).toHaveBeenCalledOnce();
    expect(searchText).toHaveBeenCalledWith({ query: "veg restaurants", bias: { center: MID, radiusM: 10_000 }, pageSize: 5 });
    expect(gemini.calls).toHaveLength(2);
    expect(gemini.calls[1].prompt).toContain("Hotel Kamat");
    expect(gemini.calls[1].prompt).toContain("340 reviews");
    expect(gemini.calls[1].prompt).toMatch(/(left|right) side of the road/);
    // Only the final answer is spoken.
    expect(gnani.calls.filter((c) => c.kind === "tts").map((c) => c.text)).toEqual(["Try Hotel Kamat on the right."]);
  });

  it("defaults the query to famous restaurants and never loops more than once", async () => {
    const searchText = vi.fn(async () => ({ places: [] }));
    const { service, gemini } = setup(
      [answer("Checking.", { missingData: "nearby_places" }), answer("Still checking.", { missingData: "nearby_places" })],
      { maps: fakeMaps({ searchText }) },
    );
    const r = await service.ask(base({ language: "en-IN" }));
    expect(searchText).toHaveBeenCalledOnce();
    expect(searchText).toHaveBeenCalledWith(expect.objectContaining({ query: "famous restaurants" }));
    expect(gemini.calls).toHaveLength(2);
    expect(r.answerText).toBe("Still checking.");
  });

  it("still answers when the Places search fails", async () => {
    const searchText = vi.fn(async () => {
      throw new UpstreamError("maps", 503, "down", true);
    });
    const { service, gemini } = setup([answer("Checking.", { missingData: "nearby_places" }), answer("I could not check just now.")], {
      maps: fakeMaps({ searchText }),
    });
    const r = await service.ask(base({ language: "en-IN" }));
    expect(r.answerText).toBe("I could not check just now.");
    expect(gemini.calls[1].prompt).toContain("unavailable");
  });
});

describe("ask service: script check and failures", () => {
  it("hands Gemini a validator that rejects digits, km, wrong script and over-long answers", async () => {
    const { service, gemini } = setup([answer(KN)]);
    await service.ask(base());
    const validate = gemini.calls[0].validate as (a: ReturnType<typeof AnswerSchema.parse>) => string[];
    const check = (text: string, missingData: "none" | "nearby_places" = "none") => validate({ answer: text, missingData });
    expect(check(KN)).toEqual([]);
    expect(check("ಇದು 5 km ದೂರ.").join(" ")).toMatch(/digits/);
    expect(check("ఇది పాత కోట.").join(" ")).toMatch(/Telugu/);
    expect(check(`${KN} `.repeat(80)).join(" ")).toMatch(/at most 29 words/);
    expect(check("")).not.toEqual([]);
    // A placeholder that only asks for a Places lookup is never spoken, so it is not held to the script rules.
    expect(check("checking 5 km", "nearby_places")).toEqual([]);
  });

  it("caps answers at about fifteen seconds of speech and rejects chatbot sign-offs", async () => {
    const { service, gemini } = setup([answer("It is an old fort.")]);
    await service.ask(base({ language: "en-IN" }));
    const validate = gemini.calls[0].validate as (a: ReturnType<typeof AnswerSchema.parse>) => string[];
    const check = (text: string) => validate({ answer: text, missingData: "none" });
    // English: 190 words a minute, so fifteen seconds is about forty-eight words.
    expect(check("word ".repeat(48).trim())).toEqual([]);
    expect(check("word ".repeat(49).trim()).join(" ")).toMatch(/49 words; it must be at most 48/);
    // The real first English answer ended like this; a car voice should just stop.
    const chatty = "Srirangapatna was Tipu Sultan's capital. Let me know if you would like to explore more about it.";
    expect(check(chatty).join(" ")).toMatch(/closing offer/);
    expect(check("Feel free to ask about the fort.").join(" ")).toMatch(/closing offer/);
    expect(check("The fort is on the island.")).toEqual([]);
  });

  it("asks for a short spoken answer with a per-language word target in the system prompt", async () => {
    const { service, gemini } = setup([answer(KN)]);
    await service.ask(base());
    // Kannada: 115 words a minute, so about ten seconds is nineteen words.
    expect(gemini.calls[0].system).toContain("at most 19 words");
    expect(gemini.calls[0].system).toMatch(/no offers like "let me know/);
  });

  it("turns a Gemini failure into an UpstreamError and speaks nothing", async () => {
    const { service, gnani } = setup([new UpstreamError("gemini", null, "no valid answer", false)]);
    await expect(service.ask(base())).rejects.toBeInstanceOf(UpstreamError);
    expect(gnani.calls).toHaveLength(0);
  });

  it("never logs the question or the answer", async () => {
    const log = vi.mocked(console.log);
    log.mockClear();
    const { service } = setup([answer(KN)]);
    await service.ask(base({ question: { kind: "text", text: "very secret question text" } }));
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("[ask]");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain(KN);
  });
});

describe("ask service: stores nothing", () => {
  it("leaves every collection unchanged", async () => {
    const trip = await makeTrip("u1", { language: "en-IN" });
    await makePlace("Fort", { lat: 12.46, lng: 76.69 });
    const before = await docCounts();
    const { service } = setup([answer("Checking.", { missingData: "nearby_places" }), answer("Done.")], {
      maps: fakeMaps({ searchText: async () => ({ places: [{ id: "g", name: "X", location: MID, types: [] }] }) }),
    });
    await service.ask(base({ tripId: trip._id.toString(), question: { kind: "audio", audio: SHORT_MP3 } }));
    expect(await docCounts()).toEqual(before);
  });
});
