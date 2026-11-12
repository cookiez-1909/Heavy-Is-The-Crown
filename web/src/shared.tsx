import { useCallback, useEffect, useRef, useState } from "react";
import { connector, errorText, view } from "./near";
import type { Info, Tournament } from "./types";

// ------------------------------------------------------------------ polling

export function usePoll<T>(load: () => Promise<T>, deps: unknown[], everyMs = 6000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fn = useRef(load);
  fn.current = load;
  const refresh = useCallback(async () => {
    try {
      setData(await fn.current());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    setData(null);
    refresh();
    const id = setInterval(refresh, everyMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, refresh };
}

/** Ticks once a second. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ------------------------------------------------------------------- toasts

type Toast = { id: number; kind: "ok" | "err" | "info"; text: string };
let push: (t: Omit<Toast, "id">) => void = () => {};
export const toast = (kind: Toast["kind"], text: string) => push({ kind, text });

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.kind === "err" ? 9000 : 4500);
    };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Runs a wallet action with busy state and toasts. */
export function useAction(after?: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, done: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      toast("ok", done);
      after?.();
    } catch (e) {
      toast("err", errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export async function ensureWallet(account: string | null): Promise<boolean> {
  if (account) return true;
  try {
    await connector.connect();
  } catch {
    /* user closed the picker */
  }
  return false;
}

// -------------------------------------------------------------------- coins

const icons = new Map<string, Promise<string | null>>();
function iconOf(token: string) {
  if (!icons.has(token)) {
    icons.set(
      token,
      view<{ icon: string | null }>(token, "ft_metadata")
        .then((m) => m.icon)
        .catch(() => null),
    );
  }
  return icons.get(token)!;
}

/** Drops onto the overall winner of a bracket. */
export function Crown({ size }: { size: number }) {
  return (
    <svg className="crown" viewBox="0 0 64 42" width={size} height={(size * 42) / 64} aria-hidden>
      <path d="M5 33 L8 11 L22 25 L32 5 L42 25 L56 11 L59 33 Z" fill="#ffd23f" stroke="#7a5c00" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="4" y="31" width="56" height="8" rx="2.5" fill="#f2b705" stroke="#7a5c00" strokeWidth="2.5" />
      <circle cx="8" cy="10" r="4" fill="#ffd23f" stroke="#7a5c00" strokeWidth="2" />
      <circle cx="32" cy="5" r="4" fill="#ffd23f" stroke="#7a5c00" strokeWidth="2" />
      <circle cx="56" cy="10" r="4" fill="#ffd23f" stroke="#7a5c00" strokeWidth="2" />
      <circle cx="19" cy="35" r="2.4" fill="#f0473c" />
      <circle cx="32" cy="35" r="2.4" fill="#45c486" />
      <circle cx="45" cy="35" r="2.4" fill="#f0473c" />
    </svg>
  );
}

export function Coin({ token, icon, symbol, size = 56, crown }: { token?: string; icon?: string | null; symbol: string; size?: number; crown?: boolean }) {
  const [src, setSrc] = useState<string | null>(icon ?? null);
  useEffect(() => {
    if (icon !== undefined) return setSrc(icon);
    if (token) iconOf(token).then(setSrc);
  }, [token, icon]);
  const style = { width: size, height: size, fontSize: size * 0.36 };
  const coin = src ? (
    <img className="coin" src={src} alt="" style={style} />
  ) : (
    <span className="coin placeholder" style={style} aria-hidden>
      {symbol.slice(0, 2)}
    </span>
  );
  if (!crown) return coin;
  return (
    <span className="crowned" title="Champion">
      {coin}
      <Crown size={size * 0.82} />
    </span>
  );
}

// -------------------------------------------------------- tournament state

export interface TState {
  t: Tournament;
  info: Info[];
  /** chain time minus local time, in ms, at the moment of the fetch */
  skew: number;
}

export async function loadTournament(t: Tournament): Promise<TState> {
  const info = await Promise.all(t.entrants.map((e) => view<Info>(e.token, "get_info")));
  const chainMs = info.length ? Number(BigInt(info[0].now_ns) / 1_000_000n) : Date.now();
  return { t, info, skew: chainMs - Date.now() };
}

export const msLeft = (s: TState, nowMs: number) => Number(BigInt(s.t.round_end_ns) / 1_000_000n) - (nowMs + s.skew);

export const alive = (t: Tournament) => t.entrants.map((_, i) => i).filter((i) => t.entrants[i].eliminated_in === null);

/** Matches of the current round whose result is not on the tokens yet. */
export function unsettled(s: TState): number[] {
  if (s.t.phase !== "Playing") return [];
  return alive(s.t).filter((i) => s.info[i].status === "Live" && s.info[i].rival !== null);
}

export function roundName(t: Tournament, round: number): string {
  if (round === 0) return "Registration";
  const size = t.rounds[round - 1]?.reduce((n, m) => n + (m.b === null ? 1 : 2), 0) ?? 0;
  if (size <= 2) return "Final";
  if (size <= 4) return "Semi-final";
  if (size <= 8) return "Quarter-final";
  return `Round ${round}`;
}

/** Share of the bar for side A given two signed scores, 0..100. */
export function share(a: string, b: string): number {
  let x = Number(BigInt(a));
  let y = Number(BigInt(b));
  const low = Math.min(x, y, 0);
  x -= low;
  y -= low;
  return x + y === 0 ? 50 : (x / (x + y)) * 100;
}

export function ScoreBar({ a, b, label }: { a: string; b: string; label: string }) {
  const p = share(a, b);
  return (
    <div className="scorebar" role="img" aria-label={label}>
      <div className="fill a" style={{ width: `${p}%` }} />
      <div className="fill b" style={{ width: `${100 - p}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ motion

/** Fades its children up the first time they scroll into view. */
export function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <div ref={ref} className={`reveal ${seen ? "in" : ""}`}>
      {children}
    </div>
  );
}
