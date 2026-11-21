#!/bin/sh
# Railway pre-deploy command of the app service (railway.toml; ADR-013, S14.5). Runs once per deploy, before the new
# release takes traffic: checks the required variables, applies pending migrations and syncs the role ACLs of
# newly enabled modules. Any failure fails the deploy and the previous release keeps serving. It never runs
# `yarn initialize`: an empty or wrong database URL fails here instead of setting up a new database.
set -euo pipefail

node ./packages/app/scripts/vereino-boot-env.mjs
yarn db:migrate
yarn mercato auth sync-role-acls
