import { useState } from "react";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { view } from "./near";
import { RPCS } from "./config";
import { usePoll } from "./shared";
import { SectionHead } from "./Brand";
import "./crosschain.css";

/**
 * The two cross-chain matches this page reads, one per outcome. `crosschain/run.sh` plays new ones
 * and writes these numbers to `crosschain/last-run-<scenario>.json`.
 */
interface MatchRef {
  key: "evm-lost" | "near-lost";
  label: string;
  xarena: string;
  logsFrom: number;
  logsTo: number;
}
const MATCHES: MatchRef[] = [
  { key: "evm-lost", label: "the Base copy lost", xarena: "xarena-41572.memeduel-4a2d2e.testnet", logsFrom: 58_598_077, logsTo: 58_600_845 },
  { key: "near-lost", label: "the NEAR copy lost", xarena: "xarena-40795.memeduel-4a2d2e.testnet", logsFrom: 58_594_178, logsTo: 58_596_901 },
];

const BASE_RPCS = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"];
const BASESCAN = "https://sepolia.basescan.org";
const NEARBLOCKS = "https://testnet.nearblocks.io";
const USDC_BASE = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const T = {
  bought: "0x4ed3ccdc6a3e97922d1b04ad388487c42bfef808e6380dc7180004114803de0b",
  released: "0xb21fb52d5749b80f3182f8c6992236b5e5576681880914484d7f4c9b062e619e",
  won: "0xa96a0414e8f431a794f289d635c13771fe3dd21c1f91265eebd92ae2ee86929b",
  absorbed: "0xe316cebfac596b29a2d9da7cde2114fb3f095932bb46c38540d2183f50566853",
  granted: "0x830cad818db7fa43ac6053f645136c5d74a8a18439a8e0ed6735fbddff43fdd6",
};

interface Vote {
  kind: string;
  value: string;
  voters: string[];
}
interface XInfo {
  phase: "Playing" | "EvmLost" | "NearLost";
  ticker: string;
  stable: string;
  near_reserve: string;
  near_score: string;
  near_holders: number;
  near_holdings: string;
  evm_score: string | null;
  evm_score_in_near_units: string | null;
  chain_id: string;
  pool: string;
  evm_escrow: string;
  near_escrow: string;
  reporters: string[];
  threshold: number;
  votes: Vote[];
  mpc: string;
  path: string;
  verdict_digest: string | null;
  verdict_signature: string | null;
  holders_root: string | null;
  holders_supply: string;
  swapped: string;
  spoils: string;
  claimed: string;
  claims: number;
  grants: number;
  grants_signed: number;
}
interface Log {
  topics: string[];
  data: string;
  transactionHash: string;
}
interface Match {
  ref: MatchRef;
  info: XInfo;
  keys: number;
  derived: string;
  pool: { arena: string; score: bigint; released: boolean; won: boolean; supply: bigint; stableHeld: bigint; absorbedTokens: bigint; absorbedStable: bigint };
  bought: { amount: bigint; tx: string }[];
  released: { amount: bigint; tx: string } | null;
  wonTx: string | null;
  absorbed: { amount: bigint; spoils: bigint; tokens: bigint; tx: string } | null;
  granted: { to: string; tokens: bigint; nonce: bigint; tx: string }[];
  signer: string | null;
}

// ------------------------------------------------------------------ chain reads

const hexToBytes = (h: string) => Uint8Array.from((h.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16)));
const bytesToHex = (b: Uint8Array) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const evmAddress = (uncompressed64: Uint8Array) => bytesToHex(keccak_256(uncompressed64).slice(12));
const word = (hex: string, i: number) => BigInt("0x" + (hex.replace(/^0x/, "").slice(i * 64, i * 64 + 64) || "0"));
const signedWord = (hex: string, i: number) => BigInt.asIntN(256, word(hex, i));
const addrOfTopic = (t: string) => "0x" + t.slice(26);
const short = (a: string, n = 6) => (a.length > 2 * n + 2 ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : a);
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function base58(s: string): Uint8Array {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(A.indexOf(c));
  const out = new Uint8Array(64);
  for (let i = 63; i >= 0; i--) {
    out[i] = Number(n & 255n);
    n >>= 8n;
  }
  return out;
}

