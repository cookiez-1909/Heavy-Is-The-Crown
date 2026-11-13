//! Full tournaments on a local NEAR sandbox.
use near_workspaces::network::Sandbox;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const TOKEN_WASM: &str = "../target/near/duel_token/duel_token.wasm";
const ARENA_WASM: &str = "../target/near/duel_arena/duel_arena.wasm";
const PUBLISHER_WASM: &str = "../target/near/publisher/publisher.wasm";
const SEC: u64 = 1_000_000_000;
const FEE: u128 = 250; // millinear

fn mn(n: u128) -> NearToken {
    NearToken::from_millinear(n)
}
fn u(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

struct World {
    worker: Worker<Sandbox>,
    arena: Contract,
    p: Vec<Account>,
}

impl World {
    async fn new(max_entrants: u8) -> anyhow::Result<Self> {
        let worker = near_workspaces::sandbox().await?;
        let token_wasm = std::fs::read(TOKEN_WASM)?;
        let publisher = worker.dev_deploy(&std::fs::read(PUBLISHER_WASM)?).await?;
        publisher.call("publish").args(token_wasm.clone()).gas(Gas::from_tgas(300)).transact().await?.into_result()?;
        let arena = worker.dev_deploy(&std::fs::read(ARENA_WASM)?).await?;
        arena
            .call("new")
            .args_json(json!({
                "registration_ns": (120 * SEC).to_string(),
                "round_ns": (120 * SEC).to_string(),
                "cooldown_ns": (30 * SEC).to_string(),
                "penalty_bps": 1500,
                "virtual_near": NearToken::from_near(50).as_yoctonear().to_string(),
                "min_seed": NearToken::from_near(1).as_yoctonear().to_string(),
                "max_entrants": max_entrants,
                "creator_reward_bps": 100,
                "score_cap": NearToken::from_near(1000).as_yoctonear().to_string(),
                "token_code_hash": bs58::encode(Sha256::digest(&token_wasm)).into_string(),
            }))
            .transact()
            .await?
            .into_result()?;
        let mut p = Vec::new();
        for _ in 0..6 {
            p.push(worker.dev_create_account().await?);
        }
        Ok(Self { worker, arena, p })
    }

    async fn enter(&self, who: usize, name: &str, symbol: &str, seed_mn: u128) -> anyhow::Result<bool> {
        let r = self.p[who]
            .call(self.arena.id(), "enter")
            .args_json(json!({ "meme": { "name": name, "symbol": symbol, "icon": null } }))
            .deposit(mn(FEE + seed_mn))
            .gas(Gas::from_tgas(100))
            .transact()
            .await?;
        Ok(r.is_success())
    }

    async fn tournament(&self, id: u32) -> anyhow::Result<Value> {
        Ok(self.arena.view("get_tournament").args_json(json!({ "id": id })).await?.json()?)
    }

    async fn token(&self, id: u32, i: usize) -> anyhow::Result<AccountId> {
        Ok(self.tournament(id).await?["entrants"][i]["token"].as_str().unwrap().parse()?)
    }

    async fn info(&self, token: &AccountId) -> anyhow::Result<Value> {
        Ok(self.p[0].view(token, "get_info").await?.json()?)
    }

    async fn balance(&self, token: &AccountId, of: &AccountId) -> anyhow::Result<u128> {
        let v: Value = self.p[0].view(token, "ft_balance_of").args_json(json!({ "account_id": of })).await?.json()?;
        Ok(u(&v))
    }

    async fn buy(&self, who: usize, token: &AccountId, amount_mn: u128) -> anyhow::Result<bool> {
        Ok(self.p[who].call(token, "buy").args_json(json!({})).deposit(mn(amount_mn)).transact().await?.is_success())
    }

    async fn settle(&self, who: usize, token: &AccountId) -> anyhow::Result<bool> {
        Ok(self.p[who].call(token, "settle").gas(Gas::from_tgas(150)).transact().await?.is_success())
    }

    async fn claim(&self, who: usize, token: &AccountId) -> anyhow::Result<bool> {
        let dep: Value = self.p[0].view(token, "claim_deposit").await?.json()?;
        let r = self.p[who].call(token, "claim").deposit(NearToken::from_yoctonear(u(&dep))).gas(Gas::from_tgas(100)).transact().await?;
        Ok(r.is_success())
    }

    /// Returns the message of `advance`, or None if the call itself failed.
    async fn advance(&self, who: usize, id: u32) -> anyhow::Result<Option<String>> {
        let r = self.p[who]
            .call(self.arena.id(), "advance")
            .args_json(json!({ "tournament_id": id }))
            .gas(Gas::from_tgas(300))
            .transact()
            .await?;
        Ok(if r.is_success() { Some(r.json::<String>()?) } else { None })
    }

    async fn ring_the_bell(&self, id: u32) -> anyhow::Result<()> {
        let end: u64 = self.tournament(id).await?["round_end_ns"].as_str().unwrap().parse()?;
        loop {
            let now = self.worker.view_block().await?.timestamp();
            if now >= end {
                return Ok(());
            }
            self.worker.fast_forward(100).await?;
        }
    }
}

#[tokio::test]
async fn four_coins_one_ticker_one_survivor() -> anyhow::Result<()> {
    let w = World::new(8).await?;

    // Below the minimum seed: refused.
    assert!(!w.enter(0, "Pepe", "PEPE", 500).await?);
    // Four copies of the same ticker, any letter case, land in one tournament.
    assert!(w.enter(0, "Pepe Original", "PEPE", 1000).await?);
    assert!(w.enter(1, "Real Pepe", "pepe", 1000).await?);
    assert!(w.enter(2, "Pepe 2.0", "Pepe", 1000).await?);
    assert!(w.enter(3, "Pepe Classic", "PEPE", 1000).await?);
    let n: u32 = w.arena.view("tournament_count").await?.json()?;
    assert_eq!(n, 1);
    let t = w.tournament(0).await?;
    assert_eq!(t["phase"], "Registration");
    assert_eq!(t["entrants"].as_array().unwrap().len(), 4);
    let c: Vec<AccountId> = vec![w.token(0, 0).await?, w.token(0, 1).await?, w.token(0, 2).await?, w.token(0, 3).await?];
    assert_eq!(c[0].as_str(), format!("pepe-0.{}", w.arena.id()));

    // The seed is the creator's first buy.
    let i0 = w.info(&c[0]).await?;
    assert_eq!(u(&i0["reserve"]), mn(1000).as_yoctonear());
    assert!(w.balance(&c[0], w.p[0].id()).await? > 0);
    let meta: Value = w.p[0].view(&c[1], "ft_metadata").await?.json()?;
    assert_eq!(meta["symbol"], "PEPE");

    // Registration inflow decides the seeding: c0 > c1 > c2 > c3.
    assert!(w.buy(4, &c[0], 6000).await?);
    assert!(w.buy(4, &c[1], 4000).await?);
    assert!(w.buy(4, &c[2], 2000).await?);
    assert!(w.advance(5, 0).await?.is_none(), "cannot advance during registration");

    w.ring_the_bell(0).await?;
    assert!(!w.enter(5, "Late Pepe", "PEPE", 1000).await?, "ticker is locked after registration");
    assert_eq!(w.advance(5, 0).await?.as_deref(), Some("round 1 started"));

    let t = w.tournament(0).await?;
    assert_eq!(t["phase"], "Playing");
    let m = &t["rounds"][0];
    assert_eq!((m[0]["a"].as_u64(), m[0]["b"].as_u64()), (Some(0), Some(3)), "best against worst");
    assert_eq!((m[1]["a"].as_u64(), m[1]["b"].as_u64()), (Some(1), Some(2)));
    let i0 = w.info(&c[0]).await?;
    assert_eq!(i0["rival"].as_str().unwrap(), c[3].as_str());
    assert_eq!(i0["round_base"], i0["reserve"]);
    assert_eq!(i0["score"], "0");

    // Round 1. c0 has the most liquidity, but only new inflow scores: c3 wins.
    assert!(w.buy(4, &c[3], 5000).await?);
    assert!(w.buy(5, &c[1], 1000).await?);
    w.worker.fast_forward(40).await?;
    let i3 = w.info(&c[3]).await?;
    assert!(i3["sell_tax_bps"].as_u64().unwrap() > 0, "sell tax is ramping");
    assert!(w.advance(5, 0).await?.is_none(), "round still running");

    w.ring_the_bell(0).await?;
    assert!(!w.buy(4, &c[0], 1000).await?, "frozen after the bell");
    // Advancing with unsettled matches changes nothing.
    let msg = w.advance(5, 0).await?.unwrap();
    assert!(msg.starts_with("match not settled"), "{msg}");
    assert_eq!(w.tournament(0).await?["round"], 1);

    let c0_reserve = u(&w.info(&c[0]).await?["reserve"]);
    let c3_before = u(&w.info(&c[3]).await?["reserve"]);
    assert!(w.settle(5, &c[0]).await?);
    assert!(w.settle(5, &c[2]).await?);
    let (i0, i3) = (w.info(&c[0]).await?, w.info(&c[3]).await?);
    assert_eq!(i0["status"], "Lost");
    assert_eq!(i0["absorbed_by"].as_str().unwrap(), c[3].as_str());
    assert_eq!(i3["status"], "Advanced");
    // Settle bounty (1%, capped at 0.05 NEAR), 15% of the rest as spoils, everything else into the winner's curve.
    let moved = c0_reserve - (c0_reserve / 100).min(mn(50).as_yoctonear());
    // 1% of what moved goes to the winning coin's creator; 14% stays as spoils.
    let reward = moved / 100;
    assert_eq!(u(&i3["reserve"]), c3_before + moved - reward);
    assert_eq!(u(&i3["spoils"]), moved * 15 / 100 - reward);
    assert_eq!(u(&i3["creator_rewards"]), reward);
    let log: Value = w.p[0].view(&c[3], "get_trades").args_json(json!({ "from_index": 0, "limit": 50 })).await?.json()?;
    let r = log.as_array().unwrap().iter().find(|t| t["kind"] == "reward").expect("reward in the log");
    assert_eq!(r["account"].as_str().unwrap(), w.p[3].id().as_str());
    assert_eq!(i3["sell_tax_bps"].as_u64().unwrap() / 100, 14, "post-win tax starts at the penalty");
    assert_eq!(w.info(&c[1]).await?["status"], "Advanced");
    assert_eq!(w.info(&c[2]).await?["status"], "Lost");

    // Final: c3 against c1. Absorbed liquidity gives c3 no head start.
    assert_eq!(w.advance(5, 0).await?.as_deref(), Some("round 2 started"));
    let t = w.tournament(0).await?;
    assert_eq!(t["rounds"][0][0]["winner"], 3);
    assert_eq!(t["rounds"][0][1]["winner"], 1);
    assert_eq!(t["entrants"][0]["eliminated_in"], 1);
    let i3 = w.info(&c[3]).await?;
    assert_eq!(i3["round_base"], i3["reserve"]);
    assert_eq!(i3["rival"].as_str().unwrap(), c[1].as_str());
    assert!(w.buy(5, &c[1], 3000).await?);
    w.ring_the_bell(0).await?;
    assert!(w.settle(4, &c[3]).await?);
    assert_eq!(w.advance(4, 0).await?.as_deref(), Some("finished"));
    let t = w.tournament(0).await?;
    assert_eq!(t["phase"], "Finished");
    assert_eq!(t["champion"], 1);

    // A holder of the first coin to die follows the liquidity: c0 -> c3 -> c1.
    let dev0 = w.p[0].id().clone();
    assert!(w.balance(&c[0], &dev0).await? > 0);
    assert!(w.claim(0, &c[0]).await?);
    assert_eq!(w.balance(&c[0], &dev0).await?, 0);
    assert!(w.balance(&c[3], &dev0).await? > 0);
    assert!(w.claim(0, &c[3]).await?);
    assert_eq!(w.balance(&c[3], &dev0).await?, 0);
    let got = w.balance(&c[1], &dev0).await?;
    assert!(got > 0);
    assert!(!w.claim(0, &c[0]).await?, "nothing left to claim");

    // The champion trades on, and its liquidity is the whole bracket's.
    let champ = w.info(&c[1]).await?;
    assert!(u(&champ["reserve"]) > mn(20_000).as_yoctonear());
    let r = w.p[0]
        .call(&c[1], "sell")
        .args_json(json!({ "amount": got.to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;
    assert!(r.is_success(), "{:#?}", r.failures());

    // Season 2: a new PEPE has to go through the champion.
    assert!(w.enter(5, "Pepe Reborn", "PEPE", 1000).await?);
    let t2 = w.tournament(1).await?;
    assert_eq!(t2["season"], 2);
    assert_eq!(t2["entrants"][0]["token"].as_str().unwrap(), c[1].as_str());
    assert_eq!(t2["entrants"].as_array().unwrap().len(), 2);
    let champ = w.info(&c[1]).await?;
    assert_eq!(champ["status"], "Live");
    assert_eq!(champ["round_end_ns"], t2["round_end_ns"]);
    w.ring_the_bell(1).await?;
    assert_eq!(w.advance(4, 1).await?.as_deref(), Some("round 1 started"));
    let reborn = w.token(1, 1).await?;
    assert_eq!(w.info(&reborn).await?["rival"].as_str().unwrap(), c[1].as_str());
    Ok(())
}

#[tokio::test]
async fn three_coins_top_seed_gets_a_bye() -> anyhow::Result<()> {
    let w = World::new(8).await?;
    for (i, name) in ["Doge A", "Doge B", "Doge C"].iter().enumerate() {
        assert!(w.enter(i, name, "DOGE", 1000).await?);
    }
    let c = vec![w.token(0, 0).await?, w.token(0, 1).await?, w.token(0, 2).await?];
    assert!(w.buy(4, &c[2], 3000).await?); // c2 becomes top seed
    w.ring_the_bell(0).await?;
    assert_eq!(w.advance(5, 0).await?.as_deref(), Some("round 1 started"));
    let t = w.tournament(0).await?;
    assert_eq!(t["rounds"][0][0]["a"], 2);
    assert!(t["rounds"][0][0]["b"].is_null(), "bye");
    assert_eq!((t["rounds"][0][1]["a"].as_u64(), t["rounds"][0][1]["b"].as_u64()), (Some(0), Some(1)));
    assert!(w.info(&c[2]).await?["rival"].is_null());

    assert!(w.buy(4, &c[1], 2000).await?);
    w.ring_the_bell(0).await?;
    // The bye needs no settlement; the real match does.
    assert!(!w.settle(5, &c[2]).await?);
    assert!(w.settle(5, &c[1]).await?, "anyone can settle from either side");
    assert_eq!(w.info(&c[1]).await?["status"], "Advanced");
    assert_eq!(w.info(&c[0]).await?["status"], "Live", "loser still has to hand over");
    assert!(w.advance(5, 0).await?.unwrap().starts_with("match not settled"));
    assert!(w.settle(5, &c[0]).await?);
    assert_eq!(w.info(&c[0]).await?["status"], "Lost");
    assert_eq!(w.advance(5, 0).await?.as_deref(), Some("round 2 started"));
    let t = w.tournament(0).await?;
    assert_eq!(t["rounds"][1].as_array().unwrap().len(), 1);
    Ok(())
}

#[tokio::test]
async fn limits_and_access_control() -> anyhow::Result<()> {
    let w = World::new(2).await?;
    assert!(w.enter(0, "Cat", "CAT", 1000).await?);
    // A different ticker is a different tournament.
    assert!(w.enter(1, "Frog", "FROG", 1000).await?);
    assert!(w.enter(1, "Cat 2", "CAT", 1000).await?);
    assert!(!w.enter(2, "Cat 3", "CAT", 1000).await?, "tournament is full");
    // The same account cannot launch a second copy in a bracket.
    assert!(w.enter(3, "Dog", "DOGE", 1000).await?);
    assert!(!w.enter(3, "Dog again", "DOGE", 1000).await?, "one coin per account per bracket");
    let cat = w.token(0, 0).await?;
    let frog = w.token(1, 0).await?;

    // Only the arena pairs tokens; only the opponent absorbs.
    let r = w.p[3].call(&cat, "start_round").args_json(json!({ "rival": null, "round_end_ns": "99999999999999999999" })).transact().await?;
    assert!(r.is_failure());
    assert!(w.p[3].call(&cat, "absorb").deposit(mn(1000)).transact().await?.is_failure());

    // A lone coin is champion by default once registration closes.
    w.ring_the_bell(1).await?;
    assert_eq!(w.advance(3, 1).await?.as_deref(), Some("finished"));
    let t = w.tournament(1).await?;
    assert_eq!(t["champion"], 0);
    assert_eq!(w.info(&frog).await?["status"], "Advanced");
    assert!(w.buy(3, &frog, 1000).await?);
    // Resync on a token that is already in sync is rejected by the token.
    let r = w.p[3].call(w.arena.id(), "resync").args_json(json!({ "tournament_id": 0, "entrant": 0 })).gas(Gas::from_tgas(50)).transact().await?;
    assert!(r.is_failure());
    Ok(())
}
