import { useMemo, useState } from "react";
import { DEFAULTS, scenarios, survives } from "../../sim/duel-sim.ts";
import { ARENA, EXPLORER } from "./config";
import { view } from "./near";
import { duration, near } from "./fmt";
import { usePoll } from "./shared";
import Chart, { METRICS, type Metric } from "./Chart";
import type { Config } from "./types";

export default function Rules() {
  const { data: cfg } = usePoll(() => view<Config>(ARENA, "get_config"), [], 60_000);
  const penalty = cfg?.penalty_bps ?? DEFAULTS.penaltyBps;
  const virtualNear = cfg ? Number(BigInt(cfg.virtual_near) / 10n ** 24n) : DEFAULTS.virtualNear;
  const results = useMemo(() => scenarios({ ...DEFAULTS, penaltyBps: penalty, virtualNear }), [penalty, virtualNear]);
  const [pick, setPick] = useState(1);
  const [metric, setMetric] = useState<Metric>("score");
  const r = results[pick];
  const ab = (i: number) => "AB"[i];
  const pct = penalty / 100;

  return (
    <div className="rules">
      <h1>The rules</h1>
      <p className="lead">
        Everything on this page is enforced by the contracts. The arena has no owner and no access key, the tokens have no admin method, and the token code is pinned by hash. Nobody can change a number after launch.
      </p>

      <div className="params">
        <div>
          <dt>Registration</dt>
          <dd>{cfg ? duration(cfg.registration_ns) : "…"}</dd>
        </div>
        <div>
          <dt>Each round</dt>
          <dd>{cfg ? duration(cfg.round_ns) : "…"}</dd>
        </div>
        <div>
          <dt>Penalty / top sell tax</dt>
          <dd>{pct}%</dd>
        </div>
        <div>
          <dt>Coins per bracket</dt>
          <dd>{cfg ? `up to ${cfg.max_entrants}` : "…"}</dd>
        </div>
        <div>
          <dt>Minimum seed</dt>
          <dd>{cfg ? `${near(cfg.min_seed, 3)} NEAR` : "…"}</dd>
        </div>
        <div>
          <dt>Post-win tax decay</dt>
          <dd>{cfg ? duration(cfg.cooldown_ns) : "…"}</dd>
        </div>
        <div>
          <dt>Curve depth</dt>
          <dd>{virtualNear} NEAR virtual</dd>
        </div>
        <div>
          <dt>Launch fee</dt>
          <dd>{cfg ? `${near(cfg.launch_fee)} NEAR` : "…"}</dd>
        </div>
      </div>
      <p className="muted">
        Read live from{" "}
        <a href={`${EXPLORER}/address/${ARENA}`} target="_blank" rel="noreferrer">
          {ARENA}
        </a>
        {cfg && <> · token code hash {cfg.token_code_hash}</>}
      </p>

      <ol className="rulelist">
        <li>
          <b>One bracket per ticker.</b> The first coin launched with a ticker opens its bracket. Every coin launched with that ticker during registration joins it. After registration the ticker is locked until one coin is left.
        </li>
        <li>
          <b>Creators post a seed.</b> The seed buys the creator's first tokens from the coin's own curve, so an empty copy cannot take a slot for free.
        </li>
        <li>
          <b>Seeding is by score.</b> When a round closes the arena ranks the survivors by their score and pairs best against worst. With an odd number, the top seed sits the round out.
        </li>
        <li>
          <b>Score is new NEAR × time.</b> Each round a coin scores only the NEAR that came in since the round started, for as long as it stays. Liquidity it already had, including what it absorbed, scores nothing. Net outflow scores negative.
        </li>
        <li>
          <b>Selling is taxed, and the tax stays in the curve.</b> It ramps from 0 to {pct}% over the round, so leaving just before the bell costs the same as losing. After a win it restarts at {pct}% and decays, so winners cannot dump on the holders who were just converted in.
        </li>
        <li>
          <b>At the bell, trading freezes.</b> Anyone can settle a match and is paid 1% of the loser's reserve (at most 0.05 NEAR). The two tokens compare scores themselves.
        </li>
        <li>
          <b>The loser is absorbed.</b> {pct}% of its reserve enters the winner's curve with no tokens minted. The other {100 - pct}% buys winner tokens, which the loser's holders claim pro rata by burning their dead coin.
        </li>
        <li>
          <b>The champion defends.</b> A later coin with the same ticker opens a new season, and the reigning champion is automatically entered in it.
        </li>
      </ol>

      <h2>One match under different crowds</h2>
      <p className="muted">
        Simulated before launch with the contract's formulas (<code>sim/duel-sim.ts</code>): one {DEFAULTS.hours}-hour round between coin A and coin B, using this arena's penalty and curve depth.
      </p>
      <div className="filters">
        <div className="tabs" role="tablist" aria-label="Scenario">
          {results.map((x, i) => (
            <button key={x.name} role="tab" aria-selected={i === pick} className={i === pick ? "on" : ""} onClick={() => setPick(i)}>
              {x.name}
            </button>
          ))}
        </div>
        <div className="tabs" role="tablist" aria-label="Measure">
          {METRICS.map((m) => (
            <button key={m.key} role="tab" aria-selected={m.key === metric} className={m.key === metric ? "on" : ""} onClick={() => setMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="story">{r.story}</p>
      <Chart result={r} metric={metric} />
      <p className="verdict">
        <b>{ab(r.winner)} wins on score.</b>{" "}
        {r.naiveWinner !== r.winner ? `A rule that counted total NEAR in the curve at the bell would have picked ${ab(r.naiveWinner)}.` : "Counting total NEAR in the curve would give the same winner here."}{" "}
        {r.loserReserve.toFixed(1)} NEAR moves to the winner{r.loserTax >= 0.05 ? `, ${r.loserTax.toFixed(1)} of it sell tax left behind by holders who ran` : ""}; {r.spoils.toFixed(1)} NEAR of that is spoils, lifting the winner's price by {r.winnerPriceBump.toFixed(1)}%.
      </p>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Winner</th>
              <th>Net inflow A / B</th>
              <th>Loser's reserve moved</th>
              <th>of which sell tax</th>
              <th>Spoils</th>
              <th>Winner price</th>
              <th>Supply after</th>
            </tr>
          </thead>
          <tbody>
            {results.map((x) => {
              const l = x.points[x.points.length - 1];
              return (
                <tr key={x.name}>
                  <td>{x.name}</td>
                  <td>
                    {ab(x.winner)}
                    {x.naiveWinner !== x.winner && ` (total reserve: ${ab(x.naiveWinner)})`}
                  </td>
                  <td>
                    {l.inflow[0].toFixed(1)} / {l.inflow[1].toFixed(1)}
                  </td>
                  <td>{x.loserReserve.toFixed(1)} NEAR</td>
                  <td>{x.loserTax.toFixed(1)}</td>
                  <td>{x.spoils.toFixed(1)}</td>
                  <td>+{x.winnerPriceBump.toFixed(1)}%</td>
                  <td>
                    {(x.supplyAfter[x.winner] / 1e6).toFixed(0)}M {ab(x.winner)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Losing more than once</h2>
      <p className="muted">A holder who is converted into a coin that then loses again is converted again. What is left of the stake, at this arena's {pct}% penalty:</p>
      <div className="params three">
        {[1, 2, 3].map((k) => (
          <div key={k}>
            <dt>
              after {k} lost round{k > 1 ? "s" : ""}
            </dt>
            <dd>{survives(penalty, k).toFixed(0)}%</dd>
          </div>
        ))}
      </div>

      <h2>Known limits</h2>
      <ul className="limits">
        <li>Score counts NEAR, not people. A wallet with enough NEAR can carry a coin through a round alone. It has to bring that NEAR in during the round and leave it there, taxed on the way out. Splitting across wallets changes nothing, so there is no sybil angle, and no "one person, one vote" either.</li>
        <li>The sell tax makes running before the bell no cheaper than losing. It does not force anyone to stay: see "Run for the exit", where almost all of the loser's liquidity leaves and the winner receives only the tax.</li>
        <li>Spoils are locked liquidity. They lift the winner's price for every holder, but holders can only withdraw part of them; the rest stays in the curve as a floor.</li>
        <li>A bracket holds a fixed number of coins. Filling the remaining slots with seeded copies to shut a rival out is possible; it costs one fee and one seed per slot, and those seeds are lost to whoever beats them.</li>
        <li>Only coins launched here are in the bracket. Copies launched on other launchpads are out of reach.</li>
        <li>Each trade pays a flat 0.002 NEAR that stays in the token contract to pay for the on-chain log.</li>
      </ul>
    </div>
  );
}
