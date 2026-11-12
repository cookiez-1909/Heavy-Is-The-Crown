//! Helper, not part of the protocol. Publishes the wasm passed as raw input
//! as an immutable global contract (addressed by its code hash). Used by the
//! sandbox tests and by `scripts/deploy.mjs`.
use near_sdk::{env, near, Promise};

#[near(contract_state)]
#[derive(Default)]
pub struct Publisher {}

#[near]
impl Publisher {
    #[payable]
    pub fn publish(&mut self) -> Promise {
        let code = env::input().unwrap_or_else(|| env::panic_str("pass the wasm as input"));
        Promise::new(env::current_account_id()).deploy_global_contract(code)
    }
}
