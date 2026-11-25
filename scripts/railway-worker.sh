#!/bin/sh
# Railway start command of the worker service (railway.worker.toml). It never migrates or initialises: the app
# service's pre-deploy command migrates once per deploy (ADR-013).
set -euo pipefail

export CACHE_STRATEGY="${CACHE_STRATEGY:-redis}"
export CACHE_REDIS_URL="${CACHE_REDIS_URL:-${REDIS_URL:-}}"
# Rate-limit counters in Redis, shared by instances and kept across deploys (#738); the limiter reads REDIS_URL.
export RATE_LIMIT_STRATEGY="${RATE_LIMIT_STRATEGY:-redis}"
export QUEUE_STRATEGY=async
export NEXT_PUBLIC_QUEUE_STRATEGY=async
export AUTO_SPAWN_WORKERS=false
export OM_AUTO_SPAWN_WORKERS=false

# Refuse to start, naming the missing variables, before anything else runs (S8.10).
node ./packages/app/scripts/vereino-boot-env.mjs

if [ ! -d "packages/app/.mercato/generated" ]; then
  yarn generate
fi

exec yarn mercato queue worker --all
