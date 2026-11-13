#!/usr/bin/env bash
# Builds the web app and pitch deck against the fast test arena and publishes the
# result to the gh-pages branch, which GitHub Pages serves.
#
#   scripts/publish-pages.sh [arena account]
#
# Defaults to arena-35900 (6 min registration, 9 min rounds) so a bracket can be
# played in one sitting. A local clone of the app still defaults to arena-33881.
set -euo pipefail
cd "$(dirname "$0")/.."

ARENA=${1:-arena-35900.memeduel-4a2d2e.testnet}
REMOTE=$(git remote get-url origin)
REV=$(git rev-parse --short HEAD)
NAME=$(git log -1 --format=%an)
EMAIL=$(git log -1 --format=%ae)

(cd web && VITE_NETWORK=testnet VITE_ARENA="$ARENA" pnpm build)

OUT=$(mktemp -d)
trap 'rm -rf -- "$OUT"' EXIT
cp -r web/dist/. "$OUT"
touch "$OUT/.nojekyll"   # serve files as they are, no Jekyll processing

cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="$NAME" -c user.email="$EMAIL" commit -q -m "Publish $REV against $ARENA"
git push -q -f "$REMOTE" gh-pages
echo "Published $REV against $ARENA to the gh-pages branch."
