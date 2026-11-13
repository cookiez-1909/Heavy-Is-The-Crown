# Ticker Bracket

**A launchpad where every coin with the same ticker lands in the same bracket. Each round the weaker copy's liquidity moves to the stronger one, until a single coin holds all of it.**

Built at NEAR HACKATHON for the **Memecoins With Mechanics** track.

## The problem

Launching a memecoin is one click, so anything that goes viral gets launched many times: same name, same picture, same ticker. Traders call it PVP. The copies split the same buyers and most of them die with the liquidity still inside.

**Across chains (DexScreener).** We took DexScreener's own "top boosts" list, the tokens being promoted the most, and searched each ticker. On 2026-11-12 17:36 UTC, **23 of the 29 promoted tokens shared their ticker with at least one other token, 13 of them with nine or more others**: at least 331 distinct token contracts on 29 tickers (175 on Solana, 46 on Robinhood Chain, 12 on BNB Chain). HUANG alone returned 28 different tokens.

- `node scripts/dexscreener.mjs` reruns it and prints, for each ticker, the search URL that returns those tokens. No API key.
- On the home page and in the pitch deck each dot is one token contract and links to it on DexScreener.
- The tickers are not hand-picked: the list is whatever DexScreener is promoting when the script runs, so the numbers move during the day.
- A search returns at most 30 pairs, so the counts are lower bounds (14 of the 29 searches hit the cap).
- Sharing a ticker does not prove a token is a copy. Short generic tickers such as MAX or ZEN include unrelated projects.
- Promoted tokens are not a random sample of all tokens.

**On NEAR (meme.cooking).** meme.cooking shows it happening on NEAR. On 2026-11-12, **31 tickers there had been listed by two or more different accounts: 80 of the 591 listings the site displays (14%)**. HOT was listed by 5 accounts, COOKED by 4, and SHIT, BATMAN, CHILL, MNGA, MINIROOT, SOON and HIJACK by 3 each.

Every one of those numbers can be checked by hand:

- `node scripts/radar.mjs` prints each contested ticker with a `meme.cooking/meme/<id>` link per listing.
- On the home page each dot is one listing and links to its page on meme.cooking.
- Or type a ticker into meme.cooking's search and count the cards with that `$TICKER` (the search also matches names and descriptions, so read the ticker on the card).

What the count includes and leaves out:

- It counts only what meme.cooking displays, which is listings that hold a deposit: 591 of the 2,321 its API returns. The other 1,730 are empty listings the site hides; 572 of them come from one account.
- Most displayed listings never reached their soft cap. Of the 267 that launched, 37 share a ticker with another launched coin.
- A ticker listed several times by a single account is not counted.
- This is one launchpad on one chain, and 14% is a modest share. The cross-chain picture is the DexScreener count above.

## The mechanic

1. **One bracket per ticker.** The first coin launched with a ticker opens its bracket and a registration window. Every coin launched with that ticker during registration joins it (up to 8). After registration the ticker is locked.
2. **Creators post a seed.** The seed buys the creator's first tokens from the coin's own bonding curve, so it is at stake like everyone else's money.
3. **Seeding by score.** When a round closes, the arena ranks the survivors by score and pairs best against worst. With an odd number the top seed gets a bye.
4. **Score = new NEAR × time.** Each round a coin scores only the NEAR that came in since the round started, for as long as it stays. Net outflow scores negative.
5. **Selling is taxed and the tax stays in the curve.** It ramps from 0 to the penalty over the round. After a win it restarts at the penalty and decays.
6. **At the bell trading freezes.** Anyone settles a match and is paid 1% of the loser's reserve (at most 0.05 NEAR). The two tokens compare scores themselves.
7. **The loser is absorbed.** 15% of its reserve enters the winner's curve with no tokens minted (spoils). The other 85% buys winner tokens, which the loser's holders claim pro rata by burning their dead coin.
8. **The champion defends.** A later coin with the same ticker opens a new season, and the reigning champion is entered in it automatically. There is never a second living coin with that ticker here.

Each coin is its own NEP-141 token with its own constant-product curve: buying mints, selling burns.

## Exploits considered, and what the contracts do about them

