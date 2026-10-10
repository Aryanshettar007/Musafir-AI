import type { Request, Response } from "express";
import { AutocompleteQuerySchema, type PlacesService } from "../services/trip/places.service";

export function placesController(service: PlacesService) {
  return {
    async autocomplete(req: Request, res: Response) {
      const query = AutocompleteQuerySchema.parse(req.query);
      res.json({ success: true, data: await service.autocomplete(query) });
    },
  };
}
