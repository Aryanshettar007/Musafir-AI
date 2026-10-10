import { Router } from "express";
import { placesController } from "../controllers/places.controller";
import type { PlacesService } from "../services/trip/places.service";

export const placesRouter = (service: PlacesService) => Router().get("/autocomplete", placesController(service).autocomplete);
