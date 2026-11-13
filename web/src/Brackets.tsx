import { useEffect, useMemo, useState } from "react";
import { ARENA } from "./config";
import { connector, view } from "./near";
import { countdown, near, short } from "./fmt";
import { alive, Coin, loadTournament, msLeft, roundName, unsettled, useNow, usePoll, type TState } from "./shared";
import type { Tournament } from "./types";

async function loadAll() {
  const count = await view<number>(ARENA, "tournament_count");
  const from = Math.max(0, count - 40);
  const list = await view<Tournament[]>(ARENA, "get_tournaments", { from_index: from, limit: 40 });
  return Promise.all(list.reverse().map(loadTournament));
}

type Kind = "action" | "registering" | "playing" | "finished";

function kindOf(s: TState, now: number): Kind {
  if (s.t.phase === "Finished") return "finished";
  if (msLeft(s, now) <= 0) return "action";
  return s.t.phase === "Registration" ? "registering" : "playing";
}

export function TournamentCard({ s, now }: { s: TState; now: number }) {
  const { t } = s;
  const left = msLeft(s, now);
  const total = s.info.reduce((n, i) => n + BigInt(i.reserve), 0n);
  const kind = kindOf(s, now);
  return (
    <a className={`card tcard ${t.phase.toLowerCase()}`} href={`#/t/${t.id}`}>
      <div className="thead">
        <h3>${t.ticker}</h3>
        {t.season > 1 && <span className="season">season {t.season}</span>}
        <span className="right">{near(total)} NEAR in the bracket</span>
      </div>
      <div className="faces">
        {t.entrants.map((e, i) => (
          <span key={e.token} className={e.eliminated_in !== null ? "out" : ""} title={e.name}>
            <Coin token={e.token} symbol={t.ticker} size={40} crown={t.champion === i} />
          </span>
        ))}
      </div>
      <div className="meta">
        {kind === "finished" ? (
          <>
            <span className="pill done">COMPLETED</span>
            <span>{t.champion !== null ? `${t.entrants[t.champion].name} holds every $${t.ticker}'s liquidity` : "nobody launched"}</span>
          </>
        ) : kind === "action" ? (
          <>
            <span className="pill bell">ACTION NEEDED</span>
            <span>{unsettled(s).length ? "time's up: matches to settle" : "time's up: draw the next round"}</span>
          </>
        ) : (
          <>
            <span className="pill live">{roundName(t, t.round).toUpperCase()}</span>
            <span className="mono">{countdown(left)}</span>
            <span>{t.phase === "Registration" ? `${t.entrants.length} registered, copies can still join` : `${alive(t).length} of ${t.entrants.length} coins left`}</span>
          </>
        )}
      </div>
      <p className="by">Opened by {t.entrants[0] ? short(t.entrants[0].creator) : "?"}</p>
    </a>
  );
}

interface Next {
  text: string;
  cta: string;
  href?: string;
  onClick?: () => void;
}

/** One thing worth doing now, in order of how much it matters to the viewer. */
function useNext(states: TState[] | null, account: string | null, now: number): Next | null {
  const [bag, setBag] = useState<{ tid: number; name: string; amount: bigint } | null>(null);
  useEffect(() => {
    setBag(null);
    if (!account || !states) return;
    let stale = false;
    (async () => {
      for (const s of states) {
        for (const [i, e] of s.t.entrants.entries()) {
          if (e.eliminated_in === null || s.info[i].status !== "Lost") continue;
          const c = BigInt(await view<string>(e.token, "claimable", { account }).catch(() => "0"));
          if (c > 0n && !stale) return setBag({ tid: s.t.id, name: e.name, amount: c });
        }
      }
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, states?.length]);
  if (!states) return null;
  if (!account) return { text: "Connect a wallet to launch a coin or back one.", cta: "Connect wallet", onClick: () => connector.connect().catch(() => {}) };
  if (bag) return { text: `${bag.name} lost its round. Convert your bag into the winner's tokens.`, cta: "Convert my bag", href: `#/t/${bag.tid}` };
  const due = states.find((s) => kindOf(s, now) === "action");
  if (due)
    return unsettled(due).length
      ? { text: `The $${due.t.ticker} round is over. Settle it: the caller is paid from the loser's reserve.`, cta: `Settle $${due.t.ticker}`, href: `#/t/${due.t.id}` }
      : { text: `$${due.t.ticker} is ready for its next round. Anyone can draw it and earns a small bounty.`, cta: "Draw the next round", href: `#/t/${due.t.id}` };
  const open = states.find((s) => kindOf(s, now) === "registering");
  if (open) return { text: `$${open.t.ticker} is open for copies for ${countdown(msLeft(open, now))}. Back one, or launch your own.`, cta: `Open $${open.t.ticker}`, href: `#/t/${open.t.id}` };
  return { text: "No bracket is waiting on you. Launch a ticker and open the next one.", cta: "Launch a coin", href: "#/launch" };
}

const FILTERS: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "action", label: "Action needed" },
  { key: "registering", label: "Registering" },
  { key: "playing", label: "Playing" },
  { key: "finished", label: "Completed" },
];
const ORDER: Record<Kind, number> = { action: 0, registering: 1, playing: 2, finished: 3 };

export default function Brackets({ account }: { account: string | null }) {
  const { data, error } = usePoll(loadAll, [], 8000);
  const now = useNow();
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [shown, setShown] = useState(5);
  const next = useNext(data, account, now);

  const sorted = useMemo(() => (data ?? []).slice().sort((x, y) => ORDER[kindOf(x, now)] - ORDER[kindOf(y, now)] || y.t.id - x.t.id), [data, now]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sorted.length };
    for (const s of sorted) c[kindOf(s, now)] = (c[kindOf(s, now)] ?? 0) + 1;
    return c;
  }, [sorted, now]);
  const list = sorted.filter((s) => filter === "all" || kindOf(s, now) === filter);

  return (
    <div className="page">
      <header className="pagehead">
        <h1>Brackets</h1>
        <p>One bracket per ticker. Open one to back a coin, settle a finished round, or convert a losing bag.</p>
      </header>

      {next && (
        <section className="next">
          <div>
            <p className="eyebrow accent">What to do next</p>
            <p>{next.text}</p>
          </div>
          {next.href ? (
            <a className="btn" href={next.href}>
              {next.cta}
            </a>
          ) : (
            <button className="btn" onClick={next.onClick}>
              {next.cta}
            </button>
          )}
        </section>
      )}

      <div className="filters" role="tablist" aria-label="Filter brackets">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? "on" : ""} onClick={() => (setFilter(f.key), setShown(5))}>
            {f.label} <span className="count">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && !data && <p className="error">Could not reach the arena: {error}</p>}
      {!data ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <div className="emptystate">
          <p>Nothing here yet.</p>
          <a className="btn" href="#/launch">
            Launch a coin
          </a>
        </div>
      ) : (
        <>
          <div className="tgrid">
            {list.slice(0, shown).map((s) => (
              <TournamentCard key={s.t.id} s={s} now={now} />
            ))}
          </div>
          {list.length > shown && (
            <button className="showmore" onClick={() => setShown((n) => n + 5)}>
              Show more <span>({list.length - shown} left)</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
