//! Bracket token: a NEP-141 memecoin that lives inside a same-ticker tournament.
//!
//! Every rule below is enforced by this contract. There is no owner and no
//! upgrade method. The only outside input is the arena telling the token who
//! its next opponent is; the arena itself has no owner and no access key.
//!
//! * Buy / sell against a built-in constant-product curve. Buying mints,
//!   selling burns.
//! * Each round the token scores **net inflow x time**: (NEAR in the curve
//!   now - NEAR in the curve when the round started), integrated over the
//!   round. Old liquidity, including liquidity absorbed from a previous
//!   opponent, scores nothing.
//! * Selling is taxed. The tax ramps from 0 to `penalty_bps` over the round,
//!   so leaving just before the bell costs the same as losing. After a win
//!   the tax restarts at `penalty_bps` and decays over `cooldown_ns`, so
//!   winners cannot dump on the holders that were just converted in. The tax
//!   never leaves the curve.
//! * At the bell trading freezes. Anyone may call `settle` and earns a small
//!   bounty. The lower score loses: its reserve goes to the opponent,
//!   `penalty_bps` of it as spoils (no mint) and the rest buys opponent
//!   tokens that loser holders redeem pro rata with `claim`.

use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::{U128, U64};
use near_sdk::store::Vector;
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, Gas,
    NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue,
};

uint::construct_uint! {
    pub struct U256(4);
}

pub const DECIMALS: u8 = 18;
/// Tokens sitting in the curve before the first buy (1 billion).
pub const CURVE_SUPPLY: u128 = 1_000_000_000 * 10u128.pow(18);
/// Flat fee per trade. It stays in the contract and pays for the on-chain trade log.
pub const LOG_FEE: u128 = 2 * 10u128.pow(21); // 0.002 NEAR
/// Paid from the loser's reserve to whoever settles the match: 1%, at most 0.05 NEAR.
pub const SETTLE_BOUNTY_BPS: u128 = 100;
pub const SETTLE_BOUNTY_MAX: u128 = 5 * 10u128.pow(22);
/// Score unit: NEAR is measured in micro-NEAR, time in milliseconds.
const SCORE_UNIT: i128 = 10i128.pow(18);
const NS_PER_MS: u64 = 1_000_000;

const GAS_VIEW: Gas = Gas::from_tgas(5);
const GAS_ON_SCORE: Gas = Gas::from_tgas(60);
const GAS_ABSORB: Gas = Gas::from_tgas(15);
const GAS_ON_ABSORBED: Gas = Gas::from_tgas(5);
const GAS_TRANSFER_TO: Gas = Gas::from_tgas(10);
const GAS_ON_DELIVERED: Gas = Gas::from_tgas(8);

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Token,
    Trades,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    /// Playing a round, or past the bell and waiting for `settle`.
    Live,
    /// Won its last round (or had no opponent). Waiting for the next round,
    /// or champion. Trades freely.
    Advanced,
    /// Lost. Reserve is gone; holders can only `claim`.
    Lost,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Trade {
    pub account: AccountId,
    /// "buy" | "sell" | "spoils" | "convert" | "claim"
    pub kind: String,
    pub near: U128,
    pub tokens: U128,
    pub ts: U64,
}

/// What an opponent (or the arena) needs to know about this token's round.
#[near(serializers = [json])]
pub struct RoundResult {
    pub status: Status,
    pub round_end_ns: U64,
    /// Signed integer as a decimal string.
    pub score: String,
}

#[near(serializers = [json])]
pub struct Info {
    pub name: String,
    pub symbol: String,
    pub creator: AccountId,
    pub status: Status,
    pub rival: Option<AccountId>,
    pub arena: AccountId,
    pub round_start_ns: U64,
    pub round_end_ns: U64,
    pub now_ns: U64,
    pub penalty_bps: u16,
    pub cooldown_ns: U64,
    /// Sell tax right now, in basis points.
    pub sell_tax_bps: u16,
    pub virtual_near: U128,
    pub reserve: U128,
    /// Reserve when the current round started.
    pub round_base: U128,
    pub pool_tokens: U128,
    pub total_supply: U128,
    /// yoctoNEAR for one whole token.
    pub price: U128,
    pub score: String,
    pub trades: u32,
    /// NEAR received as spoils over all rounds won.
    pub spoils: U128,
    /// Rounds won against an opponent.
    pub wins: u32,
    /// If lost: the token that absorbed this one.
    pub absorbed_by: Option<AccountId>,
    /// If lost: opponent tokens still waiting to be claimed.
    pub pool_remaining: U128,
    /// If lost: supply that has not been converted yet.
    pub supply_remaining: U128,
    pub pool_ready: bool,
}

