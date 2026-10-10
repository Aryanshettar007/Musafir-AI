import type { LanguageId } from "../catalog/languages";
import { PROMPT_VERSION } from "./rules";
import type { Focus, Side } from "./types";

export interface CacheKeyInput {
  type: string;
  placeIds: readonly string[];
  language: LanguageId;
  voice: string;
  focus: Focus;
  side: Side;
  // trip-intro is per trip and never shared.
  tripId?: string;
}

// Stories are shared across trips (decision D2): places + type + language + voice + focus + side, and the prompt
// version so a prompt change doesn't serve old writing.
export function cacheKey(i: CacheKeyInput): string {
  if (i.type === "trip-intro") return `v${PROMPT_VERSION}|trip-intro|${i.tripId}|${i.language}|${i.voice}`;
  return `v${PROMPT_VERSION}|${i.type}|${[...i.placeIds].sort().join(",")}|${i.language}|${i.voice}|${i.focus}|${i.side}`;
}
