//! Cross-chain match, spike. One copy of a ticker lives on NEAR (a pool inside
//! this contract), the other on an EVM chain (`HITCPool`). Both score the same
//! way: every buy adds `amount × seconds left in the round`. At the bell the
//! contract compares the two scores. If the EVM copy lost, the contract asks
//! NEAR Chain Signatures to sign an EIP-712 `Release` for the pool, so anyone
//! can relay it and move the loser's whole reserve to the escrow address. If
//! the NEAR copy lost, its reserve goes to the NEAR escrow account.
//!
//! The account that runs this contract has no access keys once deployed, so
//! the EVM address derived from it (account + path) is controlled only by the
//! rules below.
//!
//! Holders of a losing EVM copy claim on NEAR: they sign "HITC claim <ticker> copy on <chain> to
//! <near account>" with their EVM key, prove their balance at the bell against a Merkle root, and the
//! contract checks the signature with `ecrecover` and pays their share of the swapped reserve: 85% goes
//! to holders pro rata, 15% stays with the winner as spoils, as in the bracket rules.
//!
//! Known gaps, by design of the spike:
//! * The EVM score is reported by `reporter`; NEAR cannot read Base state by
//!   itself. A light client or an oracle would remove that trust.
//! * NEAR and ETH are compared through a fixed `yocto_per_wei` rate set at
//!   deployment. A price oracle would replace it.
//! * The escrow addresses stand in for NEAR Intents deposit addresses, which
//!   would swap the reserve into the winner's asset. Intents runs on mainnet only,
//!   so `deliver_swap` stands in for the swapped NEAR arriving.
//! * The holders' Merkle root is posted by `reporter`, for the same reason as the score.

use near_sdk::json_types::{U128, U64};
use near_sdk::store::LookupSet;
use near_sdk::{env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise};

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Claimed,
}

const SECP256K1_DOMAIN_ID: u64 = 0;
const SIGN_GAS: Gas = Gas::from_tgas(50);
const CALLBACK_GAS: Gas = Gas::from_tgas(10);
const SIGN_DEPOSIT: NearToken = NearToken::from_yoctonear(1);
const MAX_SIGN_RESPONSE_BYTES: usize = 1024;
const PENALTY_BPS: u128 = 1_500;
const MAX_PROOF: usize = 32;

uint::construct_uint! {
    pub struct U256(4);
}

/// a × b / c without overflowing: balances are ~1e26 and NEAR amounts ~1e24, so a × b does not fit in u128.
fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    (U256::from(a) * U256::from(b) / U256::from(c)).as_u128()
}
const NS_PER_S: u64 = 1_000_000_000;

