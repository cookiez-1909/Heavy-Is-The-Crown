import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import "./pitch.css";
import { DupRows, listingUrl, radarSnapshot as radar } from "../Radar";
import Chart from "../Chart";
import { DEFAULTS, scenarios } from "../../../sim/duel-sim.ts";
import { ARENA } from "../config";

const pct = Math.round((radar.sharing / radar.visible) * 100);
const top = radar.top[0];

function Coin({ c, label, dead }: { c: string; label?: string; dead?: boolean }) {
  return (
    <span className={`pc ${dead ? "dead" : ""}`} style={{ background: c }}>
      🐸{label && <small>{label}</small>}
    </span>
  );
}

const COPIES = ["#2f9e62", "#1f7ae0", "#7a4fd6", "#c2452f"];

function MiniBracket() {
  return (
    <div className="minibracket" aria-hidden>
      <div className="mbcol">
        {COPIES.map((c, i) => (
          <Coin key={c} c={c} dead={i === 0 || i === 2} />
        ))}
      </div>
      <svg viewBox="0 0 60 200" preserveAspectRatio="none">
        <path d="M0 25 H30 V75 H0 M30 50 H60 M0 125 H30 V175 H0 M30 150 H60" />
      </svg>
      <div className="mbcol two">
        <Coin c={COPIES[1]} dead />
        <Coin c={COPIES[3]} />
      </div>
      <svg viewBox="0 0 60 200" preserveAspectRatio="none">
        <path d="M0 50 H30 V150 H0 M30 100 H60" />
      </svg>
      <div className="mbcol one">
        <span className="crown">
          <Coin c={COPIES[3]} />
        </span>
      </div>
    </div>
  );
}

function ScoreSlide() {
  const r = useMemo(() => scenarios(DEFAULTS)[1], []);
  return (
    <div className="chartwrap">
      <Chart result={r} metric="score" />
      <p className="cap">
        Simulated 24 h round. A starts with 150 NEAR absorbed earlier and no new buyers; B starts with 5 NEAR and keeps attracting them. B wins {Math.round(r.points[r.points.length - 1].score[1])} to {Math.round(r.points[r.points.length - 1].score[0])} NEAR-hours. <code>node sim/run.ts</code>
      </p>
    </div>
  );
}