#[ext_contract(ext_token)]
pub trait Opponent {
    fn round_result(&self) -> RoundResult;
    fn absorb(&mut self) -> U128;
    fn transfer_to(&mut self, account: AccountId, amount: U128);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BracketToken {
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
    arena: AccountId,
    creator: AccountId,
    penalty_bps: u16,
    cooldown_ns: u64,
    virtual_near: u128,
    /// Real NEAR backing the curve.
    reserve: u128,
    /// Tokens still inside the curve.
    pool_tokens: u128,

    status: Status,
    rival: Option<AccountId>,
    round_start_ns: u64,
    round_end_ns: u64,
    round_base: u128,
    /// Reserve when the token last advanced (after absorbing). The next
    /// round's base never goes below it, so selling in the break and buying
    /// back after the start does not count as inflow.
    floor_reserve: u128,
    score_acc: i128,
    score_ts: u64,
    /// When the last win was booked. Drives the post-win sell tax.
    won_at_ns: u64,
    wins: u32,
    settling: bool,
    settler: Option<AccountId>,
    absorbed_this_round: bool,
    spoils: u128,

    absorbed_by: Option<AccountId>,
    pool_remaining: u128,
    supply_remaining: u128,
    pool_ready: bool,
    trades: Vector<Trade>,
}

fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    (U256::from(a) * U256::from(b) / U256::from(c)).as_u128()
}

#[near]
impl BracketToken {
    /// Called once by the arena in the batch that creates the account. The
    /// attached deposit is the creator's bonded seed: it buys from the curve
    /// like any other buy, and is at stake like any other holding.
    #[init]
    #[payable]
    pub fn new(
        name: String,
        symbol: String,
        icon: Option<String>,
        creator: AccountId,
        round_end_ns: U64,
        virtual_near: U128,
        penalty_bps: u16,
        cooldown_ns: U64,
    ) -> Self {
        require!(penalty_bps <= 5_000, "penalty_bps > 50%");
        require!(virtual_near.0 > 0, "virtual_near must be > 0");
        require!(round_end_ns.0 > env::block_timestamp(), "round must end in the future");
        let now = env::block_timestamp();
        let mut this = Self {
            token: FungibleToken::new(Key::Token),
            metadata: FungibleTokenMetadata {
                spec: FT_METADATA_SPEC.to_string(),
                name,
                symbol,
                icon,
                reference: None,
                reference_hash: None,
                decimals: DECIMALS,
            },
            arena: env::predecessor_account_id(),
            creator: creator.clone(),
            penalty_bps,
            cooldown_ns: cooldown_ns.0,
            virtual_near: virtual_near.0,
            reserve: 0,
            pool_tokens: CURVE_SUPPLY,
            status: Status::Live,
            rival: None,
            round_start_ns: now,
            round_end_ns: round_end_ns.0,
            round_base: 0,
            floor_reserve: 0,
            score_acc: 0,
            score_ts: now,
            won_at_ns: 0,
            wins: 0,
            settling: false,
            settler: None,
            absorbed_this_round: false,
            spoils: 0,
            absorbed_by: None,
            pool_remaining: 0,
            supply_remaining: 0,
            pool_ready: false,
            trades: Vector::new(Key::Trades),
        };
        let seed = env::attached_deposit().as_yoctonear();
        if seed > 0 {
            this.token.internal_register_account(&creator);
            let out = this.curve_buy(seed);
            this.token.internal_deposit(&creator, out);
            FtMint { owner_id: &creator, amount: U128(out), memo: Some("seed") }.emit();
            this.log_trade(&creator, "buy", seed, out);
        }
        this
    }

    /// Arena only. Puts a token that advanced into its next round. `rival`
    /// is `None` for a bye or for the registration round of a new season.
    pub fn start_round(&mut self, rival: Option<AccountId>, round_end_ns: U64) {
        require!(env::predecessor_account_id() == self.arena, "only the arena");
        self.sync();
        require!(self.status == Status::Advanced, "not waiting for a round");
        let now = env::block_timestamp();
        require!(round_end_ns.0 > now, "round must end in the future");
        require!(rival.as_ref() != Some(&env::current_account_id()), "cannot face yourself");
        self.status = Status::Live;
        self.rival = rival;
        self.round_start_ns = now;
        self.round_end_ns = round_end_ns.0;
        self.round_base = self.reserve.max(self.floor_reserve);
        self.score_acc = 0;
        self.score_ts = now;
        self.absorbed_this_round = false;
    }

