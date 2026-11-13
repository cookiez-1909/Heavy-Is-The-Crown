import { useEffect, useState } from "react";
import { ARENA, EXPLORER } from "./config";
import { call, TGAS, view } from "./near";
import { ago, countdown, near, parseUnits, score, short, tokens } from "./fmt";
import { useMe, alive, Coin, ensureWallet, loadTournament, msLeft, roundName, ScoreBar, unsettled, useAction, useNow, usePoll, type TState } from "./shared";
import type { Info, Match, Tournament, Trade } from "./types";
import { confirmRisk } from "./ui";

const LOG_FEE = 2n * 10n ** 21n;
const REG_FEE = 125n * 10n ** 19n; // 0.00125 NEAR of NEP-145 storage, charged on a first buy
const SLIPPAGE_BPS = 300n;

interface Mine {
  balance: bigint[];
  claimable: bigint[];
}

async function load(id: number, account: string | null) {
  const t = await view<Tournament | null>(ARENA, "get_tournament", { id });
  if (!t) throw new Error("This bracket does not exist.");
  const state = await loadTournament(t);
  let mine: Mine | null = null;
  if (account) {
    const q = (m: string, key: string) => Promise.all(t.entrants.map((e) => view<string>(e.token, m, { [key]: account }).then(BigInt)));
    const [balance, claimable] = await Promise.all([q("ft_balance_of", "account_id"), q("claimable", "account")]);
    mine = { balance, claimable };
  }
  return { state, mine };
}

async function loadLog(s: TState, shown: number[]) {
  const logs = await Promise.all(
    shown.map((i) => view<Trade[]>(s.t.entrants[i].token, "get_trades", { from_index: Math.max(0, s.info[i].trades - 30), limit: 30 })),
  );
  return logs
    .flatMap((l, k) => l.map((t) => ({ ...t, coin: shown[k] })))
    .sort((x, y) => (BigInt(y.ts) > BigInt(x.ts) ? 1 : -1))
    .slice(0, 40);
}

function quoteBuy(i: Info, nearIn: bigint) {
  const n = BigInt(i.virtual_near) + BigInt(i.reserve);
  return (BigInt(i.pool_tokens) * nearIn) / (n + nearIn);
}

function quoteSell(i: Info, amount: bigint) {
  const n = BigInt(i.virtual_near) + BigInt(i.reserve);
  let gross = (n * amount) / (BigInt(i.pool_tokens) + amount);
  if (gross > BigInt(i.reserve)) gross = BigInt(i.reserve);
  const net = gross - (gross * BigInt(i.sell_tax_bps)) / 10_000n;
  return net > LOG_FEE ? net - LOG_FEE : 0n;
}

function formatExact(v: bigint): string {
  const s = v.toString().padStart(19, "0");
  return (s.slice(0, -18) + "." + s.slice(-18)).replace(/\.?0+$/, "");
}

// ------------------------------------------------------------------ trading

