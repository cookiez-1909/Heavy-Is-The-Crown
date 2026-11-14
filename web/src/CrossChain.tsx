import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { view } from "./near";
import { RPCS } from "./config";
import { usePoll } from "./shared";
import { SectionHead } from "./Brand";
import "./crosschain.css";

/** The cross-chain match this page reads. `crosschain/run.sh` prints a new one. */
const XARENA = import.meta.env.VITE_XARENA || "xarena-37994.memeduel-4a2d2e.testnet";
const BASE_RPCS = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"];
const BASESCAN = "https://sepolia.basescan.org";
const NEARBLOCKS = "https://testnet.nearblocks.io";
// The block range of this match on Base Sepolia. The public endpoint returns logs for at most 200 blocks
// per request, so the range is read in slices.
const LOGS_FROM_BLOCK = Number(import.meta.env.VITE_XLOGS_FROM || 58_580_679);
const LOGS_TO_BLOCK = Number(import.meta.env.VITE_XLOGS_TO || 58_583_047);
/** Example mainnet account standing for the winning coin; a dry quote only checks its format. */
const INTENTS_RECIPIENT = "hitc-winner.near";
const BOUGHT = "0x4ed3ccdc6a3e97922d1b04ad388487c42bfef808e6380dc7180004114803de0b"; // Bought(address,uint256,uint256,int256)
const RELEASED = "0xb21fb52d5749b80f3182f8c6992236b5e5576681880914484d7f4c9b062e619e";

interface XInfo {
  phase: "Playing" | "EvmLost" | "NearLost";
  ticker: string;
  round_end_ns: string;
  near_reserve: string;
  near_score: string;
  evm_score: string | null;
  evm_score_in_near: string | null;
  yocto_per_wei: string;
  chain_id: string;
  pool: string;
  evm_escrow: string;
  near_escrow: string;
  reporter: string;
  mpc: string;
  path: string;
  release_digest: string | null;
  release_signature: string | null;
  holders_root: string | null;
  holders_supply: string;
  swapped_near: string;
  spoils_near: string;
  claimed_near: string;
  claims: number;
}

interface Log {
  topics: string[];
  data: string;
  transactionHash: string;
}

interface Match {
  info: XInfo;
  keys: number;
  derived: string;
  pool: { arena: string; score: bigint; released: boolean; balance: bigint; roundEnd: number; supply: bigint };
  bought: { buyer: string; amount: bigint; tokens: bigint; tx: string }[];
  released: { to: string; amount: bigint; tx: string } | null;
  signer: string | null;
}

// ------------------------------------------------------------------ helpers

const hexToBytes = (h: string) => Uint8Array.from((h.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16)));
const bytesToHex = (b: Uint8Array) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const evmAddress = (uncompressed64: Uint8Array) => bytesToHex(keccak_256(uncompressed64).slice(12));
const word = (hex: string, i: number) => BigInt("0x" + hex.replace(/^0x/, "").slice(i * 64, i * 64 + 64));
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
const call = (to: string, selector: string) => evm("eth_call", [{ to, data: selector }, "latest"]) as Promise<string>;

async function poolLogs(pool: string): Promise<Log[]> {
  const logs: Log[] = [];
  for (let from = LOGS_FROM_BLOCK; from <= LOGS_TO_BLOCK; from += 200) {
    const to = Math.min(from + 199, LOGS_TO_BLOCK);
    logs.push(...((await evm("eth_getLogs", [{ address: pool, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }])) as Log[]));
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

/** Recovers the EVM address that produced `signature` over `digest`, in the browser. */
function recoverSigner(digest: string, signature: string): string | null {
  try {
    const sig = hexToBytes(signature);
    const s = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact").addRecoveryBit(sig[64] - 27);
    return evmAddress(s.recoverPublicKey(hexToBytes(digest)).toBytes(false).slice(1));
  } catch {
    return null;
  }
}

/**
 * A live NEAR Intents (1Click) quote for swapping the released ETH into NEAR. `dry` asks for a price
 * only: no deposit address is created and nothing moves. The NEAR is delivered into the recipient's
 * balance inside intents.near (recipientType INTENTS); delivering it straight to a NEAR wallet is
 * refused for this pair by the API.
 */
interface Quote {
  amountInFormatted: string;
  amountOutFormatted: string;
  minAmountOut: string;
  timeEstimate: number;
}
async function intentsQuote(amountWei: bigint, refundTo: string): Promise<Quote> {
  const r = await fetch("https://1click.chaindefuser.com/v0/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: "nep141:base.omft.near",
      depositType: "ORIGIN_CHAIN",
      destinationAsset: "nep141:wrap.near",
      amount: amountWei.toString(),
      refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: INTENTS_RECIPIENT,
      recipientType: "INTENTS",
      deadline: new Date(Date.now() + 3_600_000).toISOString(),
    }),
  });
  const body = await r.json();
  if (!r.ok || !body.quote) throw new Error(body.message ?? `quote failed (${r.status})`);
  return body.quote as Quote;
}

