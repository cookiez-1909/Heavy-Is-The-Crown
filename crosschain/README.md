# Cross-chain brackets, spike

Branch `crosschain`. Not part of the submitted app: the hackathon build on `main` merges only coins launched on NEAR. This folder tests what would lift that limit: copies of a ticker on an EVM chain fighting in the same bracket, their liquidity moved by the NEAR arena, and their holders paid on NEAR.

The web app on this branch has a **Cross-chain** page that reads the last match live from both chains and re-checks the signatures in the browser.

## What it shows

**A keyless NEAR contract judges a match between a NEAR copy and a Base copy, moves the loser's liquidity on Base, and pays the loser's holders on NEAR after they prove who they are with their EVM key.**

```text
NEAR testnet                                     Base Sepolia
xarena (no access keys)                          HITCPool, an ERC-20 on its own curve (no owner)
 ├ NEAR copy: buy() scores amount × seconds       ├ buy mints, sell burns, sell tax 0 → 15% over the round
 ├ report_evm_score(score)   ◄──── reporter ────── score(): net inflow × seconds left
 ├ settle(): compare scores                       └ at the bell: trading and transfers freeze
 │   Base copy lost → sign Release(to, nonce)
 ▼
v1.signer-prod.testnet (Chain Signatures)
 └ signature from the EVM address derived from xarena + path
                                           ────► release(to, sig): anyone relays; the pool checks the
                                                 signer and sends its whole reserve to `to`
 ├ report_evm_holders(root, supply) ◄── reporter ── balances at the bell, as a Merkle root
 ├ deliver_swap()  ◄── NEAR Intents (stand-in on testnet; live quote from mainnet)
 │   15% stays with the winner as spoils
 └ claim_evm(holder, balance, proof, evm_signature, near_account)
     ecrecover checks the holder signed "HITC claim <ticker> copy on <chain> to <near_account>",
     the proof checks the balance, and the holder's share of the other 85% is paid in NEAR
```

Nobody holds a key that can drain the pool: the address it trusts is derived by the MPC network from the `xarena` account, and that account has no access keys, so only `settle` can ask for that signature.

## What is real and what is a stand-in

| Piece | Status |
|---|---|
| Chain Signatures address derived from a keyless NEAR contract | Real (`v1.signer-prod.testnet`) |
| EIP-712 `Release` hashed on NEAR, verified on Base | Real; the same bytes on both sides (one vector tested in Rust and Solidity) |
| EVM copy as an ERC-20 on a constant-product curve, with the ramping sell tax | Real, on Base Sepolia |
| Scoring on both chains, net inflow × seconds left | Real, on chain on both sides |
| EVM holders proving ownership on NEAR (`ecrecover` on EIP-191 `personal_sign`) and a Merkle proof of their balance | Real, on NEAR testnet |
| The EVM score and the holders' root reaching NEAR | **Trusted reporter.** NEAR cannot read Base state by itself; a light client or an oracle would remove this trust |
| NEAR and ETH on one scale | **Fixed rate** from a price API at deployment. Pyth's Hermes now requires an API key to fetch signed prices, and the testnet `priceoracle.testnet` holds no fresh prices, so no on-chain oracle could be wired in on testnet |
| Swapping the released ETH into NEAR | **Live price, stand-in delivery.** The run takes a real NEAR Intents (1Click) quote for the released ETH, in dry mode, and delivers that amount as testnet NEAR through `deliver_swap`. On mainnet the release would go to the Intents deposit address and the NEAR would land in the winner's balance in `intents.near` (the API delivers ETH → wNEAR into an Intents balance, not straight to a wallet) |
| The NEAR copy as a real HITC token, brackets of more than two | Not built: the NEAR copy here is a pool inside `xarena`, and a match is one against one |

## Run it

```bash
(cd crosschain/xarena && cargo near build non-reproducible-wasm --no-abi && cargo test)
(cd crosschain/evm && forge install foundry-rs/forge-std --no-git && forge test)
EVM_KEY=<Base Sepolia key with a little ETH> crosschain/run.sh
```

`run.sh` deploys a pool and an arena, buys both copies, waits for the bell, reports, settles, waits for the MPC signature, relays it, posts the holders' root, takes a live Intents quote, delivers it, and has the EVM holder sign and claim on NEAR. The last run is in `crosschain/last-run.json`.
