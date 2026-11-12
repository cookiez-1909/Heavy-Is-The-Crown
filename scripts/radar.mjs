// Refreshes web/src/radar.json from meme.cooking's public API.
//   node scripts/radar.mjs
// The API only allows browser calls from its own origins, so the site ships
// this snapshot and upgrades to live data where the browser is allowed to.
import { writeFileSync } from "node:fs";

const memes = await (await fetch("https://api.meme.cooking/meme")).json();
const counts = new Map();
for (const m of memes) {
  const t = (m.symbol ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{2,8}$/.test(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
}
const dups = [...counts].filter(([, n]) => n > 1).map(([ticker, count]) => ({ ticker, count }));
dups.sort((x, y) => y.count - x.count || x.ticker.localeCompare(y.ticker));
const out = {
  fetchedAt: new Date().toISOString().slice(0, 10),
  total: memes.length,
  sharing: dups.reduce((n, d) => n + d.count, 0),
  tickers: dups.length,
  top: dups.slice(0, 14),
};
writeFileSync(new URL("../web/src/radar.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(out);
