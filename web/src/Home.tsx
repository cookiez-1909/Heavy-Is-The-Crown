import { useEffect, useState } from "react";
import { ARENA } from "./config";
import { call, TGAS, view } from "./near";
import { countdown, duration, near, parseUnits } from "./fmt";
import { COLORS, EMOJI, makeIcon } from "./icon";
import { alive, Coin, ensureWallet, loadTournament, msLeft, roundName, unsettled, useAction, useNow, usePoll, type TState } from "./shared";
import type { Config, Tournament } from "./types";
import Radar from "./Radar";
import DexSection, { LiquiditySplit } from "./Dex";
import Faq from "./Faq";
import { Reveal } from "./shared";

async function loadHome() {
  const [config, count] = await Promise.all([view<Config>(ARENA, "get_config"), view<number>(ARENA, "tournament_count")]);
  const from = Math.max(0, count - 20);
  const list = await view<Tournament[]>(ARENA, "get_tournaments", { from_index: from, limit: 20 });
  const states = await Promise.all(list.reverse().map(loadTournament));
  return { config, states };
}

// --------------------------------------------------------------- launch form

function LaunchForm({ config, account, ticker, setTicker, done }: { config: Config; account: string | null; ticker: string; setTicker: (t: string) => void; done: () => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJI[0]);
  const [color, setColor] = useState(COLORS[0]);
  const minSeed = BigInt(config.min_seed);
  const [seedText, setSeedText] = useState(near(minSeed, 3));
  const [existing, setExisting] = useState<Tournament | null | undefined>(undefined);
  const { busy, run } = useAction(done);
  const now = useNow();
  const sym = ticker.toUpperCase();
  const validTicker = /^[A-Z0-9]{2,8}$/.test(sym);

  useEffect(() => {
    setExisting(undefined);
    if (!validTicker) return;
    let stale = false;
    const id = setTimeout(() => {
      view<Tournament | null>(ARENA, "get_by_ticker", { ticker: sym })
        .then((t) => !stale && setExisting(t))
        .catch(() => !stale && setExisting(null));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [sym, validTicker]);

  const seed = parseUnits(seedText, 24);
  const regOpen = existing?.phase === "Registration" && Number(BigInt(existing.round_end_ns) / 1_000_000n) > now;
  const full = !!existing && regOpen && existing.entrants.length + existing.pending_launches >= config.max_entrants;
  const locked = !!existing && existing.phase !== "Finished" && !regOpen;

  let where: string | null = null;
  if (validTicker && existing !== undefined) {
    if (!existing) where = `No ${sym} here yet. You open the ${sym} tournament; copies have ${duration(config.registration_ns)} to register.`;
    else if (locked) where = `${sym} is locked: its tournament is in ${roundName(existing, existing.round).toLowerCase()}. Come back for the next season.`;
    else if (full) where = `The ${sym} tournament is full (${config.max_entrants} coins).`;
    else if (regOpen) where = `Joins the ${sym} tournament: ${existing.entrants.length} of ${config.max_entrants} coins registered.`;
    else where = `${sym} has a champion (${existing.champion !== null ? existing.entrants[existing.champion].name : "none"}). You open season ${existing.season + 1} and will have to go through it.`;
  }
  const problem =
    name.trim().length === 0
      ? "Give it a name."
      : new TextEncoder().encode(name).length > 32
        ? "Name is too long (32 bytes max)."
        : !validTicker
          ? "Ticker: 2-8 letters or digits."
          : !seed || seed < minSeed
            ? `Seed at least ${near(minSeed, 3)} NEAR.`
            : locked || full
              ? where
              : null;
  const icon = makeIcon(emoji, color);

  const submit = async () => {
    if (problem || !seed) return;
    if (!(await ensureWallet(account))) return;
    run("enter", `${name.trim()} is live in the ${sym} bracket.`, () =>
      call(ARENA, "enter", { meme: { name: name.trim(), symbol: sym, icon } }, { deposit: BigInt(config.launch_fee) + seed, gas: 100n * TGAS }),
    );
  };

  return (
    <form
      className="memeform"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="preview">
        <Coin icon={icon} symbol={sym || "??"} size={72} />
        <div>
          <strong>{name || "Your coin"}</strong>
          <span>${sym || "TICKER"}</span>
        </div>
      </div>
      <label>
        Ticker
        <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="PEPE" maxLength={8} />
      </label>
      {where && <p className={`where ${locked || full ? "bad" : ""}`}>{where}</p>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pepe the Unbothered" maxLength={32} />
      </label>
      <fieldset>
        <legend>Face</legend>
        <div className="chips">
          {EMOJI.map((e) => (
            <button type="button" key={e} className={e === emoji ? "chip on" : "chip"} onClick={() => setEmoji(e)} aria-label={`emoji ${e}`}>
              {e}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Color</legend>
        <div className="chips">
          {COLORS.map((c) => (
            <button type="button" key={c} className={c === color ? "swatch on" : "swatch"} style={{ background: c }} onClick={() => setColor(c)} aria-label={`color ${c}`} />
          ))}
        </div>
      </fieldset>
      <label>
        Your seed (NEAR)
        <input inputMode="decimal" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
      </label>
      <button className="btn big" disabled={!!busy || !!problem}>
        {busy ? "Waiting for wallet…" : `Launch into the bracket · ${seed ? near(BigInt(config.launch_fee) + seed, 3) : "?"} NEAR`}
      </button>
      {problem && problem !== where && (name || ticker) && <p className="hint">{problem}</p>}
      <p className="hint">
        The seed buys your first tokens from your coin's own curve. It is at stake in the bracket like everyone else's money. The {near(config.launch_fee)} NEAR fee pays for the coin's account.
      </p>
    </form>
  );
}

// ------------------------------------------------------------------- cards

export function TournamentCard({ s, now }: { s: TState; now: number }) {
  const { t } = s;
  const left = msLeft(s, now);
  const total = s.info.reduce((n, i) => n + BigInt(i.reserve), 0n);
  const due = t.phase !== "Finished" && left <= 0;
  return (
    <a className={`card tcard ${t.phase.toLowerCase()}`} href={`#/t/${t.id}`}>
      <div className="thead">
        <h3>${t.ticker}</h3>
        {t.season > 1 && <span className="season">season {t.season}</span>}
        <span className="right">{near(total)} NEAR in the bracket</span>
      </div>
      <div className="faces">
        {t.entrants.map((e, i) => (
          <span key={e.token} className={e.eliminated_in !== null ? "out" : t.champion === i ? "champ" : ""} title={e.name}>
            <Coin token={e.token} symbol={t.ticker} size={40} crown={t.champion === i} />
          </span>
        ))}
      </div>
      <div className="meta">
        {t.phase === "Finished" ? (
          <>
            <span className="pill done">FINISHED</span>
            <span>{t.champion !== null ? `${t.entrants[t.champion].name} is the only $${t.ticker} left` : "nobody launched"}</span>
          </>
        ) : due ? (
          <>
            <span className="pill bell">TIME'S UP</span>
            <span>{unsettled(s).length ? "matches waiting to be settled" : "waiting for anyone to advance the bracket"}</span>
          </>
        ) : (
          <>
            <span className="pill live">{roundName(t, t.round).toUpperCase()}</span>
            <span className="mono">{countdown(left)}</span>
            <span>
              {t.phase === "Registration" ? `${t.entrants.length} registered, copies can still join` : `${alive(t).length} of ${t.entrants.length} coins left`}
            </span>
          </>
        )}
      </div>
    </a>
  );
}

export default function Home({ account }: { account: string | null }) {
  const { data, error, refresh } = usePoll(loadHome, [], 8000);
  const now = useNow();
  const [ticker, setTicker] = useState("");
  const ready = !!data;
  useEffect(() => {
    if (ready && window.location.hash === "#/faq") document.getElementById("faq")?.scrollIntoView();
  }, [ready]);
  const pick = (t: string) => {
    setTicker(t);
    document.getElementById("launch")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <section className="hero">
        <h1>
          <span className="rise">One ticker.</span>
          <br />
          <span className="rise d1">One</span> <em className="rise d2">survivor.</em>
        </h1>
        <p>
          A launchpad where every coin with the same ticker lands in the same bracket. Each round the weaker copy's liquidity moves to the stronger one, until a single coin holds all of it.
        </p>
        <ol className="steps">
          <li>
            <b>Register</b> Launch a ticker and you open its bracket. Every copy launched {data ? `in the next ${duration(data.config.registration_ns)}` : "during registration"} joins it.
          </li>
          <li>
            <b>Fight</b> Copies are paired each round. Score = new NEAR that came in this round × how long it stayed.
          </li>
          <li>
            <b>Merge</b> The loser's liquidity and holders move into the winner. Repeat until one is left.
          </li>
        </ol>
      </section>

      <Reveal>
        <LiquiditySplit />
      </Reveal>

      <Reveal>
        <h2>How common it is</h2>
        <DexSection pick={pick} />
      </Reveal>
      <Reveal>
        <h2>And on NEAR, in meme.cooking's own data</h2>
        <Radar pick={pick} />
      </Reveal>

      {error && !data && <p className="error">Could not reach the arena: {error}</p>}

      <div className="columns">
        <section>
          <h2>Brackets</h2>
          {!data ? (
            <p className="muted">Loading…</p>
          ) : data.states.length === 0 ? (
            <p className="muted">No ticker has been launched yet. Yours opens the first bracket.</p>
          ) : (
            data.states.map((s) => <TournamentCard key={s.t.id} s={s} now={now} />)
          )}
        </section>

        <aside id="launch">
          <h2>Launch a coin</h2>
          <div className="card">{data ? <LaunchForm config={data.config} account={account} ticker={ticker} setTicker={setTicker} done={refresh} /> : <p className="muted">Loading…</p>}</div>
        </aside>
      </div>

      <Reveal>
        <Faq config={data?.config ?? null} />
      </Reveal>
    </>
  );
}
