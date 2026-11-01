#!/usr/bin/env bash
# Deploys backend/convex/ to the production Convex deployment of project "tippani".
# Needs CONVEX_DEPLOY_KEY in backend/.env.prod.local (git-ignored; see backend/.env.example).
#   scripts/deploy-backend.sh            checks, then deploy
#   DRY_RUN=1 scripts/deploy-backend.sh  preview only: nothing is deployed
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/load-env.sh

load_env backend/.env.prod.local
: "${CONVEX_DEPLOY_KEY:?CONVEX_DEPLOY_KEY is not set in backend/.env.prod.local}"
# backend/.env.local points `convex` at the local dev backend; don't let it win.
unset CONVEX_DEPLOYMENT

echo "› Checks"
scripts/check.sh

cd backend
if [ -n "${DRY_RUN:-}" ]; then
  echo "› Backend (dry run)"
  npx convex deploy --dry-run
  echo "Dry run: nothing was deployed."
  exit 0
fi

echo "› Deploying to production"
npx convex deploy -y
