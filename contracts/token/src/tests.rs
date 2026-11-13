use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const NEAR: u128 = 10u128.pow(24);
const HOUR: u64 = 3_600_000_000_000;
const T0: u64 = 1_000 * HOUR;
const REG_END: u64 = T0 + 12 * HOUR;
const COOLDOWN: u64 = 6 * HOUR;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(who: &str, deposit: u128, ts: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("pepe-0.arena.near"))
        .predecessor_account_id(acc(who))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(1000))
        .block_timestamp(ts)
        .build());
}

fn token_with_cap(seed: u128, cap: u128) -> BracketToken {
    ctx("arena.near", seed, T0);
    BracketToken::new("Pepe".into(), "PEPE".into(), None, acc("dev.near"), U64(REG_END), U128(50 * NEAR), 1500, U64(COOLDOWN), 100, U128(cap))
}

fn token(seed: u128) -> BracketToken {
    token_with_cap(seed, 1_000 * NEAR)
}

/// A token that finished registration and is in round 1 against pepe-1.
fn in_round(seed: u128) -> (BracketToken, u64, u64) {
    let mut t = token(seed);
    let start = REG_END + HOUR;
    let end = start + 24 * HOUR;
    ctx("arena.near", 0, start);
    t.start_round(Some(acc("pepe-1.arena.near")), U64(end));
    (t, start, end)
}

#[test]
fn seed_buys_for_the_creator() {
    let t = token(2 * NEAR);
    assert_eq!(t.reserve, 2 * NEAR);
    assert!(t.token.ft_balance_of(acc("dev.near")).0 > 0);
    assert_eq!(t.token.total_supply, t.token.ft_balance_of(acc("dev.near")).0);
}

#[test]
fn registration_needs_no_settlement() {
    let mut t = token(NEAR);
    ctx("x.near", 0, REG_END - 1);
    assert_eq!(t.round_result().status, Status::Live);
    ctx("x.near", 0, REG_END);
    assert_eq!(t.round_result().status, Status::Advanced);
    // Trading continues in the break.
    ctx("alice.near", NEAR, REG_END + 1);
    assert!(t.buy(None).0 > 0);
    assert_eq!(t.status, Status::Advanced);
}

#[test]
fn sell_tax_ramps_to_the_penalty_and_stays_in_the_curve() {
    let (mut t, start, end) = in_round(0);
    ctx("alice.near", 10 * NEAR, start);
    let out = t.buy(None).0;
    assert_eq!(t.sell_tax_bps(), 0);
    ctx("alice.near", 1, start + 12 * HOUR);
    assert_eq!(t.sell_tax_bps(), 750);
    ctx("alice.near", 1, end - 1);
    assert_eq!(t.sell_tax_bps(), 1499);

    ctx("alice.near", 1, start + 12 * HOUR);
    let before = t.reserve;
    let _ = t.sell(U128(out), None);
    // Everything was sold, yet 7.5% of the curve payout is still in the reserve.
    assert_eq!(t.token.total_supply, 0);
    let left = t.reserve;
    assert!(left > before * 74 / 1000 && left < before * 76 / 1000, "left {left}");
}

#[test]
fn score_is_net_inflow_times_time() {
    // 5 NEAR of old liquidity scores nothing in the new round.
    let (mut t, start, end) = in_round(5 * NEAR);
    assert_eq!(t.round_base, 5 * NEAR);
    ctx("x.near", 0, start + 10 * HOUR);
    assert_eq!(t.round_result().score, "0");

    ctx("alice.near", 2 * NEAR + LOG_FEE + t.registration_fee(), start + 10 * HOUR);
    t.buy(None);
    ctx("x.near", 0, start + 20 * HOUR);
    let expect = (2 * NEAR / 10u128.pow(18)) as i128 * (10 * 3_600_000);
    assert_eq!(t.round_result().score, expect.to_string());
    // The score stops at the bell.
    ctx("x.near", 0, end + 100 * HOUR);
    let fin: i128 = t.round_result().score.parse().unwrap();
    assert_eq!(fin, expect / 10 * 14);
}

#[test]
fn outflow_scores_negative() {
    let (mut t, start, _) = in_round(5 * NEAR);
    let bal = t.token.ft_balance_of(acc("dev.near")).0;
    ctx("dev.near", 1, start + HOUR);
    let _ = t.sell(U128(bal / 2), None);
    ctx("x.near", 0, start + 2 * HOUR);
    assert!(t.round_result().score.starts_with('-'));
}

#[test]
fn selling_in_the_break_and_buying_back_is_not_inflow() {
    let mut t = token(5 * NEAR);
    let bal = t.token.ft_balance_of(acc("dev.near")).0;
    // Registration is over: sell everything tax-free in the break ...
    ctx("dev.near", 1, REG_END + 1);
    let _ = t.sell(U128(bal), None);
    assert!(t.reserve < NEAR / 100);
    // ... the next round still starts from the reserve at the bell.
    let start = REG_END + HOUR;
    ctx("arena.near", 0, start);
    t.start_round(Some(acc("pepe-1.arena.near")), U64(start + 24 * HOUR));
    assert_eq!(t.round_base, 5 * NEAR);
    ctx("dev.near", 5 * NEAR, start + 1);
    t.buy(None);
    ctx("x.near", 0, start + 10 * HOUR);
    let s: i128 = t.round_result().score.parse().unwrap();
    assert!(s <= 0, "wash scored {s}");
}

#[test]
#[should_panic(expected = "round is over")]
fn trading_freezes_at_the_bell() {
    let (mut t, _, end) = in_round(0);
    ctx("alice.near", NEAR, end);
    t.buy(None);
}

