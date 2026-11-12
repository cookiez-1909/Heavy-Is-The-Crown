// Refreshes web/src/radar.json from meme.cooking's public API (Node 24).
//   node scripts/radar.mjs
// The API only allows browser calls from its own origins, so the site ships
// this snapshot and upgrades to live data where the browser is allowed to.
// The counting rules live in web/src/radarCompute.ts.
import { writeFileSync } from "node:fs";
import { computeRadar } from "../web/src/radarCompute.ts";

const memes = await (await fetch("https://api.meme.cooking/meme")).json();
const out = computeRadar(memes, new Date().toISOString().slice(0, 10));
writeFileSync(new URL("../web/src/radar.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`${out.sharing} of ${out.visible} displayed listings are on one of ${out.tickers} contested tickers (API returns ${out.total} listings in all)`);
for (const d of out.top) console.log(`  $${d.ticker}: ${d.listings.length} listings by ${d.creators} accounts -> ${d.listings.map((l) => "meme.cooking/meme/" + l.id).join(" ")}`);
