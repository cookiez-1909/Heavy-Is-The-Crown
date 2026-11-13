import { useEffect, useState } from "react";
import { ARENA } from "./config";
import { call, TGAS, view } from "./near";
import { duration, near, parseUnits, tokens } from "./fmt";
import { COLORS, EMOJI, makeIcon } from "./icon";
import { Coin, ensureWallet, roundName, useAction, useNow, usePoll } from "./shared";
import { confirmRisk } from "./ui";
import type { Config, Tournament } from "./types";

const CURVE_SUPPLY = 1_000_000_000n * 10n ** 18n;

function LaunchForm({ config, account, initialTicker }: { config: Config; account: string | null; initialTicker: string }) {
  const [ticker, setTicker] = useState(initialTicker);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJI[0]);
  const [color, setColor] = useState(COLORS[0]);
  const minSeed = BigInt(config.min_seed);
  const [seedText, setSeedText] = useState(near(minSeed, 3));
  const [existing, setExisting] = useState<Tournament | null | undefined>(undefined);
  const now = useNow();
  const sym = ticker.toUpperCase();
  const validTicker = /^[A-Z0-9]{2,8}$/.test(sym);
  const { busy, run } = useAction(async () => {
    const t = await view<Tournament | null>(ARENA, "get_by_ticker", { ticker: sym }).catch(() => null);
    if (t) window.location.hash = `#/t/${t.id}`;
  });

  useEffect(() => setTicker(initialTicker), [initialTicker]);
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
    if (!existing) where = `No $${sym} here yet. You open its bracket; copies have ${duration(config.registration_ns)} to join.`;
    else if (locked) where = `$${sym} is locked: its bracket is in the ${roundName(existing, existing.round).toLowerCase()}. Come back for the next season.`;
    else if (full) where = `The $${sym} bracket is full (${config.max_entrants} coins).`;
    else if (regOpen) where = `Joins the $${sym} bracket: ${existing.entrants.length} of ${config.max_entrants} coins registered.`;
    else where = `$${sym} has a champion (${existing.champion !== null ? existing.entrants[existing.champion].name : "none"}). You open season ${existing.season + 1} and will face it.`;
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
  const fee = BigInt(config.launch_fee);
  const p = config.penalty_bps / 100;

  const submit = async () => {
    if (problem || !seed) return;
    if (!(await ensureWallet(account))) return;
    const v = BigInt(config.virtual_near);
    const ok = await confirmRisk({
      title: `Launch $${sym}`,
      lines: [
        { label: "Leaves your wallet", value: `${near(fee + seed, 3)} NEAR`, tone: "out" },
        { label: "Your seed buys", value: `≈ ${tokens((CURVE_SUPPLY * seed) / (v + seed))} ${sym} of your own coin`, tone: "in" },
        { label: "Launch fee, not refundable", value: `${near(fee)} NEAR`, tone: "lost" },
      ],
      risks: [
        existing && existing.phase === "Registration" ? `Your coin enters the $${sym} bracket against ${existing.entrants.length} other cop${existing.entrants.length === 1 ? "y" : "ies"}.` : `Every copy of $${sym} launched in the next ${duration(config.registration_ns)} joins your bracket.`,
        `If your coin loses a round, ${p}% of its liquidity goes to the winner. Its holders, you included, get the rest back as winner tokens.`,
        "NEAR testnet, contracts not audited.",
      ],
      confirm: "Launch",
    });
    if (!ok) return;
    run("enter", `${name.trim()} is live in the $${sym} bracket.`, () => call(ARENA, "enter", { meme: { name: name.trim(), symbol: sym, icon } }, { deposit: fee + seed, gas: 100n * TGAS }), true);
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
        <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="HOT" maxLength={8} />
      </label>
      {where && <p className={`where ${locked || full ? "bad" : ""}`}>{where}</p>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hot Original" maxLength={32} />
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
        {busy ? "Waiting for wallet…" : `Launch into the bracket · ${seed ? near(fee + seed, 3) : "?"} NEAR`}
      </button>
      {problem && problem !== where && (name || ticker) && <p className="hint">{problem}</p>}
    </form>
  );
}

export default function Launch({ account, ticker }: { account: string | null; ticker: string }) {
  const { data: config } = usePoll(() => view<Config>(ARENA, "get_config"), [], 60_000);
  return (
    <div className="page launchpage">
      <header className="pagehead">
        <h1>Launch a coin</h1>
        <p>Pick a ticker. If nobody has it yet you open its bracket; if a bracket is open, your coin joins it.</p>
      </header>
      <div className="launchgrid">
        <div className="card">{config ? <LaunchForm config={config} account={account} initialTicker={ticker} /> : <p className="muted">Loading…</p>}</div>
        <aside className="explain">
          <h3>Before you launch</h3>
          <ol>
            <li>
              <b>The seed is not a fee.</b> It buys the first tokens of your own coin, so it is at stake like everyone else's money.
            </li>
            <li>
              <b>The fee pays for the coin's account.</b> {config ? `${near(config.launch_fee)} NEAR` : ""}, not refundable.
            </li>
            <li>
              <b>Same ticker, same bracket.</b> Copies launched during registration fight yours, round by round.
            </li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
