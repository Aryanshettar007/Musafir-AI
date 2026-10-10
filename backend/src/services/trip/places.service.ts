import { z } from "zod";
import type { MapsClient } from "../../clients/maps";

export const AutocompleteQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    sessionToken: z.uuid().optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "Send lat and lng together", path: ["lat"] });
export type AutocompleteQuery = z.infer<typeof AutocompleteQuerySchema>;

// Destination search box: Places Autocomplete (New), India only, biased to the user's position when sent.
export function createPlacesService(maps: MapsClient) {
  return {
    async autocomplete(q: AutocompleteQuery) {
      const suggestions = await maps.autocomplete({
        input: q.q,
        bias: q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined,
        sessionToken: q.sessionToken,
      });
      return { suggestions: suggestions.slice(0, 5) };
    },
  };
}
export type PlacesService = ReturnType<typeof createPlacesService>;
