//! Local chain with the arena deployed and brackets in every phase, for the web UI.
//!
//!   cargo run -p duel-tests --example localnet
//!
//! It prints the RPC URL and arena account to put in web/.env.local, then keeps
//! the sandbox alive until Ctrl-C. Wallets cannot sign on a sandbox: this is
//! for looking at real contract state, not for clicking Buy.
use near_workspaces::network::Sandbox;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const MINUTE: u64 = 60_000_000_000;

fn mn(n: u128) -> NearToken {
    NearToken::from_millinear(n)
}

fn icon(emoji: &str, color: &str) -> String {
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="{color}"/><text x="48" y="50" font-size="52" text-anchor="middle" dominant-baseline="central">{emoji}</text></svg>"#
    );
    let mut out = String::from("data:image/svg+xml;utf8,");
    for b in svg.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

struct World {
    worker: Worker<Sandbox>,
    arena: Contract,
    p: Vec<Account>,
}

impl World {
    async fn enter(&self, who: usize, name: &str, symbol: &str, emoji: &str, color: &str, seed_mn: u128) -> anyhow::Result<()> {
        self.p[who]
            .call(self.arena.id(), "enter")
            .args_json(json!({ "meme": { "name": name, "symbol": symbol, "icon": icon(emoji, color) } }))
            .deposit(mn(250 + seed_mn))
            .gas(Gas::from_tgas(100))
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }
    async fn tournament(&self, id: u32) -> anyhow::Result<Value> {
        Ok(self.arena.view("get_tournament").args_json(json!({ "id": id })).await?.json()?)
    }
    async fn token(&self, id: u32, i: usize) -> anyhow::Result<AccountId> {
        Ok(self.tournament(id).await?["entrants"][i]["token"].as_str().unwrap().parse()?)
    }
    async fn buy(&self, who: usize, token: &AccountId, amount_mn: u128) -> anyhow::Result<()> {
        self.p[who].call(token, "buy").args_json(json!({})).deposit(mn(amount_mn)).transact().await?.into_result()?;
        Ok(())
    }
    async fn settle(&self, token: &AccountId) -> anyhow::Result<()> {
        self.p[5].call(token, "settle").gas(Gas::from_tgas(150)).transact().await?.into_result()?;
        Ok(())
    }
    async fn advance(&self, id: u32) -> anyhow::Result<String> {
        let r = self.p[5].call(self.arena.id(), "advance").args_json(json!({ "tournament_id": id })).gas(Gas::from_tgas(300)).transact().await?;
        Ok(r.json::<String>()?)
    }
    async fn ring_the_bell(&self, id: u32) -> anyhow::Result<()> {
        let end: u64 = self.tournament(id).await?["round_end_ns"].as_str().unwrap().parse()?;
        while self.worker.view_block().await?.timestamp() < end {
            self.worker.fast_forward(200).await?;
        }
        Ok(())
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let token_wasm = std::fs::read("target/near/duel_token/duel_token.wasm")?;
    let publisher = worker.dev_deploy(&std::fs::read("target/near/publisher/publisher.wasm")?).await?;
    publisher.call("publish").args(token_wasm.clone()).gas(Gas::from_tgas(300)).transact().await?.into_result()?;
    let arena = worker.dev_deploy(&std::fs::read("target/near/duel_arena/duel_arena.wasm")?).await?;
    arena
        .call("new")
        .args_json(json!({
            "registration_ns": (20 * MINUTE).to_string(),
            "round_ns": (20 * MINUTE).to_string(),
            "cooldown_ns": (5 * MINUTE).to_string(),
            "penalty_bps": 1500,
            "virtual_near": NearToken::from_near(50).as_yoctonear().to_string(),
            "min_seed": NearToken::from_near(1).as_yoctonear().to_string(),
            "max_entrants": 8,
            "creator_reward_bps": 100,
            "score_cap": NearToken::from_near(5).as_yoctonear().to_string(),
            "token_code_hash": bs58::encode(Sha256::digest(&token_wasm)).into_string(),
        }))
        .transact()
        .await?
        .into_result()?;
    let mut p = Vec::new();
    for _ in 0..6 {
        p.push(worker.dev_create_account().await?);
    }
    let w = World { worker, arena, p };

    // Bracket 0: four PEPEs. Bracket 1: two KEKs.
    w.enter(0, "Pepe Original", "PEPE", "🐸", "#2f9e62", 2000).await?;
    w.enter(1, "Real Pepe", "PEPE", "🐸", "#1f7ae0", 1000).await?;
    w.enter(2, "Pepe 2.0", "PEPE", "🐸", "#7a4fd6", 1000).await?;
    w.enter(3, "Pepe Classic", "PEPE", "🐸", "#c2452f", 1000).await?;
    w.enter(4, "Kek", "KEK", "🤡", "#d9a520", 1000).await?;
    w.enter(0, "Top Kek", "KEK", "🤡", "#d6418c", 1500).await?;
    let pepe = [w.token(0, 0).await?, w.token(0, 1).await?, w.token(0, 2).await?, w.token(0, 3).await?];
    let kek = [w.token(1, 0).await?, w.token(1, 1).await?];
    w.buy(4, &pepe[0], 6000).await?;
    w.buy(5, &pepe[1], 4000).await?;
    w.buy(4, &pepe[2], 2500).await?;
    w.buy(2, &kek[1], 3000).await?;
    w.ring_the_bell(0).await?;
    w.advance(0).await?;
    w.advance(1).await?;

    // Round 1.
    w.buy(1, &pepe[3], 5000).await?;
    w.buy(2, &pepe[0], 1500).await?;
    w.buy(3, &pepe[1], 2000).await?;
    w.buy(5, &pepe[2], 800).await?;
    w.buy(3, &kek[0], 4000).await?;
    w.buy(1, &kek[1], 1000).await?;
    w.ring_the_bell(0).await?;
    for t in [&pepe[0], &pepe[3], &pepe[1], &pepe[2], &kek[0], &kek[1]] {
        let _ = w.settle(t).await; // the second side of a settled match has nothing left to do
    }
    println!("pepe: {}", w.advance(0).await?); // -> final
    println!("kek: {}", w.advance(1).await?); // -> finished, loser bags unclaimed

    // PEPE final is live.
    let t = w.tournament(0).await?;
    let m = &t["rounds"][1][0];
    let (a, b) = (m["a"].as_u64().unwrap() as usize, m["b"].as_u64().unwrap() as usize);
    w.buy(0, &pepe[a], 3000).await?;
    w.buy(2, &pepe[b], 4500).await?;
    w.worker.fast_forward(150).await?;
    w.buy(4, &pepe[a], 1200).await?;

    // Bracket 2: DOGE is still registering.
    w.enter(1, "Doge Classic", "DOGE", "🐶", "#d9a520", 1000).await?;
    w.enter(2, "Doge but Blue", "DOGE", "🐶", "#1f7ae0", 1000).await?;
    w.enter(3, "Dogwifnothing", "DOGE", "🐶", "#3b3f4a", 1000).await?;
    let doge0 = w.token(2, 0).await?;
    w.buy(5, &doge0, 2000).await?;

    println!("\nLocal arena is up. Put this in web/.env.local and run `pnpm dev`:\n");
    println!("VITE_RPC={}", w.worker.rpc_addr());
    println!("VITE_ARENA={}\n", w.arena.id());
    println!("Ctrl-C to stop.");
    tokio::signal::ctrl_c().await?;
    Ok(())
}
