//! Cross-chain match, spike. One copy of a ticker lives on NEAR (a pool inside this contract), the
//! other on an EVM chain (`HITCPool`). Both are priced in the same stablecoin (test USDC on both
//! testnets), so their scores compare directly and no price oracle is needed. Both score the same way:
//! every unit of net inflow adds `amount × seconds left in the round`.
//!
//! The account that runs this contract has no access keys once deployed, so the EVM address that NEAR
//! Chain Signatures derives from it (account + path) signs only what the code below asks for.
//!
//! At the bell the contract compares the scores:
//! * **The EVM copy lost.** The contract asks the MPC network to sign EIP-712 `Release(to, nonce)`;
//!   anyone relays it and the pool's whole reserve leaves. Swapped into the stablecoin on NEAR, it
//!   arrives back here (`msg = "swap"`): 15% stays with the winner as spoils, and holders of the EVM copy
//!   claim the rest pro rata with an EVM signature and a Merkle proof of their balance at the bell.
//! * **The NEAR copy lost.** Its reserve leaves towards the winner, and the contract signs `Won(nonce)`
//!   for the pool, then one `Grant(to, num, den, nonce)` per holder of the NEAR copy, who receives
//!   num/den of the winner tokens the pool bought with the absorbed reserve. This direction needs no
//!   reporter: NEAR is where the holders' balances live.
//!
//! Trust left in the spike: the EVM score and the EVM holders' root reach NEAR through reporters, and a
//! value counts once `threshold` of them report the same one. The cross-chain move of the reserve
//! (escrow address / escrow account) stands in for a NEAR Intents swap; Intents is only quoted.

use near_sdk::json_types::{U128, U64};
use near_sdk::store::LookupMap;
use near_sdk::{env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue};

const SECP256K1_DOMAIN_ID: u64 = 0;
const SIGN_GAS: Gas = Gas::from_tgas(50);
const CALLBACK_GAS: Gas = Gas::from_tgas(10);
const FT_GAS: Gas = Gas::from_tgas(15);
const SIGN_DEPOSIT: NearToken = NearToken::from_yoctonear(1);
const MAX_SIGN_RESPONSE_BYTES: usize = 1024;
const NS_PER_S: u64 = 1_000_000_000;
const PENALTY_BPS: u128 = 1_500;
const MAX_PROOF: usize = 32;
const MAX_REPORTERS: usize = 9;

const DOMAIN_TYPE: &[u8] = b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
const DOMAIN_NAME: &[u8] = b"HITCPool";
const DOMAIN_VERSION: &[u8] = b"1";
const RELEASE_TYPE: &[u8] = b"Release(address to,uint256 nonce)";
const WON_TYPE: &[u8] = b"Won(uint256 nonce)";
const GRANT_TYPE: &[u8] = b"Grant(address to,uint256 num,uint256 den,uint256 nonce)";

uint::construct_uint! {
    pub struct U256(4);
}

fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    (U256::from(a) * U256::from(b) / U256::from(c)).as_u128()
}

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Holdings,
    ClaimedEvm,
    Grants,
}

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

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Phase {
    Playing,
    EvmLost,
    NearLost,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Vote {
    pub kind: String,
    pub value: String,
    pub voters: Vec<AccountId>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Grant {
    pub evm_address: String,
    pub num: U128,
    pub den: U128,
    pub nonce: U64,
    pub digest: String,
    pub signature: Option<String>,
}

#[near(serializers = [json])]
pub struct Info {
    pub phase: Phase,
    pub ticker: String,
    pub round_end_ns: U64,
    pub stable: AccountId,
    pub near_reserve: U128,
    pub near_score: U128,
    pub near_holders: u32,
    pub near_holdings: U128,
    pub evm_score: Option<String>,
    pub evm_score_in_near_units: Option<String>,
    pub chain_id: U64,
    pub pool: String,
    pub evm_escrow: String,
    pub near_escrow: AccountId,
    pub reporters: Vec<AccountId>,
    pub threshold: u8,
    pub votes: Vec<Vote>,
    pub mpc: AccountId,
    pub path: String,
    pub verdict_digest: Option<String>,
    pub verdict_signature: Option<String>,
    pub holders_root: Option<String>,
    pub holders_supply: U128,
    pub swapped: U128,
    pub spoils: U128,
    pub claimed: U128,
    pub claims: u32,
    pub grants: u32,
    pub grants_signed: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct XArena {
    ticker: String,
    round_end_ns: u64,
    stable: AccountId,
    /// 10^(NEAR stable decimals − EVM stable decimals); 1 when both are 6-decimal USDC.
    unit_scale: u128,
    chain_id: u64,
    pool: [u8; 20],
    evm_escrow: [u8; 20],
    near_escrow: AccountId,
    reporters: Vec<AccountId>,
    threshold: u8,
    votes: Vec<Vote>,
    mpc: AccountId,
    path: String,
    phase: Phase,
    near_reserve: u128,
    near_score: u128,
    holdings: LookupMap<AccountId, u128>,
    near_holders: u32,
    near_holdings: u128,
    evm_score: Option<i128>,
    signing: bool,
    verdict_signature: Option<String>,
    holders_root: Option<[u8; 32]>,
    holders_supply: u128,
    swapped: u128,
    claimed: u128,
    claims: u32,
    claimed_evm: LookupMap<[u8; 20], bool>,
    grants: LookupMap<AccountId, Grant>,
    grant_count: u32,
    grants_signed: u32,
}

#[near]
impl XArena {
    #[init]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        ticker: String,
        round_end_ns: U64,
        stable: AccountId,
        unit_scale: U128,
        chain_id: U64,
        pool: String,
        evm_escrow: String,
        near_escrow: AccountId,
        reporters: Vec<AccountId>,
        threshold: u8,
        mpc: AccountId,
        path: String,
    ) -> Self {
        require!(round_end_ns.0 > env::block_timestamp(), "the round must end in the future");
        require!(unit_scale.0 > 0, "unit_scale must be positive");
        require!(!reporters.is_empty() && reporters.len() <= MAX_REPORTERS, "1 to 9 reporters");
        require!(threshold >= 1 && threshold as usize <= reporters.len(), "threshold must be 1..=reporters");
        Self {
            ticker,
            round_end_ns: round_end_ns.0,
            stable,
            unit_scale: unit_scale.0,
            chain_id: chain_id.0,
            pool: parse_hex_fixed(&pool).unwrap_or_else(|| env::panic_str("pool must be a 20-byte hex address")),
            evm_escrow: parse_hex_fixed(&evm_escrow).unwrap_or_else(|| env::panic_str("evm_escrow must be a 20-byte hex address")),
            near_escrow,
            reporters,
            threshold,
            votes: Vec::new(),
            mpc,
            path,
            phase: Phase::Playing,
            near_reserve: 0,
            near_score: 0,
            holdings: LookupMap::new(StorageKey::Holdings),
            near_holders: 0,
            near_holdings: 0,
            evm_score: None,
            signing: false,
            verdict_signature: None,
            holders_root: None,
            holders_supply: 0,
            swapped: 0,
            claimed: 0,
            claims: 0,
            claimed_evm: LookupMap::new(StorageKey::ClaimedEvm),
            grants: LookupMap::new(StorageKey::Grants),
            grant_count: 0,
            grants_signed: 0,
        }
    }

    /// NEP-141 entry point for the stablecoin. `msg = "buy"` buys the NEAR copy during the round;
    /// `msg = "swap"` is the EVM loser's reserve arriving (stand-in for a NEAR Intents delivery).
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.stable, "only the stablecoin");
        let amount = amount.0;
        match msg.as_str() {
            "buy" => {
                let now = env::block_timestamp();
                require!(now < self.round_end_ns, "the round is over");
                let seconds_left = ((self.round_end_ns - now) / NS_PER_S) as u128;
                self.near_reserve += amount;
                self.near_score += amount * seconds_left;
                let before = self.holdings.get(&sender_id).copied().unwrap_or(0);
                if before == 0 {
                    self.near_holders += 1;
                }
                self.holdings.insert(sender_id, before + amount);
                self.near_holdings += amount;
            }
            "swap" => {
                require!(self.phase == Phase::EvmLost, "the EVM copy has not lost");
                self.near_reserve += amount * PENALTY_BPS / 10_000;
                self.swapped += amount;
            }
            _ => env::panic_str("msg must be \"buy\" or \"swap\""),
        }
        PromiseOrValue::Value(U128(0))
    }

    /// A reporter reports what it read on the EVM chain. A value counts once `threshold` reporters agree.
    /// `kind = "score"`: `HITCPool.score()` after the bell (signed integer).
    /// `kind = "holders"`: `"<merkle root>:<total supply>"` of the EVM copy at the bell, after it lost.
    pub fn report(&mut self, kind: String, value: String) -> bool {
        let me = env::predecessor_account_id();
        require!(self.reporters.contains(&me), "only a reporter");
        require!(env::block_timestamp() >= self.round_end_ns, "wait for the bell");
        match kind.as_str() {
            "score" => require!(self.phase == Phase::Playing && self.evm_score.is_none(), "the score is settled"),
            "holders" => require!(self.phase == Phase::EvmLost && self.holders_root.is_none(), "holders are settled or not needed"),
            _ => env::panic_str("kind must be score or holders"),
        }
        require!(!self.votes.iter().any(|v| v.kind == kind && v.voters.contains(&me)), "already reported");
        let index = match self.votes.iter().position(|v| v.kind == kind && v.value == value) {
            Some(i) => i,
            None => {
                self.votes.push(Vote { kind: kind.clone(), value: value.clone(), voters: Vec::new() });
                self.votes.len() - 1
            }
        };
        self.votes[index].voters.push(me);
        if self.votes[index].voters.len() < self.threshold as usize {
            return false;
        }
        if kind == "score" {
            self.evm_score = Some(value.parse().unwrap_or_else(|_| env::panic_str("score must be an integer")));
        } else {
            let (root, supply) = value.split_once(':').unwrap_or_else(|| env::panic_str("holders must be root:supply"));
            self.holders_root = Some(parse_hex_fixed(root).unwrap_or_else(|| env::panic_str("root must be 32-byte hex")));
            self.holders_supply = supply.parse().unwrap_or_else(|_| env::panic_str("supply must be an integer"));
            require!(self.holders_supply > 0, "empty supply");
        }
        true
    }

    /// After the bell and an agreed EVM score, anyone settles.
    pub fn settle(&mut self) {
        require!(env::block_timestamp() >= self.round_end_ns, "wait for the bell");
        require!(self.phase == Phase::Playing, "already settled");
        let evm = self.evm_score.unwrap_or_else(|| env::panic_str("the EVM score is not agreed yet"));
        let evm_in_near = evm.saturating_mul(self.unit_scale as i128);
        if (self.near_score as i128) >= evm_in_near {
            self.phase = Phase::EvmLost;
        } else {
            self.phase = Phase::NearLost;
            let reserve = self.near_reserve;
            self.near_reserve = 0;
            if reserve > 0 {
                ext_ft::ext(self.stable.clone())
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(FT_GAS)
                    .ft_transfer(self.near_escrow.clone(), U128(reserve), Some("HITC: losing reserve, towards the winner".into()))
                    .detach();
            }
        }
        self.sign_verdict();
    }

    /// Asks for the verdict signature again if the MPC network did not answer.
    pub fn retry_verdict(&mut self) {
        require!(self.phase != Phase::Playing, "not settled");
        require!(self.verdict_signature.is_none() && !self.signing, "already signed or on its way");
        self.sign_verdict();
    }

    #[private]
    pub fn on_verdict_signed(&mut self) -> Option<String> {
        self.signing = false;
        let signature = read_signature();
        if signature.is_some() {
            self.verdict_signature = signature.clone();
        }
        signature
    }

    /// EVM copy lost: a holder claims with an EVM signature over
    /// `HITC claim <ticker> copy on <chain id> to <near_account>` (EIP-191) and a Merkle proof.
    pub fn claim_evm(&mut self, evm_address: String, balance: U128, proof: Vec<String>, signature: String, near_account: AccountId) -> U128 {
        require!(self.phase == Phase::EvmLost, "the EVM copy has not lost");
        let root = self.holders_root.unwrap_or_else(|| env::panic_str("holders are not agreed yet"));
        require!(self.swapped > 0, "the swapped reserve has not arrived");
        require!(proof.len() <= MAX_PROOF, "proof too long");
        let holder: [u8; 20] = parse_hex_fixed(&evm_address).unwrap_or_else(|| env::panic_str("evm_address must be 20-byte hex"));
        require!(!self.claimed_evm.contains_key(&holder), "already claimed");

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

        let for_holders = self.swapped - self.swapped * PENALTY_BPS / 10_000;
        let share = mul_div(for_holders, balance.0, self.holders_supply);
        require!(share > 0, "nothing to claim");
        self.claimed_evm.insert(holder, true);
        self.claimed += share;
        self.claims += 1;
        ext_ft::ext(self.stable.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(FT_GAS)
            .ft_transfer(near_account, U128(share), Some("HITC: claim of a losing EVM copy".into()))
            .then(Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_claim_paid(to_hex(&holder), U128(share)))
            .detach();
        U128(share)
    }

    /// If the transfer failed (say the receiver is not registered with the stablecoin), the claim is
    /// undone so the holder can try again.
    #[private]
    pub fn on_claim_paid(&mut self, evm_address: String, share: U128, #[callback_result] paid: Result<(), PromiseError>) -> bool {
        if paid.is_ok() {
            return true;
        }
        let holder: [u8; 20] = parse_hex_fixed(&evm_address).unwrap();
        self.claimed_evm.remove(&holder);
        self.claimed -= share.0;
        self.claims -= 1;
        false
    }

    /// NEAR copy lost: a holder asks for a `Grant` of winner tokens on the EVM chain, to an address of
    /// their choosing. No reporter is involved: their holding is recorded here.
    pub fn claim_on_evm(&mut self, evm_address: String) -> U64 {
        require!(self.phase == Phase::NearLost, "the NEAR copy has not lost");
        require!(self.verdict_signature.is_some(), "the verdict is not signed yet");
        let account = env::predecessor_account_id();
        require!(self.grants.get(&account).is_none(), "already granted");
        let held = self.holdings.get(&account).copied().unwrap_or(0);
        require!(held > 0, "no holding in the NEAR copy");
        let to: [u8; 20] = parse_hex_fixed(&evm_address).unwrap_or_else(|| env::panic_str("evm_address must be 20-byte hex"));
        self.grant_count += 1;
        let nonce = self.grant_count as u64;
        let digest = self.grant_digest(&to, held, self.near_holdings, nonce);
        self.grants.insert(
            account.clone(),
            Grant { evm_address: to_hex(&to), num: U128(held), den: U128(self.near_holdings), nonce: U64(nonce), digest: to_hex(&digest), signature: None },
        );
        self.request_signature(digest, Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_grant_signed(account));
        U64(nonce)
    }

    pub fn retry_grant(&mut self) {
        let account = env::predecessor_account_id();
        let grant = self.grants.get(&account).cloned().unwrap_or_else(|| env::panic_str("no grant"));
        require!(grant.signature.is_none(), "already signed");
        let digest: [u8; 32] = parse_hex_fixed(&grant.digest).unwrap();
        self.request_signature(digest, Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_grant_signed(account));
    }

    #[private]
    pub fn on_grant_signed(&mut self, account: AccountId) -> Option<String> {
        let signature = read_signature();
        if let Some(sig) = &signature {
            if let Some(grant) = self.grants.get_mut(&account) {
                if grant.signature.is_none() {
                    grant.signature = Some(sig.clone());
                    self.grants_signed += 1;
                }
            }
        }
        signature
    }

    pub fn get_grant(&self, account_id: AccountId) -> Option<Grant> {
        self.grants.get(&account_id).cloned()
    }

    pub fn get_holding(&self, account_id: AccountId) -> U128 {
        U128(self.holdings.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_info(&self) -> Info {
        Info {
            phase: self.phase,
            ticker: self.ticker.clone(),
            round_end_ns: U64(self.round_end_ns),
            stable: self.stable.clone(),
            near_reserve: U128(self.near_reserve),
            near_score: U128(self.near_score),
            near_holders: self.near_holders,
            near_holdings: U128(self.near_holdings),
            evm_score: self.evm_score.map(|s| s.to_string()),
            evm_score_in_near_units: self.evm_score.map(|s| s.saturating_mul(self.unit_scale as i128).to_string()),
            chain_id: U64(self.chain_id),
            pool: to_hex(&self.pool),
            evm_escrow: to_hex(&self.evm_escrow),
            near_escrow: self.near_escrow.clone(),
            reporters: self.reporters.clone(),
            threshold: self.threshold,
            votes: self.votes.clone(),
            mpc: self.mpc.clone(),
            path: self.path.clone(),
            verdict_digest: self.verdict_digest().map(|d| to_hex(&d)),
            verdict_signature: self.verdict_signature.clone(),
            holders_root: self.holders_root.map(|r| to_hex(&r)),
            holders_supply: U128(self.holders_supply),
            swapped: U128(self.swapped),
            spoils: U128(self.swapped * PENALTY_BPS / 10_000),
            claimed: U128(self.claimed),
            claims: self.claims,
            grants: self.grant_count,
            grants_signed: self.grants_signed,
        }
    }
}

impl XArena {
    fn domain(&self) -> [u8; 32] {
        keccak(&[keccak(DOMAIN_TYPE), keccak(DOMAIN_NAME), keccak(DOMAIN_VERSION), word_u64(self.chain_id), word_address(&self.pool)].concat())
    }

    fn typed(&self, message: [u8; 32]) -> [u8; 32] {
        keccak(&[b"\x19\x01".as_slice(), &self.domain(), &message].concat())
    }

    /// `Release(to = evm_escrow, nonce = 1)` when the EVM copy lost, `Won(nonce = 1)` when it won.
    fn verdict_digest(&self) -> Option<[u8; 32]> {
        match self.phase {
            Phase::Playing => None,
            Phase::EvmLost => Some(self.typed(keccak(&[keccak(RELEASE_TYPE), word_address(&self.evm_escrow), word_u64(1)].concat()))),
            Phase::NearLost => Some(self.typed(keccak(&[keccak(WON_TYPE), word_u64(1)].concat()))),
        }
    }

    fn grant_digest(&self, to: &[u8; 20], num: u128, den: u128, nonce: u64) -> [u8; 32] {
        self.typed(keccak(&[keccak(GRANT_TYPE), word_address(to), word_u128(num), word_u128(den), word_u64(nonce)].concat()))
    }

    fn sign_verdict(&mut self) {
        self.signing = true;
        let digest = self.verdict_digest().unwrap();
        self.request_signature(digest, Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_verdict_signed());
    }

    fn request_signature(&self, digest: [u8; 32], callback: Promise) {
        let request = SignRequest {
            path: self.path.clone(),
            payload_v2: SignPayload::Ecdsa(to_hex(&digest).trim_start_matches("0x").to_string()),
            domain_id: SECP256K1_DOMAIN_ID,
        };
        ext_signer::ext(self.mpc.clone())
            .with_attached_deposit(SIGN_DEPOSIT)
            .with_static_gas(SIGN_GAS)
            .sign(request)
            .then(callback)
            .detach();
    }
}

fn read_signature() -> Option<String> {
    env::promise_result_checked(0, MAX_SIGN_RESPONSE_BYTES)
        .ok()
        .and_then(|bytes| near_sdk::serde_json::from_slice::<SignResponse>(&bytes).ok())
        .and_then(|response| evm_signature(&response))
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
    const STABLE: &str = "tusdc.testnet";
    // Vectors made with `cast wallet sign` / `cast keccak` for the key 0xa11ce.
    const HOLDER: &str = "0xe05fcc23807536bee418f142d19fa0d21bb0cff7";
    const HOLDER_SIG: &str = "0xd523ed9fc676b59161db9f5a3a16da615246ef924e900dea8a343e9925e1010a202a8cdde365698ecd18dd9c52fecb94e7818070ffb0395fb3012ddc8130b8841c";
    const HOLDER_LEAF: &str = "0x207a6270849d64547cf696b5b8a9ec85d118e6bf1d3e9b7cbca07a7211e69d57"; // abi.encode(holder, 1000e18)

    fn ctx(now_s: u64, caller: &str) {
        testing_env!(VMContextBuilder::new()
            .block_timestamp(now_s * NS_PER_S)
            .predecessor_account_id(caller.parse().unwrap())
            .current_account_id("xarena.testnet".parse().unwrap())
            .build());
    }

    fn arena() -> XArena {
        ctx(0, "deployer.testnet");
        XArena::new(
            "HUANG".into(),
            U64(600 * NS_PER_S),
            STABLE.parse().unwrap(),
            U128(1),
            U64(84532),
            POOL.into(),
            ESCROW.into(),
            "escrow.testnet".parse().unwrap(),
            vec!["r1.testnet".parse().unwrap(), "r2.testnet".parse().unwrap(), "r3.testnet".parse().unwrap()],
            2,
            "v1.signer-prod.testnet".parse().unwrap(),
            "hitc-xarena".into(),
        )
    }

    fn buy(a: &mut XArena, now: u64, who: &str, amount: u128) {
        ctx(now, STABLE);
        let _ = a.ft_on_transfer(who.parse().unwrap(), U128(amount), "buy".into());
    }

    fn agree_score(a: &mut XArena, score: &str) {
        ctx(600, "r1.testnet");
        assert!(!a.report("score".into(), score.into()));
        ctx(600, "r2.testnet");
        assert!(a.report("score".into(), score.into()));
    }

    fn agree_holders(a: &mut XArena) {
        let value = format!("{HOLDER_LEAF}:{}", 2_000 * 10u128.pow(18));
        ctx(602, "r1.testnet");
        a.report("holders".into(), value.clone());
        ctx(602, "r3.testnet");
        assert!(a.report("holders".into(), value));
    }

    #[test]
    fn near_buys_score_amount_times_seconds_left() {
        let mut a = arena();
        buy(&mut a, 100, "alice.testnet", 2_000_000);
        assert_eq!(a.near_score, 2_000_000 * 500);
        assert_eq!(a.get_holding("alice.testnet".parse().unwrap()).0, 2_000_000);
    }

    #[test]
    #[should_panic(expected = "only the stablecoin")]
    fn only_the_stablecoin_pays_in() {
        let mut a = arena();
        ctx(10, "fake.testnet");
        let _ = a.ft_on_transfer("alice.testnet".parse().unwrap(), U128(1), "buy".into());
    }

    #[test]
    #[should_panic(expected = "the round is over")]
    fn no_buys_after_the_bell() {
        let mut a = arena();
        buy(&mut a, 600, "alice.testnet", 1);
    }

    #[test]
    fn a_score_counts_only_when_threshold_reporters_agree() {
        let mut a = arena();
        ctx(600, "r1.testnet");
        a.report("score".into(), "100".into());
        ctx(600, "r2.testnet");
        assert!(!a.report("score".into(), "999".into())); // disagreement: nothing counts
        assert!(a.evm_score.is_none());
        ctx(600, "r3.testnet");
        assert!(a.report("score".into(), "100".into()));
        assert_eq!(a.evm_score, Some(100));
    }

    #[test]
    #[should_panic(expected = "already reported")]
    fn a_reporter_votes_once() {
        let mut a = arena();
        ctx(600, "r1.testnet");
        a.report("score".into(), "1".into());
        a.report("score".into(), "2".into());
    }

    #[test]
    #[should_panic(expected = "only a reporter")]
    fn strangers_cannot_report() {
        let mut a = arena();
        ctx(600, "mallory.testnet");
        a.report("score".into(), "1".into());
    }

    #[test]
    fn evm_copy_loses_and_its_holder_claims_on_near() {
        let mut a = arena();
        buy(&mut a, 0, "alice.testnet", 3_000_000);
        agree_score(&mut a, "1000");
        ctx(601, "anyone.testnet");
        a.settle();
        assert_eq!(a.phase, Phase::EvmLost);
        agree_holders(&mut a);
        ctx(603, STABLE);
        let _ = a.ft_on_transfer("relayer.testnet".parse().unwrap(), U128(10_000), "swap".into());
        assert_eq!(a.get_info().spoils.0, 1_500);
        ctx(604, "anyone.testnet");
        let share = a.claim_evm(HOLDER.into(), U128(1_000 * 10u128.pow(18)), vec![], HOLDER_SIG.into(), "alice.testnet".parse().unwrap());
        assert_eq!(share.0, 8_500 / 2);
    }

    #[test]
    #[should_panic(expected = "not signed by this holder")]
    fn an_evm_claim_is_bound_to_its_near_account() {
        let mut a = arena();
        buy(&mut a, 0, "alice.testnet", 3_000_000);
        agree_score(&mut a, "1000");
        ctx(601, "anyone.testnet");
        a.settle();
        agree_holders(&mut a);
        ctx(603, STABLE);
        let _ = a.ft_on_transfer("relayer.testnet".parse().unwrap(), U128(10_000), "swap".into());
        ctx(604, "mallory.testnet");
        a.claim_evm(HOLDER.into(), U128(1_000 * 10u128.pow(18)), vec![], HOLDER_SIG.into(), "mallory.testnet".parse().unwrap());
    }

    #[test]
    #[should_panic(expected = "balance not in the holders' root")]
    fn a_wrong_balance_fails_the_proof() {
        let mut a = arena();
        buy(&mut a, 0, "alice.testnet", 3_000_000);
        agree_score(&mut a, "1000");
        ctx(601, "anyone.testnet");
        a.settle();
        agree_holders(&mut a);
        ctx(603, STABLE);
        let _ = a.ft_on_transfer("relayer.testnet".parse().unwrap(), U128(10_000), "swap".into());
        ctx(604, "anyone.testnet");
        a.claim_evm(HOLDER.into(), U128(2_000 * 10u128.pow(18)), vec![], HOLDER_SIG.into(), "alice.testnet".parse().unwrap());
    }

    #[test]
    fn near_copy_loses_and_its_holders_get_grants() {
        let mut a = arena();
        buy(&mut a, 0, "alice.testnet", 3_000_000);
        buy(&mut a, 0, "bob.testnet", 1_000_000);
        agree_score(&mut a, "999999999999");
        ctx(601, "anyone.testnet");
        a.settle();
        assert_eq!(a.phase, Phase::NearLost);
        assert_eq!(a.near_reserve, 0);
        a.verdict_signature = Some("0xsigned".into()); // stands for the MPC callback in a unit test
        ctx(602, "alice.testnet");
        a.claim_on_evm("0x3333333333333333333333333333333333333333".into());
        let g = a.get_grant("alice.testnet".parse().unwrap()).unwrap();
        assert_eq!((g.num.0, g.den.0, g.nonce.0), (3_000_000, 4_000_000, 1));
    }

    #[test]
    #[should_panic(expected = "no holding in the NEAR copy")]
    fn only_near_holders_get_grants() {
        let mut a = arena();
        buy(&mut a, 0, "alice.testnet", 1);
        agree_score(&mut a, "999999999999");
        ctx(601, "anyone.testnet");
        a.settle();
        a.verdict_signature = Some("0xsigned".into());
        ctx(602, "mallory.testnet");
        a.claim_on_evm("0x3333333333333333333333333333333333333333".into());
    }

    #[test]
    #[should_panic(expected = "already granted")]
    fn one_grant_per_holder() {
        let mut a = arena();
        buy(&mut a, 0, "alice.testnet", 1);
        agree_score(&mut a, "999999999999");
        ctx(601, "anyone.testnet");
        a.settle();
        a.verdict_signature = Some("0xsigned".into());
        ctx(602, "alice.testnet");
        a.claim_on_evm("0x3333333333333333333333333333333333333333".into());
        a.claim_on_evm("0x4444444444444444444444444444444444444444".into());
    }

    #[test]
    fn claim_math_at_real_sizes() {
        let supply: u128 = 333_333_333_333_333_333_333_333_333;
        let swapped: u128 = 2_800_000;
        let for_holders = swapped - swapped * PENALTY_BPS / 10_000;
        assert_eq!(mul_div(for_holders, supply, supply), for_holders);
    }

    /// Must equal the digests `HITCPool` computes (crosschain/evm/test, `test_digestsMatchTheNearSide`).
    #[test]
    fn digest_vectors() {
        let mut a = arena();
        a.phase = Phase::EvmLost;
        assert_eq!(to_hex(&a.verdict_digest().unwrap()), "0xb9bcdcb209dd26e4862a7265458b9d666c04403449db22b22b783b778868c096");
        a.phase = Phase::NearLost;
        assert_eq!(to_hex(&a.verdict_digest().unwrap()), "0xaaf18a4a031275a90cf9f275718a64e84bbc781440a328c9f1bf11119743e3db");
        let to = parse_hex_fixed::<20>("0x3333333333333333333333333333333333333333").unwrap();
        assert_eq!(to_hex(&a.grant_digest(&to, 3, 4, 9)), "0xa561e69ae5906ecf2283871cdca5459642cd61796da8098f52e726d84bd6f068");
    }
}
