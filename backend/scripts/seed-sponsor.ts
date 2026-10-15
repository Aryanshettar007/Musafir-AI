// Upserts the sample sponsored slot (Corner House) into MongoDB `sponsors`. Idempotent; never touches `ads`.
// Run: npx tsx scripts/seed-sponsor.ts
import mongoose from "mongoose";
import { connectDB } from "../src/config/db";
import { Sponsor } from "../src/models/sponsor.model";
import { CORNER_HOUSE } from "../src/sponsors/cornerHouse";
import { ROYAL_ENFIELD } from "../src/sponsors/royalEnfield";
import { KARNATAKA_TOURISM } from "../src/sponsors/karnatakaTourism";

async function main() {
  await connectDB();
  await Sponsor.init(); // build the unique and 2dsphere indexes

  const seeds = [CORNER_HOUSE, ROYAL_ENFIELD, KARNATAKA_TOURISM];
  for (const item of seeds) {
    const { slug, ...fields } = item;
    const res = await Sponsor.updateOne(
      { slug },
      { $set: fields, $setOnInsert: { slug, ads: [] } },
      { upsert: true, runValidators: true }
    );
    console.log(`${slug}: ${res.upsertedCount ? "inserted" : "updated"}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