#[test]
#[should_panic(expected = "round still running")]
fn cannot_settle_early() {
    let (mut t, _, end) = in_round(0);
    ctx("alice.near", 0, end - 1);
    let _ = t.settle();
}

#[test]
#[should_panic(expected = "only the arena")]
fn only_arena_starts_rounds() {
    let mut t = token(0);
    ctx("mallory.near", 0, REG_END + 1);
    t.start_round(None, U64(REG_END + HOUR));
}

#[test]
#[should_panic(expected = "not waiting for a round")]
fn cannot_restart_a_running_round() {
    let (mut t, start, end) = in_round(0);
    ctx("arena.near", 0, start + HOUR);
    t.start_round(None, U64(end + HOUR));
}

#[test]
#[should_panic(expected = "only this round's opponent")]
fn only_the_opponent_can_absorb() {
    let (mut t, _, end) = in_round(0);
    ctx("mallory.near", NEAR, end + 1);
    t.absorb();
}

#[test]
fn absorb_pays_spoils_mints_the_pool_and_starts_the_cooldown_tax() {
    let (mut t, start, end) = in_round(0);
    ctx("alice.near", 10 * NEAR, start + HOUR);
    let alice = t.buy(None).0;

    ctx("pepe-1.arena.near", 20 * NEAR, end + 1);
    let pool = t.absorb().0;
    assert_eq!(t.status, Status::Advanced);
    assert_eq!(t.wins, 1);
    // 15% penalty: 1% of what moved goes to the creator, 14% stays as spoils.
    assert_eq!(t.spoils, 28 * NEAR / 10);
    assert_eq!(t.creator_rewards, 2 * NEAR / 10);
    assert_eq!(t.token.ft_balance_of(acc("pepe-1.arena.near")).0, pool);
    assert_eq!(t.token.total_supply, alice + pool);
    // Solvent: everyone selling never asks for more than the reserve.
    let n = t.virtual_near + t.reserve;
    assert!(mul_div(n, alice + pool, t.pool_tokens + alice + pool) <= t.reserve);

    // Right after the win, dumping costs the full penalty; it decays to zero.
    assert_eq!(t.sell_tax_bps(), 1500);
    ctx("x.near", 0, end + 1 + COOLDOWN / 2);
    assert_eq!(t.sell_tax_bps(), 750);
    ctx("x.near", 0, end + 1 + COOLDOWN);
    assert_eq!(t.sell_tax_bps(), 0);

    // Absorbed liquidity is not inflow in the next round.
    ctx("arena.near", 0, end + 2);
    t.start_round(None, U64(end + 24 * HOUR));
    assert_eq!(t.round_base, t.reserve);
    assert_eq!(t.get_info().scored_inflow, "0");
    // In a new round the tax is the larger of the two schedules.
    ctx("x.near", 0, end + 3);
    assert!(t.sell_tax_bps() > 1490);
}

#[test]
#[should_panic(expected = "already absorbed")]
fn absorb_only_once_per_round() {
    let (mut t, _, end) = in_round(0);
    ctx("pepe-1.arena.near", NEAR, end + 1);
    t.absorb();
    ctx("pepe-1.arena.near", NEAR, end + 2);
    t.absorb();
}

#[test]
fn transfer_to_registers_the_receiver() {
    let mut t = token(2 * NEAR);
    let bal = t.token.ft_balance_of(acc("dev.near")).0;
    ctx("dev.near", t.registration_fee(), T0 + 1);
    t.transfer_to(acc("bob.near"), U128(bal / 4));
    assert_eq!(t.token.ft_balance_of(acc("bob.near")).0, bal / 4);
}

#[test]
#[should_panic(expected = "slippage")]
fn slippage_guard() {
    let mut t = token(0);
    ctx("alice.near", NEAR, T0 + 1);
    t.buy(Some(U128(CURVE_SUPPLY)));
}

#[test]
fn one_account_counts_only_up_to_the_cap() {
    // Cap of 1 NEAR per account per round.
    let mut t = token_with_cap(0, NEAR);
    let start = REG_END + HOUR;
    ctx("arena.near", 0, start);
    t.start_round(Some(acc("pepe-1.arena.near")), U64(start + 24 * HOUR));
    // A whale brings 10 NEAR, two small buyers bring 0.5 NEAR each.
    ctx("whale.near", 10 * NEAR, start);
    t.buy(None);
    let whale_only: i128 = t.get_info().scored_inflow.parse().unwrap();
    assert_eq!(whale_only, NEAR as i128);
    for who in ["a.near", "b.near"] {
        ctx(who, NEAR / 2 + LOG_FEE + t.registration_fee(), start);
        t.buy(None);
    }
    let all: i128 = t.get_info().scored_inflow.parse().unwrap();
    assert_eq!(all, 2 * NEAR as i128);
    // The whale selling part of a position above the cap changes nothing.
    let bal = t.token.ft_balance_of(acc("whale.near")).0;
    ctx("whale.near", 1, start + 1);
    let _ = t.sell(U128(bal / 4), None);
    assert_eq!(t.get_info().scored_inflow.parse::<i128>().unwrap(), 2 * NEAR as i128);
}

#[test]
fn creator_reward_comes_out_of_the_penalty() {
    ctx("arena.near", 0, T0);
    let ok = std::panic::catch_unwind(|| {
        BracketToken::new("P".into(), "P".into(), None, acc("dev.near"), U64(REG_END), U128(NEAR), 1000, U64(COOLDOWN), 1001, U128(NEAR))
    });
    assert!(ok.is_err(), "a reward above the penalty is refused");
}
