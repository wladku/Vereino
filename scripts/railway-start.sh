#!/bin/sh
# Railway start command of the app service (railway.toml). It only starts the server (ADR-013, S14.5): migrations and
# the role-ACL sync run once per deploy in Railway's pre-deploy command, and `yarn initialize` never runs here — with
# an empty or wrong database URL a start must fail, not set up a new database. First-time setup of an environment is
# a manual runbook step (docs/ops/deploy.md).
set -euo pipefail

export CACHE_STRATEGY="${CACHE_STRATEGY:-redis}"
export CACHE_REDIS_URL="${CACHE_REDIS_URL:-${REDIS_URL:-}}"
export QUEUE_STRATEGY="${QUEUE_STRATEGY:-async}"
export NEXT_PUBLIC_QUEUE_STRATEGY="${NEXT_PUBLIC_QUEUE_STRATEGY:-async}"

# Refuse to start, naming the missing variables, before anything else runs (S8.10).
node ./packages/app/scripts/vereino-boot-env.mjs

if [ ! -d "packages/app/.mercato/generated" ]; then
  yarn generate
fi

exec yarn start
