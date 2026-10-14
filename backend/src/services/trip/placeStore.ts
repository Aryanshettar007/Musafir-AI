import type { Types } from "mongoose";
import type { WikipediaClient } from "../../clients/wikipedia";
import { articleUrl } from "../../clients/wikipedia";
import { haversineM } from "../../geo";
import { Place, type PlaceDoc } from "../../models/place.model";
import { toPoint } from "../../models/point";
import { matchArticle } from "../../pipeline/match";
import { BORROW_TOWN_MAX_M, FACTS_MAX_AGE_MS, FACTS_MAX_CHARS, SEARCH_MATCH_MAX_DISTANCE_M } from "../../pipeline/rules";
import type { Article, Candidate, PlannedItem } from "../../pipeline/types";
import { placeKeysOf } from "../../pipeline/types";

type PlaceRow = PlaceDoc & { _id: Types.ObjectId };

const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === 11000;

export interface StoredPlace {
  id: Types.ObjectId;
  candidate: Candidate;
  hasFacts: boolean;
}

export interface ResolvedItem {
  planned: PlannedItem;
  // Place keys of the final item: the chosen places, plus the town whose facts a place without an article borrows.
  keys: string[];
}

export interface FactsStats {
  extracts: number;
  nameSearches: number;
  borrowed: number;
  dropped: number;
}

export interface PlaceStoreDeps {
  wikipedia: WikipediaClient;
  // Whether a town really is where Wikipedia puts it (see townCheck.ts); every town is trusted when absent.
  townIsReal?: (town: Candidate) => Promise<boolean>;
  exclude?: ReadonlySet<string>;
  now?: () => Date;
  warn?: (message: string) => void;
}