    // ---------------------------------------------------------------- trade

    /// Buy with the attached NEAR. Mints new tokens from the curve.
    #[payable]
    pub fn buy(&mut self, min_tokens_out: Option<U128>) -> U128 {
        self.sync();
        self.assert_tradable();
        let account = env::predecessor_account_id();
        let mut fee = LOG_FEE;
        if !self.token.accounts.contains_key(&account) {
            fee += self.registration_fee();
            self.token.internal_register_account(&account);
        }
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached > fee, "deposit does not cover the fees");
        let near_in = attached - fee;

        self.touch_score();
        let out = self.curve_buy(near_in);
        require!(out > 0, "amount too small");
        if let Some(min) = min_tokens_out {
            require!(out >= min.0, "slippage: tokens out below minimum");
        }
        self.token.internal_deposit(&account, out);
        FtMint { owner_id: &account, amount: U128(out), memo: Some("buy") }.emit();
        self.log_trade(&account, "buy", near_in, out);
        U128(out)
    }

    /// Sell tokens back to the curve. Burns them and pays out NEAR minus the
    /// current sell tax. The tax stays in the curve.
    #[payable]
    pub fn sell(&mut self, amount: U128, min_near_out: Option<U128>) -> Promise {
        assert_one_yocto();
        self.sync();
        self.assert_tradable();
        let account = env::predecessor_account_id();
        let amount = amount.0;
        require!(amount > 0, "amount must be > 0");

        self.touch_score();
        let n = self.virtual_near + self.reserve;
        let gross = mul_div(n, amount, self.pool_tokens + amount).min(self.reserve);
        let tax = mul_div(gross, self.sell_tax_bps() as u128, 10_000);
        require!(gross - tax > LOG_FEE, "amount too small");
        let payout = gross - tax - LOG_FEE;
        if let Some(min) = min_near_out {
            require!(payout >= min.0, "slippage: NEAR out below minimum");
        }
        self.token.internal_withdraw(&account, amount);
        self.pool_tokens += amount;
        self.reserve -= gross - tax;
        FtBurn { owner_id: &account, amount: U128(amount), memo: Some("sell") }.emit();
        self.log_trade(&account, "sell", payout, amount);
        Promise::new(account).transfer(NearToken::from_yoctonear(payout))
    }

    // --------------------------------------------------------------- settle

    /// Anyone may call this once the round is over. If this side turns out to
    /// be the loser, the caller earns the settle bounty.
    pub fn settle(&mut self) -> Promise {
        self.sync();
        require!(self.status == Status::Live, "nothing to settle");
        require!(env::block_timestamp() >= self.round_end_ns, "round still running");
        require!(!self.settling, "settlement in progress");
        let rival = self.rival.clone().unwrap_or_else(|| env::panic_str("no opponent this round"));
        self.settling = true;
        self.settler = Some(env::predecessor_account_id());
        self.touch_score();
        ext_token::ext(rival)
            .with_static_gas(GAS_VIEW)
            .round_result()
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_SCORE).on_rival_result())
    }

    #[private]
    pub fn on_rival_result(
        &mut self,
        #[callback_result] rival_result: Result<RoundResult, PromiseError>,
    ) -> PromiseOrValue<String> {
        self.settling = false;
        let Ok(theirs) = rival_result else {
            return PromiseOrValue::Value("opponent unreachable, call settle again".to_string());
        };
        if self.status != Status::Live {
            // The opponent surrendered to us while we were asking.
            return PromiseOrValue::Value("won".to_string());
        }
        if theirs.round_end_ns.0 != self.round_end_ns {
            return PromiseOrValue::Value("opponent is not in this round yet: resync it from the arena".to_string());
        }
        let their_score: i128 = theirs.score.parse().unwrap_or_else(|_| env::panic_str("bad score"));
        let mine = self.score_acc;
        let rival = self.rival.clone().unwrap();
        // Ties go to the smaller account id: both sides compute the same answer.
        let win = mine > their_score || (mine == their_score && env::current_account_id() < rival);
        if win {
            env::log_str(&format!("WON {mine} vs {their_score}"));
            self.book_win();
            return PromiseOrValue::Value("won".to_string());
        }
        env::log_str(&format!("LOST {mine} vs {their_score}"));
        self.status = Status::Lost;
        self.absorbed_by = Some(rival.clone());
        self.supply_remaining = self.token.total_supply;
        let total = self.reserve;
        self.reserve = 0;
        if total == 0 {
            self.pool_ready = true;
            return PromiseOrValue::Value("lost".to_string());
        }
        let bounty = mul_div(total, SETTLE_BOUNTY_BPS, 10_000).min(SETTLE_BOUNTY_MAX);
        let out = total - bounty;
        PromiseOrValue::Promise(
            ext_token::ext(rival)
                .with_attached_deposit(NearToken::from_yoctonear(out))
                .with_static_gas(GAS_ABSORB)
                .absorb()
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_ON_ABSORBED)
                        .on_absorbed(U128(total), U128(bounty)),
                ),
        )
    }

    #[private]
    pub fn on_absorbed(
        &mut self,
        total: U128,
        bounty: U128,
        #[callback_result] pool: Result<U128, PromiseError>,
    ) -> String {
        match pool {
            Ok(pool) => {
                self.pool_remaining = pool.0;
                self.pool_ready = true;
                if let Some(settler) = self.settler.take() {
                    if bounty.0 > 0 {
                        Promise::new(settler).transfer(NearToken::from_yoctonear(bounty.0)).detach();
                    }
                }
                "lost".to_string()
            }
            Err(_) => {
                // The NEAR bounced back. Undo, so settle can be retried.
                self.status = Status::Live;
                self.reserve = total.0;
                self.absorbed_by = None;
                self.supply_remaining = 0;
                "absorb failed, call settle again".to_string()
            }
        }
    }

    /// Winner side. Only this round's opponent can call it, and it only does
    /// so after its own contract decided it lost.
    #[payable]
    pub fn absorb(&mut self) -> U128 {
        self.sync();
        let rival = env::predecessor_account_id();
        require!(self.rival.as_ref() == Some(&rival), "only this round's opponent");
        require!(env::block_timestamp() >= self.round_end_ns, "round still running");
        require!(self.status != Status::Lost, "both sides cannot lose");
        require!(!self.absorbed_this_round, "already absorbed");
        self.touch_score();
        self.absorbed_this_round = true;
        // (Re)start the post-win tax now, so it covers the tokens minted below.
        self.book_win();

        let received = env::attached_deposit().as_yoctonear();
        let spoils = mul_div(received, self.penalty_bps as u128, 10_000);
        // Spoils: NEAR enters the curve and no token is minted.
        self.reserve += spoils;
        self.spoils += spoils;
        // The remainder buys winner tokens at the post-spoils price.
        let rest = received - spoils;
        let pool = if rest > 0 { self.curve_buy(rest) } else { 0 };

        if !self.token.accounts.contains_key(&rival) {
            self.token.internal_register_account(&rival);
        }
        if pool > 0 {
            self.token.internal_deposit(&rival, pool);
            FtMint { owner_id: &rival, amount: U128(pool), memo: Some("conversion pool") }.emit();
        }
        self.floor_reserve = self.reserve;
        self.log_trade(&rival, "spoils", spoils, 0);
        self.log_trade(&rival, "convert", rest, pool);
        U128(pool)
    }

    // ---------------------------------------------------------------- claim

    /// Loser side. Burns the caller's tokens and sends their share of the
    /// conversion pool in the absorbing token. Attach `claim_deposit()` NEAR:
    /// it pays for storage on that token and is refunded if not needed.
    /// If the absorbing token later lost as well, call `claim` there next.
    #[payable]
    pub fn claim(&mut self) -> Promise {
        require!(self.status == Status::Lost, "this token did not lose");
        require!(self.pool_ready, "conversion pool not ready");
        let account = env::predecessor_account_id();
        let deposit = env::attached_deposit();
        require!(deposit.as_yoctonear() >= self.registration_fee(), "attach claim_deposit() NEAR");
        let balance = self.token.ft_balance_of(account.clone()).0;
        require!(balance > 0, "nothing to claim");
        let share = mul_div(self.pool_remaining, balance, self.supply_remaining);
        require!(share > 0, "share rounds to zero");

        self.token.internal_withdraw(&account, balance);
        self.pool_remaining -= share;
        self.supply_remaining -= balance;
        FtBurn { owner_id: &account, amount: U128(balance), memo: Some("claim") }.emit();
        self.log_trade(&account, "claim", 0, balance);

        ext_token::ext(self.absorbed_by.clone().unwrap())
            .with_attached_deposit(deposit)
            .with_static_gas(GAS_TRANSFER_TO)
            .transfer_to(account.clone(), U128(share))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_DELIVERED)
                    .on_delivered(account, U128(balance), U128(share), U128(deposit.as_yoctonear())),
            )
    }

    #[private]
    pub fn on_delivered(
        &mut self,
        account: AccountId,
        burned: U128,
        share: U128,
        deposit: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            return true;
        }
        // Delivery failed: give the tokens and the deposit back.
        if !self.token.accounts.contains_key(&account) {
            self.token.internal_register_account(&account);
        }
        self.token.internal_deposit(&account, burned.0);
        self.pool_remaining += share.0;
        self.supply_remaining += burned.0;
        FtMint { owner_id: &account, amount: burned, memo: Some("claim reverted") }.emit();
        Promise::new(account).transfer(NearToken::from_yoctonear(deposit.0)).detach();
        false
    }

    /// `ft_transfer` that also registers the receiver, paid by the attached
    /// deposit (the unused part is refunded to the receiver). Moves the
    /// caller's own tokens only, so anyone may call it.
    #[payable]
    pub fn transfer_to(&mut self, account: AccountId, amount: U128) {
        let sender = env::predecessor_account_id();
        let mut refund = env::attached_deposit().as_yoctonear();
        if !self.token.accounts.contains_key(&account) {
            let fee = self.registration_fee();
            require!(refund >= fee, "deposit does not cover storage");
            refund -= fee;
            self.token.internal_register_account(&account);
        }
        self.token.internal_transfer(&sender, &account, amount.0, None);
        if refund > 0 {
            Promise::new(account).transfer(NearToken::from_yoctonear(refund)).detach();
        }
    }

    // ---------------------------------------------------------------- views

    /// Final once `now >= round_end_ns`.
    pub fn round_result(&self) -> RoundResult {
        RoundResult {
            status: self.status_now(),
            round_end_ns: U64(self.round_end_ns),
            score: self.score_now().to_string(),
        }
    }

    pub fn get_info(&self) -> Info {
        Info {
            name: self.metadata.name.clone(),
            symbol: self.metadata.symbol.clone(),
            creator: self.creator.clone(),
            status: self.status_now(),
            rival: self.rival.clone(),
            arena: self.arena.clone(),
            round_start_ns: U64(self.round_start_ns),
            round_end_ns: U64(self.round_end_ns),
            now_ns: U64(env::block_timestamp()),
            penalty_bps: self.penalty_bps,
            cooldown_ns: U64(self.cooldown_ns),
            sell_tax_bps: self.sell_tax_bps(),
            virtual_near: U128(self.virtual_near),
            reserve: U128(self.reserve),
            round_base: U128(self.round_base),
            pool_tokens: U128(self.pool_tokens),
            total_supply: U128(self.token.total_supply),
            price: U128(mul_div(
                self.virtual_near + self.reserve,
                10u128.pow(DECIMALS as u32),
                self.pool_tokens,
            )),
            score: self.score_now().to_string(),
            trades: self.trades.len(),
            spoils: U128(self.spoils),
            wins: self.wins,
            absorbed_by: self.absorbed_by.clone(),
            pool_remaining: U128(self.pool_remaining),
            supply_remaining: U128(self.supply_remaining),
            pool_ready: self.pool_ready,
        }
    }

    /// Winner tokens `account` would receive from `claim`.
    pub fn claimable(&self, account: AccountId) -> U128 {
        if self.status != Status::Lost || !self.pool_ready || self.supply_remaining == 0 {
            return U128(0);
        }
        let balance = self.token.ft_balance_of(account).0;
        U128(mul_div(self.pool_remaining, balance, self.supply_remaining))
    }

    /// NEAR to attach to `claim`.
    pub fn claim_deposit(&self) -> U128 {
        U128(self.registration_fee())
    }

    /// Fee taken from a buy: log fee, plus storage if the buyer is new.
    pub fn buy_fee(&self, account: AccountId) -> U128 {
        let reg = if self.token.accounts.contains_key(&account) { 0 } else { self.registration_fee() };
        U128(LOG_FEE + reg)
    }

    /// Append-only log of every mint and burn caused by the mechanic.
    pub fn get_trades(&self, from_index: u32, limit: u32) -> Vec<Trade> {
        self.trades.iter().skip(from_index as usize).take(limit.min(200) as usize).cloned().collect()
    }
}

