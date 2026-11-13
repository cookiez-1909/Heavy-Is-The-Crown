import { Fragment, StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import "../extras.css";
import "../herobracket.css";
import "./pitch.css";
import { DupRows, radarSnapshot as radar } from "../Radar";
import { dex, DexRows, isSelf, when } from "../Dex";
import Chart from "../Chart";
import { DEFAULTS, scenarios } from "../../../sim/duel-sim.ts";
import { ARENA } from "../config";
import { COPIES, HeroBracket } from "../HeroBracket";

const ARENA_ID = ARENA || "arena-33881.memeduel-4a2d2e.testnet";
const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const topDex = dex.rows[0];

// ------------------------------------------------------------ motion pieces

/** Headline that rises word by word. Parts wrapped in [] are gold. */
function H({ parts, small }: { parts: (string | [string])[]; small?: boolean }) {
  let k = 0;
  return (
    <h1 className={small ? "small" : ""}>
      {parts.map((p, i) => {
        const gold = Array.isArray(p);
        const text = gold ? p[0] : p;
        return (
          <Fragment key={i}>
            {text.split(" ").map((w, j) => (
              <Fragment key={j}>
                <span className={`w ${gold ? "g" : ""}`} style={{ animationDelay: `${k++ * 70}ms` }}>
                  {w}
                </span>{" "}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </h1>
  );
}

function Count({ to, ms = 1300 }: { to: number; ms?: number }) {
  const [v, setV] = useState(still ? to : 0);
  useEffect(() => {
    if (still) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{v.toLocaleString("en-US")}</>;
}

/** Four thin pools pour into one. */
function MergeBars() {
  return (
    <div className="versus2">
      <div className="box">
        <h3>Any launchpad today</h3>
        <div className="lanes">
          {COPIES.map((c, i) => (
            <div key={c}>
              <span className="pc" style={{ background: c }}>
                🐸
              </span>
              <i style={{ width: `${[38, 30, 18, 14][i]}%` }} />
            </div>
          ))}
        </div>
        <p>Four copies, four thin pools. Buyers guess which one is "the" coin.</p>
      </div>
      <div className="arrow">→</div>
      <div className="box hot">
        <h3>Ticker Bracket</h3>
        <div className="lanes pour">
          {COPIES.map((c, i) => (
            <div key={c} className={i === 3 ? "keep" : "drain"} style={{ ["--w" as string]: `${[38, 30, 18, 14][i]}%`, ["--d" as string]: `${i * 0.5}s` }}>
              <span className="pc" style={{ background: c }}>
                🐸
              </span>
              <i />
            </div>
          ))}
        </div>
        <p>Copies are paired off round by round. Each loser's liquidity and holders move into its winner, until one coin holds all of it.</p>
      </div>
    </div>
  );
}

const STEPS: [string, string][] = [
  ["Register", "The first coin of a ticker opens the bracket. Copies join during registration, each with a bonded seed. Then the ticker locks."],
  ["Fight", "The contract pairs best against worst. Score = new NEAR this round × how long it stayed."],
  ["Bell", "Trading freezes. Anyone settles and earns a bounty. The two tokens compare scores themselves."],
  ["Merge", "15% of the loser's reserve becomes the winner's spoils. 85% buys winner tokens for the loser's holders."],
];

function Steps() {
  const [on, setOn] = useState(still ? -1 : 0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setOn((x) => (x + 1) % STEPS.length), 1700);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <div className="rail">
        <i style={{ width: `${on < 0 ? 100 : ((on + 1) / STEPS.length) * 100}%` }} />
      </div>
      <ol className="flow">
        {STEPS.map(([t, d], i) => (
          <li key={t} className={i === on ? "on" : ""}>
            <b>{t}</b>
            <span>{d}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** The sell tax over one round, a win, and the start of the next round. */
function TaxCurve() {
  const d = "M60 210 L300 60 L375.5 185.8 L560 60";
  return (
    <svg className="taxcurve" viewBox="0 0 620 270" role="img" aria-label="Sell tax rises from 0 to 15 percent over a round, restarts at 15 percent after a win and fades, then rises again in the next round">
      <rect x="300" y="40" width="40" height="170" className="break" />
      <line x1="60" y1="210" x2="580" y2="210" className="axis" />
      <line x1="60" y1="60" x2="580" y2="60" className="guide" />
      <text x="52" y="64" textAnchor="end" className="lbl">
        15%
      </text>
      <text x="52" y="214" textAnchor="end" className="lbl">
        0%
      </text>
      <text x="180" y="236" textAnchor="middle" className="lbl">
        round 1
      </text>
      <text x="320" y="236" textAnchor="middle" className="lbl">
        break
      </text>
      <text x="450" y="236" textAnchor="middle" className="lbl">
        round 2
      </text>
      <path d={d} className="taxline" pathLength="1" />
      <circle cx="300" cy="60" r="5" className="bell" />
      <text x="300" y="34" textAnchor="middle" className="call">
        bell: same as the loser's penalty
      </text>
      <text x="320" y="258" textAnchor="middle" className="lbl">
        after a win it stays at the top, fades through the break, then climbs again
      </text>
      {!still && (
        <circle r="7" className="rider">
          <animateMotion dur="6s" repeatCount="indefinite" path={d} />
        </circle>
      )}
    </svg>
  );
}

function ScoreSlide() {
  const r = useMemo(() => scenarios(DEFAULTS)[1], []);
  const last = r.points[r.points.length - 1];
  return (
    <div className="chartwrap">
      <Chart result={r} metric="score" />
      <p className="cap">
        Simulated {DEFAULTS.hours} h round. A starts with 150 NEAR absorbed earlier and no new buyers; B starts with 5 NEAR and keeps attracting them. B wins {Math.round(last.score[1])} to {Math.round(last.score[0])} NEAR-hours. <code>node sim/run.ts</code>
      </p>
    </div>
  );
}

// -------------------------------------------------------------------- slides

const SLIDES: { kicker: string; node: React.ReactNode }[] = [
  {
    kicker: "NEAR HACKATHON · MEMECOINS WITH MECHANICS",
    node: (
      <div className="two">
        <div>
          <H parts={["One ticker.", "One", ["survivor."]]} />
          <p className="sub">A launchpad where every coin with the same ticker lands in the same bracket. Each round the weaker copy's liquidity moves to the stronger one.</p>
          <p className="tag">live on NEAR testnet · {ARENA_ID}</p>
        </div>
        <HeroBracket />
      </div>
    ),
  },
  {
    kicker: "THE PROBLEM",
    node: (
      <div className="two">
        <div>
          <H parts={["One ticker.", [`${topDex.tokens.length}${topDex.pairsReturned >= 30 ? "+" : ""} tokens.`]]} />
          <p className="sub">
            ${topDex.symbol.toUpperCase()} is one of the most promoted tokens on DexScreener. Search the ticker and you get at least <b>{topDex.tokens.length} different token contracts</b> with that name. Launching takes one click, so every joke gets launched again and again, and buyers are split between them.
          </p>
          <p className="tag">every chip is a real token: click to open it · DexScreener, {when(dex)}</p>
        </div>
        <div className="swarm">
          {topDex.tokens.map((t, i) => (
            <a key={t.chain + t.address} href={t.url} target="_blank" rel="noreferrer" className={isSelf(topDex, t) ? "self" : ""} style={{ animationDelay: `${200 + i * 45}ms` }} title={`${t.name} · $${t.liquidity.toLocaleString("en-US")} liquidity`}>
              <b>${topDex.symbol.toUpperCase()}</b>
              <small>{t.chain}</small>
            </a>
          ))}
        </div>
      </div>
    ),
  },
  {
    kicker: "HOW COMMON · DEXSCREENER",
    node: (
      <div className="two wide">
        <div>
          <div className="huge">
            <Count to={dex.shared} />
            <small>/{dex.promoted}</small>
          </div>
          <h2>of the tokens promoted most on DexScreener share their ticker with another token.</h2>
          <p className="sub">
            {dex.ten} of them with nine or more others. At least <Count to={dex.totalTokens} /> token contracts on {dex.promoted} tickers. The list is DexScreener's own, not ours.
          </p>
          <p className="tag">one dot = one token, click it · counts with + hit the 30-result cap · node scripts/dexscreener.mjs</p>
        </div>
        <DexRows rows={9} />
      </div>
    ),
  },
  {
    kicker: "AND ON NEAR · MEME.COOKING",
    node: (
      <div className="two wide">
        <div>
          <div className="huge">
            <Count to={radar.tickers} />
          </div>
          <h2>tickers on meme.cooking were listed by two or more different accounts.</h2>
          <p className="sub">
            {radar.sharing} of the {radar.visible} listings the site displays. Smaller than on Solana, same pattern. Gold dots launched; red ones never reached their soft cap.
          </p>
          <p className="tag">one dot = one listing, click it · node scripts/radar.mjs</p>
        </div>
        <DupRows data={radar} rows={9} />
      </div>
    ),
  },
  {
    kicker: "THE MECHANIC",
    node: (
      <>
        <H parts={["Same ticker,", ["same bracket."]]} />
        <MergeBars />
      </>
    ),
  },
  {
    kicker: "WHY LAUNCH HERE",
    node: (
      <>
        <H parts={["Your ticker,", ["shielded."]]} />
        <div className="facts">
          <div>
            <strong>1st</strong>
            <b>The original defends</b>
            <span>Once your coin is champion, every later copy of the ticker has to beat it first. A copy that loses brings you its liquidity and its holders.</span>
          </div>
          <div>
            <strong>1%</strong>
            <b>Paid to the winner's creator</b>
            <span>Out of the 15% penalty, from every coin the winner absorbs. Launching the coin people back pays.</span>
          </div>
          <div>
            <strong>≈85%</strong>
            <b>Back to a loser's holders</b>
            <span>As the winner's tokens. Backing the wrong copy costs part of the stake, not all of it.</span>
          </div>
        </div>
        <p className="tag">only coins launched here are in a bracket · a launchpad such as meme.cooking could route its same-ticker launches here; nobody has agreed to that</p>
      </>
    ),
  },
  {
    kicker: "ONE ROUND",
    node: (
      <>
        <H parts={["Four steps,", ["all on-chain."]]} />
        <Steps />
        <p className="tag">a later coin with the same ticker opens a new season against the champion</p>
      </>
    ),
  },
  {
    kicker: "WHY THE SCORE IS NOT THE WALLET SIZE",
    node: (
      <div className="two wide">
        <div>
          <H small parts={["Old money", ["scores nothing."]]} />
          <p className="sub">Each round counts only the NEAR that arrived in that round, weighted by time. A coin cannot win round two on what it absorbed in round one, and a whale cannot win in the last minute.</p>
        </div>
        <ScoreSlide />
      </div>
    ),
  },
  {
    kicker: "WHY NOBODY RUNS AT THE BELL",
    node: (
      <div className="two wide">
        <div>
          <H small parts={["Leaving costs", ["what losing costs."]]} />
          <p className="sub">The sell tax climbs to exactly the loser's penalty at the bell, so dodging the result is no cheaper than taking it. After a win it starts again at the top and fades, so winners cannot dump on the holders who were just converted in. The tax never leaves the coin's curve.</p>
        </div>
        <TaxCurve />
      </div>
    ),
  },
  {
    kicker: "EXPLOITS WE DESIGNED AGAINST",
    node: (
      <>
        <H small parts={["Every cheap trick", ["has a price."]]} />
        <table className="exploits">
          <tbody>
            {[
              ["Run before the bell", "Sell tax ramps to exactly the loser's penalty; the tax stays in the curve"],
              ["Winners dump on converted holders", "Sell tax restarts at the penalty on a win, then decays"],
              ["Win on absorbed liquidity", "Only inflow since the round started is scored"],
              ["Sell in the break, buy back to fake inflow", "Round base never drops below the reserve at the last bell"],
              ["One whale carries a coin", "Inflow is weighted by time held, and one wallet counts for at most 2 NEAR a round"],
              ["Stuff the bracket with empty copies", "One coin per account, and every empty copy's seed flows to whoever beats it"],
              ["Open a second bracket for the ticker", "One live tournament per ticker, enforced by the arena"],
              ["Nobody settles", "Settling and advancing pay a bounty to anyone"],
            ].map(([a, c], i) => (
              <tr key={a} style={{ animationDelay: `${250 + i * 90}ms` }}>
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
        <H parts={[["Nobody."], "Check it yourself."]} />
        <div className="facts">
          <div>
            <strong>0</strong>
            <b>access keys on the arena</b>
            <span>The deploy script deletes its only key. No owner, no admin method, no upgrade.</span>
            <code>near account list-keys {ARENA_ID}</code>
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
        <H small parts={["Built, tested,", ["played."]]} />
        <table className="receipts">
          <tbody>
            {[
              ["Unit tests on the token", "17 pass", "cargo test -p duel-token"],
              ["End-to-end brackets on a NEAR sandbox", "3 pass", "cargo test -p duel-tests"],
              ["4 coins → semi-finals → final → season 2", "covered", "tests/tests/duel.rs"],
              ["A $KEK bracket played to a champion on testnet", "tournament 0", 'get_tournament {"id":0}'],
              ["Match scenarios simulated before picking 15%", "5 × 4", "node sim/run.ts --sweep"],
              ["Bracket UI against real contract state, no funds needed", "local chain", "cargo run -p duel-tests --example localnet"],
            ].map(([a, b, c], i) => (
              <tr key={a} style={{ animationDelay: `${250 + i * 90}ms` }}>
                <td>{a}</td>
                <td>{b}</td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tag">partner tech: meme.cooking API for the NEAR data · HOT near-connect for wallets</p>
      </>
    ),
  },
  {
    kicker: "TRY IT",
    node: (
      <>
        <H parts={["Launch a copy.", ["Then beat it."]]} />
        <pre className="term">
          <span>$</span> scripts/build.sh && cargo test{"\n"}
          <span>$</span> cargo run -p duel-tests --example localnet{"\n"}
          <span>$</span> cd web && pnpm install && pnpm dev<i className="caret" />
        </pre>
        <p className="sub">What it does not do: it cannot touch copies launched elsewhere, it counts NEAR rather than people, and the sell tax discourages running without preventing it. Not audited.</p>
        <p className="tag">
          <a href="../">open the app →</a>
        </p>
      </>
    ),
  },
];

const AUTO_MS = 9000;

function Deck() {
  const read = () => Math.min(SLIDES.length, Math.max(1, parseInt(window.location.hash.slice(1)) || 1));
  const [n, setN] = useState(read);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const go = (d: number) => {
      window.location.hash = String(Math.min(SLIDES.length, Math.max(1, read() + d)));
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) (e.preventDefault(), go(1));
      if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) (e.preventDefault(), go(-1));
      if (e.key === "Home") window.location.hash = "1";
      if (e.key === "End") window.location.hash = String(SLIDES.length);
      if (e.key === "Escape") window.location.href = "../";
      if (e.key.toLowerCase() === "p") setPlaying((x) => !x);
    };
    const onHash = () => setN(read());
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    if (n >= SLIDES.length) return setPlaying(false);
    const id = setTimeout(() => (window.location.hash = String(n + 1)), AUTO_MS);
    return () => clearTimeout(id);
  }, [playing, n]);

  const s = SLIDES[n - 1];
  const pad = (x: number) => String(x).padStart(2, "0");
  return (
    <div className="deck">
      <div className="bg" aria-hidden>
        <i />
        <i />
      </div>
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
          <button className={playing ? "on" : ""} onClick={() => setPlaying((x) => !x)} title="Play the deck automatically (P)" aria-pressed={playing}>
            {playing ? "❚❚ Pause" : "▶ Play"}
            {playing && <i key={n} style={{ animationDuration: `${AUTO_MS}ms` }} />}
          </button>
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
