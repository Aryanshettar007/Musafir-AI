import { afterEach, describe, expect, it, vi } from "vitest";
import { truncateAtSentence, wikipediaClient } from "../src/clients/wikipedia";

interface Sent {
  url: URL;
  userAgent: string;
}

// Stubs global fetch with a queue of responses (GET) and records what was sent.
function stubFetch(responses: Array<{ status?: number; json?: unknown; headers?: Record<string, string> }>): Sent[] {
  const sent: Sent[] = [];
  const queue = [...responses];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url: new URL(url), userAgent: (init.headers as Record<string, string>)["User-Agent"] });
    const next = queue.shift() ?? { json: { query: { pages: [] } } };
    return new Response(JSON.stringify(next.json ?? {}), { status: next.status ?? 200, headers: next.headers });
  });
  return sent;
}

afterEach(() => vi.unstubAllGlobals());

const client = () => wikipediaClient({ userAgent: "TestAgent/1.0 (https://example.test)" });

describe("wikipediaClient", () => {
  it("geosearch sends the generator query with a descriptive user agent and maps hits in index order", async () => {
    const sent = stubFetch([
      {
        json: {
          query: {
            pages: [
              { pageid: 2, index: 2, title: "Mandya", description: "City in Karnataka, India", length: 15340, coordinates: [{ lat: 12.52, lon: 76.9 }], pageprops: { wikibase_item: "Q1" } },
              { pageid: 1, index: 1, title: "Maddur", coordinates: [{ lat: 12.58, lon: 77.04 }] },
              { pageid: 3, index: 3, title: "No coordinates" },
            ],
          },
        },
      },
    ]);
    const hits = await client().geosearch({ center: { lat: 12.5, lng: 77 }, radiusM: 10_000, limit: 100 });
    expect(hits.map((h) => h.title)).toEqual(["Maddur", "Mandya"]);
    expect(hits[1]).toEqual({ pageId: 2, title: "Mandya", location: { lat: 12.52, lng: 76.9 }, description: "City in Karnataka, India", length: 15340, wikidataId: "Q1" });
    const q = sent[0].url.searchParams;
    expect(sent[0].userAgent).toContain("example.test");
    expect(q.get("generator")).toBe("geosearch");
    expect(q.get("ggscoord")).toBe("12.5|77");
    expect(q.get("ggsradius")).toBe("10000");
    expect(q.get("ggslimit")).toBe("100");
    expect(q.get("prop")).toBe("description|coordinates|info|pageprops");
    expect(q.get("ppprop")).toBe("wikibase_item");
  });

  it("caps the geosearch radius at Wikipedia's 10 km", async () => {
    const sent = stubFetch([{ json: { query: { pages: [] } } }]);
    await client().geosearch({ center: { lat: 1, lng: 2 }, radiusM: 25_000, limit: 10 });
    expect(sent[0].url.searchParams.get("ggsradius")).toBe("10000");
  });

  it("searchByName uses generator=search", async () => {
    const sent = stubFetch([{ json: { query: { pages: [{ pageid: 9, index: 1, title: "Gumbaz, Srirangapatna", coordinates: [{ lat: 12.41, lon: 76.71 }] }] } } }]);
    const hits = await client().searchByName({ query: "Gumbaz Srirangapatna" });
    expect(hits[0].title).toBe("Gumbaz, Srirangapatna");
    expect(sent[0].url.searchParams.get("generator")).toBe("search");
    expect(sent[0].url.searchParams.get("gsrsearch")).toBe("Gumbaz Srirangapatna");
    expect(sent[0].url.searchParams.get("gsrlimit")).toBe("3");
  });

  it("searchByName keeps articles without coordinates", async () => {
    stubFetch([{ json: { query: { pages: [{ pageid: 3, index: 1, title: "Bengaluru Palace", description: "Royal palace in India" }] } } }]);
    const hits = await client().searchByName({ query: "Bengaluru Palace" });
    expect(hits).toEqual([{ pageId: 3, title: "Bengaluru Palace", description: "Royal palace in India", length: undefined, wikidataId: undefined }]);
  });

  it("extract returns the plain text cut at a sentence, with the page url", async () => {
    stubFetch([{ json: { query: { pages: [{ pageid: 5, title: "Mysore Palace", extract: "First sentence. Second sentence is longer. Third sentence here." }] } } }]);
    const ex = await client().extract({ pageId: 5, maxChars: 50 });
    expect(ex).toEqual({ pageId: 5, title: "Mysore Palace", url: "https://en.wikipedia.org/wiki/Mysore_Palace", text: "First sentence. Second sentence is longer." });
  });

  it("extract is null for a missing page or an empty extract", async () => {
    stubFetch([{ json: { query: { pages: [{ pageid: 6, title: "Gone", missing: true }] } } }, { json: { query: { pages: [{ pageid: 7, title: "Empty", extract: "  " }] } } }]);
    expect(await client().extract({ pageId: 6, maxChars: 100 })).toBeNull();
    expect(await client().extract({ pageId: 7, maxChars: 100 })).toBeNull();
  });

  it("retries 429 (honouring Retry-After) and then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const sent = stubFetch([{ status: 429, headers: { "Retry-After": "1" }, json: {} }, { json: { query: { pages: [] } } }]);
      const p = client().geosearch({ center: { lat: 1, lng: 2 }, radiusM: 1000, limit: 5 });
      await vi.advanceTimersByTimeAsync(1500);
      await expect(p).resolves.toEqual([]);
      expect(sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails with an UpstreamError on a 500 that never recovers", async () => {
    vi.useFakeTimers();
    try {
      stubFetch([{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }]);
      const p = client().geosearch({ center: { lat: 1, lng: 2 }, radiusM: 1000, limit: 5 });
      const assertion = expect(p).rejects.toMatchObject({ name: "UpstreamError", service: "wikipedia", status: 500 });
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends requests one at a time", async () => {
    let inFlight = 0, max = 0;
    vi.stubGlobal("fetch", async () => {
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response(JSON.stringify({ query: { pages: [] } }));
    });
    const c = client();
    await Promise.all([1, 2, 3].map(() => c.geosearch({ center: { lat: 1, lng: 2 }, radiusM: 1000, limit: 5 })));
    expect(max).toBe(1);
  });
});

describe("truncateAtSentence", () => {
  it("keeps short text, cuts at the last sentence end, and falls back to a hard cut", () => {
    expect(truncateAtSentence("Short.", 100)).toBe("Short.");
    expect(truncateAtSentence("One two three. Four five six seven.", 25)).toBe("One two three.");
    expect(truncateAtSentence("A very long run of words without any full stop in it at all", 20)).toHaveLength(20);
  });
});
