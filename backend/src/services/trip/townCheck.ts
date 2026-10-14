import type { MapsClient } from "../../clients/maps";
import { UpstreamError } from "../../clients/upstream";
import { haversineM } from "../../geo";
import { TOWN_CHECK_MAX_M } from "../../pipeline/rules";
import type { Candidate } from "../../pipeline/types";

// Wikipedia sometimes puts a town hundreds of kilometres from where it is: Belavanaki, a Gadag district village, sits at
// Bengaluru's Majestic, so a Rajajinagar restaurant borrowed its history. Google knows where towns are. A town is
// trusted when Google finds a place of that name within TOWN_CHECK_MAX_M of the Wikipedia point, or finds nothing at
// all (too small for Google), or can't be asked. One Text Search per town, remembered for the build.
export function createTownCheck(maps: MapsClient, warn: (message: string) => void = () => {}): (town: Candidate) => Promise<boolean> {
  const known = new Map<string, Promise<boolean>>();

  async function check(town: Candidate): Promise<boolean> {
    const name = town.name.split(",")[0].trim(); // "Kadoli, Karnataka" -> "Kadoli"
    try {
      const { places } = await maps.searchText({ query: name, bias: { center: town.location, radiusM: TOWN_CHECK_MAX_M }, pageSize: 5 });
      if (places.length === 0) return true;
      const near = places.some((p) => haversineM(p.location, town.location) <= TOWN_CHECK_MAX_M);
      if (!near) warn(`skipped town "${town.name}": Wikipedia puts it here, but Google finds it far away`);
      return near;
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e;
      warn(`could not check town "${town.name}" on Google, using it anyway: ${e.message}`);
      return true;
    }
  }

  return (town) => {
    let result = known.get(town.key);
    if (!result) {
      result = check(town);
      known.set(town.key, result);
    }
    return result;
  };
}
