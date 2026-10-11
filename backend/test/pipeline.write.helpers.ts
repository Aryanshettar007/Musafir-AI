import { tripIntroFacts } from "../src/pipeline/introFacts";

export const introFactsCheck = tripIntroFacts({
  originLabel: "Bengaluru",
  destinationLabel: "Mysore Palace",
  distanceM: 138_500,
  durationS: 9060,
  townNames: ["Channapatna", "Mandya"],
  itemTitles: ["Srirangapatna Fort"],
});
