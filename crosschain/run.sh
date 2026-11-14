#!/usr/bin/env bash
# Plays one cross-chain match on public testnets, priced in test USDC on both sides (no price oracle):
#   NEAR copy: a pool inside a keyless `xarena` contract on NEAR testnet
#   EVM copy:  `HITCPool`, an ERC-20 on its own curve on Base Sepolia, which obeys only the arena's
#              Chain Signatures address
# Three reporters relay what they read on Base; a value counts once two agree.
#
#   SCENARIO=evm-lost  EVM_KEY=<key> crosschain/run.sh   # the Base copy loses; its holder claims on NEAR
#   SCENARIO=near-lost EVM_KEY=<key> crosschain/run.sh   # the NEAR copy loses; its holders get Grants on Base
#
# Needs crosschain/stable.env from setup.sh, near (near-cli-rs) with the signer and reporters in the
# legacy keychain, cargo-near, foundry, python3.
set -euo pipefail
cd "$(dirname "$0")"
source ./stable.env

: "${EVM_KEY:?set EVM_KEY to a Base Sepolia private key holding a little ETH}"
SCENARIO=${SCENARIO:-evm-lost}
NEAR_SIGNER=${NEAR_SIGNER:-memeduel-4a2d2e.testnet}
REPORTERS=${REPORTERS:-memeduel-4a2d2e.testnet,duel-a.memeduel-4a2d2e.testnet,duel-b.memeduel-4a2d2e.testnet}
NEAR_RPC=${NEAR_RPC:-https://rpc.testnet.fastnear.com}
BASE_RPC=${BASE_RPC:-https://sepolia.base.org}
CHAIN_ID=84532
MPC=v1.signer-prod.testnet
ROUND_S=${ROUND_S:-240}
TICKER=${TICKER:-HUANG}
DERIVATION_PATH=${DERIVATION_PATH:-hitc-xarena-$SCENARIO-$(date +%s | tail -c 5)}
A=duel-a.memeduel-4a2d2e.testnet
B=duel-b.memeduel-4a2d2e.testnet

say() { printf '\n== %s\n' "$*"; }
nearview() {
  curl -s "$NEAR_RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"optimistic\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$3" | base64 -w0)\"}}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(bytes(r['result']['result']).decode())"
}
nearcall() { # signer contract method json-args deposit
  near contract call-function as-transaction "$2" "$3" json-args "$4" prepaid-gas '300 Tgas' attached-deposit "$5" \
    sign-as "$1" network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "succeeded|panicked|Error" | head -2
}
evmsend() { cast send "$@" --rpc-url "$BASE_RPC" --private-key "$EVM_KEY" --json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['transactionHash'], 'ok' if d['status'] in ('0x1', 1, '1') else 'FAILED')"; }
units() { python3 -c "print('%.6f' % ($1/1e6))"; }
quote() { # amount originAsset destinationAsset depositType recipient recipientType [refundTo, default recipient]
  curl -s -X POST https://1click.chaindefuser.com/v0/quote -H 'content-type: application/json' -d "{\"dry\":true,\"swapType\":\"EXACT_INPUT\",\"slippageTolerance\":100,\"originAsset\":\"$2\",\"depositType\":\"$4\",\"destinationAsset\":\"$3\",\"amount\":\"$1\",\"refundTo\":\"${7:-$5}\",\"refundType\":\"$4\",\"recipient\":\"$5\",\"recipientType\":\"$6\",\"deadline\":\"$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)\"}" \
    | python3 -c "import sys,json; q=json.load(sys.stdin).get('quote') or {}; print(q.get('amountOut') or '')"
}
USDC_BASE=nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near
USDC_NEAR=nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
ME_EVM=$(cast wallet address --private-key "$EVM_KEY")
XA="xarena-$(date +%s | tail -c 6).$NEAR_SIGNER"

say "1/9 [$SCENARIO] the EVM address Chain Signatures derives for $XA, path $DERIVATION_PATH"
KEY=$(nearview "$MPC" derived_public_key "{\"path\":\"$DERIVATION_PATH\",\"predecessor\":\"$XA\",\"domain_id\":0}" | tr -d '"')
RAW=$(python3 - "$KEY" <<'PY'
import sys
A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
n = 0
for c in sys.argv[1].split(":")[1]: n = n * 58 + A.index(c)
print("0x" + n.to_bytes(64, "big").hex())
PY
)
ARENA_EVM=$(cast to-check-sum-address "0x$(cast keccak "$RAW" | cut -c27-)")
echo "arena's EVM address: $ARENA_EVM"

END=$(( $(date +%s) + ROUND_S + 150 ))
say "2/9 deploy HITCPool (test USDC, 10 tUSDC virtual, 15% penalty) on Base Sepolia; round ends $(date -u -d @$END +%H:%M:%S) UTC"
POOL=$( (cd evm && forge create src/HITCPool.sol:HITCPool --rpc-url "$BASE_RPC" --private-key "$EVM_KEY" --broadcast \
  --constructor-args "$ARENA_EVM" "$END" "$TICKER" "$MUSDC" 10000000 1500) | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | awk '{print $3}')
echo "pool: $POOL (arena() = $(cast call "$POOL" 'arena()(address)' --rpc-url "$BASE_RPC"))"

say "3/9 deploy xarena on NEAR testnet (3 reporters, 2 must agree), then delete its only key"
near account create-account fund-myself "$XA" '2 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
  sign-as "$NEAR_SIGNER" network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "successfully created|Error" | head -1
RLIST=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1].split(',')))" "$REPORTERS")
ARGS=$(printf '{"ticker":"%s","round_end_ns":"%s","stable":"%s","unit_scale":"1","chain_id":"%s","pool":"%s","evm_escrow":"%s","near_escrow":"%s","reporters":%s,"threshold":2,"mpc":"%s","path":"%s"}' \
  "$TICKER" "${END}000000000" "$TUSDC" "$CHAIN_ID" "$(echo "$POOL" | tr A-F a-f)" "$(echo "$ME_EVM" | tr A-F a-f)" "$NEAR_SIGNER" "$RLIST" "$MPC" "$DERIVATION_PATH")
