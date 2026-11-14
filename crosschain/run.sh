#!/usr/bin/env bash
# Plays one cross-chain match, end to end, on public testnets:
#   NEAR copy: a pool inside a keyless `xarena` contract on NEAR testnet
#   EVM copy:  `HITCPool` on Base Sepolia, which only the arena's Chain Signatures address can drain
# The NEAR copy is given the bigger score, so the EVM copy loses and its reserve is released by a
# signature that NEAR's MPC network produces for the arena contract.
#
#   EVM_KEY=<base sepolia private key with a little ETH> crosschain/run.sh
#
# Needs: near (near-cli-rs) with NEAR_SIGNER in the legacy keychain, cargo-near, foundry, python3.
set -euo pipefail
cd "$(dirname "$0")"

: "${EVM_KEY:?set EVM_KEY to a Base Sepolia private key holding a little ETH}"
NEAR_SIGNER=${NEAR_SIGNER:-memeduel-4a2d2e.testnet}
NEAR_RPC=${NEAR_RPC:-https://rpc.testnet.fastnear.com}
BASE_RPC=${BASE_RPC:-https://sepolia.base.org}
CHAIN_ID=84532
MPC=v1.signer-prod.testnet
DERIVATION_PATH=${DERIVATION_PATH:-hitc-xarena-1}
ROUND_S=${ROUND_S:-300}
NEAR_BUY=${NEAR_BUY:-0.5}
ETH_BUY=${ETH_BUY:-0.0005}
TICKER=${TICKER:-HUANG}
VIRTUAL_ETH=${VIRTUAL_ETH:-0.001}
CLAIM_TO=${CLAIM_TO:-duel-a.memeduel-4a2d2e.testnet}   # the NEAR account the EVM holder claims to

say() { printf '\n== %s\n' "$*"; }
nearview() { # contract method json-args
  curl -s "$NEAR_RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"optimistic\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$3" | base64 -w0)\"}}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(bytes(r['result']['result']).decode())"
}
nearcall() { # contract method json-args deposit
  near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas '300 Tgas' attached-deposit "$4" \
    sign-as "$NEAR_SIGNER" network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "succeeded|panicked|Error" | head -2
}

ESCROW_EVM=$(cast wallet address --private-key "$EVM_KEY")   # stands in for a NEAR Intents deposit address
XA="xarena-$(date +%s | tail -c 6).$NEAR_SIGNER"

say "1/11 price: fixed NEAR-per-ETH rate for this match (a price oracle would replace it)"
YOCTO_PER_WEI=$(curl -s "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,near&vs_currencies=usd" \
  | python3 -c "import sys,json; p=json.load(sys.stdin); print(int(p['ethereum']['usd']/p['near']['usd']*1e6))")
echo "1 wei = $YOCTO_PER_WEI yoctoNEAR (1 ETH ≈ $(python3 -c "print(round($YOCTO_PER_WEI/1e6))") NEAR)"

say "2/11 the EVM address that Chain Signatures derives for $XA, path $DERIVATION_PATH"
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
say "3/11 deploy HITCPool on Base Sepolia (round ends $(date -u -d @$END +%H:%M:%S) UTC)"
POOL=$( (cd evm && forge create src/HITCPool.sol:HITCPool --rpc-url "$BASE_RPC" --private-key "$EVM_KEY" --broadcast \
  --constructor-args "$ARENA_EVM" "$END" "$TICKER" "$(cast to-wei "$VIRTUAL_ETH")" 1500) | grep -oE 'Deployed to: 0x[0-9a-fA-F]{40}' | awk '{print $3}')
echo "pool: $POOL"
[ "$(cast call "$POOL" 'arena()(address)' --rpc-url "$BASE_RPC")" = "$ARENA_EVM" ] && echo "pool.arena() is the derived address"

say "4/11 deploy xarena on NEAR testnet as $XA, then delete its only key"
near account create-account fund-myself "$XA" '2 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
  sign-as "$NEAR_SIGNER" network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "successfully created|Error" | head -1
ARGS=$(printf '{"ticker":"%s","round_end_ns":"%s","yocto_per_wei":"%s","chain_id":"%s","pool":"%s","evm_escrow":"%s","near_escrow":"%s","reporter":"%s","mpc":"%s","path":"%s"}' \
  "$TICKER" "${END}000000000" "$YOCTO_PER_WEI" "$CHAIN_ID" "$(echo "$POOL" | tr A-F a-f)" "$(echo "$ESCROW_EVM" | tr A-F a-f)" "$NEAR_SIGNER" "$NEAR_SIGNER" "$MPC" "$DERIVATION_PATH")
near contract deploy "$XA" use-file xarena/target/near/xarena.wasm with-init-call new json-args "$ARGS" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "successfully deployed|Error" | head -1
PUB=$(python3 -c "import json,os; print(json.load(open(os.path.expanduser('~/.near-credentials/testnet/$XA.json')))['public_key'])")
near account delete-keys "$XA" public-keys "$PUB" network-config testnet sign-with-legacy-keychain send 2>&1 | grep -E "successfully deleted|Error" | head -1

say "5/11 both copies are bought during the round"
cast send "$POOL" 'buy(uint256)' 0 --value "${ETH_BUY}ether" --rpc-url "$BASE_RPC" --private-key "$EVM_KEY" 2>&1 | grep -E '^transactionHash|^status' | tr -s ' '
nearcall "$XA" buy '{}' "$NEAR_BUY NEAR"
BUY_BLOCK=$(cast block-number --rpc-url "$BASE_RPC")

say "6/11 waiting for the bell"
while [ "$(date +%s)" -lt $((END + 5)) ]; do sleep 5; done
EVM_SCORE=$(cast call "$POOL" 'score()(int256)' --rpc-url "$BASE_RPC" | awk '{print $1}')
echo "EVM score (wei·s): $EVM_SCORE, reserve: $(cast balance "$POOL" --rpc-url "$BASE_RPC" --ether) ETH"
nearcall "$XA" report_evm_score "{\"score\":\"$EVM_SCORE\"}" '0 NEAR'

say "7/11 settle on NEAR: the arena compares the scores and asks the MPC network for the release signature"
nearcall "$XA" settle '{}' '0 NEAR'
for _ in $(seq 1 40); do
  INFO=$(nearview "$XA" get_info '{}')
  SIG=$(echo "$INFO" | python3 -c "import sys,json; print(json.load(sys.stdin).get('release_signature') or '')")
  [ -n "$SIG" ] && break; sleep 6
done
echo "$INFO" | python3 -m json.tool
[ -n "$SIG" ] || { echo "no signature yet: call retry_signature on $XA"; exit 1; }

say "8/11 anyone relays the signature to Base Sepolia"
BEFORE=$(cast balance "$ESCROW_EVM" --rpc-url "$BASE_RPC")
TX=$(cast send "$POOL" 'release(address,bytes)' "$ESCROW_EVM" "$SIG" --rpc-url "$BASE_RPC" --private-key "$EVM_KEY" --json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['transactionHash'], d['status'])")
echo "release tx: $TX"
echo "pool reserve now: $(cast balance "$POOL" --rpc-url "$BASE_RPC" --ether) ETH; released() = $(cast call "$POOL" 'released()(bool)' --rpc-url "$BASE_RPC")"

RELEASED_WEI=$(cast call "$POOL" 'reserve()(uint256)' --rpc-url "$BASE_RPC" >/dev/null; cast receipt "${TX%% *}" --rpc-url "$BASE_RPC" --json | python3 -c "import sys,json; r=json.load(sys.stdin); print(int(r['logs'][-1]['data'],16))")

say "9/11 balances at the bell, as a Merkle root (leaves: keccak256(abi.encode(holder, balance)))"
SUPPLY=$(cast call "$POOL" 'totalSupply()(uint256)' --rpc-url "$BASE_RPC" | awk '{print $1}')
HOLDERS=$(python3 - "$POOL" "$BASE_RPC" "$BUY_BLOCK" <<'PY'
import json, subprocess, sys
pool, rpc, buy_block = sys.argv[1:]
topic = subprocess.check_output(["cast", "sig-event", "Bought(address,uint256,uint256,int256)"]).decode().strip()
logs = []
start = int(buy_block) - 400   # the buy landed a few blocks before this number was read
end = int(subprocess.check_output(["cast", "block-number", "--rpc-url", rpc]).decode())
for frm in range(start, end + 1, 200):
    out = subprocess.check_output(["cast", "logs", "--from-block", str(frm), "--to-block", str(frm + 199), "--address", pool, topic, "--rpc-url", rpc, "--json"]).decode()
    logs += json.loads(out or "[]")
holders = sorted({"0x" + l["topics"][1][-40:] for l in logs})
rows = []
for h in holders:
    bal = int(subprocess.check_output(["cast", "call", pool, "balanceOf(address)(uint256)", h, "--rpc-url", rpc]).decode().split()[0])
    if bal:
        leaf = subprocess.check_output(["cast", "keccak", subprocess.check_output(["cast", "abi-encode", "f(address,uint256)", h, str(bal)]).decode().strip()]).decode().strip()
        rows.append({"holder": h, "balance": bal, "leaf": leaf})
def h2(a, b):
    a, b = sorted([a, b])
    return subprocess.check_output(["cast", "keccak", a + b[2:]]).decode().strip()
level = [r["leaf"] for r in rows]
proofs = {r["leaf"]: [] for r in rows}
members = {r["leaf"]: [r["leaf"]] for r in rows}
while len(level) > 1:
    nxt = []
    for i in range(0, len(level), 2):
        if i + 1 == len(level):
            nxt.append(level[i]); continue
        a, b = level[i], level[i + 1]
        p = h2(a, b)
        for leaf in members[a]: proofs[leaf].append(b)
        for leaf in members[b]: proofs[leaf].append(a)
        members[p] = members.pop(a) + members.pop(b)
        nxt.append(p)
    level = nxt
for r in rows: r["proof"] = proofs[r["leaf"]]
print(json.dumps({"root": level[0] if level else None, "rows": rows}))
PY
)
ROOT=$(echo "$HOLDERS" | python3 -c "import sys,json; print(json.load(sys.stdin)['root'])")
echo "holders: $(echo "$HOLDERS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['rows']))"), supply $SUPPLY, root $ROOT"
nearcall "$XA" report_evm_holders "{\"root\":\"$ROOT\",\"total_supply\":\"$SUPPLY\"}" '0 NEAR'

