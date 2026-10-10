import type { InterestId } from "../catalog/interests";
import type { LatLng } from "../geo";
import type { ItemType } from "../models/trip.model";
import type { SponsoredItemSpec } from "../services/sponsor/types";

export type Focus = InterestId | "general";
export type Side = "left" | "right" | "none";

// A Wikipedia article attached to a candidate: matched to a Google POI, or the candidate itself (town, region).
export interface Article {
  pageId: number;
  title: string;
  location: LatLng;
  wikidataId?: string;
  description?: string;
  length?: number;
}

export type CandidateKind = "poi" | "food" | "town" | "region" | "episode";

// Something the trip could narrate, projected onto the route.
export interface Candidate {
  // googlePlaceId, "wiki:<pageId>" for towns/regions, "episode:<anchor key>" for clusters.
  key: string;
  kind: CandidateKind;
  name: string;
  location: LatLng;
  googlePlaceId?: string;
  primaryType?: string;
  types: string[];
  ratings: number;
  article?: Article;
  interests: InterestId[];
  distanceFromRouteM: number;
  // Where along the route the candidate is closest (for an episode: its anchor member).
  routeDistanceM: number;
  side: "left" | "right";
  historic: boolean;
  inEdge: boolean; // inside the first or last 15 km (city edges)
  score: number;
  heard: boolean;
  // Episodes only.
  members?: Candidate[];
  anchor?: Candidate;
}

// An item chosen for the trip, before it is written.
export interface PlannedItem {
  type: ItemType;
  candidate?: Candidate; // absent for trip-intro and sponsored
  focus: Focus;
  side: Side;
  targetSeconds: number;
  anchorRouteDistanceM: number;
  score: number;
  title: string;
  // Never dropped or shortened by the spacing rule: trip-intro and sponsored.
  locked?: boolean;
  triggerRadiusM?: number;
  // Sponsored items carry their ready-made audio.
  sponsor?: SponsoredItemSpec;
}

export type RealItemType = Exclude<ItemType, "trip-intro" | "sponsored">;

export const placeKeysOf = (item: PlannedItem): string[] =>
  !item.candidate ? [] : item.type === "episode" && item.candidate.members ? item.candidate.members.map((m) => m.key) : [item.candidate.key];