near contract deploy "$XA" use-file xarena/target/near/xarena.wasm with-init-call new json-args "$ARGS" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "successfully deployed|Error" | head -1
PUB=$(python3 -c "import json,os; print(json.load(open(os.path.expanduser('~/.near-credentials/testnet/$XA.json')))['public_key'])")
near account delete-keys "$XA" public-keys "$PUB" network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "successfully deleted|Error" | head -1
nearcall "$NEAR_SIGNER" "$TUSDC" storage_deposit "{\"account_id\":\"$XA\"}" '0.01 NEAR'

say "4/9 buys during the round, in test USDC on both sides"
if [ "$SCENARIO" = evm-lost ]; then NEAR_BUYS="$NEAR_SIGNER:5000000"; EVM_BUY=2000000; else NEAR_BUYS="$A:1000000 $B:500000"; EVM_BUY=3000000; fi
evmsend "$MUSDC" 'mint(address,uint256)' "$ME_EVM" "$EVM_BUY" >/dev/null
evmsend "$MUSDC" 'approve(address,uint256)' "$POOL" "$EVM_BUY" >/dev/null
echo "Base buy $(units $EVM_BUY) tUSDC: $(evmsend "$POOL" 'buy(uint256,uint256)' "$EVM_BUY" 0)"
BUY_BLOCK=$(cast block-number --rpc-url "$BASE_RPC")
for nb in $NEAR_BUYS; do
  who=${nb%%:*}; amt=${nb##*:}
  nearcall "$NEAR_SIGNER" "$TUSDC" mint "{\"account_id\":\"$who\",\"amount\":\"$amt\"}" '0 NEAR' >/dev/null
  echo "NEAR buy $(units "$amt") tUSDC by $who: $(nearcall "$who" "$TUSDC" ft_transfer_call "{\"receiver_id\":\"$XA\",\"amount\":\"$amt\",\"msg\":\"buy\"}" '1 yoctoNEAR' | head -1 | cut -c1-80)"
done

say "5/9 the bell; reporters read the pool's score on Base and report it (2 of 3 must agree)"
while [ "$(date +%s)" -lt $((END + 5)) ]; do sleep 5; done
EVM_SCORE=$(cast call "$POOL" 'score()(int256)' --rpc-url "$BASE_RPC" | awk '{print $1}')
echo "pool score: $EVM_SCORE"
IFS=, read -r R1 R2 R3 <<< "$REPORTERS"
nearcall "$R1" "$XA" report "{\"kind\":\"score\",\"value\":\"$EVM_SCORE\"}" '0 NEAR'
nearcall "$R3" "$XA" report "{\"kind\":\"score\",\"value\":\"$EVM_SCORE\"}" '0 NEAR'

say "6/9 settle on NEAR: compare the scores and ask the MPC network for the verdict signature"
nearcall "$NEAR_SIGNER" "$XA" settle '{}' '0 NEAR'
for _ in $(seq 1 40); do
  INFO=$(nearview "$XA" get_info '{}')
  SIG=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('verdict_signature') or '')")
  [ -n "$SIG" ] && break; sleep 6