| Attack | Counter | Where |
|---|---|---|
| Run before the bell to dodge the loser's penalty | Sell tax ramps to exactly the penalty at the bell; the tax stays in the curve and moves to the winner | `sell_tax_bps` in the token |
| Winners dump on holders who were just converted in | Sell tax restarts at the penalty at the moment of the win and decays over the cooldown | `book_win`, `sell_tax_bps` |
| Snowball: win round 2 on liquidity absorbed in round 1 | Score counts only inflow since the round started | `round_base`, `score_now` |
| Sell in the break, buy back after the start to fake inflow | The round base never goes below the reserve at the previous bell | `floor_reserve` |
| Last-minute whale | Inflow is weighted by how long it stayed | `touch_score` |
| Stuff the bracket with empty copies | Launch fee plus a bonded seed per coin; pairing is computed by the contract from scores | `enter`, `on_results` in the arena |
| Open a second bracket for the same ticker | Ticker is normalised and maps to one live tournament | `by_ticker` in the arena |
| Nobody settles, bracket stalls | Settle and advance are open to anyone and pay a bounty | `settle`, `advance` |
| Deployer swaps the arena code | The arena has no owner, and the deploy script deletes its only access key | `scripts/deploy.sh` |

None of these is a complete defence; see Known limits.

## Where the rules live

- `contracts/token`: the NEP-141. Curve, mint, burn, score, sell tax, freeze, settle, absorb, claim.
- `contracts/arena`: launch, one-bracket-per-ticker, seeding, round clock.

There is no owner, no admin method and no upgrade path in either contract. All parameters are fixed in the arena's `new` and readable through `get_config` (arena) and `get_info` (token). The only thing the arena can tell a token is who its next opponent is. The web app has no backend: it reads the RPC and sends wallet transactions.

**NEAR's role, concretely:** NEP-141/145/148 tokens; global contracts (NEP-591) so every coin runs the same code pinned by hash and a launch costs 0.25 NEAR instead of ~2.3 NEAR of code storage; named sub-accounts (`pepe-0.<arena>`); cross-contract promises with callbacks and rollback for settle → absorb → claim → transfer; an account with no access keys as the "no admin" guarantee.

**Partner tech:** meme.cooking's API for the contested-ticker data; HOT's `@hot-labs/near-connect` for wallets.

## Live on testnet

