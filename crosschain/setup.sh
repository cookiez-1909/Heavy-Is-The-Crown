#!/usr/bin/env bash
# One-time setup for the cross-chain spike: test USDC on NEAR testnet and on Base Sepolia.
# Writes their addresses to crosschain/stable.env, which run.sh reads.
#
#   EVM_KEY=<base sepolia key> crosschain/setup.sh
set -euo pipefail
cd "$(dirname "$0")"
: "${EVM_KEY:?set EVM_KEY}"
NEAR_SIGNER=${NEAR_SIGNER:-memeduel-4a2d2e.testnet}
BASE_RPC=${BASE_RPC:-https://sepolia.base.org}

(cd tusdc && cargo near build non-reproducible-wasm --no-abi >/dev/null 2>&1)
TUSDC="tusdc-$(date +%s | tail -c 6).$NEAR_SIGNER"
near account create-account fund-myself "$TUSDC" '2 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
  sign-as "$NEAR_SIGNER" network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "successfully created|Error" | head -1
near contract deploy "$TUSDC" use-file tusdc/target/near/tusdc.wasm with-init-call new json-args '{}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "successfully deployed|Error" | head -1

MUSDC=$( (cd evm && forge create src/MockUSDC.sol:MockUSDC --rpc-url "$BASE_RPC" --private-key "$EVM_KEY" --broadcast) | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | awk '{print $3}')
printf 'TUSDC=%s\nMUSDC=%s\n' "$TUSDC" "$MUSDC" > stable.env
cat stable.env