async function loadMatch(): Promise<Match> {
  const info = await view<XInfo>(XARENA, "get_info");
  const [keys, derivedKey, arenaW, scoreW, releasedW, endW, supplyW, balance, logs] = await Promise.all([
    accessKeys(XARENA),
    view<string>(info.mpc, "derived_public_key", { path: info.path, predecessor: XARENA, domain_id: 0 }),
    call(info.pool, "0xfd3705f9"),
    call(info.pool, "0xefedc669"),
    call(info.pool, "0x96132521"),
    call(info.pool, "0xc02e580e"),
    call(info.pool, "0x18160ddd"),
    evm("eth_getBalance", [info.pool, "latest"]) as Promise<string>,
    poolLogs(info.pool),
  ]);
  const rel = logs.find((l) => l.topics[0] === RELEASED);
  return {
    info,
    keys,
    derived: evmAddress(base58(derivedKey.split(":")[1])),
    pool: {
      arena: "0x" + arenaW.slice(26),
      score: signedWord(scoreW, 0),
      released: word(releasedW, 0) === 1n,
      balance: BigInt(balance),
      roundEnd: Number(word(endW, 0)),
      supply: word(supplyW, 0),
    },
    bought: logs.filter((l) => l.topics[0] === BOUGHT).map((l) => ({ buyer: addrOfTopic(l.topics[1]), amount: word(l.data, 0), tokens: word(l.data, 1), tx: l.transactionHash })),
    released: rel ? { to: addrOfTopic(rel.topics[1]), amount: word(rel.data, 0), tx: rel.transactionHash } : null,
    signer: info.release_digest && info.release_signature ? recoverSigner(info.release_digest, info.release_signature) : null,
  };
}

const near = (yocto: bigint | string, d = 3) => (Number(BigInt(yocto)) / 1e24).toFixed(d);
const eth = (wei: bigint, d = 4) => (Number(wei) / 1e18).toFixed(d);
const sci = (v: bigint | string) => Number(BigInt(v)).toExponential(2).replace("e+", "e");
const millions = (v: bigint) => `${(Number(v) / 1e24).toFixed(1)}M`;

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

