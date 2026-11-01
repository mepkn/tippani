#!/usr/bin/env bash
# Builds the web app (web/, a Vite SPA) and syncs web/dist to the VPS, where Caddy serves DEPLOY_DIR
# directly (no restart or sudo needed).
#
# Server details and the production Convex URL live in web/.env.prod.local
# (git-ignored; see web/.env.example).
#   scripts/deploy-web.sh            checks, build and upload
#   DRY_RUN=1 scripts/deploy-web.sh  preview the upload without changing anything
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/load-env.sh

URL="https://tippani.pknspace.com"

load_env web/.env.prod.local
: "${DEPLOY_HOST:?DEPLOY_HOST is not set in web/.env.prod.local}"
: "${DEPLOY_PORT:?DEPLOY_PORT is not set in web/.env.prod.local}"
: "${DEPLOY_DIR:?DEPLOY_DIR is not set in web/.env.prod.local}"
# The build inlines this URL. Set here, it wins over backend/.env.local, which
# points at the local dev backend.
: "${VITE_CONVEX_URL:?VITE_CONVEX_URL (production) is not set in web/.env.prod.local}"

echo "› Checks"
scripts/check.sh

echo "› Build"
npm --prefix web run build

if ! grep -q "$VITE_CONVEX_URL" web/dist/assets/index-*.js; then
  echo "The build doesn't contain the production Convex URL; not uploading." >&2
  exit 1
fi

echo "› Upload"
rsync -avz --delete ${DRY_RUN:+--dry-run} \
  -e "ssh -p $DEPLOY_PORT" \
  web/dist/ "$DEPLOY_HOST:$DEPLOY_DIR/"

if [ -n "${DRY_RUN:-}" ]; then
  echo "Dry run: nothing was uploaded."
else
  echo "Deployed to $URL"
fi