function TradeBox({ info, token, balance, account, refresh }: { info: Info; token: string; balance: bigint; account: string | null; refresh: () => void }) {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [text, setText] = useState("");
  const { busy, run } = useAction(() => {
    setText("");
    refresh();
  });
  const fee = LOG_FEE + (balance === 0n ? REG_FEE : 0n);
  const amount = parseUnits(text, mode === "buy" ? 24 : 18);

  let out = 0n;
  let problem: string | null = null;
  if (amount) {
    if (mode === "buy") {
      if (amount <= fee) problem = "Too small to cover the fee.";
      else out = quoteBuy(info, amount - fee);
    } else if (amount > balance) problem = `You hold ${tokens(balance)} ${info.symbol}.`;
    else {
      out = quoteSell(info, amount);
      if (out === 0n) problem = "Too small to cover the fee.";
    }
  }
  const min = (out * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const tax = info.sell_tax_bps / 100;

  const go = async () => {
    if (!amount || problem) return;
    if (!(await ensureWallet(account))) return;
    const p = info.penalty_bps / 100;
    if (mode === "buy") {
      const ok = await confirmRisk({
        title: `Back ${info.name}`,
        lines: [
          { label: "Leaves your wallet", value: `${near(amount, 4)} NEAR`, tone: "out" },
          { label: "You receive", value: `≈ ${tokens(out)} ${info.symbol} (newly minted)`, tone: "in" },
          { label: "Fees, not refundable", value: `${near(fee, 5)} NEAR${fee > LOG_FEE ? " (includes one-time token storage)" : ""}`, tone: "lost" },
        ],
        risks: [
          `If this coin loses its round, ${p}% of its liquidity goes to the winner. You keep the rest as winner tokens.`,
          `Selling is taxed. Right now ${tax.toFixed(1)}%${info.status === "Live" ? `, rising to ${p}% at the bell` : ""}.`,
          "NEAR testnet, contracts not audited. Price can fall like any memecoin.",
        ],
        confirm: `Back ${info.name}`,
      });
      if (!ok) return;
      run("t", `Bought ${tokens(out)} ${info.name}.`, () => call(token, "buy", { min_tokens_out: min.toString() }, { deposit: amount }));
    } else {
      const gross = quoteSell({ ...info, sell_tax_bps: 0 }, amount);
      const ok = await confirmRisk({
        title: `Sell ${info.name}`,
        lines: [
          { label: "You sell", value: `${tokens(amount)} ${info.symbol} (burned)`, tone: "out" },
          { label: "You receive", value: `≈ ${near(out, 4)} NEAR`, tone: "in" },
          { label: `Sell tax ${tax.toFixed(1)}%, stays in the curve`, value: `≈ ${near(gross > out ? gross - out : 0n, 4)} NEAR`, tone: "lost" },
        ],
        risks: ["The tax is never refunded: it stays in this coin's curve for the remaining holders."],
        confirm: `Sell ${info.name}`,
      });
      if (!ok) return;
      run("t", `Sold ${tokens(amount)} ${info.name}.`, () => call(token, "sell", { amount: amount.toString(), min_near_out: min.toString() }, { deposit: 1n }));
    }
  };

  return (
    <div className="tradebox">
      <div className="tabs tradetabs" role="tablist">
        <button role="tab" aria-selected={mode === "buy"} className={`buytab ${mode === "buy" ? "on" : ""}`} onClick={() => (setMode("buy"), setText(""))}>
          Buy
        </button>
        <button role="tab" aria-selected={mode === "sell"} className={`selltab ${mode === "sell" ? "on" : ""}`} onClick={() => (setMode("sell"), setText(""))}>
          Sell <span className="taxpill" title="Sell tax right now. It stays in this coin's curve.">{tax.toFixed(1)}% tax</span>
        </button>
      </div>
      <div className="amount">
        <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0.0" aria-label={mode === "buy" ? "NEAR to spend" : `${info.symbol} to sell`} />
        <span>{mode === "buy" ? "NEAR" : info.symbol}</span>
      </div>
      <div className="presets">
        {mode === "buy"
          ? ["0.5", "1", "5"].map((v) => (
              <button key={v} onClick={() => setText(v)}>
                {v} NEAR
              </button>
            ))
          : [25n, 50n, 100n].map((p) => (
              <button key={p.toString()} disabled={balance === 0n} onClick={() => setText(formatExact((balance * p) / 100n))}>
                {p.toString()}%
              </button>
            ))}
      </div>
      <p className="quote">
        {problem ??
          (amount
            ? mode === "buy"
              ? `You get ≈ ${tokens(out)} tokens (minted)`
              : `You get ≈ ${near(out, 4)} NEAR after the ${tax.toFixed(1)}% tax (tokens burned)`
            : mode === "buy"
              ? "Buying mints new supply and adds to this round's score."
              : `Selling burns supply. The tax stays in this coin's curve.`)}
      </p>
      <button className={`btn big ${mode === "sell" ? "sellbtn" : "buybtn"}`} disabled={!amount || !!problem || !!busy} onClick={go}>
        {busy ? "Waiting for wallet…" : mode === "buy" ? `Back ${info.name}` : `Sell ${info.name}`}
      </button>
    </div>
  );
}

function CoinPanel(p: { s: TState; idx: number; side: "a" | "b" | "n"; mine: Mine | null; account: string | null; refresh: () => void; now: number }) {
  const { s, idx, mine } = p;
  const info = s.info[idx];
  const e = s.t.entrants[idx];
  const balance = mine?.balance[idx] ?? 0n;
  const claimable = mine?.claimable[idx] ?? 0n;
  const frozen = info.status === "Live" && msLeft(s, p.now) <= 0;
  const tradable = info.status === "Advanced" || (info.status === "Live" && !frozen);
  const champion = s.t.champion === idx;
  const absorber = info.absorbed_by ? s.t.entrants.find((x) => x.token === info.absorbed_by) : null;
  // Newer tokens report the capped inflow the score actually uses.
  const inflow = info.scored_inflow !== undefined ? BigInt(info.scored_inflow) : BigInt(info.reserve) - BigInt(info.round_base);
  const { busy, run } = useAction(p.refresh);

  const claim = async () => {
    if (!(await ensureWallet(p.account))) return;
    const deposit = BigInt(await view<string>(e.token, "claim_deposit"));
    run("claim", `Converted into ${tokens(claimable)} ${absorber?.name ?? "winner"} tokens.`, () => call(e.token, "claim", {}, { deposit, gas: 100n * TGAS }), true);
  };

  return (
    <section className={`panel ${p.side} ${info.status.toLowerCase()} ${p.account && p.account === e.creator ? "mine" : ""}`}>
      {p.account && p.account === e.creator && <span className="minebadge">Your coin</span>}
      <header>
        <Coin token={e.token} symbol={info.symbol} size={64} crown={champion} />
        <div>
          <h2>{info.name}</h2>
          <a href={`${EXPLORER}/address/${e.token}`} target="_blank" rel="noreferrer">
            ${info.symbol} · {short(e.token)}
          </a>
        </div>
        {champion && <span className="stamp won">CHAMPION</span>}
        {info.status === "Lost" && <span className="stamp lost">ABSORBED</span>}
      </header>

      <dl className="stats">
        <div>
          <dt>Round score</dt>
          <dd>{score(info.score)}</dd>
        </div>
        <div>
          <dt title={info.score_cap ? `Each wallet counts for at most ${near(info.score_cap)} NEAR per round` : undefined}>{info.score_cap ? "Scored inflow" : "New NEAR this round"}</dt>
          <dd>
            {inflow < 0n ? "-" : "+"}
            {near(inflow < 0n ? -inflow : inflow)}
          </dd>
        </div>
        <div>
          <dt>NEAR in curve</dt>
          <dd>{near(info.reserve)}</dd>
        </div>
        <div>
          <dt>Supply</dt>
          <dd>{tokens(info.total_supply)}</dd>
        </div>
      </dl>

      {p.account && (
        <p className="holding">
          You hold <b>{tokens(balance)}</b>
          {balance > 0n && info.status !== "Lost" && <> · {near(quoteSell(info, balance), 3)} NEAR if sold now</>}
        </p>
      )}

      {tradable && <TradeBox info={info} token={e.token} balance={balance} account={p.account} refresh={p.refresh} />}
      {frozen && info.rival && <p className="muted">Frozen until this match is settled.</p>}

      {info.status === "Lost" && (
        <div className="claim">
          <p>
            Absorbed by <b>{absorber?.name ?? short(info.absorbed_by ?? "")}</b>. {info.penalty_bps / 100}% of its reserve became the winner's spoils; the rest bought winner tokens for its holders.
          </p>
          {claimable > 0n ? (
            <button className="btn big" disabled={!!busy} onClick={claim}>
              {busy ? "Waiting for wallet…" : `Convert my bag → ${tokens(claimable)} ${absorber?.name ?? ""}`}
            </button>
          ) : (
            <p className="muted">{p.account ? "You have nothing to convert here." : "Connect a wallet to see what you can convert."}</p>
          )}
        </div>
      )}
      {info.status !== "Lost" && BigInt(info.spoils) > 0n && (
        <p className="spoils">
          {info.wins} win{info.wins === 1 ? "" : "s"}: +{near(info.spoils)} NEAR of spoils locked into this curve with no tokens minted
          {info.creator_rewards && BigInt(info.creator_rewards) > 0n ? `, and ${near(info.creator_rewards, 3)} NEAR paid to its creator` : ""}.
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ bracket

function Slot({ s, idx, sc, won, lost, crown }: { s: TState; idx: number | null; sc: string | null; won: boolean; lost: boolean; crown?: boolean }) {
  if (idx === null) return <div className="slot bye">bye</div>;
  const e = s.t.entrants[idx];
  const mine = useMe() === e.creator;
  return (
    <div className={`slot ${won ? "won" : ""} ${lost ? "lost" : ""} ${mine ? "mine" : ""}`}>
      <Coin token={e.token} symbol={s.t.ticker} size={crown ? 34 : 28} crown={crown} />
      <span className="nm">{e.name}</span>
      {mine && <span className="minetag">Yours</span>}
      <span className="sc mono">{sc !== null ? score(sc) : ""}</span>
    </div>
  );
}

function Bracket({ s, selected, select }: { s: TState; selected: number[]; select: (ids: number[]) => void }) {
  const { t } = s;
  const isSel = (ids: number[]) => ids.length === selected.length && ids.every((i) => selected.includes(i));
  const live = (i: number, round: number) => (round === t.round && t.phase !== "Finished" ? s.info[i].score : null);
  const everyone = t.entrants.map((_, i) => i);
  return (
    <div className="bracket" role="list">
      <div className="bcol" role="listitem">
        <h4>Registration</h4>
        <button className={`match reg ${isSel(everyone) ? "sel" : ""}`} onClick={() => select(everyone)}>
          {t.entrants.map((e, i) => (
            <Slot key={e.token} s={s} idx={i} sc={t.round === 0 ? s.info[i].score : null} won={false} lost={false} />
          ))}
        </button>
      </div>
      {t.rounds.map((matches, r) => (
        <div className="bcol" key={r} role="listitem">
          <h4>{roundName(t, r + 1)}</h4>
          <div className="bm">
          {matches.map((m: Match, k) => {
            const ids = m.b === null ? [m.a] : [m.a, m.b];
            const closed = r + 1 < t.round || t.phase === "Finished";
            return (
              <button key={k} className={`match ${isSel(ids) ? "sel" : ""}`} onClick={() => select(ids)}>
                <Slot s={s} idx={m.a} sc={m.score_a ?? live(m.a, r + 1)} won={closed && m.winner === m.a} lost={closed && m.winner !== m.a} />
                <Slot s={s} idx={m.b} sc={m.b === null ? null : (m.score_b ?? live(m.b, r + 1))} won={closed && m.b !== null && m.winner === m.b} lost={closed && m.b !== null && m.winner !== m.b} />
              </button>
            );
          })}
          </div>
        </div>
      ))}
      {t.phase === "Finished" && t.champion !== null && (
        <div className="bcol" role="listitem">
          <h4>Champion</h4>
          <button className={`match ${isSel([t.champion]) ? "sel" : ""}`} onClick={() => select([t.champion!])}>
            <Slot s={s} idx={t.champion} sc={null} won lost={false} crown />
          </button>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- milestones

/** Registration → each round → Champion, with the current stage lit. */
function Milestones({ t }: { t: Tournament }) {
  const n = Math.max(2, t.entrants.length);
  const rounds = Math.ceil(Math.log2(n));
  const name = (r: number) => {
    const left = Math.ceil(n / 2 ** (r - 1));
    return left <= 2 ? "Final" : left <= 4 ? "Semi-final" : left <= 8 ? "Quarter-final" : `Round ${r}`;
  };
  const stages = ["Registration", ...Array.from({ length: rounds }, (_, i) => name(i + 1)), "Champion"];
  // A finished bracket has completed every stage, the crown included.
  const current = t.phase === "Finished" ? stages.length : t.round;
  return (
    <ol className="milestones" aria-label="Bracket progress">
      {stages.map((st, i) => (
        <li key={st + i} className={i < current ? "done" : i === current ? "now" : ""} aria-current={i === current ? "step" : undefined}>
          <i>{i < current ? "✓" : i + 1}</i>
          <span>{st}</span>
        </li>
      ))}
    </ol>
  );
}

// --------------------------------------------------------------------- page

const verb: Record<Trade["kind"], string> = { buy: "bought", sell: "sold", spoils: "paid spoils:", convert: "was converted:", claim: "burned to convert", reward: "earned the creator reward:" };

function defaultSelection(t: Tournament): number[] {
  if (t.phase === "Finished") return t.champion !== null ? [t.champion] : [];
  if (t.phase === "Registration") return t.entrants.map((_, i) => i);
  const m = t.rounds[t.rounds.length - 1]?.find((x) => x.b !== null) ?? t.rounds[t.rounds.length - 1]?.[0];
  return m ? (m.b === null ? [m.a] : [m.a, m.b]) : [];
}

export default function TournamentPage({ id, account }: { id: number; account: string | null }) {
  const { data, error, refresh } = usePoll(() => load(id, account), [id, account], 5000);
  const now = useNow();
  const { busy, run } = useAction(refresh);
  const [picked, setPicked] = useState<{ key: string; ids: number[] } | null>(null);
  const [log, setLog] = useState<(Trade & { coin: number })[]>([]);

  const key = data ? `${data.state.t.phase}-${data.state.t.round}-${data.state.t.entrants.length}` : "";
  const selected = data ? (picked && picked.key === key ? picked.ids : defaultSelection(data.state.t)) : [];
  const selKey = selected.join(",");
  const tradeCount = data ? selected.reduce((n, i) => n + (data.state.info[i]?.trades ?? 0), 0) : 0;
  useEffect(() => {
    if (data) loadLog(data.state, selected).then(setLog).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, tradeCount, key]);

  if (error && !data) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading bracket…</p>;
  const { state: s, mine } = data;
  const { t } = s;
  const left = msLeft(s, now);
  const due = t.phase !== "Finished" && left <= 0;
  const pending = unsettled(s);
  const roleOf = (acct: string): { kind: string; label: string } => {
    if (account && acct === account) return { kind: "you", label: "You" };
    const coin = t.entrants.find((e) => e.token === acct);
    if (coin) return { kind: "contract", label: `${coin.name} contract` };
    const made = t.entrants.find((e) => e.creator === acct);
    if (made) return { kind: "creator", label: `Creator · ${made.name}` };
    if (acct === ARENA) return { kind: "contract", label: "Arena" };
    return { kind: "trader", label: "Trader" };
  };
  const bags = mine ? t.entrants.map((_, i) => i).filter((i) => mine.claimable[i] > 0n && !selected.includes(i)) : [];

  const settleAll = async () => {
    if (!(await ensureWallet(account))) return;
    run("settle", "Matches settled on-chain.", async () => {
      // Lower score first: the loser's settlement also advances its opponent.
      const order = [...pending].sort((x, y) => (BigInt(s.info[x].score) < BigInt(s.info[y].score) ? -1 : 1));
      for (const i of order) {
        const fresh = await view<Info>(t.entrants[i].token, "get_info");
        if (fresh.status === "Live") await call(t.entrants[i].token, "settle", {}, { gas: 150n * TGAS });
      }
    }, true);
  };
  const advance = async () => {
    if (!(await ensureWallet(account))) return;
    run("advance", "Bracket advanced.", () => call(ARENA, "advance", { tournament_id: t.id }, { gas: 300n * TGAS }), true);
  };

  return (
    <>
      <a className="back" href="#/app">
        ← All brackets
      </a>
      <h1 className="ttitle">
        ${t.ticker}
        {t.season > 1 && <small>season {t.season}</small>}
      </h1>
      <Milestones t={t} />
      <section className={`banner ${due ? "bell" : "live"}`}>
        {t.phase === "Finished" ? (
          <>
            <span className="pill done">FINISHED</span>
            <span>{t.champion !== null ? `${t.entrants[t.champion].name} absorbed every other $${t.ticker}. A new $${t.ticker} launched here will have to face it.` : "Nobody launched."}</span>
          </>
        ) : !due ? (
          <>
            <span className="pill live">{roundName(t, t.round).toUpperCase()}</span>
            <span className="clock mono">{countdown(left)}</span>
            <span>
              {t.phase === "Registration"
                ? `${t.entrants.length} cop${t.entrants.length === 1 ? "y" : "ies"} of $${t.ticker} registered. Inflow now decides the seeding.`
                : `${alive(t).length} coins left. Sell tax is ramping up to ${s.info[0].penalty_bps / 100}% at the bell.`}
            </span>
          </>
        ) : pending.length > 0 ? (
          <>
            <span className="pill bell">TIME'S UP</span>
            <span>Trading is frozen. {pending.length / 2} match{pending.length === 2 ? "" : "es"} to settle; the caller earns a bounty from the loser's reserve.</span>
            <button className="btn big" disabled={!!busy} onClick={settleAll}>
              {busy ? "Settling…" : "Settle matches"}
            </button>
          </>
        ) : (
          <>
            <span className="pill bell">TIME'S UP</span>
            <span>{t.phase === "Registration" ? "Registration is closed." : "All matches are settled."} Anyone can draw the next round and earns a small bounty.</span>
            <button className="btn big" disabled={!!busy} onClick={advance}>
              {busy ? "Advancing…" : alive(t).filter((i) => s.info[i].status !== "Lost").length <= 1 ? "Crown the champion" : "Start the next round"}
            </button>
          </>
        )}
      </section>

      <Bracket s={s} selected={selected} select={(ids) => setPicked({ key, ids })} />

      {selected.length === 2 && s.info[selected[0]].rival === t.entrants[selected[1]].token && (
        <>
          <div className="tug">
            <b className="a">{score(s.info[selected[0]].score)}</b>
            <ScoreBar a={s.info[selected[0]].score} b={s.info[selected[1]].score} label="Round score, side by side" />
            <b className="b">{score(s.info[selected[1]].score)}</b>
          </div>
          <p className="tugnote">Round score in NEAR-hours: NEAR that came in since the round started × how long it stayed. Old liquidity scores nothing.</p>
        </>
      )}

      <div className="ring">
        {selected.map((i, k) => (
          <CoinPanel key={i} s={s} idx={i} side={selected.length === 2 ? (k === 0 ? "a" : "b") : "n"} mine={mine} account={account} refresh={refresh} now={now} />
        ))}
      </div>

      {bags.length > 0 && (
        <section>
          <h2>Your bags to convert</h2>
          <div className="ring">
            {bags.map((i) => (
              <CoinPanel key={i} s={s} idx={i} side="n" mine={mine} account={account} refresh={refresh} now={now} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Log</h2>
        {log.length === 0 ? (
          <p className="muted">No trades yet.</p>
        ) : (
          <ul className="log">
            {log.map((x, k) => {
              const name = t.entrants[x.coin]?.name ?? "";
              return (
                <li key={k} className={selected.indexOf(x.coin) === 1 ? "b" : "a"}>
                  <span className="dot" />
                  <span className="who">
                    <span className={`role ${roleOf(x.account).kind}`}>{roleOf(x.account).label}</span>
                    {roleOf(x.account).kind === "you" ? null : short(x.account)}
                  </span>
                  <span>
                    {verb[x.kind]}{" "}
                    {x.kind === "reward" ? (
                      <>
                        <b>{near(x.near, 3)} NEAR</b> for launching {name}
                      </>
                    ) : x.kind === "spoils" ? (
                      <>
                        <b>{near(x.near)} NEAR</b> into {name}, no mint
                      </>
                    ) : x.kind === "convert" ? (
                      <>
                        <b>{tokens(x.tokens)}</b> {name} minted for {near(x.near)} NEAR
                      </>
                    ) : x.kind === "claim" ? (
                      <>
                        <b>{tokens(x.tokens)}</b> {name}
                      </>
                    ) : (
                      <>
                        <b>{tokens(x.tokens)}</b> {name} for {near(x.near, 3)} NEAR ({x.kind === "buy" ? "mint" : "burn"})
                      </>
                    )}
                  </span>
                  <time>{ago(x.ts, now + s.skew)}</time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
