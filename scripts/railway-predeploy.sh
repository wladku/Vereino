#!/bin/sh
# Railway pre-deploy command of the app service (railway.toml; ADR-013, S14.5). Runs once per deploy, before the new
# release takes traffic: checks the required variables, applies pending migrations and syncs the role ACLs of every
# club's tenant only when the role-feature defaults (or the installed platform version) changed since the last
# successful sync (DD-M11 of the many clubs spec; `docs/ops/deploy.md`). Any failure fails the deploy and the previous release keeps serving. It never runs
# `yarn initialize`: an empty or wrong database URL fails here instead of setting up a new database.
set -euo pipefail

# Same rate-limit store default as the start scripts, so the boot check sees what the app will run with (#738).
export RATE_LIMIT_STRATEGY="${RATE_LIMIT_STRATEGY:-redis}"
node ./packages/app/scripts/vereino-boot-env.mjs
yarn db:migrate
yarn mercato foundation sync-role-acls-if-changed