const SLIDES: { kicker: string; node: React.ReactNode }[] = [
  {
    kicker: "NEAR HACKATHON · MEMECOINS WITH MECHANICS",
    node: (
      <div className="two">
        <div>
          <h1>
            One ticker.
            <br />
            One <em>survivor.</em>
          </h1>
          <p className="sub">A launchpad where every coin with the same ticker lands in the same bracket. Each round the weaker copy's liquidity moves to the stronger one.</p>
          <p className="tag">live on NEAR testnet · {ARENA || "arena-82872.memeduel-4a2d2e.testnet"}</p>
        </div>
        <MiniBracket />
      </div>
    ),
  },
  {
    kicker: "THE PROBLEM",
    node: (
      <div className="two">
        <div>
          <h1>
            {top.creators} accounts listed <em>${top.ticker}.</em>
          </h1>
          <p className="sub">One click to launch means every joke gets copied: same ticker, different deployer. Traders call it PVP. Each card is a real ${top.ticker} listing on meme.cooking; only {top.listings.filter((l) => l.launched).length} of the {top.listings.length} reached its soft cap. Click one to check.</p>
          <p className="tag">source: api.meme.cooking · {radar.fetchedAt}</p>
        </div>
        <div className="wall">
          {top.listings.map((l, i) => (
            <a key={l.id} href={listingUrl(l.id)} target="_blank" rel="noreferrer" className={l.launched ? "ok" : ""} style={{ animationDelay: `${i * 90}ms` }}>
              <b>${top.ticker}</b>
              <span>{l.name}</span>
              <small>
                by {l.owner.length > 22 ? l.owner.slice(0, 20) + "…" : l.owner} · {l.launched ? "launched" : "soft cap missed"}
              </small>
              <small>meme.cooking/meme/{l.id}</small>
            </a>
          ))}
        </div>
      </div>
    ),
  },
  {
    kicker: "HOW COMMON",
    node: (
      <div className="two wide">
        <div>
          <div className="huge">{radar.tickers}</div>
          <h2>tickers on meme.cooking were listed by two or more different accounts.</h2>
          <p className="sub">
            {radar.sharing} of the {radar.visible} listings the site displays ({pct}%). One dot is one listing and links to it; gold ones launched. Search any ticker on meme.cooking and you will count the same cards.
          </p>
          <p className="tag">node scripts/radar.mjs</p>
        </div>
        <DupRows data={radar} rows={9} />
      </div>
    ),
  },
  {
    kicker: "THE MECHANIC",
    node: (
      <>
        <h1>
          Same ticker, <em>same bracket.</em>
        </h1>
        <div className="versus2">
          <div className="box">
            <h3>Any launchpad today</h3>
            <div className="lanes">
              {COPIES.map((c, i) => (
                <div key={c}>
                  <Coin c={c} />
                  <i style={{ width: `${[38, 30, 18, 14][i]}%` }} />
                </div>
              ))}
            </div>
            <p>Four copies, four thin pools. Buyers guess which one is "the" coin.</p>
          </div>
          <div className="arrow">→</div>
          <div className="box hot">
            <h3>Ticker Bracket</h3>
            <div className="lanes">
              <div>
                <Coin c={COPIES[3]} />
                <i className="merged" style={{ width: "92%" }} />
              </div>
            </div>
            <p>The copies are paired off round by round. Each loser's liquidity and holders move into its winner, until one coin holds all of it.</p>
          </div>
        </div>
      </>
    ),
  },
  {
    kicker: "ONE ROUND",
    node: (
      <>
        <h1>
          Four steps, <em>all on-chain.</em>
        </h1>
        <ol className="flow">
          <li>
            <b>Register</b>
            <span>The first coin of a ticker opens the bracket. Copies join during registration, each with a bonded seed. Then the ticker locks.</span>
          </li>
          <li>
            <b>Fight</b>
            <span>The contract pairs best against worst. Score = new NEAR this round × how long it stayed.</span>
          </li>
          <li>
            <b>Bell</b>
            <span>Trading freezes. Anyone settles and earns a bounty. The two tokens compare scores themselves.</span>
          </li>
          <li>
            <b>Merge</b>
            <span>15% of the loser's reserve becomes the winner's spoils. 85% buys winner tokens for the loser's holders.</span>
          </li>
        </ol>
        <p className="tag">a later coin with the same ticker opens a new season against the champion</p>
      </>
    ),
  },
  {
    kicker: "WHY THE SCORE IS NOT THE WALLET SIZE",
    node: (
      <div className="two wide">
        <div>
          <h1>
            Old money <em>scores nothing.</em>
          </h1>
          <p className="sub">Each round counts only the NEAR that arrived in that round, weighted by time. A coin cannot win round two on what it absorbed in round one, and a whale cannot win in the last minute.</p>
        </div>
        <ScoreSlide />
      </div>
    ),
  },
  {
    kicker: "EXPLOITS WE DESIGNED AGAINST",
    node: (
      <>
        <h1>
          Every cheap trick <em>has a price.</em>
        </h1>
        <table className="exploits">
          <tbody>
            {[
              ["Run before the bell", "Sell tax ramps to exactly the loser's penalty; the tax stays in the curve"],
              ["Winners dump on converted holders", "Sell tax restarts at the penalty on a win, then decays"],
              ["Win on absorbed liquidity", "Only inflow since the round started is scored"],
              ["Sell in the break, buy back to fake inflow", "Round base never drops below the reserve at the last bell"],
              ["Last-minute whale", "Inflow is weighted by time held"],
              ["Stuff the bracket with empty copies", "Launch fee plus a seed that is at stake"],
              ["Open a second bracket for the ticker", "One live tournament per ticker, enforced by the arena"],
              ["Nobody settles", "Settling and advancing pay a bounty to anyone"],
            ].map(([a, c]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tag">none is a complete defence: README, "Known limits"</p>
      </>
    ),
  },
  {
    kicker: "WHO CAN CHANGE THE RULES",
    node: (
      <>
        <h1>
          <em>Nobody.</em> Check it yourself.
        </h1>
        <div className="facts">
          <div>
            <strong>0</strong>
            <b>access keys on the arena</b>
            <span>The deploy script deletes its only key. No owner, no admin method, no upgrade.</span>
            <code>near account list-keys {ARENA || "arena-82872.memeduel-4a2d2e.testnet"}</code>
          </div>
          <div>
            <strong>1</strong>
            <b>token code, pinned by hash</b>
            <span>Every coin is a sub-account running the same NEAR global contract. Launching costs 0.25 NEAR instead of ~2.3.</span>
            <code>5LpgXeEt…pfAHsC</code>
          </div>
          <div>
            <strong>0</strong>
            <b>backends</b>
            <span>The rules are in the NEP-141 itself. The site reads the RPC and sends wallet transactions.</span>
            <code>get_config · get_info · get_trades</code>
          </div>
        </div>
      </>
    ),
  },
  {
    kicker: "RECEIPTS",
    node: (
      <>
        <h1>
          Built, tested, <em>played.</em>
        </h1>
        <table className="receipts">
          <tbody>
            <tr>
              <td>Unit tests on the token</td>
              <td>15 pass</td>
              <td>cargo test -p duel-token</td>
            </tr>
            <tr>
              <td>End-to-end brackets on a NEAR sandbox</td>
              <td>3 pass</td>
              <td>cargo test -p duel-tests</td>
            </tr>
            <tr>
              <td>4 coins → semi-finals → final → season 2</td>
              <td>covered</td>
              <td>tests/tests/duel.rs</td>
            </tr>
            <tr>
              <td>A $KEK bracket played to a champion on testnet</td>
              <td>tournament 0</td>
              <td>get_tournament {"{"}"id":0{"}"}</td>
            </tr>
            <tr>
              <td>Match scenarios simulated before picking 15%</td>
              <td>5 × 4</td>
              <td>node sim/run.ts --sweep</td>
            </tr>
            <tr>
              <td>Bracket UI against real contract state, no funds needed</td>
              <td>local chain</td>
              <td>cargo run -p duel-tests --example localnet</td>
            </tr>
          </tbody>
        </table>
        <p className="tag">partner tech: meme.cooking API for the duplicate data · HOT near-connect for wallets</p>
      </>
    ),
  },
  {
    kicker: "TRY IT",
    node: (
      <>
        <h1>
          Launch a copy. <em>Then beat it.</em>
        </h1>
        <pre className="term">
          <span>$</span> scripts/build.sh && cargo test{"\n"}
          <span>$</span> cargo run -p duel-tests --example localnet{"\n"}
          <span>$</span> cd web && pnpm install && pnpm dev
        </pre>
        <p className="sub">What it does not do: it cannot touch copies launched elsewhere, it counts NEAR rather than people, and the sell tax discourages running without preventing it. Not audited.</p>
        <p className="tag">
          <a href="../">open the app →</a>
        </p>
      </>
    ),
  },
];

function Deck() {
  const read = () => Math.min(SLIDES.length, Math.max(1, parseInt(window.location.hash.slice(1)) || 1));
  const [n, setN] = useState(read);
  useEffect(() => {
    const go = (d: number) => {
      const next = Math.min(SLIDES.length, Math.max(1, read() + d));
      window.location.hash = String(next);
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) (e.preventDefault(), go(1));
      if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) (e.preventDefault(), go(-1));
      if (e.key === "Home") window.location.hash = "1";
      if (e.key === "End") window.location.hash = String(SLIDES.length);
      if (e.key === "Escape") window.location.href = "../";
    };
    const onHash = () => setN(read());
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  const s = SLIDES[n - 1];
  const pad = (x: number) => String(x).padStart(2, "0");
  return (
    <div className="deck">
      <div className="progress" style={{ width: `${(n / SLIDES.length) * 100}%` }} />
      <a className="exit" href="../" title="Back to the app (Esc)">
        ✕ <span>Exit to app</span>
      </a>
      <section className="slide" key={n} aria-label={`Slide ${n} of ${SLIDES.length}`}>
        <p className="kicker">{s.kicker}</p>
        {s.node}
      </section>
      <footer>
        <a href="../">
          TICKER<span>BRACKET</span>
        </a>
        <nav>
          <a className={n === 1 ? "off" : ""} href={`#${Math.max(1, n - 1)}`} aria-label="Previous slide">
            ←
          </a>
          <span>
            {pad(n)} / {pad(SLIDES.length)}
          </span>
          <a className={n === SLIDES.length ? "off" : ""} href={`#${Math.min(SLIDES.length, n + 1)}`} aria-label="Next slide">
            →
          </a>
        </nav>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Deck />
  </StrictMode>,
);
