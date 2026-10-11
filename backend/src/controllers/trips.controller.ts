import type { Request, Response } from "express";
import { identityOf } from "../middleware/auth";
import {
  CreateTripSchema,
  ListTripsQuerySchema,
  PreviewRoutesSchema,
  type TripService,
} from "../services/trip/trip.service";

export function tripsController(service: TripService) {
  return {
    async preview(req: Request, res: Response) {
      const input = PreviewRoutesSchema.parse(req.body ?? {});
      const data = await service.previewRoutes(identityOf(req), input);
      res.json({ success: true, data });
    },
    async create(req: Request, res: Response) {
      const input = CreateTripSchema.parse(req.body ?? {});
      const data = await service.createTrip(identityOf(req), input);
      res.status(202).json({ success: true, data });
    },
    async get(req: Request, res: Response) {
      res.json({ success: true, data: await service.getTrip(identityOf(req), String(req.params.id)) });
    },
    async list(req: Request, res: Response) {
      const { limit } = ListTripsQuerySchema.parse(req.query);
      res.json({ success: true, data: await service.listTrips(identityOf(req), limit) });
    },
  };
}