/** Base Sepolia JSON-RPC with retries and a second endpoint: public endpoints throttle. */
async function evm(method: string, params: unknown[]) {
  let last: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = await fetch(BASE_RPCS[attempt % BASE_RPCS.length], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      if (j.result === undefined || j.result === null) throw new Error(`empty answer to ${method}`);
      return j.result;
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 300 * 2 ** attempt));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
const call = (to: string, data: string) => evm("eth_call", [{ to, data }, "latest"]) as Promise<string>;
const sel = {
  arena: "0xfd3705f9",
  score: "0xefedc669",
  released: "0x96132521",
  won: "0x12c8052f",
  totalSupply: "0x18160ddd",
  stable: "0x22be3de1",
  absorbedTokens: "0xe4f37f15",
  absorbedStable: "0x4c154178",
  balanceOf: "0x70a08231",
};

/** The public endpoint returns logs for at most 200 blocks per request, so the range is read in slices. */
async function poolLogs(pool: string, from: number, to: number): Promise<Log[]> {
  const logs: Log[] = [];
  for (let start = from; start <= to; start += 200) {
    const end = Math.min(start + 199, to);
    logs.push(...((await evm("eth_getLogs", [{ address: pool, fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16) }])) as Log[]));
  }
  return logs;
}

async function accessKeys(account: string): Promise<number> {
  const r = await fetch(RPCS[0], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key_list", finality: "final", account_id: account } }),
  });
  return (await r.json()).result.keys.length;
}

function recoverSigner(digest: string, signature: string): string | null {
  try {
    const sig = hexToBytes(signature);
    const s = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact").addRecoveryBit(sig[64] - 27);
    return evmAddress(s.recoverPublicKey(hexToBytes(digest)).toBytes(false).slice(1));
  } catch {
    return null;
  }
}

async function loadMatch(ref: MatchRef): Promise<Match> {
  const info = await view<XInfo>(ref.xarena, "get_info");
  const p = info.pool;
  const [keys, derivedKey, arenaW, scoreW, releasedW, wonW, supplyW, stableW, absTokW, absStW, logs] = await Promise.all([
    accessKeys(ref.xarena),
    view<string>(info.mpc, "derived_public_key", { path: info.path, predecessor: ref.xarena, domain_id: 0 }),
    call(p, sel.arena),
    call(p, sel.score),
    call(p, sel.released),
    call(p, sel.won),
    call(p, sel.totalSupply),
    call(p, sel.stable),
    call(p, sel.absorbedTokens),
    call(p, sel.absorbedStable),
    poolLogs(p, ref.logsFrom, ref.logsTo),
  ]);
  const stableAddr = "0x" + stableW.slice(26);
  const held = await call(stableAddr, sel.balanceOf + p.replace(/^0x/, "").toLowerCase().padStart(64, "0"));
  const of = (topic: string) => logs.filter((l) => l.topics[0] === topic);
  const rel = of(T.released)[0];
  const abs = of(T.absorbed)[0];
  return {
    ref,
    info,
    keys,
    derived: evmAddress(base58(derivedKey.split(":")[1])),
    pool: {
      arena: "0x" + arenaW.slice(26),
      score: signedWord(scoreW, 0),
      released: word(releasedW, 0) === 1n,
      won: word(wonW, 0) === 1n,
      supply: word(supplyW, 0),
      stableHeld: word(held, 0),
      absorbedTokens: word(absTokW, 0),
      absorbedStable: word(absStW, 0),
    },
    bought: of(T.bought).map((l) => ({ amount: word(l.data, 0), tx: l.transactionHash })),
    released: rel ? { amount: word(rel.data, 0), tx: rel.transactionHash } : null,
    wonTx: of(T.won)[0]?.transactionHash ?? null,
    absorbed: abs ? { amount: word(abs.data, 0), spoils: word(abs.data, 1), tokens: word(abs.data, 2), tx: abs.transactionHash } : null,
    granted: of(T.granted).map((l) => ({ to: addrOfTopic(l.topics[1]), tokens: word(l.data, 0), nonce: word(l.data, 1), tx: l.transactionHash })),
    signer: info.verdict_digest && info.verdict_signature ? recoverSigner(info.verdict_digest, info.verdict_signature) : null,
  };
}