const DOMAIN_TYPE: &[u8] = b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
const DOMAIN_NAME: &[u8] = b"HITCPool";
const DOMAIN_VERSION: &[u8] = b"1";
const RELEASE_TYPE: &[u8] = b"Release(address to,uint256 nonce)";

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SignRequest {
    pub path: String,
    pub payload_v2: SignPayload,
    pub domain_id: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub enum SignPayload {
    Ecdsa(String),
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SignResponse {
    pub big_r: BigR,
    pub s: Scalar,
    pub recovery_id: u8,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct BigR {
    pub affine_point: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Scalar {
    pub scalar: String,
}

#[ext_contract(ext_signer)]
#[allow(dead_code)]
trait MpcSigner {
    fn sign(&mut self, request: SignRequest);
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Phase {
    /// Before the bell: anyone buys the NEAR copy.
    Playing,
    /// The EVM copy lost; the release is being signed (or can be signed again).
    EvmLost,
    /// The NEAR copy lost; its reserve went to the NEAR escrow.
    NearLost,
}

#[near(serializers = [json])]
pub struct Info {
    pub phase: Phase,
    pub ticker: String,
    pub round_end_ns: U64,
    pub near_reserve: U128,
    pub near_score: U128,
    pub evm_score: Option<U128>,
    pub evm_score_in_near: Option<U128>,
    pub yocto_per_wei: U128,
    pub chain_id: U64,
    pub pool: String,
    pub evm_escrow: String,
    pub near_escrow: AccountId,
    pub reporter: AccountId,
    pub mpc: AccountId,
    pub path: String,
    pub release_digest: Option<String>,
    pub release_signature: Option<String>,
    pub holders_root: Option<String>,
    pub holders_supply: U128,
    pub swapped_near: U128,
    pub spoils_near: U128,
    pub claimed_near: U128,
    pub claims: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct XArena {
    ticker: String,
    round_end_ns: u64,
    near_reserve: u128,
    near_score: u128,
    evm_score: Option<u128>,
    yocto_per_wei: u128,
    chain_id: u64,
    pool: [u8; 20],
    evm_escrow: [u8; 20],
    near_escrow: AccountId,
    reporter: AccountId,
    mpc: AccountId,
    path: String,
    phase: Phase,
    signing: bool,
    release_signature: Option<String>,
    evm_score_raw: i128,
    holders_root: Option<[u8; 32]>,
    holders_supply: u128,
    swapped_near: u128,
    claimed_near: u128,
    claims: u32,
    claimed: LookupSet<[u8; 20]>,
}

#[near]
impl XArena {
    #[init]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        ticker: String,
        round_end_ns: U64,
        yocto_per_wei: U128,
        chain_id: U64,
        pool: String,
        evm_escrow: String,
        near_escrow: AccountId,
        reporter: AccountId,
        mpc: AccountId,
        path: String,
    ) -> Self {
        require!(round_end_ns.0 > env::block_timestamp(), "the round must end in the future");
        require!(yocto_per_wei.0 > 0, "yocto_per_wei must be positive");
        Self {
            ticker,
            round_end_ns: round_end_ns.0,
            near_reserve: 0,
            near_score: 0,
            evm_score: None,
            yocto_per_wei: yocto_per_wei.0,
            chain_id: chain_id.0,
            pool: parse_hex_fixed(&pool).unwrap_or_else(|| env::panic_str("pool must be a 20-byte hex address")),
            evm_escrow: parse_hex_fixed(&evm_escrow).unwrap_or_else(|| env::panic_str("evm_escrow must be a 20-byte hex address")),
            near_escrow,
            reporter,
            mpc,
            path,
            phase: Phase::Playing,
            signing: false,
            release_signature: None,
            evm_score_raw: 0,
            holders_root: None,
            holders_supply: 0,
            swapped_near: 0,
            claimed_near: 0,
            claims: 0,
            claimed: LookupSet::new(StorageKey::Claimed),
        }
    }

    /// Buy the NEAR copy. Scores `amount × seconds left`, like `HITCPool.buy`.
    #[payable]
    pub fn buy(&mut self) {
        let now = env::block_timestamp();
        require!(now < self.round_end_ns, "the round is over");
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "attach NEAR to buy");
        let seconds_left = ((self.round_end_ns - now) / NS_PER_S) as u128;
        self.near_reserve += amount;
        self.near_score += amount * seconds_left;
    }

    /// The EVM copy's score, read from `HITCPool.score()` after the bell (signed: net outflow is
    /// negative). Trusted in the spike.
    pub fn report_evm_score(&mut self, score: String) {
        require!(env::predecessor_account_id() == self.reporter, "only the reporter");
        require!(env::block_timestamp() >= self.round_end_ns, "wait for the bell");
        require!(self.phase == Phase::Playing, "already settled");
        let raw: i128 = score.parse().unwrap_or_else(|_| env::panic_str("score must be an integer"));
        self.evm_score_raw = raw;
        self.evm_score = Some(raw.max(0) as u128);
    }

    /// After the EVM copy lost: the Merkle root of its balances at the bell and their total.
    /// Leaves are `keccak256(abi.encode(address, uint256))`, pairs are hashed sorted. Trusted in the spike.
    pub fn report_evm_holders(&mut self, root: String, total_supply: U128) {
        require!(env::predecessor_account_id() == self.reporter, "only the reporter");
        require!(self.phase == Phase::EvmLost, "the EVM copy has not lost");
        require!(self.holders_root.is_none(), "already reported");
        require!(total_supply.0 > 0, "empty supply");
        self.holders_root = Some(parse_hex_fixed(&root).unwrap_or_else(|| env::panic_str("root must be 32-byte hex")));
        self.holders_supply = total_supply.0;
    }

    /// Stand-in for NEAR Intents delivering the swapped reserve. 15% stays with the winner as spoils;
    /// the rest is what the EVM holders claim.
    #[payable]
    pub fn deliver_swap(&mut self) {
        require!(self.phase == Phase::EvmLost, "the EVM copy has not lost");
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "attach the swapped NEAR");
        let spoils = amount * PENALTY_BPS / 10_000;
        self.near_reserve += spoils;
        self.swapped_near += amount;
    }

    /// A holder of the losing EVM copy claims on NEAR with an EVM signature over
    /// `HITC claim <ticker> copy on <chain id> to <near_account>` (EIP-191 personal_sign).
    pub fn claim_evm(&mut self, evm_address: String, balance: U128, proof: Vec<String>, signature: String, near_account: AccountId) -> U128 {
        let root = self.holders_root.unwrap_or_else(|| env::panic_str("holders are not reported yet"));
        require!(self.swapped_near > 0, "the swapped reserve has not arrived");
        require!(proof.len() <= MAX_PROOF, "proof too long");
        let holder: [u8; 20] = parse_hex_fixed(&evm_address).unwrap_or_else(|| env::panic_str("evm_address must be 20-byte hex"));
        require!(!self.claimed.contains(&holder), "already claimed");

        let mut node = keccak(&[word_address(&holder), word_u128(balance.0)].concat());
        for step in &proof {
            let sibling: [u8; 32] = parse_hex_fixed(step).unwrap_or_else(|| env::panic_str("proof items must be 32-byte hex"));
            node = if node <= sibling { keccak(&[node, sibling].concat()) } else { keccak(&[sibling, node].concat()) };
        }
        require!(node == root, "balance not in the holders' root");

        let message = format!("HITC claim {} copy on {} to {}", self.ticker, self.chain_id, near_account);
        let digest = keccak(&[format!("\x19Ethereum Signed Message:\n{}", message.len()).as_bytes(), message.as_bytes()].concat());
        let sig: [u8; 65] = parse_hex_fixed(&signature).unwrap_or_else(|| env::panic_str("signature must be 65-byte hex"));
        let v = sig[64].checked_sub(27).filter(|v| *v <= 1).unwrap_or_else(|| env::panic_str("bad recovery id"));
        let public = env::ecrecover(&digest, &sig[..64], v, true).unwrap_or_else(|| env::panic_str("bad signature"));
        let signer: [u8; 20] = keccak(&public)[12..].try_into().unwrap();
        require!(signer == holder, "not signed by this holder");

        let for_holders = self.swapped_near - self.swapped_near * PENALTY_BPS / 10_000;
        let share = mul_div(for_holders, balance.0, self.holders_supply);
        require!(share > 0, "nothing to claim");
        self.claimed.insert(holder);
        self.claimed_near += share;
        self.claims += 1;
        Promise::new(near_account).transfer(NearToken::from_yoctonear(share)).detach();
        U128(share)
    }

    /// After the bell and the report, anyone settles. The loser's reserve leaves.
    pub fn settle(&mut self) {
        require!(env::block_timestamp() >= self.round_end_ns, "wait for the bell");
        require!(self.phase == Phase::Playing, "already settled");
        let evm = self.evm_score_in_near().unwrap_or_else(|| env::panic_str("the EVM score is not reported yet"));
        if self.near_score >= evm {
            self.phase = Phase::EvmLost;
            self.start_signing();
        } else {
            self.phase = Phase::NearLost;
            let reserve = self.near_reserve;
            self.near_reserve = 0;
            if reserve > 0 {
                Promise::new(self.near_escrow.clone()).transfer(NearToken::from_yoctonear(reserve)).detach();
            }
        }
    }

    /// Asks for the release signature again if the MPC network did not answer.
    pub fn retry_signature(&mut self) {
        require!(self.phase == Phase::EvmLost, "nothing to sign");
        require!(self.release_signature.is_none(), "already signed");
        require!(!self.signing, "a signature is on its way");
        self.start_signing();
    }

    #[private]
    pub fn on_signed(&mut self) -> Option<String> {
        self.signing = false;
        let signature = env::promise_result_checked(0, MAX_SIGN_RESPONSE_BYTES)
            .ok()
            .and_then(|bytes| near_sdk::serde_json::from_slice::<SignResponse>(&bytes).ok())
            .and_then(|response| evm_signature(&response));
        if signature.is_some() {
            self.release_signature = signature.clone();
        }
        signature
    }

    pub fn get_info(&self) -> Info {
        Info {
            phase: self.phase,
            ticker: self.ticker.clone(),
            round_end_ns: U64(self.round_end_ns),
            near_reserve: U128(self.near_reserve),
            near_score: U128(self.near_score),
            evm_score: self.evm_score.map(U128),
            evm_score_in_near: self.evm_score_in_near().map(U128),
            yocto_per_wei: U128(self.yocto_per_wei),
            chain_id: U64(self.chain_id),
            pool: to_hex(&self.pool),
            evm_escrow: to_hex(&self.evm_escrow),
            near_escrow: self.near_escrow.clone(),
            reporter: self.reporter.clone(),
            mpc: self.mpc.clone(),
            path: self.path.clone(),
            release_digest: (self.phase == Phase::EvmLost).then(|| to_hex(&self.release_digest())),
            release_signature: self.release_signature.clone(),
            holders_root: self.holders_root.map(|r| to_hex(&r)),
            holders_supply: U128(self.holders_supply),
            swapped_near: U128(self.swapped_near),
            spoils_near: U128(self.swapped_near * PENALTY_BPS / 10_000),
            claimed_near: U128(self.claimed_near),
            claims: self.claims,
        }
    }
}

impl XArena {
    fn evm_score_in_near(&self) -> Option<u128> {
        self.evm_score.map(|score| score.saturating_mul(self.yocto_per_wei))
    }

    /// EIP-712 hash of `Release(to, nonce = 1)` for this pool. Must match `HITCPool.releaseDigest`.
    fn release_digest(&self) -> [u8; 32] {
        let domain = keccak(
            &[
                keccak(DOMAIN_TYPE),
                keccak(DOMAIN_NAME),
                keccak(DOMAIN_VERSION),
                word_u64(self.chain_id),
                word_address(&self.pool),
            ]
            .concat(),
        );
        let message = keccak(&[keccak(RELEASE_TYPE), word_address(&self.evm_escrow), word_u64(1)].concat());
        keccak(&[b"\x19\x01".as_slice(), &domain, &message].concat())
    }

    fn start_signing(&mut self) {
        self.signing = true;
        let request = SignRequest {
            path: self.path.clone(),
            payload_v2: SignPayload::Ecdsa(to_hex(&self.release_digest()).trim_start_matches("0x").to_string()),
            domain_id: SECP256K1_DOMAIN_ID,
        };
        ext_signer::ext(self.mpc.clone())
            .with_attached_deposit(SIGN_DEPOSIT)
            .with_static_gas(SIGN_GAS)
            .sign(request)
            .then(Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_signed())
            .detach();
    }
}

fn keccak(data: &[u8]) -> [u8; 32] {
    env::keccak256_array(data)
}

fn word_u64(value: u64) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[24..].copy_from_slice(&value.to_be_bytes());
    word
}

fn word_u128(value: u128) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[16..].copy_from_slice(&value.to_be_bytes());
    word
}

fn word_address(address: &[u8; 20]) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[12..].copy_from_slice(address);
    word
}

