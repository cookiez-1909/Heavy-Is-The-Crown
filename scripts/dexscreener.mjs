// Refreshes web/src/dex.json from DexScreener's public API (Node 24, no key).
//   node scripts/dexscreener.mjs
//
// Question: when a memecoin gets attention, how many other tokens carry the
// same ticker?
//
// Method, chosen so that nobody picks the tickers by hand:
//   1. Take DexScreener's "top boosts" list (the tokens currently promoted the
//      most on DexScreener):  GET /token-boosts/top/v1
//   2. For each token read its ticker:  GET /tokens/v1/{chain}/{address}
//   3. Search DexScreener for that ticker:  GET /latest/dex/search?q={ticker}
//   4. Count distinct token contracts (chain + address) in the answer whose
//      symbol equals the ticker, ignoring letter case.
//
// Limits: the search returns at most 30 pairs, so every count is a lower
// bound. "Same ticker" does not prove the other token is a copy of this one:
// for short generic tickers (MAX, ZEN) some are unrelated projects. The boost
// list changes during the day, so the snapshot is dated to the minute.
import { writeFileSync } from "node:fs";

const API = "https://api.dexscreener.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(API + path);
    if (r.ok) return r.json();
    if (attempt >= 3) throw new Error(`${path}: HTTP ${r.status}`);
    await sleep(1500 * (attempt + 1));
  }
}

const boosts = await get("/token-boosts/top/v1");
const seen = new Set();
const promoted = boosts.filter((b) => {
  const k = b.chainId + ":" + b.tokenAddress;
  return seen.has(k) ? false : (seen.add(k), true);
});

const rows = [];
for (const b of promoted) {
  const own = await get(`/tokens/v1/${b.chainId}/${b.tokenAddress}`);
  const self = own.find((p) => p.baseToken.address.toLowerCase() === b.tokenAddress.toLowerCase());
  if (!self) continue; // no trading pair yet: no ticker to read
  const symbol = self.baseToken.symbol;
  const found = await get("/latest/dex/search?q=" + encodeURIComponent(symbol));
  const tokens = new Map();
  for (const p of found.pairs ?? []) {
    if (p.baseToken.symbol.toUpperCase() !== symbol.toUpperCase()) continue;
    const key = p.chainId + ":" + p.baseToken.address;
    const liq = p.liquidity?.usd ?? 0;
    const t = tokens.get(key) ?? { chain: p.chainId, address: p.baseToken.address, name: p.baseToken.name.slice(0, 40), liquidity: 0, url: p.url, best: -1 };
    t.liquidity += liq;
    if (liq > t.best) (t.best = liq), (t.url = p.url);
    tokens.set(key, t);
  }
  const list = [...tokens.values()].map(({ best, ...t }) => ({ ...t, liquidity: Math.round(t.liquidity) })).sort((x, y) => y.liquidity - x.liquidity);
  rows.push({
    symbol,
    chain: b.chainId,
    address: b.tokenAddress,
    url: b.url,
    search: `${API}/latest/dex/search?q=${encodeURIComponent(symbol)}`,
    pairsReturned: found.pairs?.length ?? 0,
    tokens: list,
  });
  await sleep(220);
}

rows.sort((x, y) => y.tokens.length - x.tokens.length || x.symbol.localeCompare(y.symbol));
const chains = {};
for (const r of rows) for (const t of r.tokens) chains[t.chain] = (chains[t.chain] ?? 0) + 1;
const out = {
  fetchedAt: new Date().toISOString().slice(0, 16) + "Z",
  source: `${API}/token-boosts/top/v1`,
  promoted: rows.length,
  shared: rows.filter((r) => r.tokens.length >= 2).length,
  five: rows.filter((r) => r.tokens.length >= 5).length,
  ten: rows.filter((r) => r.tokens.length >= 10).length,
  totalTokens: rows.reduce((n, r) => n + r.tokens.length, 0),
  capped: rows.filter((r) => r.pairsReturned >= 30).length,
  chains: Object.fromEntries(Object.entries(chains).sort((a, b) => b[1] - a[1])),
  rows,
};
writeFileSync(new URL("../web/src/dex.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");

console.log(`${out.fetchedAt}: ${out.promoted} promoted tokens with a ticker`);
console.log(`  ${out.shared} share their ticker with at least one other token; ${out.five} with 4+ others; ${out.ten} with 9+ others`);
console.log(`  ${out.totalTokens} distinct tokens across those ${out.promoted} tickers (lower bound: ${out.capped} searches hit the 30-pair cap)`);
console.log("  by chain:", JSON.stringify(out.chains));
for (const r of rows) console.log(`  $${r.symbol}: ${r.tokens.length} tokens -> ${r.search}`);