/** A live NEAR Intents (1Click) quote, dry: a price only; nothing moves. */
interface Quote {
  amountInFormatted: string;
  amountOutFormatted: string;
  minAmountOut: string;
  timeEstimate: number;
}
async function intentsQuote(evmLost: boolean, amount: bigint, pool: string): Promise<Quote> {
  // Base → NEAR: deposit on Base, delivered into an Intents balance on NEAR.
  // NEAR → Base: from an Intents balance, delivered straight to the winning pool on Base.
  const body = evmLost
    ? { originAsset: USDC_BASE, depositType: "ORIGIN_CHAIN", destinationAsset: USDC_NEAR, refundTo: pool, refundType: "ORIGIN_CHAIN", recipient: "hitc-winner.near", recipientType: "INTENTS" }
    : { originAsset: USDC_NEAR, depositType: "INTENTS", destinationAsset: USDC_BASE, refundTo: "hitc-winner.near", refundType: "INTENTS", recipient: pool, recipientType: "DESTINATION_CHAIN" };
  const r = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100, amount: amount.toString(), deadline: new Date(Date.now() + 3_600_000).toISOString(), ...body }),
  });
  const j = await r.json();
  if (!r.ok || !j.quote) throw new Error(j.message ?? `quote failed (${r.status})`);
  return j.quote as Quote;
}

const usd = (v: bigint | string, d = 2) => (Number(BigInt(v)) / 1e6).toFixed(d);
const tokensM = (v: bigint) => `${(Number(v) / 1e24).toFixed(1)}M`;
const sci = (v: bigint | string) => Number(BigInt(v)).toExponential(2).replace("e+", "e");

// ------------------------------------------------------------------ page

function Tag({ kind }: { kind: "real" | "trusted" | "stand-in" }) {
  return <span className={`xtag ${kind}`}>{kind}</span>;
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`xcheck ${ok ? "ok" : "bad"}`}>
      <i aria-hidden>{ok ? "✓" : "✕"}</i> {children}
    </p>
  );
}

function Tx({ hash, label }: { hash: string; label: string }) {
  return (
    <a href={`${BASESCAN}/tx/${hash}`} target="_blank" rel="noreferrer">
      {label} {short(hash, 4)} ↗
    </a>
  );
}

export default function CrossChain() {
  const [which, setWhich] = useState<MatchRef["key"]>("evm-lost");
  const ref = MATCHES.find((m) => m.key === which) ?? MATCHES[0];
  const { data: m, error } = usePoll(() => loadMatch(ref), [ref.key], 30_000);
  const live = m && m.ref.key === ref.key ? m : null;
  const evmLost = live?.info.phase === "EvmLost";
  const swapIn = live ? (evmLost ? live.released?.amount ?? 0n : BigInt(live.info.near_holdings)) : 0n;
  const { data: quote, error: quoteError } = usePoll(
    () => (live && swapIn > 0n ? intentsQuote(evmLost, swapIn, live.info.pool) : Promise.resolve(null)),
    [ref.key, swapIn.toString()],
    60_000,
  );

  return (
    <div className="page xpage">
      <SectionHead n="04" label="CROSS-CHAIN · SPIKE" title="one ticker, two chains">
        <p className="secsub">
          A $HUANG on NEAR against a $HUANG on Base, judged by a NEAR contract with no keys. It moves the loser's liquidity on Base through NEAR Chain Signatures, and pays the loser's holders on the other chain. Both copies trade against test USDC, so their scores compare without a price oracle. Read live from NEAR testnet and Base Sepolia.
        </p>
      </SectionHead>

      <div className="xtabs" role="tablist">
        {MATCHES.map((x) => (
          <button key={x.key} role="tab" aria-selected={x.key === which} className={x.key === which ? "on" : ""} onClick={() => setWhich(x.key)}>
            {x.label}
          </button>
        ))}
      </div>

      {!live ? <p className="muted">{error ? `Could not read the match: ${error}` : "Reading NEAR testnet and Base Sepolia…"}</p> : <MatchView m={live} quote={quote ?? null} quoteError={quoteError} />}
    </div>
  );
}

