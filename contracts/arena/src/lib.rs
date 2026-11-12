//! Arena: one tournament per ticker.
//!
//! Memecoins get copied: the same name and picture launched many times, each
//! copy splitting the same buyers. Here every coin launched with the same
//! ticker lands in the same bracket, and the bracket merges their liquidity
//! into one survivor.
//!
//! * `enter` launches a coin. The first coin of a ticker opens a tournament
//!   and its registration window; later coins with that ticker join it. Once
//!   registration closes the ticker is locked until the tournament ends.
//! * `advance` (anyone, paid a small bounty) closes the current round, reads
//!   every surviving token's result, seeds the survivors by score (best
//!   against worst, a bye for the top seed when the count is odd) and starts
//!   the next round. With one survivor left the tournament is finished.
//! * A new season for a finished ticker automatically includes the reigning
//!   champion, so there is never a second living coin with that ticker here.
//!
//! The arena has no owner and no method that changes its parameters. Deploy
//! it, call `new`, then delete the account's access keys.

use near_sdk::json_types::{Base58CryptoHash, U128, U64};
use near_sdk::serde_json::json;
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, CryptoHash, Gas, NearToken,
    PanicOnDefault, Promise, PromiseOrValue,
};

/// Paid by every entrant on top of the seed.
pub const LAUNCH_FEE: NearToken = NearToken::from_millinear(250);
/// Part of the fee forwarded to the new token account for its own storage.
const TOKEN_FUND: NearToken = NearToken::from_millinear(200);
/// Paid from the tournament's share of the fees to whoever calls `advance`.
const ADVANCE_BOUNTY: u128 = 10u128.pow(22); // 0.01 NEAR
const MAX_ENTRANTS_LIMIT: u8 = 8;
const MAX_ICON_BYTES: usize = 4096;