say "10/11 the swap: a live NEAR Intents quote for the released ETH (dry, mainnet), delivered here as testnet NEAR"
QUOTE=$(curl -s -X POST https://1click.chaindefuser.com/v0/quote -H 'content-type: application/json' -d "{\"dry\":true,\"swapType\":\"EXACT_INPUT\",\"slippageTolerance\":100,\"originAsset\":\"nep141:base.omft.near\",\"depositType\":\"ORIGIN_CHAIN\",\"destinationAsset\":\"nep141:wrap.near\",\"amount\":\"$RELEASED_WEI\",\"refundTo\":\"$POOL\",\"refundType\":\"ORIGIN_CHAIN\",\"recipient\":\"hitc-winner.near\",\"recipientType\":\"INTENTS\",\"deadline\":\"$(date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)\"}")
SWAP_OUT=$(echo "$QUOTE" | python3 -c "import sys,json; print(json.load(sys.stdin)['quote']['amountOut'])")
echo "quote: $(python3 -c "print($RELEASED_WEI/1e18)") ETH -> $(python3 -c "print($SWAP_OUT/1e24)") NEAR"
nearcall "$XA" deliver_swap '{}' "$(python3 -c "print('%.6f' % ($SWAP_OUT/1e24))") NEAR"

say "11/11 the EVM holder signs with their EVM key and claims on NEAR, to $CLAIM_TO"
HOLDER=$(echo "$HOLDERS" | python3 -c "import sys,json; print(json.load(sys.stdin)['rows'][0]['holder'])")
BAL=$(echo "$HOLDERS" | python3 -c "import sys,json; print(json.load(sys.stdin)['rows'][0]['balance'])")
PROOF=$(echo "$HOLDERS" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['rows'][0]['proof']))")
CLAIM_SIG=$(cast wallet sign --private-key "$EVM_KEY" "HITC claim $TICKER copy on $CHAIN_ID to $CLAIM_TO")
NEAR_BEFORE=$(curl -s "$NEAR_RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"optimistic\",\"account_id\":\"$CLAIM_TO\"}}" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['amount'])")
nearcall "$XA" claim_evm "{\"evm_address\":\"$HOLDER\",\"balance\":\"$BAL\",\"proof\":$PROOF,\"signature\":\"$CLAIM_SIG\",\"near_account\":\"$CLAIM_TO\"}" '0 NEAR'
sleep 4
NEAR_AFTER=$(curl -s "$NEAR_RPC" -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_account\",\"finality\":\"optimistic\",\"account_id\":\"$CLAIM_TO\"}}" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['amount'])")
echo "$CLAIM_TO received $(python3 -c "print(($NEAR_AFTER - $NEAR_BEFORE)/1e24)") NEAR (85% of the swapped reserve, pro rata)"
nearview "$XA" get_info '{}' | python3 -m json.tool | grep -E '"(phase|holders_root|holders_supply|swapped_near|spoils_near|claimed_near|claims)"'

python3 - "$XA" "$POOL" "$ARENA_EVM" "${TX%% *}" "$ESCROW_EVM" "$YOCTO_PER_WEI" <<'PY'
import json, sys, time
xa, pool, arena, tx, escrow, rate = sys.argv[1:]
out = {"xarena": xa, "nearblocks": f"https://testnet.nearblocks.io/address/{xa}",
       "arena_evm_address": arena, "pool": pool, "pool_basescan": f"https://sepolia.basescan.org/address/{pool}",
       "release_tx": f"https://sepolia.basescan.org/tx/{tx}", "escrow_stand_in": escrow, "yocto_per_wei": rate,
       "finished_utc": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())}
open("last-run.json", "w").write(json.dumps(out, indent=1) + "\n")
print(json.dumps(out, indent=1))
PY
