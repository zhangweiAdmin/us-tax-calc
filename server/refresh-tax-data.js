import { refreshTaxData } from "./lib/taxUpdater.js";

async function run() {
  const data = await refreshTaxData({ reason: "manual-cli-refresh" });
  const meta = data.metadata;

  console.log("Tax data refreshed.");
  console.log(`Year: ${meta.taxYear}`);
  console.log(`Refreshed At: ${meta.refreshedAt}`);
  console.log(`Source Status: federal=${meta.sourceStatus.federal}, states=${meta.sourceStatus.states}`);

  if (meta.errors?.length) {
    console.log("Warnings:");
    for (const message of meta.errors) {
      console.log(`- ${message}`);
    }
  }
}

run().catch((error) => {
  console.error("Failed to refresh tax data:", error);
  process.exit(1);
});