const GAS_TOKEN_INIT: Gas = Gas::from_tgas(20);
const GAS_ON_LAUNCHED: Gas = Gas::from_tgas(10);
const GAS_RESULT: Gas = Gas::from_tgas(5);
const GAS_START_ROUND: Gas = Gas::from_tgas(8);
const GAS_ON_RESULTS: Gas = Gas::from_tgas(100);

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Tournaments,
    ByTicker,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Meme {
    pub name: String,
    pub symbol: String,
    /// Optional `data:image/...` URL, at most 4 KB.
    pub icon: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Registration,
    Playing,
    Finished,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Entrant {
    pub token: AccountId,
    pub name: String,
    pub creator: AccountId,
    /// Round in which this coin was absorbed.
    pub eliminated_in: Option<u32>,
    /// Score in the last closed round (signed integer as a string).
    pub last_score: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Match {
    /// Indexes into `entrants`. `b` is `None` for a bye.
    pub a: u8,
    pub b: Option<u8>,
    pub winner: Option<u8>,
    pub score_a: Option<String>,
    pub score_b: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Tournament {
    pub id: u32,
    pub ticker: String,
    pub season: u32,
    pub phase: Phase,
    /// 0 = registration, 1.. = bracket rounds.
    pub round: u32,
    pub round_end_ns: U64,
    pub entrants: Vec<Entrant>,
    /// `rounds[0]` is round 1.
    pub rounds: Vec<Vec<Match>>,
    pub champion: Option<u8>,
    pub bounty_pool: U128,
    pub pending_launches: u8,
    pub advancing: bool,
}

#[near(serializers = [json])]
pub struct Config {
    pub registration_ns: U64,
    pub round_ns: U64,
    pub cooldown_ns: U64,
    pub penalty_bps: u16,
    pub virtual_near: U128,
    pub min_seed: U128,
    pub max_entrants: u8,
    pub token_code_hash: Base58CryptoHash,
    pub launch_fee: U128,
}

#[near(serializers = [json])]
pub struct RoundResult {
    pub status: String,
    pub round_end_ns: U64,
    pub score: String,
}

#[ext_contract(ext_token)]
pub trait Token {
    fn round_result(&self) -> RoundResult;
    fn start_round(&mut self, rival: Option<AccountId>, round_end_ns: U64);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Arena {
    registration_ns: u64,
    round_ns: u64,
    cooldown_ns: u64,
    penalty_bps: u16,
    virtual_near: u128,
    min_seed: u128,
    max_entrants: u8,
    token_code_hash: CryptoHash,
    next_token: u32,
    tournaments: Vector<Tournament>,
    /// Ticker -> its latest tournament.
    by_ticker: LookupMap<String, u32>,
}

#[near]
impl Arena {
    #[init]
    pub fn new(
        registration_ns: U64,
        round_ns: U64,
        cooldown_ns: U64,
        penalty_bps: u16,
        virtual_near: U128,
        min_seed: U128,
        max_entrants: u8,
        token_code_hash: Base58CryptoHash,
    ) -> Self {
        require!(registration_ns.0 > 0 && round_ns.0 > 0, "durations must be > 0");
        require!(penalty_bps <= 5_000, "penalty_bps > 50%");
        require!(virtual_near.0 > 0, "virtual_near must be > 0");
        require!((2..=MAX_ENTRANTS_LIMIT).contains(&max_entrants), "max_entrants: 2-8");
        Self {
            registration_ns: registration_ns.0,
            round_ns: round_ns.0,
            cooldown_ns: cooldown_ns.0,
            penalty_bps,
            virtual_near: virtual_near.0,
            min_seed: min_seed.0,
            max_entrants,
            token_code_hash: token_code_hash.into(),
            next_token: 0,
            tournaments: Vector::new(Key::Tournaments),
            by_ticker: LookupMap::new(Key::ByTicker),
        }
    }

    /// Launch a coin. Attach `launch_fee + seed` with `seed >= min_seed`; the
    /// seed buys the creator's first tokens from the coin's own curve, so it
    /// is at stake in the bracket like everyone else's money.
    #[payable]
    pub fn enter(&mut self, meme: Meme) -> Promise {
        validate(&meme);
        let deposit = env::attached_deposit();
        let need = LAUNCH_FEE.saturating_add(NearToken::from_yoctonear(self.min_seed));
        require!(deposit >= need, "attach the launch fee plus at least the minimum seed");
        let seed = deposit.saturating_sub(LAUNCH_FEE);
        let ticker = meme.symbol.to_ascii_uppercase();
        let now = env::block_timestamp();
        let arena = env::current_account_id();

        let open_new = match self.by_ticker.get(&ticker).copied() {
            None => true,
            Some(id) => {
                let t = &self.tournaments[id];
                match t.phase {
                    Phase::Finished => true,
                    Phase::Playing => env::panic_str("this ticker is in a tournament: wait for the champion"),
                    Phase::Registration => {
                        require!(now < t.round_end_ns.0, "registration is over: wait for the champion");
                        false
                    }
                }
            }
        };

        let tid = if open_new {
            let id = self.tournaments.len();
            let round_end_ns = now + self.registration_ns;
            let mut entrants = Vec::new();
            let mut season = 1;
            if let Some(prev) = self.by_ticker.get(&ticker).copied() {
                let prev = &self.tournaments[prev];
                season = prev.season + 1;
                if let Some(c) = prev.champion {
                    // The reigning champion defends: it joins registration like a new coin.
                    let champ = prev.entrants[c as usize].clone();
                    ext_token::ext(champ.token.clone())
                        .with_static_gas(GAS_START_ROUND)
                        .start_round(None, U64(round_end_ns))
                        .detach();
                    entrants.push(Entrant { eliminated_in: None, last_score: "0".to_string(), ..champ });
                }
            }
            self.tournaments.push(Tournament {
                id,
                ticker: ticker.clone(),
                season,
                phase: Phase::Registration,
                round: 0,
                round_end_ns: U64(round_end_ns),
                entrants,
                rounds: Vec::new(),
                champion: None,
                bounty_pool: U128(0),
                pending_launches: 0,
                advancing: false,
            });
            self.by_ticker.insert(ticker.clone(), id);
            id
        } else {
            self.by_ticker[&ticker]
        };

        let (penalty_bps, virtual_near, cooldown_ns, max) =
            (self.penalty_bps, self.virtual_near, self.cooldown_ns, self.max_entrants);
        let n = self.next_token;
        self.next_token += 1;
        let t = &mut self.tournaments[tid];
        require!(
            t.entrants.len() + (t.pending_launches as usize) < max as usize,
            "this tournament is full"
        );
        t.pending_launches += 1;
        let round_end_ns = t.round_end_ns;

        let token: AccountId = format!("{}-{}.{}", ticker.to_ascii_lowercase(), n, arena)
            .parse()
            .unwrap_or_else(|_| env::panic_str("arena account name too long for sub-accounts"));
        let creator = env::predecessor_account_id();
        let args = json!({
            "name": meme.name,
            "symbol": ticker,
            "icon": meme.icon,
            "creator": creator,
            "round_end_ns": round_end_ns,
            "virtual_near": U128(virtual_near),
            "penalty_bps": penalty_bps,
            "cooldown_ns": U64(cooldown_ns),
        });
        let entrant = Entrant {
            token: token.clone(),
            name: meme.name.clone(),
            creator,
            eliminated_in: None,
            last_score: "0".to_string(),
        };
        Promise::new(token)
            .create_account()
            .transfer(TOKEN_FUND)
            .use_global_contract(self.token_code_hash)
            .function_call("new".to_string(), args.to_string().into_bytes(), seed, GAS_TOKEN_INIT)
            .then(
                Self::ext(arena)
                    .with_static_gas(GAS_ON_LAUNCHED)
                    .on_launched(tid, entrant, U128(deposit.as_yoctonear())),
            )
    }

    #[private]
    pub fn on_launched(&mut self, tournament_id: u32, entrant: Entrant, deposit: U128) -> Option<u8> {
        let ok = env::promise_result_checked(0, 64).is_ok();
        let t = &mut self.tournaments[tournament_id];
        t.pending_launches -= 1;
        if !ok {
            // A failed batch creates nothing and its funds bounce back here.
            Promise::new(entrant.creator).transfer(NearToken::from_yoctonear(deposit.0)).detach();
            env::log_str("launch failed, deposit refunded");
            return None;
        }
        t.bounty_pool.0 += LAUNCH_FEE.as_yoctonear() - TOKEN_FUND.as_yoctonear();
        t.entrants.push(entrant);
        Some((t.entrants.len() - 1) as u8)
    }

    /// Close the current round and start the next one. Anyone may call it
    /// once the round is over and every match has been settled on the tokens.
    pub fn advance(&mut self, tournament_id: u32) -> Promise {
        let t = &mut self.tournaments[tournament_id];
        require!(t.phase != Phase::Finished, "tournament is finished");
        require!(env::block_timestamp() >= t.round_end_ns.0, "round still running");
        require!(!t.advancing, "advance in progress");
        require!(t.pending_launches == 0, "a launch is still in flight");
        t.advancing = true;
        let alive: Vec<u8> = alive(t);
        let callback = Self::ext(env::current_account_id())
            .with_static_gas(GAS_ON_RESULTS)
            .on_results(tournament_id, alive.clone(), env::predecessor_account_id());
        let mut calls = alive
            .iter()
            .map(|&i| ext_token::ext(t.entrants[i as usize].token.clone()).with_static_gas(GAS_RESULT).round_result());
        match calls.next() {
            Some(first) => calls.fold(first, |acc, p| acc.and(p)).then(callback),
            // Nobody managed to launch: nothing to ask.
            None => callback,
        }
    }

    #[private]
    pub fn on_results(&mut self, tournament_id: u32, alive: Vec<u8>, caller: AccountId) -> String {
        let (round_ns, now) = (self.round_ns, env::block_timestamp());
        let t = &mut self.tournaments[tournament_id];
        t.advancing = false;

        // Read everything first; change nothing unless the round is really closed.
        let mut results: Vec<(u8, bool, i128)> = Vec::new(); // (entrant, advanced, score)
        for (k, &i) in alive.iter().enumerate() {
            let token = &t.entrants[i as usize].token;
            let Ok(bytes) = env::promise_result_checked(k as u64, 512) else {
                return format!("{token} did not answer, try again");
            };
            let Ok(r) = near_sdk::serde_json::from_slice::<RoundResult>(&bytes) else {
                return format!("{token} returned garbage");
            };
            if r.round_end_ns != t.round_end_ns {
                return format!("{token} is not in this round: call resync({tournament_id}, {i})");
            }
            match r.status.as_str() {
                "Live" => return format!("match not settled: call settle on {token}"),
                "Advanced" => results.push((i, true, r.score.parse().unwrap_or(0))),
                _ => results.push((i, false, r.score.parse().unwrap_or(0))),
            }
        }

        let round = t.round;
        for &(i, advanced, score) in &results {
            let e = &mut t.entrants[i as usize];
            e.last_score = score.to_string();
            if !advanced {
                e.eliminated_in = Some(round);
            }
        }
        if let Some(matches) = t.rounds.last_mut() {
            let find = |i: u8| results.iter().find(|r| r.0 == i).copied();
            for m in matches.iter_mut() {
                let ra = find(m.a);
                let rb = m.b.and_then(find);
                m.score_a = ra.map(|r| r.2.to_string());
                m.score_b = rb.map(|r| r.2.to_string());
                m.winner = match (ra, rb) {
                    (Some(a), Some(b)) if b.1 && !a.1 => m.b,
                    (Some(a), _) if a.1 => Some(m.a),
                    _ => None,
                };
            }
        }

        // Seed the survivors: best score first, earlier entrant on ties.
        let mut seeds: Vec<(u8, i128)> = results.iter().filter(|r| r.1).map(|r| (r.0, r.2)).collect();
        seeds.sort_by(|x, y| y.1.cmp(&x.1).then(x.0.cmp(&y.0)));

        let message = if seeds.len() <= 1 {
            t.phase = Phase::Finished;
            t.champion = seeds.first().map(|s| s.0);
            "finished".to_string()
        } else {
            t.phase = Phase::Playing;
            t.round += 1;
            let end = U64(now + round_ns);
            t.round_end_ns = end;
            let mut order: Vec<u8> = seeds.iter().map(|s| s.0).collect();
            let mut matches = Vec::new();
            if order.len() % 2 == 1 {
                let top = order.remove(0);
                matches.push(Match { a: top, b: None, winner: None, score_a: None, score_b: None });
            }
            while order.len() >= 2 {
                let a = order.remove(0);
                let b = order.pop().unwrap();
                matches.push(Match { a, b: Some(b), winner: None, score_a: None, score_b: None });
            }
            for m in &matches {
                let ta = t.entrants[m.a as usize].token.clone();
                let tb = m.b.map(|b| t.entrants[b as usize].token.clone());
                ext_token::ext(ta.clone()).with_static_gas(GAS_START_ROUND).start_round(tb.clone(), end).detach();
                if let Some(tb) = tb {
                    ext_token::ext(tb).with_static_gas(GAS_START_ROUND).start_round(Some(ta), end).detach();
                }
            }
            t.rounds.push(matches);
            format!("round {} started", t.round)
        };

        if t.bounty_pool.0 >= ADVANCE_BOUNTY {
            t.bounty_pool.0 -= ADVANCE_BOUNTY;
            Promise::new(caller).transfer(NearToken::from_yoctonear(ADVANCE_BOUNTY)).detach();
        }
        message
    }

    /// Re-send the current round to one token, in case the first message was
    /// lost. A token that already is in the round rejects it, so this is safe
    /// for anyone to call.
    pub fn resync(&mut self, tournament_id: u32, entrant: u8) -> PromiseOrValue<String> {
        let t = &self.tournaments[tournament_id];
        let e = t.entrants.get(entrant as usize).unwrap_or_else(|| env::panic_str("no such entrant"));
        require!(e.eliminated_in.is_none(), "this coin is out");
        let rival = match t.phase {
            Phase::Finished => return PromiseOrValue::Value("tournament is finished".to_string()),
            Phase::Registration => None,
            Phase::Playing => {
                let m = t.rounds.last().and_then(|r| r.iter().find(|m| m.a == entrant || m.b == Some(entrant)));
                let m = m.unwrap_or_else(|| env::panic_str("not paired this round"));
                let other = if m.a == entrant { m.b } else { Some(m.a) };
                other.map(|o| t.entrants[o as usize].token.clone())
            }
        };
        PromiseOrValue::Promise(
            ext_token::ext(e.token.clone()).with_static_gas(GAS_START_ROUND).start_round(rival, t.round_end_ns),
        )
    }

    // ---------------------------------------------------------------- views

    pub fn get_config(&self) -> Config {
        Config {
            registration_ns: U64(self.registration_ns),
            round_ns: U64(self.round_ns),
            cooldown_ns: U64(self.cooldown_ns),
            penalty_bps: self.penalty_bps,
            virtual_near: U128(self.virtual_near),
            min_seed: U128(self.min_seed),
            max_entrants: self.max_entrants,
            token_code_hash: self.token_code_hash.into(),
            launch_fee: U128(LAUNCH_FEE.as_yoctonear()),
        }
    }

    pub fn tournament_count(&self) -> u32 {
        self.tournaments.len()
    }

    pub fn get_tournament(&self, id: u32) -> Option<Tournament> {
        self.tournaments.get(id).cloned()
    }

    pub fn get_tournaments(&self, from_index: u32, limit: u32) -> Vec<Tournament> {
        self.tournaments.iter().skip(from_index as usize).take(limit.min(50) as usize).cloned().collect()
    }

    /// The latest tournament for a ticker, if any.
    pub fn get_by_ticker(&self, ticker: String) -> Option<Tournament> {
        let id = self.by_ticker.get(&ticker.to_ascii_uppercase())?;
        self.tournaments.get(*id).cloned()
    }
}

fn alive(t: &Tournament) -> Vec<u8> {
    (0..t.entrants.len() as u8).filter(|&i| t.entrants[i as usize].eliminated_in.is_none()).collect()
}

fn validate(meme: &Meme) {
    let name = meme.name.trim();
    require!(!name.is_empty() && meme.name.len() <= 32, "name: 1-32 bytes");
    require!(
        (2..=8).contains(&meme.symbol.len()) && meme.symbol.bytes().all(|b| b.is_ascii_alphanumeric()),
        "ticker: 2-8 letters or digits"
    );
    if let Some(icon) = &meme.icon {
        require!(icon.len() <= MAX_ICON_BYTES, "icon: at most 4 KB");
        require!(icon.starts_with("data:image/"), "icon must be a data:image/ URL");
    }
}
