import { Router } from "express";
import type { MapsClient } from "../clients/maps";
import type { Storage } from "../clients/storage";
import { tripsController } from "../controllers/trips.controller";
import { createPlacesService } from "../services/trip/places.service";
import { createTripService, type TripServiceDeps } from "../services/trip/trip.service";
import { listensRouter } from "./listens.routes";
import { placesRouter } from "./places.routes";

export function tripsRouter(deps: TripServiceDeps): Router {
  const c = tripsController(createTripService(deps));
  return Router().post("/", c.create).get("/", c.list).get("/:id", c.get);
}

export interface TripFeatureDeps extends TripServiceDeps {
  maps: MapsClient;
  storage: Storage;
}

// Everything the trip pipeline exposes, for createApp({ routers }): /trips, /listens, /places.
export function tripRouters(deps: TripFeatureDeps): Array<{ path: string; router: Router }> {
  return [
    { path: "/trips", router: tripsRouter(deps) },
    { path: "/listens", router: listensRouter() },
    { path: "/places", router: placesRouter(createPlacesService(deps.maps)) },
  ];
}
