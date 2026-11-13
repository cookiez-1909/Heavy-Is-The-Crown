import { useEffect, useRef, useState } from "react";
import { ARENA } from "./config";
import { call, TGAS, view } from "./near";
import { duration, near, parseUnits } from "./fmt";
import { COLORS, EMOJI, makeIcon } from "./icon";
import { ensureWallet, roundName, useAction, useNow, usePoll } from "./shared";
import { confirmRisk } from "./ui";
import type { Config, Tournament } from "./types";

const SUPPLY = 1_000_000_000n;
const ICON_LIMIT = 4096; // bytes the arena accepts for an on-chain icon

/** Shrinks any picture to a square data URL small enough to live on-chain. */
async function toIcon(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  for (const size of [96, 80, 64, 48]) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    for (const type of ["image/webp", "image/jpeg"]) {
      for (const q of [0.82, 0.7, 0.55, 0.4]) {
        const url = canvas.toDataURL(type, q);
        if (url.startsWith("data:" + type) && url.length <= ICON_LIMIT) return url;
      }
    }
  }
  throw new Error("This picture stays too large even when shrunk. Try a simpler one.");
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={`counter ${n > max ? "over" : ""}`}>{`${n}/${max}`}</span>;
}

export default function Launch({ account, ticker: initialTicker }: { account: string | null; ticker: string }) {
  const { data: config } = usePoll(() => view<Config>(ARENA, "get_config"), [], 60_000);
  const [step, setStep] = useState<1 | 2>(1);
  const [ticker, setTicker] = useState(initialTicker);
  const [name, setName] = useState("");
  const [upload, setUpload] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [emoji, setEmoji] = useState(EMOJI[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [seedText, setSeedText] = useState("");
  const [existing, setExisting] = useState<Tournament | null | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useNow();
  const sym = ticker.trim().toUpperCase();
  const validTicker = /^[A-Z0-9]{2,8}$/.test(sym);
  const { busy, run } = useAction(async () => {
    const t = await view<Tournament | null>(ARENA, "get_by_ticker", { ticker: sym }).catch(() => null);
    if (t) window.location.hash = `#/t/${t.id}`;
  });

  useEffect(() => setTicker(initialTicker), [initialTicker]);
  useEffect(() => {
    if (config && !seedText) setSeedText(near(BigInt(config.min_seed), 3));
  }, [config, seedText]);
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

  if (!config) return <p className="muted page">Loading…</p>;

  const icon = upload ?? makeIcon(emoji, color);
  const fee = BigInt(config.launch_fee);
  const minSeed = BigInt(config.min_seed);
  const seed = parseUnits(seedText, 24);
  const p = config.penalty_bps / 100;
  const regOpen = existing?.phase === "Registration" && Number(BigInt(existing.round_end_ns) / 1_000_000n) > now;
  const regLeft = regOpen ? Number(BigInt(existing!.round_end_ns) / 1_000_000n) - now : 0;
  const full = !!existing && regOpen && existing.entrants.length + existing.pending_launches >= config.max_entrants;
  const locked = !!existing && existing.phase !== "Finished" && !regOpen;
  const nameBytes = new TextEncoder().encode(name.trim()).length;

  let where: { text: string; bad?: boolean } | null = null;
  let badge = "Opens a bracket";
  if (validTicker && existing !== undefined) {
    if (!existing) where = { text: `Nobody has $${sym} here. You open its bracket; copies have ${duration(config.registration_ns)} to join.` };
    else if (locked) where = { text: `$${sym} is locked: its bracket is in the ${roundName(existing, existing.round).toLowerCase()}. Come back for the next season.`, bad: true };
    else if (full) where = { text: `The $${sym} bracket is full (${config.max_entrants} coins).`, bad: true };
    else if (regOpen) {
      where = { text: `Joins the $${sym} bracket: ${existing.entrants.length} of ${config.max_entrants} copies registered, ${Math.ceil(regLeft / 60000)} min left to join.` };
      badge = `Joins as copy ${existing.entrants.length + 1}`;
    } else {
      where = { text: `$${sym} has a champion (${existing.champion !== null ? existing.entrants[existing.champion].name : "none"}). You open season ${existing.season + 1} and will face it.` };
      badge = `Season ${existing.season + 1} vs champion`;
    }
  }
  const identityProblem =
    nameBytes === 0 ? "Give it a name." : nameBytes > 32 ? "Name is too long." : !validTicker ? "Ticker: 2 to 8 letters or digits." : where?.bad ? where.text : null;
  const seedProblem = !seed || seed < minSeed ? `Seed at least ${near(minSeed, 3)} NEAR.` : null;
  const v = BigInt(config.virtual_near);
  const seedTokens = seed && !seedProblem ? (SUPPLY * seed) / (v + seed) : null;

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setUploadError(null);
    try {
      setUpload(await toIcon(f));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not read this picture.");
    }
  };

  const launch = async () => {
    if (identityProblem || seedProblem || !seed) return;
    if (!(await ensureWallet(account))) return;
    const ok = await confirmRisk({
      title: `Launch $${sym}`,
      lines: [
        { label: "Leaves your wallet", value: `${near(fee + seed, 3)} NEAR`, tone: "out" },
        { label: "Your seed buys", value: `≈ ${seedTokens?.toLocaleString("en-US")} ${sym}`, tone: "in" },
        { label: "Launch fee, not refundable", value: `${near(fee)} NEAR`, tone: "lost" },
      ],
      risks: [
        regOpen ? `Your coin enters the $${sym} bracket against ${existing!.entrants.length} other cop${existing!.entrants.length === 1 ? "y" : "ies"}.` : `Every copy of $${sym} launched in the next ${duration(config.registration_ns)} joins your bracket.`,
        `If your coin loses a round, ${p}% of its liquidity goes to the winner. Its holders, you included, get the rest back as winner tokens.`,
        "One coin per account per bracket: this account cannot launch another copy of this ticker until the bracket ends.",
        "NEAR testnet, contracts not audited.",
      ],
      confirm: "Launch",
    });
    if (!ok) return;
    run("enter", `${name.trim()} is live in the $${sym} bracket.`, () => call(ARENA, "enter", { meme: { name: name.trim(), symbol: sym, icon } }, { deposit: fee + seed, gas: 100n * TGAS }), true);
  };

  return (
    <div className="page launchpage">
      <div className="launchwrap">
        <section className="card wizard">
          <ol className="stepper">
            <li className={step === 1 ? "on" : "done"}>
              <button onClick={() => setStep(1)}>
                <i>{step === 1 ? 1 : "✓"}</i> Identity
              </button>
            </li>
            <li className={step === 2 ? "on" : ""}>
              <button onClick={() => !identityProblem && setStep(2)} disabled={!!identityProblem}>
                <i>2</i> Seed
              </button>
            </li>
          </ol>

          {step === 1 ? (
            <div className="wstep" key="1">
              <h2>Name it and give it a face.</h2>
              <div className="field">
                <span className="lbl">Image</span>
                <div className="imgrow">
                  <button type="button" className="imgdrop" onClick={() => fileRef.current?.click()} aria-label="Choose an image">
                    <img src={icon} alt="" />
                  </button>
                  <div className="imgside">
                    <span className="hint">Square works best. It is shrunk to fit on-chain (4 KB).</span>
                    <div className="row">
                      <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
                        {upload ? "Change image" : "Upload image"}
                      </button>
                      {upload && (
                        <button type="button" className="btn ghost" onClick={() => setUpload(null)}>
                          Use a face instead
                        </button>
                      )}
                    </div>
                    {uploadError && <span className="where bad">{uploadError}</span>}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
                </div>
                {!upload && (
                  <div className="faces2">
                    <div className="chips">
                      {EMOJI.map((e) => (
                        <button type="button" key={e} className={e === emoji ? "chip on" : "chip"} onClick={() => setEmoji(e)} aria-label={`face ${e}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                    <div className="chips">
                      {COLORS.map((c) => (
                        <button type="button" key={c} className={c === color ? "swatch on" : "swatch"} style={{ background: c }} onClick={() => setColor(c)} aria-label={`color ${c}`} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="pair">
                <label className="field">
                  <span className="lbl">Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hot Original" maxLength={40} />
                  <Counter n={nameBytes} max={32} />
                </label>
                <label className="field">
                  <span className="lbl">Ticker</span>
                  <input value={ticker} onChange={(e) => setTicker(e.target.value.replace(/\s/g, ""))} placeholder="HOT" maxLength={8} className="mono" />
                  <Counter n={sym.length} max={8} />
                </label>
              </div>
              {where && <p className={`where ${where.bad ? "bad" : ""}`}>{where.text}</p>}
              <div className="wactions">
                <span className="hint">{identityProblem && (name || ticker) ? identityProblem : ""}</span>
                <button className="btn big go" disabled={!!identityProblem} onClick={() => setStep(2)}>
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div className="wstep" key="2">
              <h2>Put your money where your meme is.</h2>
              <label className="field">
                <span className="lbl">Your seed</span>
                <div className="amount">
                  <input inputMode="decimal" value={seedText} onChange={(e) => setSeedText(e.target.value)} aria-label="Seed in NEAR" />
                  <span>NEAR</span>
                </div>
              </label>
              <div className="presets">
                {[minSeed, 5n * 10n ** 23n, 10n ** 24n].map((x) => (
                  <button key={x.toString()} onClick={() => setSeedText(near(x, 3))}>
                    {near(x, 3)} NEAR
                  </button>
                ))}
              </div>
              <ul className="facts2">
                <li>
                  <b>The seed is not a fee.</b> It buys the first tokens of your own coin, at the bottom of the curve. It is at stake like everyone else's money.
                </li>
                <li>
                  <b>A bigger seed is not a head start.</b> Rounds score new money that arrives during the round, not what was there before.
                </li>
              </ul>
              <div className="wactions">
                <button className="btn ghost" onClick={() => setStep(1)}>
                  Back
                </button>
                <span className="hint">{seedProblem ?? ""}</span>
                <button className="btn big go" disabled={!!busy || !!seedProblem || !!identityProblem} onClick={launch}>
                  {busy ? "Waiting for wallet…" : `Launch · ${seed ? near(fee + seed, 3) : "?"} NEAR`}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="boardcol">
          <p className="lbl">In the bracket</p>
          <div className="card preview2">
            <div className="ptop">
              <img src={icon} alt="" />
              <div>
                <strong>{name.trim() || "Your coin"}</strong>
                <div className="prow">
                  <span className="mono">${sym || "TICKER"}</span>
                  <span className="pchip">{badge}</span>
                </div>
              </div>
            </div>
            <dl className="pgrid">
              <div>
                <dt>Supply on the curve</dt>
                <dd>{Number(SUPPLY).toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Your seed buys</dt>
                <dd>{seedTokens ? `≈ ${Number(seedTokens / 1_000_000n).toLocaleString("en-US")}M` : "—"}</dd>
              </div>
              <div>
                <dt>Registration</dt>
                <dd>{regOpen ? `${Math.ceil(regLeft / 60000)} min left` : duration(config.registration_ns)}</dd>
              </div>
              <div>
                <dt>Each round</dt>
                <dd>{duration(config.round_ns)}</dd>
              </div>
              <div>
                <dt>If it loses a round</dt>
                <dd>{p}% to the winner</dd>
              </div>
              <div>
                <dt>Launch fee</dt>
                <dd>{near(fee)} NEAR</dd>
              </div>
              <div>
                <dt>If it wins, you earn</dt>
                <dd>{config.creator_reward_bps !== undefined ? config.creator_reward_bps / 100 : 0}% of each absorbed coin</dd>
              </div>
              <div>
                <dt>Score per wallet</dt>
                <dd>{config.score_cap ? `≤ ${near(config.score_cap)} NEAR / round` : "no cap"}</dd>
              </div>
            </dl>
          </div>
          <p className="hint">Name, ticker and image are stored on-chain in the token's metadata. Testnet NEAR.</p>
        </aside>
      </div>
    </div>
  );
}