| | Account |
|---|---|
| Arena: 1 h registration, 4 h rounds (the web app's default) | `arena-32526.memeduel-4a2d2e.testnet` |
| Earlier arena with 6 min / 9 min demo timings, where the demo video's $HOT and $KEK brackets were played | `arena-82872.memeduel-4a2d2e.testnet` |
| Token code (global contract hash) | `5LpgXeEtrkB1QUWRU9Q8oeJwyL3Q8wBkDbQdK7pfAHsC` |

Both arenas: 15% penalty, 5 NEAR virtual liquidity, 0.2 NEAR minimum seed, up to 8 coins per bracket, 1 h post-win tax decay on the new one. Neither arena account has access keys.

## Simulation

One 4-hour match between coin A and coin B, with the contract's formulas (`sim/duel-sim.ts`). 15% penalty, 50 NEAR virtual liquidity:

| Scenario | Reserve at start (A / B) | Net inflow at bell (A / B) | Score, NEAR-hours (A / B) | Winner | Total-reserve rule would pick | Loser's reserve moved | of which sell tax | Spoils | Winner price bump | Supply after |
|---|---|---|---|---|---|---|---|---|---|---|
| Even match | 5 / 5 | 6.9 / 6.4 | 15 / 14 | **A** | A | 11.4 NEAR | 0.0 | 1.7 | +2.8% | 299M A |
| Rich incumbent, live newcomer | 150 / 5 | 0.7 / 6.8 | 1 / 15 | **B** | A ⚠ | 150.7 NEAR | 0.0 | 22.6 | +36.6% | 679M B |
| Last-minute whale | 5 / 5 | 6.9 / 21.6 | 15 / 7 | **A** | B ⚠ | 26.6 NEAR | 0.0 | 4.0 | +6.4% | 399M A |
| Run for the exit | 20 / 20 | 6.4 / -17.7 | 18 / -16 | **A** | A | 2.3 NEAR | 2.3 | 0.4 | +0.5% | 362M A |
| Sell in the break, buy back | 5 / 5 | 0.5 / 4.2 | -1 / 9 | **B** | A ⚠ | 25.5 NEAR | 0.0 | 3.8 | +6.5% | 372M B |

Shorter rounds make a late whale cheaper. In the whale row A collected 6.9 NEAR over the round and scored 14.8 NEAR-hours, so a single buy 30 minutes before the bell beats it with about 30 NEAR, and one 10 minutes before the bell needs about 89 NEAR. With 24-hour rounds the same crowd would have been several times harder to overtake. We chose 4-hour rounds so a bracket of 8 finishes in about 13 hours.

What is left of a stake that keeps landing on the losing side:

| Penalty per round | lost 1 round | lost 2 rounds | lost 3 rounds |
|---|---|---|---|
| 10% | 90% | 81% | 73% |
| 15% | 85% | 72% | 61% |
| 30% | 70% | 49% | 34% |

15% was chosen because a bracket of 8 has three rounds: at 30% a holder who is converted three times keeps a third.

```bash
node sim/run.ts --sweep
```

prints the tables for 10%, 15% and 30%, and the 15% case without the sell tax (Node 24). The Rules page draws each scenario.

## Run it

Requirements: Rust with the `wasm32-unknown-unknown` target, `cargo-near`, Node 24, pnpm.

```bash
scripts/build.sh
```

```bash
cargo test
```

`cargo test` runs 15 unit tests on the token and 3 end-to-end tests on a local NEAR sandbox (`tests/tests/duel.rs`): a 4-coin bracket through semi-finals and final, chained conversion of a holder through two lost coins, a second season against the champion, a 3-coin bracket with a bye, and the limits and access-control paths. The first run downloads the sandbox binary.

To look at the UI against real contract state without any testnet funds:

```bash
cargo run -p duel-tests --example localnet
```

It starts a local chain, deploys everything, plays a PEPE bracket into its final, finishes a KEK bracket and opens a DOGE registration, then prints two lines to put in `web/.env.local`. Then:

```bash
cd web && pnpm install && pnpm dev
```

Wallets cannot sign on a sandbox, so the local chain is read-only from the browser. `web/.env.example` shows how to point the app at the testnet arena above. To deploy your own:

```bash
scripts/deploy.sh <your-account.testnet> 1 4 1
```

(registration, round and cooldown in hours; further arguments are penalty in bps, virtual NEAR, minimum seed, bracket size).

## Known limits

- **Only coins launched here are in the bracket.** Copies on other launchpads are out of reach.
- **Score counts NEAR, not people.** A wallet with enough NEAR can carry a coin through a round alone. Splitting across wallets changes nothing, so there is nothing for a sybil check to do, and no "one person, one vote" either.
- **The sell tax does not force anyone to stay.** It makes leaving before the bell no cheaper than losing. In "Run for the exit" nearly all of the loser's liquidity still leaves and the winner receives only the tax.
- **Spoils are locked liquidity, not a payout.** They lift the winner's price, but holders can withdraw only part of them; the rest stays in the curve as a floor.
- **Bracket slots are finite.** Filling the remaining slots with seeded copies to shut a rival out costs one fee and one seed per slot, and is not prevented.
- **The first coin of a ticker picks the timing.** Registration starts when it launches.
- **A lost `start_round` message stalls a token** until anyone calls `resync` on the arena. Covered by a guard in `advance`, not by a sandbox test.
- **Not audited.** Hackathon code.
- Each trade pays a flat 0.002 NEAR that stays in the token contract to pay for the on-chain log; a first-time buyer also pays 0.00125 NEAR of NEP-145 storage.
- `storage_unregister(force=true)` is disabled, because burning outside the curve would break claim accounting.
- Publishing a new token code version as a global contract burns about 23 NEAR.

## Layout

```
contracts/token      NEP-141 with the bracket mechanic
contracts/arena      launchpad: one bracket per ticker, seeding, round clock
contracts/publisher  helper that publishes a wasm as a global contract (tests only)
tests                sandbox end-to-end tests and the localnet example
sim                  parameter simulation
web                  Vite + React front end
scripts              build, deploy, meme.cooking snapshot
```