export default function CrossChain() {
  const { data: m, error } = usePoll(loadMatch, [], 20_000);
  const swapAmount = m?.released?.amount ?? 0n;
  const { data: quote, error: quoteError } = usePoll(
    () => (swapAmount > 0n ? intentsQuote(swapAmount, m!.info.pool) : Promise.resolve(null)),
    [swapAmount.toString()],
    60_000,
  );

  if (!m) {
    return (
      <div className="page xpage">
        <SectionHead n="04" label="CROSS-CHAIN · SPIKE" title="one ticker, two chains" />
        <p className="muted">{error ? `Could not read the match: ${error}` : "Reading NEAR testnet and Base Sepolia…"}</p>
      </div>
    );
  }

  const { info, pool } = m;
  const nearScore = BigInt(info.near_score);
  const evmInNear = info.evm_score_in_near ? BigInt(info.evm_score_in_near) : 0n;
  const total = nearScore + evmInNear || 1n;
  const nearPct = Number((nearScore * 1000n) / total) / 10;
  const evmLost = info.phase === "EvmLost";
  const nearLost = info.phase === "NearLost";
  const ethPerNear = Number(info.yocto_per_wei) / 1e6;
  const boughtWei = m.bought.reduce((s, b) => s + b.amount, 0n);
  const derivedOk = same(m.derived, pool.arena);
  const signerOk = same(m.signer, pool.arena);

  return (
    <div className="page xpage">
      <SectionHead n="04" label="CROSS-CHAIN · SPIKE" title="one ticker, two chains">
        <p className="secsub">
          A ${info.ticker} on NEAR fought a ${info.ticker} on Base. The NEAR contract that judged the match has no keys, yet it moved the loser's liquidity on Base: NEAR Chain Signatures signed for it. Read live from NEAR testnet and Base Sepolia.
        </p>
      </SectionHead>

      <section className="xmatch">
        <article className={`xside nearside ${nearLost ? "lost" : evmLost ? "won" : ""}`}>
          <header>
            <span className="xchain">NEAR testnet</span>
            {evmLost && <span className="stamp won">WINNER</span>}
            {nearLost && <span className="stamp lost">ABSORBED</span>}
          </header>
          <h2>${info.ticker}</h2>
          <a className="xacct" href={`${NEARBLOCKS}/address/${XARENA}`} target="_blank" rel="noreferrer">
            {short(XARENA, 10)} ↗
          </a>
          <dl>
            <div>
              <dt>Reserve</dt>
              <dd>{near(info.near_reserve)} NEAR</dd>
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
          <small>both scored in NEAR terms · 1 ETH = {Math.round(ethPerNear)} NEAR</small>
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
              <dd>{eth(pool.balance)} ETH</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{info.evm_score_in_near ? sci(evmInNear) : "—"}</dd>
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
              The match runs in <code>{short(XARENA, 10)}</code>, a NEAR contract with <b>{m.keys}</b> access keys. Nobody can sign as it, so only its own code can ask for signatures.
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
              Chain Signatures (<code>{info.mpc}</code>) derives an EVM address from the contract account and the path <code>{info.path}</code>: <code>{short(m.derived)}</code>. The pool on Base only obeys signatures from <code>{short(pool.arena)}</code>.
            </p>
            <Check ok={derivedOk}>derived again in your browser from the MPC key, and it is the address the pool trusts</Check>
          </div>
        </li>
        <li>
          <i>03</i>
          <div>
            <b>
              both copies bought <Tag kind="real" />
            </b>
            <p>
              {near(info.near_reserve)} NEAR into the NEAR copy, {eth(boughtWei)} ETH into the Base copy, which minted {millions(pool.supply)} ${info.ticker} tokens on its curve
              {m.bought.map((b) => (
                <span key={b.tx}>
                  {" "}
                  (
                  <a href={`${BASESCAN}/tx/${b.tx}`} target="_blank" rel="noreferrer">
                    buy {short(b.tx, 4)} ↗
                  </a>
                  )
                </span>
              ))}
              . Each buy scores amount × seconds left in the round, on both chains. On Base, selling burns tokens and pays a tax that climbs to 15% at the bell and stays in the pool; at the bell trading and transfers freeze.
            </p>
          </div>
        </li>
        <li>
          <i>04</i>
          <div>
            <b>
              the bell, and the Base score reaches NEAR <Tag kind="trusted" /> <Tag kind="stand-in" />
            </b>
            <p>
              After the bell <code>{short(info.reporter, 10)}</code> reported the pool's score ({sci(pool.score)} wei·s). NEAR cannot read Base by itself: a light client or an oracle would replace this reporter. ETH is converted at a rate fixed when the match was deployed; a price oracle would replace it.
            </p>
            <Check ok={!!info.evm_score && BigInt(info.evm_score) === pool.score}>the reported score equals the pool's on-chain score</Check>
          </div>
        </li>
        <li>
          <i>05</i>
          <div>
            <b>
              NEAR decides, the MPC network signs <Tag kind="real" />
            </b>
            <p>
              <code>settle</code> compared the scores: {evmLost ? "the Base copy lost" : nearLost ? "the NEAR copy lost" : "not settled yet"}. The contract then asked the MPC network to sign <code>Release(to, nonce)</code> as EIP-712, hashed on NEAR exactly as the pool hashes it.
            </p>
            {info.release_signature && (
              <p className="xmono">
                digest {short(info.release_digest ?? "", 8)}
                <br />
                signature {short(info.release_signature, 10)}
              </p>
            )}
            {info.release_signature && <Check ok={signerOk}>the signature recovers, in your browser, to the arena's Base address</Check>}
          </div>
        </li>
        <li>
          <i>06</i>
          <div>
            <b>
              anyone relays it to Base <Tag kind="real" />
            </b>
            {m.released ? (
              <p>
                <a href={`${BASESCAN}/tx/${m.released.tx}`} target="_blank" rel="noreferrer">
                  release {short(m.released.tx, 4)} ↗
                </a>{" "}
                moved the loser's whole reserve, {eth(m.released.amount)} ETH, out of the pool. The pool now holds {eth(pool.balance)} ETH and will never release again.
              </p>
            ) : (
              <p>Waiting for someone to relay the signature.</p>
            )}
            <Check ok={pool.released && pool.balance === 0n}>
              pool <code>released() = {String(pool.released)}</code>, balance {eth(pool.balance)} ETH
            </Check>
          </div>
        </li>
        <li>
          <i>07</i>
          <div>
            <b>
              the swap into NEAR <Tag kind="stand-in" />
            </b>
            <p>
              The reserve went to <code>{short(info.evm_escrow)}</code>. On mainnet that would be a NEAR Intents deposit address: solvers swap the ETH and deliver NEAR into the winner's balance in <code>intents.near</code>. Intents runs on mainnet only, so here the quote is live and the delivery is a stand-in: <code>deliver_swap</code> brought {near(info.swapped_near, 4)} testnet NEAR, the amount the quote promised. 15% of it, {near(info.spoils_near, 4)} NEAR, stays with the winner as spoils.
            </p>
            {quote ? (
              <div className="xquote">
                <span className="tinylabel">Live NEAR Intents quote · dry run, nothing swapped</span>
                <strong>
                  {quote.amountInFormatted} ETH on Base → {Number(quote.amountOutFormatted).toFixed(4)} NEAR
                </strong>
                <span>
                  at least {(Number(quote.minAmountOut) / 1e24).toFixed(4)} NEAR after 1% slippage, in about {quote.timeEstimate} s
                </span>
              </div>
            ) : (
              <p className="xmono">{quoteError ? `Intents quote unavailable: ${quoteError}` : swapAmount > 0n ? "Asking NEAR Intents for a live quote…" : ""}</p>
            )}
          </div>
        </li>
        <li>
          <i>08</i>
          <div>
            <b>
              holders of the Base copy claim on NEAR <Tag kind="real" /> <Tag kind="trusted" />
            </b>
            <p>
              A holder signs <code>HITC claim {info.ticker} copy on {info.chain_id} to &lt;NEAR account&gt;</code> with their EVM key. The NEAR contract checks the signature with <code>ecrecover</code>, checks their balance at the bell against the holders' Merkle root, and pays their share of the other 85% to that NEAR account. The signature and proof checks are real; the root is posted by the reporter.
            </p>
            {info.holders_root && (
              <p className="xmono">
                root {short(info.holders_root, 8)} · supply {millions(BigInt(info.holders_supply))}
                <br />
                {info.claims} claim{info.claims === 1 ? "" : "s"}, {near(info.claimed_near, 4)} NEAR paid
              </p>
            )}
            <Check ok={!!info.holders_root && BigInt(info.holders_supply) === pool.supply}>the root covers the pool's whole supply at the bell</Check>
            <Check ok={info.claims > 0 && BigInt(info.claimed_near) <= (BigInt(info.swapped_near) * 85n) / 100n}>
              claims paid out of the holders' 85%, never more
            </Check>
          </div>
        </li>
      </ol>

      <p className="hint xfoot">
        Spike on the <code>crosschain</code> branch: contracts in <code>crosschain/xarena</code> and <code>crosschain/evm</code>, one full match with <code>crosschain/run.sh</code>. Not part of the submitted bracket rules.
      </p>
    </div>
  );
}