function MatchView({ m, quote, quoteError }: { m: Match; quote: Quote | null; quoteError: string | null }) {
  const { info, pool } = m;
  const xa = m.ref.xarena;
  const evmLost = info.phase === "EvmLost";
  const nearLost = info.phase === "NearLost";
  const nearScore = BigInt(info.near_score);
  const evmScore = info.evm_score_in_near_units ? BigInt(info.evm_score_in_near_units) : pool.score;
  const pos = (v: bigint) => (v > 0n ? v : 0n);
  const total = pos(nearScore) + pos(evmScore) || 1n;
  const nearPct = Number((pos(nearScore) * 1000n) / total) / 10;
  const bought = m.bought.reduce((s, b) => s + b.amount, 0n);
  const scoreVote = info.votes.find((v) => v.kind === "score" && v.voters.length >= info.threshold);
  const holdersVote = info.votes.find((v) => v.kind === "holders" && v.voters.length >= info.threshold);
  const verdict = evmLost ? "Release(to, nonce)" : "Won(nonce)";

  return (
    <>
      <section className="xmatch">
        <article className={`xside nearside ${nearLost ? "lost" : evmLost ? "won" : ""}`}>
          <header>
            <span className="xchain">NEAR testnet</span>
            {evmLost && <span className="stamp won">WINNER</span>}
            {nearLost && <span className="stamp lost">ABSORBED</span>}
          </header>
          <h2>${info.ticker}</h2>
          <a className="xacct" href={`${NEARBLOCKS}/address/${xa}`} target="_blank" rel="noreferrer">
            {short(xa, 10)} ↗
          </a>
          <dl>
            <div>
              <dt>Reserve now</dt>
              <dd>{usd(info.near_reserve)} tUSDC</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{sci(nearScore)}</dd>
            </div>
          </dl>
        </article>
        <div className="xvs">
          <span>vs</span>
          <div className="scorebar">
            <div className="fill a" style={{ width: `${nearPct}%` }} />
            <div className="fill b" style={{ width: `${100 - nearPct}%` }} />
          </div>
          <small>scores in the same unit · tUSDC × seconds</small>
        </div>
        <article className={`xside baseside ${evmLost ? "lost" : nearLost ? "won" : ""}`}>
          <header>
            <span className="xchain base">Base Sepolia</span>
            {nearLost && <span className="stamp won">WINNER</span>}
            {evmLost && <span className="stamp lost">ABSORBED</span>}
          </header>
          <h2>${info.ticker}</h2>
          <a className="xacct" href={`${BASESCAN}/address/${info.pool}`} target="_blank" rel="noreferrer">
            {short(info.pool)} ↗
          </a>
          <dl>
            <div>
              <dt>Reserve now</dt>
              <dd>{usd(pool.stableHeld)} tUSDC</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{sci(pool.score)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <SectionHead n="05" label="HOW IT RAN" />
      <ol className="xsteps">
        <li>
          <i>01</i>
          <div>
            <b>
              a judge with no keys <Tag kind="real" />
            </b>
            <p>
              The match runs in <code>{short(xa, 10)}</code>, a NEAR contract with <b>{m.keys}</b> access keys. Nobody can sign as it, so only its own code can ask for signatures.
            </p>
            <Check ok={m.keys === 0}>no access keys, read live from NEAR</Check>
          </div>
        </li>
        <li>
          <i>02</i>
          <div>
            <b>
              its address on Base <Tag kind="real" />
            </b>
            <p>
              Chain Signatures (<code>{info.mpc}</code>) derives an EVM address from the contract account and the path <code>{info.path}</code>: <code>{short(m.derived)}</code>. The pool on Base obeys only signatures from <code>{short(pool.arena)}</code>.
            </p>
            <Check ok={same(m.derived, pool.arena)}>derived again in your browser from the MPC key, and it is the address the pool trusts</Check>
          </div>
        </li>
        <li>
          <i>03</i>
          <div>
            <b>
              both copies bought, in the same stablecoin <Tag kind="real" />
            </b>
            <p>
              {usd(info.near_holdings)} tUSDC into the NEAR copy by {info.near_holders} holder{info.near_holders === 1 ? "" : "s"}, {usd(bought)} tUSDC into the Base copy, which minted {tokensM(pool.supply - pool.absorbedTokens)} ${info.ticker} on its curve
              {m.bought[0] && (
                <>
                  {" "}
                  (<Tx hash={m.bought[0].tx} label="buy" />)
                </>
              )}
              . Each unit of net inflow scores amount × seconds left. Both sides count test USDC, so the scores compare directly: no price oracle.
            </p>
          </div>
        </li>
        <li>
          <i>04</i>
          <div>
            <b>
              the bell: reporters bring the Base score to NEAR <Tag kind="trusted" />
            </b>
            <p>
              NEAR cannot read Base by itself. {info.reporters.length} reporters read the pool's score; it counts only once {info.threshold} of them report the same value
              {scoreVote ? `: ${scoreVote.voters.map((v) => v.split(".")[0]).join(" and ")} agreed on ${sci(scoreVote.value)}` : ""}. In this spike all three reporters are test accounts; spread across independent parties, one dishonest reporter could not change the result.
            </p>
            <Check ok={!!info.evm_score && BigInt(info.evm_score) === pool.score}>the agreed score equals the pool's on-chain score</Check>
          </div>
        </li>
        <li>
          <i>05</i>
          <div>
            <b>
              NEAR decides, the MPC network signs <Tag kind="real" />
            </b>
            <p>
              <code>settle</code> compared the scores: {evmLost ? "the Base copy lost" : nearLost ? "the NEAR copy lost" : "not settled yet"}. The contract asked the MPC network to sign <code>{verdict}</code> as EIP-712, hashed on NEAR exactly as the pool hashes it.
            </p>
            {info.verdict_signature && (
              <p className="xmono">
                digest {short(info.verdict_digest ?? "", 8)}
                <br />
                signature {short(info.verdict_signature, 10)}
              </p>
            )}
            {info.verdict_signature && <Check ok={same(m.signer, pool.arena)}>the signature recovers, in your browser, to the arena's Base address</Check>}
          </div>
        </li>
        {evmLost ? (
          <>
            <li>
              <i>06</i>
              <div>
                <b>
                  anyone relays it: the loser's reserve leaves Base <Tag kind="real" />
                </b>
                <p>
                  {m.released ? (
                    <>
                      <Tx hash={m.released.tx} label="release" /> moved the whole reserve, {usd(m.released.amount)} tUSDC, out of the pool, which now holds {usd(pool.stableHeld)} tUSDC and will never release again.
                    </>
                  ) : (
                    "Waiting for someone to relay the signature."
                  )}
                </p>
                <Check ok={pool.released && pool.stableHeld === 0n}>
                  pool <code>released() = {String(pool.released)}</code>
                </Check>
              </div>
            </li>
            <li>
              <i>07</i>
              <div>
                <b>
                  across to NEAR <Tag kind="stand-in" />
                </b>
                <p>
                  Only the price is real here. NEAR Intents runs on mainnet, so the page asks it for a quote, and the run delivered the quoted amount as test USDC: {usd(info.swapped)} tUSDC arrived, and 15% of it, {usd(info.spoils)}, stays with the winner as spoils.
                </p>
                <QuoteBox quote={quote} error={quoteError} />
              </div>
            </li>
            <li>
              <i>08</i>
              <div>
                <b>
                  holders of the Base copy claim on NEAR <Tag kind="real" /> <Tag kind="trusted" />
                </b>
                <p>
                  A holder signs <code>HITC claim {info.ticker} copy on {info.chain_id} to &lt;NEAR account&gt;</code> with their EVM key. The contract checks it with <code>ecrecover</code>, checks their balance at the bell against the holders' Merkle root, and pays their share of the other 85%. The checks are real; the root comes from the reporters
                  {holdersVote ? ` (${holdersVote.voters.length} of ${info.reporters.length} agreed)` : ""}.
                </p>
                <p className="xmono">
                  {info.claims} claim{info.claims === 1 ? "" : "s"}, {usd(info.claimed, 4)} tUSDC paid
                </p>
                <Check ok={info.claims > 0 && BigInt(info.claimed) <= BigInt(info.swapped) - (BigInt(info.swapped) * 1500n) / 10000n}>claims paid out of the holders' 85%, never more</Check>
              </div>
            </li>
          </>
        ) : (
          <>
            <li>
              <i>06</i>
              <div>
                <b>
                  anyone relays it: the Base copy reopens as the winner <Tag kind="real" />
                </b>
                <p>
                  {m.wonTx ? <Tx hash={m.wonTx} label="markWon" /> : "Waiting for someone to relay the signature."} The NEAR copy's reserve left this contract towards the winner, and the pool accepts the absorbed reserve and trades again.
                </p>
                <Check ok={pool.won && BigInt(info.near_reserve) === 0n}>
                  pool <code>won() = {String(pool.won)}</code>, NEAR reserve {usd(info.near_reserve)} tUSDC
                </Check>
              </div>
            </li>
            <li>
              <i>07</i>
              <div>
                <b>
                  across to Base <Tag kind="stand-in" />
                </b>
                <p>
                  Only the price is real here. NEAR Intents runs on mainnet, so the page asks it for a quote; the run delivered test USDC to the pool's <code>absorb</code>
                  {m.absorbed && (
                    <>
                      {" "}
                      (<Tx hash={m.absorbed.tx} label="absorb" />): {usd(m.absorbed.amount)} tUSDC, of which {usd(m.absorbed.spoils)} stays as spoils and the rest bought {tokensM(m.absorbed.tokens)} ${info.ticker} held for the NEAR holders
                    </>
                  )}
                  .
                </p>
                <QuoteBox quote={quote} error={quoteError} />
              </div>
            </li>
            <li>
              <i>08</i>
              <div>
                <b>
                  NEAR holders receive the winner on Base <Tag kind="real" />
                </b>
                <p>
                  Each holder of the NEAR copy asks the contract for a <code>Grant(to, num, den, nonce)</code>: their holding over all holdings, to an address of their choosing, signed by the MPC network. No reporter is involved: their holding is recorded on NEAR. Anyone relays it and the pool pays num/den of the tokens it bought for them.
                </p>
                <ul className="xgrants">
                  {m.granted.map((g) => (
                    <li key={g.tx}>
                      <code>{short(g.to)}</code> received {tokensM(g.tokens)} ${info.ticker} · <Tx hash={g.tx} label="grant" />
                    </li>
                  ))}
                </ul>
                <Check ok={m.granted.length > 0 && m.granted.reduce((s, g) => s + g.tokens, 0n) <= pool.absorbedTokens}>
                  {m.granted.length} of {info.near_holders} holders paid, never more than the tokens bought for them
                </Check>
              </div>
            </li>
          </>
        )}
      </ol>

      <p className="hint xfoot">
        Spike on the <code>crosschain</code> branch: contracts in <code>crosschain/xarena</code> and <code>crosschain/evm</code>, test USDC on both chains, one full match per outcome with <code>crosschain/run.sh</code>. Not part of the submitted bracket rules.
      </p>
    </>
  );
}

function QuoteBox({ quote, error }: { quote: Quote | null; error: string | null }) {
  if (!quote) return <p className="xmono">{error ? `Intents quote unavailable: ${error}` : "Asking NEAR Intents for a live quote…"}</p>;
  return (
    <div className="xquote">
      <span className="tinylabel">NEAR Intents · live quote, dry run, nothing swapped</span>
      <strong>
        {quote.amountInFormatted} USDC → {Number(quote.amountOutFormatted).toFixed(4)} USDC
      </strong>
      <span>
        at least {(Number(quote.minAmountOut) / 1e6).toFixed(4)} after 1% slippage, in about {quote.timeEstimate} s
      </span>
    </div>
  );
}
