# Sponsored ad demo (Corner House on Bengaluru → Mysuru) — design

> Status: approved direction 2026-10-11. Branch `feature/trip-pipeline`. Builds on the shared foundation
> (`docs/superpowers/specs/2026-10-11-shared-foundation.md`) and the trip pipeline spec.

## Goal
Show the revenue model in the demo: when a trip passes a sponsoring local business, Musafir plays a short,
clearly labelled sponsored message in the trip's language and voice, triggered by GPS like any story.
**Demo sponsor: Corner House Ice Cream** on Bengaluru → Mysuru. Corner House has no deal with us: in code, docs and
the pitch this is a **sample sponsored slot** ("this is how a local business would appear").

## Decisions
- **A sponsored message is just another trip item** (`type: "sponsored"`), so the app plays it with its existing
  trigger engine; the only app change is a "Sponsored" label.
- **Generated once per (sponsor, language, voice), stored in B2, reused** (cache like stories).
- **At most one sponsored item per trip.** It must never replace a story the user would otherwise hear in the
  same spot; the pipeline places it and moves/drops at most one neighbouring item to keep spacing.
- Listens on sponsored items count as **impressions** (the same `POST /listens` events), which is the revenue
  metric for the demo.

## Data

### `sponsors`
```ts
{
  slug: "corner-house",                       // unique
  name: "Corner House Ice Creams",
  active: boolean,
  brief: {                                    // hand-written, the only facts the ad may use
    tagline: string, highlights: string[],    // e.g. famous for "Death by Chocolate", since 1982 (verify before use)
    callToAction: string,
  },
  outlets: [{ label, googlePlaceId?, location: GeoJSON Point, address? }],   // 2dsphere index
  triggerRadiusM: 600,
  maxDetourM: 3000,                           // the route must pass within this distance of an outlet
  ads: [{ language, voice, title, script, storageKey, bytes, durationS, createdAt }],
}
```
Seeded from `src/sponsors/cornerHouse.ts` by `scripts/seed-sponsor.ts` (idempotent upsert). The outlet(s) are found
once with Places Text Search ("Corner House Ice Cream") along the real Bengaluru → Mysuru route; the chosen
`googlePlaceId` and location are hardcoded in the seed file with a comment saying how they were found. Prefer an
outlet the route really passes (≤ 3 km); if all are in central Bengaluru, use the Mysuru outlet (near the
destination) or the one nearest the highway, and say which in the seed file.

## Generating an ad
`sponsorAds.ensureAd(sponsor, language, voice)`:
1. Return the existing ad if `ads[]` has it.
2. Gemini (shared client) writes `{ title, script }`: 15–25 s spoken (word budget from the shared language table),
   RJ style, starts with a clear sponsor cue in the target language ("A quick word from our partner…"), uses only
   the brief, mentions the outlet is coming up on the left/right only when `side` is known, numbers spelled out.
   Shared script check; fallback model as usual.
3. Gnani TTS via the queue (`background` priority) → `ads/{slug}/{language}/{voice}.mp3` in storage.
4. Push to `ads[]` (atomic `$push` guarded by a filter so two builds don't duplicate).

`scripts/create-sponsor-ad.ts --sponsor corner-house --languages en-IN,kn-IN,hi-IN [--voices ...]` pre-generates the
demo combinations (default: each language's recommended male and female voice).

## Trip integration (the contract with the trip pipeline)
`SponsorProvider` (interface in the shared foundation, implemented here):
```ts
interface SponsorProvider {
  // Called by the trip builder after selection, before production. Pure lookup + ad generation if missing.
  sponsoredItemFor(input: {
    route: RouteIndex; language: LanguageId; voice: string; avgSpeedMps: number;
  }): Promise<SponsoredItemSpec | null>;
}
interface SponsoredItemSpec {
  sponsorSlug: string; sponsorName: string; outletLabel: string;
  anchorRouteDistanceM: number; side: "left" | "right" | "none";
  title: string; audio: { storageKey: string; bytes: number; durationS: number }; transcript: string;
  triggerRadiusM: number;
}
```
- Finds active sponsors with an outlet within `maxDetourM` of the route (`$geoWithin` box around the route, then
  exact projection with `geo/`), picks the outlet with the smallest detour, ignores outlets in the first 2 km of
  the route.
- `side` is computed by projection; the anchor is the outlet's closest approach, and the trigger lead is applied by
  the trip builder like any item.
- The trip pipeline (offline agent) calls `sponsorProvider.sponsoredItemFor(...)` when a provider is configured,
  inserts the item as `type: "sponsored"` with `sponsor: { slug, name }`, status `ready`, and enforces spacing
  around it. `GET /trips/:id` shows `sponsor.name` so the app can label it.

## Module layout
```
src/models/sponsor.model.ts
src/sponsors/cornerHouse.ts           (seed data)
src/services/sponsor/sponsorAds.ts    (ensureAd: Gemini + Gnani + storage)
src/services/sponsor/sponsorProvider.ts (route matching → SponsoredItemSpec)
scripts/seed-sponsor.ts, scripts/create-sponsor-ad.ts
```

## Testing
- Unit: outlet matching (on route, off route, start-of-route exclusion, side), ad prompt building.
- Service with fakes: ensureAd caches (second call makes no Gemini/Gnani calls), concurrent ensureAd doesn't
  duplicate, provider returns null without sponsors.
- Manual: run the seed and ad scripts against real APIs, then a real trip Bengaluru → Mysuru shows one sponsored item.
