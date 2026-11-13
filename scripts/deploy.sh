#!/usr/bin/env bash
# Deploys an arena to testnet and then deletes its access key, so nobody
# (including the deployer) can change or upgrade it.
#
#   scripts/deploy.sh <account.testnet> [registration_h=1] [round_h=4] [cooldown_h=1] \
#                     [penalty_bps=1500] [virtual_near=5] [min_seed_near=0.2] [max_entrants=8] \
#                     [creator_reward_bps=100] [score_cap_near=2]
#
# <account> must have its key in the legacy keychain (~/.near-credentials).
# Publishing the token code as a global contract burns ~23 NEAR once per code
# version; each arena then needs 2.5 NEAR. A coin launch costs 0.25 NEAR.
set -euo pipefail
cd "$(dirname "$0")/.."

ACCOUNT=${1:?usage: scripts/deploy.sh <account.testnet> [registration_h] [round_h] [cooldown_h] [penalty_bps] [virtual_near] [min_seed_near] [max_entrants]}
REG_H=${2:-1}
ROUND_H=${3:-4}
COOL_H=${4:-1}
PENALTY=${5:-1500}
VIRTUAL=${6:-5}
MIN_SEED=${7:-0.2}
MAX=${8:-8}
REWARD=${9:-100}
CAP=${10:-2}
NET=${NEAR_NETWORK:-testnet}
TOKEN=target/near/duel_token/duel_token.wasm
ARENA_WASM=target/near/duel_arena/duel_arena.wasm
[ -f "$TOKEN" ] && [ -f "$ARENA_WASM" ] || scripts/build.sh

HASH=$(python3 - "$TOKEN" <<'PY'
import hashlib, sys
A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
n = int.from_bytes(hashlib.sha256(open(sys.argv[1], "rb").read()).digest(), "big")
s = ""
while n: n, r = divmod(n, 58); s = A[r] + s
print(s)
PY
)
ns() { python3 -c "from decimal import Decimal as D; print(int(D('$1') * 3600 * 10**9))"; }
yocto() { python3 -c "from decimal import Decimal as D; print(int(D('$1') * 10**24))"; }
ARENA="arena-$(date +%s | tail -c 6).$ACCOUNT"
ARGS="{\"registration_ns\":\"$(ns "$REG_H")\",\"round_ns\":\"$(ns "$ROUND_H")\",\"cooldown_ns\":\"$(ns "$COOL_H")\",\"penalty_bps\":$PENALTY,\"virtual_near\":\"$(yocto "$VIRTUAL")\",\"min_seed\":\"$(yocto "$MIN_SEED")\",\"max_entrants\":$MAX,\"creator_reward_bps\":$REWARD,\"score_cap\":\"$(yocto "$CAP")\",\"token_code_hash\":\"$HASH\"}"

echo "1/4 publishing token code as an immutable global contract ($HASH)"
near contract deploy-as-global use-file "$TOKEN" as-global-hash "$ACCOUNT" \
  network-config "$NET" sign-with-legacy-keychain send

echo "2/4 creating $ARENA"
near account create-account fund-myself "$ARENA" '2.5 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
  sign-as "$ACCOUNT" network-config "$NET" sign-with-legacy-keychain send

echo "3/4 deploying the arena: $ARGS"
near contract deploy "$ARENA" use-file "$ARENA_WASM" with-init-call new json-args "$ARGS" \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config "$NET" sign-with-legacy-keychain send

echo "4/4 deleting the arena's only access key"
KEY=$(python3 -c "import json,os; print(json.load(open(os.path.expanduser('~/.near-credentials/$NET/$ARENA.json')))['public_key'])")
near account delete-keys "$ARENA" public-keys "$KEY" network-config "$NET" sign-with-legacy-keychain send

echo
echo "Arena: $ARENA (no access keys left)"
echo "Put this in web/.env:"
echo "VITE_ARENA=$ARENA"
echo "VITE_NETWORK=$NET"