// ------------------------------------------------------------------ internal

impl BracketToken {
    /// A round without an opponent (registration, bye) needs no settlement:
    /// the token has advanced as soon as the round is over.
    fn auto_advanced(&self) -> bool {
        self.status == Status::Live && self.rival.is_none() && env::block_timestamp() >= self.round_end_ns
    }

    fn status_now(&self) -> Status {
        if self.auto_advanced() { Status::Advanced } else { self.status }
    }

    fn sync(&mut self) {
        if self.auto_advanced() {
            self.touch_score();
            self.status = Status::Advanced;
            self.floor_reserve = self.reserve;
        }
    }

    fn book_win(&mut self) {
        if self.status != Status::Advanced {
            self.wins += 1;
        }
        self.status = Status::Advanced;
        self.floor_reserve = self.reserve;
        self.won_at_ns = env::block_timestamp();
    }

    fn assert_tradable(&self) {
        match self.status {
            Status::Advanced => {}
            Status::Lost => env::panic_str("this token lost: use claim"),
            Status::Live => require!(
                env::block_timestamp() < self.round_end_ns,
                "round is over: call settle"
            ),
        }
    }

    /// max(ramp over the current round, decay after the last win).
    fn sell_tax_bps(&self) -> u16 {
        let now = env::block_timestamp();
        let p = self.penalty_bps as u128;
        let mut tax = 0u128;
        if self.status_now() == Status::Live && self.round_end_ns > self.round_start_ns {
            let elapsed = now.min(self.round_end_ns).saturating_sub(self.round_start_ns) as u128;
            tax = p * elapsed / (self.round_end_ns - self.round_start_ns) as u128;
        }
        if self.won_at_ns > 0 && self.cooldown_ns > 0 && now < self.won_at_ns + self.cooldown_ns {
            let left = (self.won_at_ns + self.cooldown_ns - now) as u128;
            tax = tax.max(p * left / self.cooldown_ns as u128);
        }
        tax as u16
    }

