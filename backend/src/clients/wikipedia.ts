import { z } from "zod";
import type { LatLng } from "../geo/polyline";
import { createLimiter } from "./limiter";
import { asUpstreamError, fetchWithTimeout, isRetryableStatus, parseRetryAfter, UpstreamError, withRetry } from "./upstream";

// One Wikipedia page as the geosearch / name search returns it. `description` is the short Wikidata description
// ("Town in Mandya district, Karnataka"), `length` the article size in bytes (our importance score for towns).
export interface WikiHit {
  pageId: number;
  title: string;
  location: LatLng;
  description?: string;
  length?: number;
  wikidataId?: string;
}

export interface WikiExtract {
  pageId: number;
  title: string;
  url: string;
  text: string;
}

// A name-search result. Some articles have no coordinates ("Bengaluru Palace"), so the location is optional here.
export interface NameHit extends Omit<WikiHit, "location"> {
  location?: LatLng;
}

export interface WikipediaClient {
  geosearch(req: { center: LatLng; radiusM: number; limit: number }): Promise<WikiHit[]>;
  // Top `limit` articles for a name, with coordinates when the article has them.
  searchByName(req: { query: string; limit?: number }): Promise<NameHit[]>;
  // Plain-text article extract, cut at a sentence boundary to at most `maxChars`. null = no such page or empty.
  extract(req: { pageId: number; maxChars: number }): Promise<WikiExtract | null>;
}

const API = "https://en.wikipedia.org/w/api.php";
const TIMEOUT_MS = 20_000;
const RETRY = { attempts: 4, baseDelayMs: 2_000 };

const RawPage = z.object({
  pageid: z.number(),
  title: z.string(),
  index: z.number().optional(),
  description: z.string().optional(),
  length: z.number().optional(),
  coordinates: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
  pageprops: z.object({ wikibase_item: z.string().optional() }).optional(),
  extract: z.string().optional(),
  missing: z.boolean().optional(),
});
type RawPage = z.infer<typeof RawPage>;

const QueryResponse = z.object({ query: z.object({ pages: z.array(RawPage) }).optional() });

const toNameHit = (p: RawPage): NameHit => {
  const c = p.coordinates?.[0];
  return {
    pageId: p.pageid,
    title: p.title,
    ...(c ? { location: { lat: c.lat, lng: c.lon } } : {}),
    description: p.description,
    length: p.length,
    wikidataId: p.pageprops?.wikibase_item,
  };
};

const toHit = (p: RawPage): WikiHit | null => {
  const c = p.coordinates?.[0];
  if (!c) return null;
  return {
    pageId: p.pageid,
    title: p.title,
    location: { lat: c.lat, lng: c.lon },
    description: p.description,
    length: p.length,
    wikidataId: p.pageprops?.wikibase_item,
  };
};

export const articleUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

// Cuts at the last sentence end before `maxChars` (or hard at maxChars when there is none in the second half).
export function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return end > maxChars / 2 ? cut.slice(0, end + 1) : cut;
}

export function wikipediaClient(cfg: { userAgent: string }): WikipediaClient {
  // Wikimedia rate-limits bursts: one request at a time, descriptive User-Agent, retry 429.
  const limiter = createLimiter({ concurrency: 1 });

  function query<T>(params: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    const url = `${API}?${new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params })}`;
    return limiter.run(() =>
      withRetry(async () => {
        let res: Response;
        let text: string;
        try {
          res = await fetchWithTimeout(url, { headers: { "User-Agent": cfg.userAgent }, timeoutMs: TIMEOUT_MS });
          text = await res.text();
        } catch (e) {
          throw asUpstreamError("wikipedia", e);
        }
        if (!res.ok) {
          throw new UpstreamError("wikipedia", res.status, `Wikipedia failed with ${res.status}: ${text.slice(0, 100)}`,
            isRetryableStatus(res.status), parseRetryAfter(res.headers.get("retry-after")));
        }
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new UpstreamError("wikipedia", res.status, "Wikipedia returned a body that is not JSON", false);
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          throw new UpstreamError("wikipedia", res.status, `Wikipedia returned an unexpected response: ${parsed.error.message.slice(0, 200)}`, false);
        }
        return parsed.data;
      }, RETRY),
    );
  }

  const byIndex = (a: RawPage, b: RawPage) => (a.index ?? 0) - (b.index ?? 0);

  return {
    async geosearch({ center, radiusM, limit }) {
      const r = await query(
        {
          generator: "geosearch",
          ggscoord: `${center.lat}|${center.lng}`,
          ggsradius: String(Math.min(10_000, Math.round(radiusM))),
          ggslimit: String(limit),
          prop: "description|coordinates|info|pageprops",
          ppprop: "wikibase_item",
          colimit: String(limit),
          coprimary: "primary",
        },
        QueryResponse,
      );
      return (r.query?.pages ?? []).sort(byIndex).flatMap((p) => toHit(p) ?? []);
    },

    async searchByName({ query: q, limit = 3 }) {
      const r = await query(
        {
          generator: "search",
          gsrsearch: q,
          gsrlimit: String(limit),
          gsrnamespace: "0",
          prop: "description|coordinates|info|pageprops",
          ppprop: "wikibase_item",
          coprimary: "primary",
        },
        QueryResponse,
      );
      return (r.query?.pages ?? []).sort(byIndex).map(toNameHit);
    },

    async extract({ pageId, maxChars }) {
      const r = await query(
        { prop: "extracts", explaintext: "1", exsectionformat: "plain", pageids: String(pageId), redirects: "1" },
        QueryResponse,
      );
      const page = r.query?.pages[0];
      const text = page?.extract?.trim();
      if (!page || page.missing || !text) return null;
      return { pageId: page.pageid, title: page.title, url: articleUrl(page.title), text: truncateAtSentence(text, maxChars) };
    },
  };
}
