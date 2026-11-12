export const YOCTO = 10n ** 24n;
export const TOKEN = 10n ** 18n;

/** "1.5" -> 1500000000000000000000000n. Returns null for anything that is not a positive number. */
export function parseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const [whole, frac = ""] = t.split(".");
  const v = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals));
  return v > 0n ? v : null;
}

function toNumber(v: bigint, decimals: number): number {
  const scale = 10n ** BigInt(Math.max(decimals - 9, 0));
  return Number(v / scale) / 10 ** Math.min(decimals, 9);
}

export function near(v: bigint | string, digits = 2): string {
  const n = toNumber(BigInt(v), 24);
  if (n !== 0 && n < 10 ** -digits) return n.toPrecision(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function compact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export const tokens = (v: bigint | string) => compact(toNumber(BigInt(v), 18));

/** Contract score is micro-NEAR x milliseconds, signed. Show it as NEAR-hours. */
export function score(v: bigint | string): string {
  const n = Number(BigInt(v)) / 1e6 / 3_600_000;
  const abs = Math.abs(n);
  if (abs >= 100) return (n < 0 ? "-" : "") + compact(abs);
  return n.toFixed(abs >= 10 ? 1 : abs >= 1 ? 2 : 3);
}

export function countdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function duration(ns: bigint | string): string {
  const min = Number(BigInt(ns) / 60_000_000_000n);
  if (min >= 60) return `${+(min / 60).toFixed(1)} hours`;
  return `${min} minutes`;
}

export function ago(ns: string, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - Number(BigInt(ns) / 1_000_000n)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const short = (account: string) => (account.length > 22 ? account.slice(0, 9) + "…" + account.slice(-9) : account);