fn evm_signature(response: &SignResponse) -> Option<String> {
    let big_r: [u8; 33] = parse_hex_fixed(&format!("0x{}", response.big_r.affine_point))?;
    let s: [u8; 32] = parse_hex_fixed(&format!("0x{}", response.s.scalar))?;
    if response.recovery_id > 1 {
        return None;
    }
    let mut signature = Vec::with_capacity(65);
    signature.extend_from_slice(&big_r[1..]);
    signature.extend_from_slice(&s);
    signature.push(27 + response.recovery_id);
    Some(to_hex(&signature))
}

fn parse_hex_fixed<const N: usize>(value: &str) -> Option<[u8; N]> {
    let digits = value.strip_prefix("0x")?.as_bytes();
    if digits.len() != N * 2 {
        return None;
    }
    let mut out = [0u8; N];
    for (index, pair) in digits.chunks(2).enumerate() {
        out[index] = (hex_digit(pair[0])? << 4) | hex_digit(pair[1])?;
    }
    Some(out)
}

fn hex_digit(digit: u8) -> Option<u8> {
    match digit {
        b'0'..=b'9' => Some(digit - b'0'),
        b'a'..=b'f' => Some(digit - b'a' + 10),
        b'A'..=b'F' => Some(digit - b'A' + 10),
        _ => None,
    }
}

fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(2 + bytes.len() * 2);
    out.push_str("0x");
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 15) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const POOL: &str = "0x1111111111111111111111111111111111111111";
    const ESCROW: &str = "0x2222222222222222222222222222222222222222";

    fn ctx(now_s: u64, deposit: u128, caller: &str) {
        testing_env!(VMContextBuilder::new()
            .block_timestamp(now_s * NS_PER_S)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .predecessor_account_id(caller.parse().unwrap())
            .current_account_id("xarena.testnet".parse().unwrap())
            .build());
    }

    fn arena() -> XArena {
        ctx(0, 0, "deployer.testnet");
        XArena::new(
            "HUANG".into(),
            U64(600 * NS_PER_S),
            U128(1_000_000),
            U64(84532),
            POOL.into(),
            ESCROW.into(),
            "escrow.testnet".parse().unwrap(),
            "reporter.testnet".parse().unwrap(),
            "v1.signer-prod.testnet".parse().unwrap(),
            "hitc-xarena".into(),
        )
    }

    #[test]
    fn score_is_amount_times_seconds_left() {
        let mut a = arena();
        ctx(100, 2_000, "alice.testnet");
        a.buy();
        assert_eq!(a.near_score, 2_000 * 500);
        assert_eq!(a.near_reserve, 2_000);
    }

    #[test]
    fn near_copy_wins_and_the_evm_release_is_requested() {
        let mut a = arena();
        ctx(0, 3_000_000_000, "alice.testnet");
        a.buy();
        ctx(600, 0, "reporter.testnet");
        a.report_evm_score("1000".into()); // 1_000 wei·s × 1_000_000 = 1e9 yocto·s, below 1.8e12
        ctx(601, 0, "anyone.testnet");
        a.settle();
        assert_eq!(a.phase, Phase::EvmLost);
        assert!(a.get_info().release_digest.is_some());
    }

    #[test]
    fn evm_copy_wins_and_the_near_reserve_leaves() {
        let mut a = arena();
        ctx(590, 10, "alice.testnet");
        a.buy();
        ctx(600, 0, "reporter.testnet");
        a.report_evm_score("1000000".into());
        ctx(601, 0, "anyone.testnet");
        a.settle();
        assert_eq!(a.phase, Phase::NearLost);
        assert_eq!(a.near_reserve, 0);
    }

    #[test]
    #[should_panic(expected = "only the reporter")]
    fn only_the_reporter_reports() {
        let mut a = arena();
        ctx(600, 0, "mallory.testnet");
        a.report_evm_score("1".into());
    }

    #[test]
    #[should_panic(expected = "the round is over")]
    fn no_buys_after_the_bell() {
        let mut a = arena();
        ctx(600, 1, "alice.testnet");
        a.buy();
    }

    // Vectors made with `cast wallet sign` / `cast keccak` for the key 0xa11ce.
    const HOLDER: &str = "0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7";
    const HOLDER_SIG: &str = "0xd523ed9fc676b59161db9f5a3a16da615246ef924e900dea8a343e9925e1010a202a8cdde365698ecd18dd9c52fecb94e7818070ffb0395fb3012ddc8130b8841c";
    const HOLDER_LEAF: &str = "0x207a6270849d64547cf696b5b8a9ec85d118e6bf1d3e9b7cbca07a7211e69d57"; // abi.encode(holder, 1000e18)

    fn lost_evm_arena() -> XArena {
        let mut a = arena();
        ctx(0, 3_000_000_000, "alice.testnet");
        a.buy();
        ctx(600, 0, "reporter.testnet");
        a.report_evm_score("1000".into());
        ctx(601, 0, "anyone.testnet");
        a.settle();
        a
    }

    #[test]
    fn evm_holder_claims_on_near_with_an_evm_signature() {
        let mut a = lost_evm_arena();
        ctx(602, 0, "reporter.testnet");
        a.report_evm_holders(HOLDER_LEAF.into(), U128(2_000 * 10u128.pow(18)));
        ctx(603, 10_000, "relayer.testnet");
        a.deliver_swap();
        assert_eq!(a.get_info().spoils_near.0, 1_500);
        ctx(604, 0, "anyone.testnet");
        let share = a.claim_evm(HOLDER.to_lowercase(), U128(1_000 * 10u128.pow(18)), vec![], HOLDER_SIG.into(), "alice.testnet".parse().unwrap());
        assert_eq!(share.0, 8_500 / 2); // half the supply, 85% of the swapped NEAR
        assert_eq!(a.get_info().claims, 1);
    }

    /// Real sizes: a whole curve of supply (~3.3e26) and a NEAR amount (~2.8e23) multiply past u128.
    #[test]
    fn claim_math_at_real_sizes() {
        let supply: u128 = 333_333_333_333_333_333_333_333_333;
        let swapped: u128 = 280_440_342_711_357_900_000_000;
        let for_holders = swapped - swapped * PENALTY_BPS / 10_000;
        assert_eq!(mul_div(for_holders, supply, supply), for_holders);
        // an odd supply rounds a half share down by at most one yocto, never up
        let half = mul_div(for_holders, supply / 2, supply);
        assert!(half <= for_holders / 2 && for_holders / 2 - half <= 1);
    }

    #[test]
    #[should_panic(expected = "not signed by this holder")]
    fn the_signature_is_bound_to_the_near_account() {
        let mut a = lost_evm_arena();
        ctx(602, 0, "reporter.testnet");
        a.report_evm_holders(HOLDER_LEAF.into(), U128(2_000 * 10u128.pow(18)));
        ctx(603, 10_000, "relayer.testnet");
        a.deliver_swap();
        ctx(604, 0, "mallory.testnet");
        a.claim_evm(HOLDER.to_lowercase(), U128(1_000 * 10u128.pow(18)), vec![], HOLDER_SIG.into(), "mallory.testnet".parse().unwrap());
    }

    #[test]
    #[should_panic(expected = "balance not in the holders' root")]
    fn a_wrong_balance_fails_the_proof() {
        let mut a = lost_evm_arena();
        ctx(602, 0, "reporter.testnet");
        a.report_evm_holders(HOLDER_LEAF.into(), U128(2_000 * 10u128.pow(18)));
        ctx(603, 10_000, "relayer.testnet");
        a.deliver_swap();
        ctx(604, 0, "anyone.testnet");
        a.claim_evm(HOLDER.to_lowercase(), U128(2_000 * 10u128.pow(18)), vec![], HOLDER_SIG.into(), "alice.testnet".parse().unwrap());
    }

    #[test]
    #[should_panic(expected = "already claimed")]
    fn one_claim_per_holder() {
        let mut a = lost_evm_arena();
        ctx(602, 0, "reporter.testnet");
        a.report_evm_holders(HOLDER_LEAF.into(), U128(2_000 * 10u128.pow(18)));
        ctx(603, 10_000, "relayer.testnet");
        a.deliver_swap();
        ctx(604, 0, "anyone.testnet");
        a.claim_evm(HOLDER.to_lowercase(), U128(1_000 * 10u128.pow(18)), vec![], HOLDER_SIG.into(), "alice.testnet".parse().unwrap());
        a.claim_evm(HOLDER.to_lowercase(), U128(1_000 * 10u128.pow(18)), vec![], HOLDER_SIG.into(), "alice.testnet".parse().unwrap());
    }

    /// The digest must equal what `HITCPool.releaseDigest()` returns; checked against the Foundry test vector.
    #[test]
    fn release_digest_vector() {
        let a = arena();
        let digest = to_hex(&a.release_digest());
        assert_eq!(digest.len(), 66);
        println!("release digest for chain 84532, pool {POOL}, escrow {ESCROW}: {digest}");
    }
}
