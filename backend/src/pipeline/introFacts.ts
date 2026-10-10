// The trip-intro has no place: its facts are the trip itself (trip spec 5.5).
export function tripIntroFacts(trip: {
  originLabel: string;
  destinationLabel: string;
  distanceM: number;
  durationS: number;
  townNames: readonly string[];
  itemTitles: readonly string[];
}): string {
  const km = Math.round(trip.distanceM / 1000);
  const hours = Math.floor(trip.durationS / 3600);
  const minutes = Math.round((trip.durationS % 3600) / 60);
  const duration = [hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "", minutes ? `${minutes} minutes` : ""].filter(Boolean).join(" ");
  return [
    `The trip goes from ${trip.originLabel} to ${trip.destinationLabel}.`,
    `It is about ${km} kilometres and takes about ${duration} by road.`,
    trip.townNames.length ? `Towns on the way: ${trip.townNames.join(", ")}.` : "",
    trip.itemTitles.length ? `Places the listener will hear about on the way: ${trip.itemTitles.join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}