    fn registration_fee(&self) -> u128 {
        (self.token.account_storage_usage as u128) * env::storage_byte_cost().as_yoctonear()
    }

    fn score_now(&self) -> i128 {
        let now = env::block_timestamp().min(self.round_end_ns);
        if now <= self.score_ts {
            return self.score_acc;
        }
        let ms = ((now - self.score_ts) / NS_PER_MS) as i128;
        let net = self.reserve as i128 - self.round_base as i128;
        self.score_acc + (net / SCORE_UNIT) * ms
    }

    /// Must run before every change of `reserve`.
    fn touch_score(&mut self) {
        let now = env::block_timestamp().min(self.round_end_ns);
        if now > self.score_ts {
            self.score_acc = self.score_now();
            self.score_ts = now;
        }
    }

    /// x*y=k buy. Moves `near_in` into the reserve, returns tokens leaving the curve.
    fn curve_buy(&mut self, near_in: u128) -> u128 {
        let n = self.virtual_near + self.reserve;
        let out = mul_div(self.pool_tokens, near_in, n + near_in);
        self.pool_tokens -= out;
        self.reserve += near_in;
        out
    }

    fn log_trade(&mut self, account: &AccountId, kind: &str, near: u128, tokens: u128) {
        self.trades.push(Trade {
            account: account.clone(),
            kind: kind.to_string(),
            near: U128(near),
            tokens: U128(tokens),
            ts: U64(env::block_timestamp()),
        });
    }
}

// ------------------------------------------------------------------- NEP-141

#[near]
impl FungibleTokenCore for BracketToken {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for BracketToken {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        U128(used)
    }
}

#[near]
impl StorageManagement for BracketToken {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    /// Unregistering is only possible with a zero balance: burning outside
    /// the curve would break the claim accounting.
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        require!(!force.unwrap_or(false), "force unregister is disabled");
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for BracketToken {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }
}

#[cfg(test)]
mod tests;