done
PHASE=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['phase'])")
echo "phase: $PHASE; signature: ${SIG:0:20}..."
[ -n "$SIG" ] || { echo "no signature yet: call retry_verdict on $XA"; exit 1; }

if [ "$PHASE" = EvmLost ]; then
  say "7/9 the Base copy lost: anyone relays Release; its whole reserve leaves the pool"
  echo "release: $(evmsend "$POOL" 'release(address,bytes)' "$ME_EVM" "$SIG")"
  echo "pool tUSDC left: $(cast call "$MUSDC" 'balanceOf(address)(uint256)' "$POOL" --rpc-url "$BASE_RPC" | awk '{print $1}')"

  say "8/9 reporters post the pool's balances at the bell as a Merkle root (2 of 3)"
  SUPPLY=$(cast call "$POOL" 'totalSupply()(uint256)' --rpc-url "$BASE_RPC" | awk '{print $1}')
  BAL=$(cast call "$POOL" 'balanceOf(address)(uint256)' "$ME_EVM" --rpc-url "$BASE_RPC" | awk '{print $1}')
  [ "$BAL" = "$SUPPLY" ] || { echo "this run expects one holder"; exit 1; }
  ROOT=$(cast keccak "$(cast abi-encode 'f(address,uint256)' "$ME_EVM" "$BAL")")
  nearcall "$R1" "$XA" report "{\"kind\":\"holders\",\"value\":\"$ROOT:$SUPPLY\"}" '0 NEAR'
  nearcall "$R2" "$XA" report "{\"kind\":\"holders\",\"value\":\"$ROOT:$SUPPLY\"}" '0 NEAR'

  say "9/9 the swap (live Intents quote, delivered as test USDC on NEAR) and the EVM holder's claim on NEAR"
  OUT=$(quote "$EVM_BUY" "$USDC_BASE" "$USDC_NEAR" ORIGIN_CHAIN hitc-winner.near INTENTS "$POOL" || true); OUT=${OUT:-$EVM_BUY}
  echo "Intents quote (dry, mainnet): $(units $EVM_BUY) USDC on Base -> $(units "$OUT") USDC on NEAR"
  nearcall "$NEAR_SIGNER" "$TUSDC" mint "{\"account_id\":\"$NEAR_SIGNER\",\"amount\":\"$OUT\"}" '0 NEAR' >/dev/null
  nearcall "$NEAR_SIGNER" "$TUSDC" ft_transfer_call "{\"receiver_id\":\"$XA\",\"amount\":\"$OUT\",\"msg\":\"swap\"}" '1 yoctoNEAR'
  CLAIM_SIG=$(cast wallet sign --private-key "$EVM_KEY" "HITC claim $TICKER copy on $CHAIN_ID to $A")
  BEFORE=$(nearview "$TUSDC" ft_balance_of "{\"account_id\":\"$A\"}" | tr -d '"')
  nearcall "$NEAR_SIGNER" "$TUSDC" storage_deposit "{\"account_id\":\"$A\"}" '0.01 NEAR' >/dev/null
  nearcall "$NEAR_SIGNER" "$XA" claim_evm "{\"evm_address\":\"$(echo "$ME_EVM" | tr A-F a-f)\",\"balance\":\"$BAL\",\"proof\":[],\"signature\":\"$CLAIM_SIG\",\"near_account\":\"$A\"}" '0 NEAR'
  sleep 4
  AFTER=$(nearview "$TUSDC" ft_balance_of "{\"account_id\":\"$A\"}" | tr -d '"')
  echo "$A received $(units $((AFTER - BEFORE))) tUSDC (85% of the swapped reserve)"
