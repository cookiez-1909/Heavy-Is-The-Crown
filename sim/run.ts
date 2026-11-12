// node sim/run.ts            -> table for the default parameters
// node sim/run.ts --sweep    -> the same for three penalties, plus what the sell tax changes
import { DEFAULTS, scenarios, survives } from "./duel-sim.ts";

const f = (n: number, d = 1) => n.toFixed(d);
const ab = (x: number) => "AB"[x];

function table(penaltyBps: number, sellTax = true) {
  const rows = scenarios({ ...DEFAULTS, penaltyBps, sellTax });
  console.log(`\n### ${DEFAULTS.hours}h round, ${penaltyBps / 100}% penalty, ${sellTax ? "ramping sell tax" : "NO sell tax"}, ${DEFAULTS.virtualNear} NEAR virtual liquidity\n`);
  console.log("| Scenario | Reserve at start (A / B) | Net inflow at bell (A / B) | Score, NEAR-hours (A / B) | Winner | Total-reserve rule would pick | Loser's reserve moved | of which sell tax | Spoils | Winner price bump | Supply after |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const first = r.points[0];
    const last = r.points[r.points.length - 1];
    console.log(
      `| ${r.name} | ${f(first.reserve[0], 0)} / ${f(first.reserve[1], 0)} | ${f(last.inflow[0])} / ${f(last.inflow[1])} | ${f(last.score[0], 0)} / ${f(last.score[1], 0)} | **${ab(r.winner)}** | ${ab(r.naiveWinner)}${r.naiveWinner !== r.winner ? " ⚠" : ""} | ${f(r.loserReserve)} NEAR | ${f(r.loserTax)} | ${f(r.spoils)} | +${f(r.winnerPriceBump)}% | ${(r.supplyAfter[r.winner] / 1e6).toFixed(0)}M ${ab(r.winner)} |`,
    );
  }
}

if (process.argv.includes("--sweep")) {
  for (const p of [1000, 1500, 3000]) table(p);
  table(1500, false);
} else table(DEFAULTS.penaltyBps);

console.log("\n### What is left of a stake that keeps landing on the losing side\n");
console.log("| Penalty per round | lost 1 round | lost 2 rounds | lost 3 rounds |");
console.log("|---|---|---|---|");
for (const p of [1000, 1500, 3000]) console.log(`| ${p / 100}% | ${f(survives(p, 1), 0)}% | ${f(survives(p, 2), 0)}% | ${f(survives(p, 3), 0)}% |`);