// Keeps `places` in step with what the trip build sees: the Google snapshot is refreshed every time (terms: only the
// place id is ours to keep), and Wikipedia facts are fetched once and reused for 90 days.
export function createPlaceStore(deps: PlaceStoreDeps) {
  const now = deps.now ?? (() => new Date());
  const warn = deps.warn ?? (() => {});
  const townIsReal = deps.townIsReal ?? (async () => true);
  const stored = new Map<string, StoredPlace>();
  const stats: FactsStats = { extracts: 0, nameSearches: 0, borrowed: 0, dropped: 0 };

  async function save(c: Candidate, withArticle: boolean): Promise<PlaceRow> {
    const article = withArticle ? c.article : undefined;
    const set: Record<string, unknown> = { kind: c.kind === "town" || c.kind === "region" ? c.kind : "poi", name: c.name, location: toPoint(c.location), interests: c.interests };
    if (c.googlePlaceId) {
      set.google = { primaryType: c.primaryType, types: c.types, userRatingCount: c.ratings, fetchedAt: now() };
    }
    if (article) {
      set.wikipedia = { pageId: article.pageId, title: article.title, url: articleUrl(article.title) };
      if (article.wikidataId) set.wikidataId = article.wikidataId;
    }
    // Unique sparse indexes: the field is left absent, never null.
    const filter = c.googlePlaceId ? { googlePlaceId: c.googlePlaceId } : { "wikipedia.pageId": c.article?.pageId };
    const doc = await Place.findOneAndUpdate(filter, { $set: set }, { upsert: true, new: true, lean: true, setDefaultsOnInsert: true });
    return doc as PlaceRow;
  }

  async function upsert(c: Candidate): Promise<StoredPlace> {
    const known = stored.get(c.key);
    if (known) return known;
    let row: PlaceRow;
    try {
      row = await save(c, true);
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Either a parallel build created it a moment ago, or another pin already owns this article: retry once
      // without the article, which then keeps the one place that had it first.
      try {
        row = await save(c, true);
      } catch (e2) {
        if (!isDuplicateKey(e2) || !c.googlePlaceId) throw e2;
        row = await save(c, false);
      }
    }
    const fresh = row.facts && now().getTime() - row.facts.fetchedAt.getTime() < FACTS_MAX_AGE_MS;
    const sp: StoredPlace = { id: row._id, candidate: c, hasFacts: Boolean(fresh) };
    stored.set(c.key, sp);
    return sp;
  }

  async function fetchFacts(sp: StoredPlace, article: Article): Promise<boolean> {
    stats.extracts++;
    const ex = await deps.wikipedia.extract({ pageId: article.pageId, maxChars: FACTS_MAX_CHARS });
    if (!ex) return false;
    await Place.updateOne(
      { _id: sp.id },
      { $set: { facts: { text: ex.text, source: "wikipedia", url: ex.url, fetchedAt: now() } } },
    );
    sp.hasFacts = true;
    return true;
  }

  // Give one place facts: its article, else a name search (5 km looser matching), else nothing.
  async function ensureFacts(c: Candidate, nearestTownName: string | undefined): Promise<boolean> {
    const sp = await upsert(c);
    if (sp.hasFacts) return true;
    try {
      if (c.article) return await fetchFacts(sp, c.article);
      // Food places rarely have an article and a name search would only find the town: they borrow instead.
      if (c.kind !== "poi") return false;
      stats.nameSearches++;
      const hits = await deps.wikipedia.searchByName({ query: `${c.name} ${nearestTownName ?? ""}`.trim(), limit: 3 });
      const articles: Article[] = hits.map((h) => ({ pageId: h.pageId, title: h.title, location: h.location, wikidataId: h.wikidataId, description: h.description, length: h.length }));
      const found = matchArticle(c.name, c.location, articles, { exclude: deps.exclude, maxDistanceM: SEARCH_MATCH_MAX_DISTANCE_M });
      if (!found) return false;
      try {
        await Place.updateOne({ _id: sp.id }, { $set: { wikipedia: { pageId: found.pageId, title: found.title, url: articleUrl(found.title) }, ...(found.wikidataId ? { wikidataId: found.wikidataId } : {}) } });
      } catch (e) {
        if (!isDuplicateKey(e)) throw e; // another place already holds this article: still use its facts for the story
      }
      return await fetchFacts(sp, found);
    } catch (e) {
      warn(`facts for "${c.name}" failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  // Facts for every place of every chosen item (trip spec 5.5). An item whose places have no article borrows the
  // nearest real town's facts (the town id is added to the item's places); with no town in reach the item is dropped,
  // because nothing is ever written without facts. A town-welcome or long-form on a misplaced town is dropped too.
  async function resolveItems(items: readonly PlannedItem[], towns: readonly Candidate[]): Promise<{ resolved: ResolvedItem[]; dropped: PlannedItem[] }> {
    const resolved: ResolvedItem[] = [];
    const dropped: PlannedItem[] = [];
    for (const planned of items) {
      if (!planned.candidate) {
        resolved.push({ planned, keys: [] });
        continue;
      }
      const keys = placeKeysOf(planned);
      if (planned.candidate.kind === "town" && !(await townIsReal(planned.candidate))) {
        stats.dropped++;
        dropped.push(planned);
        continue;
      }
      const members = planned.type === "episode" ? (planned.candidate.members ?? [planned.candidate]) : [planned.candidate];
      const withFacts: string[] = [];
      for (const m of members) {
        const near = nearestTown(m, towns);
        if (await ensureFacts(m, near?.name)) withFacts.push(m.key);
      }
      if (withFacts.length > 0) {
        resolved.push({ planned, keys });
        continue;
      }
      let lender: Candidate | undefined;
      for (const town of townsNear(planned.candidate.anchor ?? planned.candidate, towns)) {
        if ((await townIsReal(town)) && (await ensureFacts(town, undefined))) {
          lender = town;
          break;
        }
      }
      if (lender) {
        await upsert(lender);
        stats.borrowed++;
        resolved.push({ planned, keys: [...keys, lender.key] });
      } else {
        stats.dropped++;
        dropped.push(planned);
      }
    }
    return { resolved, dropped };
  }

  return {
    stats,
    upsert,
    resolveItems,
    idOf: (key: string) => stored.get(key)?.id,
  };
}

export type PlaceStore = ReturnType<typeof createPlaceStore>;

// Towns with an article of their own within reach of a place that has none, nearest first.
export function townsNear(c: Candidate, towns: readonly Candidate[]): Candidate[] {
  return towns
    .filter((t) => t.key !== c.key && t.article)
    .map((t) => ({ t, d: haversineM(t.location, c.location) }))
    .filter((x) => x.d <= BORROW_TOWN_MAX_M)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.t);
}

export const nearestTown = (c: Candidate, towns: readonly Candidate[]): Candidate | undefined => townsNear(c, towns)[0];