else
  say "7/9 the NEAR copy lost: its reserve left towards the winner; anyone relays Won to the pool"
  echo "markWon: $(evmsend "$POOL" 'markWon(bytes)' "$SIG")"

  say "8/9 the swap (live Intents quote, delivered as test USDC on Base) is absorbed by the winner"
  NEAR_RES=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['near_holdings'])")
  OUT=$(quote "$NEAR_RES" "$USDC_NEAR" "$USDC_BASE" INTENTS "$POOL" DESTINATION_CHAIN hitc-winner.near || true); OUT=${OUT:-$NEAR_RES}
  echo "Intents quote (dry, mainnet): $(units "$NEAR_RES") USDC on NEAR -> $(units "$OUT") USDC on Base"
  evmsend "$MUSDC" 'mint(address,uint256)' "$ME_EVM" "$OUT" >/dev/null
  evmsend "$MUSDC" 'approve(address,uint256)' "$POOL" "$OUT" >/dev/null
  echo "absorb: $(evmsend "$POOL" 'absorb(uint256)' "$OUT")"
  echo "tokens held for the NEAR holders: $(cast call "$POOL" 'absorbedTokens()(uint256)' --rpc-url "$BASE_RPC")"

  say "9/9 each NEAR holder asks the arena for a Grant; anyone relays it; the tokens arrive on Base"
  for who in "$A" "$B"; do
    TO=$(cast wallet new --json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['address'])")
    nearcall "$who" "$XA" claim_on_evm "{\"evm_address\":\"$(echo "$TO" | tr A-F a-f)\"}" '0 NEAR'
    for _ in $(seq 1 40); do
      G=$(nearview "$XA" get_grant "{\"account_id\":\"$who\"}")
      GSIG=$(echo "$G" | python3 -c "import sys,json; g=json.load(sys.stdin); print((g or {}).get('signature') or '')")
      [ -n "$GSIG" ] && break; sleep 6
    done
    read -r NUM DEN NONCE <<< "$(echo "$G" | python3 -c "import sys,json; g=json.load(sys.stdin); print(g['num'], g['den'], g['nonce'])")"
    echo "grant for $who: $NUM/$DEN to $TO: $(evmsend "$POOL" 'grant(address,uint256,uint256,uint256,bytes)' "$TO" "$NUM" "$DEN" "$NONCE" "$GSIG")"
    echo "  $TO now holds $(cast call "$POOL" 'balanceOf(address)(uint256)' "$TO" --rpc-url "$BASE_RPC") winner tokens"
  done
fi

nearview "$XA" get_info '{}' | python3 -c "
import json,sys; i=json.load(sys.stdin)
print(json.dumps({k: i[k] for k in ['phase','near_reserve','near_score','evm_score','threshold','holders_root','swapped','spoils','claimed','claims','grants','grants_signed']}, indent=1))"
python3 - "$SCENARIO" "$XA" "$POOL" "$ARENA_EVM" "$BUY_BLOCK" "$(cast block-number --rpc-url "$BASE_RPC")" "$TUSDC" "$MUSDC" <<'PY'
import json, sys, time
scenario, xa, pool, arena, b0, b1, tusdc, musdc = sys.argv[1:]
out = {"scenario": scenario, "xarena": xa, "pool": pool, "arena_evm_address": arena, "logs_from_block": int(b0) - 600,
       "logs_to_block": int(b1) + 20, "tusdc_near": tusdc, "tusdc_base": musdc, "finished_utc": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())}
open(f"last-run-{scenario}.json", "w").write(json.dumps(out, indent=1) + "\n")
print(json.dumps(out, indent=1))
PY
