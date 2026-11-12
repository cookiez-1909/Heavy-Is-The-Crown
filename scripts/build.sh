#!/usr/bin/env bash
# Builds the three contracts into target/near/.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd contracts/token && cargo near build non-reproducible-wasm)
(cd contracts/arena && cargo near build non-reproducible-wasm)
(cd contracts/publisher && cargo near build non-reproducible-wasm --no-abi)
