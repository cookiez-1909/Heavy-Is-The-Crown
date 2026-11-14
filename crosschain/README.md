# Cross-chain brackets (spike)

Branch `crosschain`. This is not part of the submitted app: the hackathon build on `main` only merges coins launched on NEAR. This folder tries out what it would take to lift that limit, so that a copy of a ticker on an EVM chain can fight a NEAR copy in the same match. The NEAR arena judges the match, moves the loser's liquidity, and pays the loser's holders on the winner's side.

The web app on this branch has a **Cross-chain** page. It reads the two recorded matches live from both chains and re-checks the signatures in the browser.

## What it shows

**A keyless NEAR contract judges a match between a NEAR copy and a Base copy and carries out the verdict on both chains, whichever side loses.**

Both copies are priced in test USDC (6 decimals) on their own chain. The scores share one unit, so no price oracle is needed.

```text
NEAR testnet                                         Base Sepolia
xarena (no access keys)                              HITCPool, an ERC-20 on its own curve vs USDC (no owner)
 ├ NEAR copy: ft_on_transfer("buy")                   ├ buy / sell; sell tax ramps 0 → 15% over the round
 │   score = net inflow × seconds left                ├ score(): net inflow × seconds left
 ├ report("score" | "holders")  ◄── 3 reporters ───── └ at the bell: trading and transfers freeze
 │   a value counts once 2 of 3 agree
 ├ settle(): compare scores
 ▼
v1.signer-prod.testnet (Chain Signatures): signs from the EVM address derived from xarena + path

 Base copy lost                                       NEAR copy lost
 ─────────────                                        ──────────────
 sign Release(to, nonce) ────────────────────────►    sign Won(nonce) ────────────────────────►
   release(): pool sends its whole reserve to `to`      markWon(): the pool reopens, tax free
 the reserve reaches NEAR (see Intents below)         xarena sends its USDC reserve to the escrow;
   15% stays with the winner as spoils                  it reaches Base (see Intents below)
 claim_evm(holder, balance, proof, evm_sig, account)  absorb(): 15% spoils, 85% buys winner tokens
   ecrecover: the holder signed "HITC claim …"        claim_on_evm(evm_address) on NEAR
   Merkle proof: their balance at the bell              sign Grant(to, holding, total, nonce)
   their share of the other 85%, paid in USDC         grant(): the holder's share of those tokens
```

Nobody holds a key that can drain either side. The pool on Base trusts only the address that the MPC network derives from the `xarena` account. That account has no access keys, so only the contract's own `settle` and `claim_on_evm` can request the signature. Every message is EIP-712, and Rust and Solidity hash it to the same bytes (shared test vectors on both sides).

## What is real and what is a stand-in

| Piece | Status |
|---|---|
| Chain Signatures address derived from a keyless NEAR contract | Real (`v1.signer-prod.testnet`) |
| EIP-712 `Release`, `Won` and `Grant`, hashed on NEAR and checked on Base | Real; the same digests in both test suites |
| EVM copy as an ERC-20 on a constant-product curve, with the ramping sell tax | Real, on Base Sepolia |
| Scoring on both chains in the same unit (test USDC) | Real, on chain on both sides; no oracle needed |
| EVM holders proving ownership on NEAR (`ecrecover` on EIP-191 `personal_sign`) plus a Merkle proof of their balance | Real, on NEAR testnet. A failed payout undoes the claim so it can be retried |
| NEAR holders receiving winner tokens on Base through a signed `Grant` | Real, on Base Sepolia |
| The EVM score and the holders' root reaching NEAR | **Reporters, 2 of 3.** NEAR cannot read Base state by itself. Agreeing reporters are better than one trusted reporter, but this is still trust; a light client would remove it |
| Moving the loser's USDC to the winner's chain | **Price only.** Each run takes a live NEAR Intents (1Click) quote in dry mode, in both directions (Base USDC → NEAR and NEAR USDC → Base). Nothing is swapped: the quoted amount is minted as test USDC on the other side. Intents has no testnet, so real delivery has not been tried |
| The NEAR copy as a real HITC token, brackets of more than two | Not built. The NEAR copy here is a pool inside `xarena`, and a match is one against one |

## The two recorded matches

Each run writes `last-run-<scenario>.json` with every account, address, transaction and block range.

- **Base copy lost** (`last-run-evm-lost.json`): `Release` relayed on Base, the reserve priced through Intents, and the EVM holder's claim paid on NEAR.
- **NEAR copy lost** (`last-run-near-lost.json`): `Won` relayed on Base, the NEAR reserve priced through Intents and absorbed, and two NEAR holders granted 2/3 and 1/3 of the tokens bought with it.

## Run it

```bash
(cd crosschain/xarena && cargo near build non-reproducible-wasm --no-abi && cargo test)
(cd crosschain/evm && forge install foundry-rs/forge-std --no-git && forge test)
EVM_KEY=<Base Sepolia key with a little ETH> crosschain/setup.sh   # once: test USDC on both chains
SCENARIO=evm-lost  EVM_KEY=<key> crosschain/run.sh
SCENARIO=near-lost EVM_KEY=<key> crosschain/run.sh
```

`run.sh` deploys a pool and an arena, buys both copies, waits for the bell, has three reporters post the Base score, settles, waits for the MPC signature, and relays it. It then takes a live Intents quote, delivers that amount as test USDC, and finishes the losing side's payout: a claim on NEAR, or Grants on Base.
