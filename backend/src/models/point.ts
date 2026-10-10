import { Schema } from "mongoose";
import type { LatLng } from "../geo/polyline";

// GeoJSON Point as MongoDB wants it: coordinates are [lng, lat].
export const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], required: true, default: "Point" },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

export const toPoint = (p: LatLng) => ({ type: "Point" as const, coordinates: [p.lng, p.lat] });
export const fromPoint = (p: { coordinates: number[] }): LatLng => ({ lat: p.coordinates[1], lng: p.coordinates[0] });
