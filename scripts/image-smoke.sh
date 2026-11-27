#!/usr/bin/env bash
# Smoke test of the deployed Docker image (#727). Builds the `runner` stage of the root `Dockerfile` and runs it the
# way Railway does (`railway.toml`, `docs/ops/deploy.md`) against throwaway PostgreSQL and Redis containers:
#   1. pre-deploy  `sh ./scripts/railway-predeploy.sh` on an empty database (migrations, role-ACL sync);
#   2. first setup `yarn initialize --no-examples` (the one-time runbook step);
#   3. app         `sh ./scripts/railway-start.sh` with its default `CACHE_STRATEGY=redis`;
#   4. worker      `sh ./scripts/railway-worker.sh`;
#   5. checks      `node scripts/smoke.mjs` (health incl. the Redis probe, sign-in page, headers, an authenticated
#                  call), one more authenticated call behind an RBAC feature check, and the worker still running.
# The smoke account is the super-admin, who signs in with an e-mailed code (staff second factor, #736). The app alone
# runs with `OM_TEST_MODE=1`, which only writes every e-mail to a capture file (a directory of this run, mounted into
# the container) that `smoke.mjs` reads the code from; the auth limits stay on (no `OM_TEST_AUTH_RATE_LIMIT_MODE`).
# Exits 0 when every step passes; otherwise prints the containers' logs and exits 1. Every container, the network and
# the published port are this run's own (random names, a random host port); nothing outlives the run.
#
#   scripts/image-smoke.sh                     build the image, then run the checks
#   IMAGE=<tag> SKIP_BUILD=1 scripts/image-smoke.sh   check an image built before
#
# Needs Docker and Node. Never point it at a real or dev database: it creates its own.
set -euo pipefail

cd "$(dirname "$0")/.."

RUN_ID="vereino-image-smoke-$$-$(date +%s)"
IMAGE="${IMAGE:-$RUN_ID:runner}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-pgvector/pgvector:pg17-trixie}"
REDIS_IMAGE="${REDIS_IMAGE:-redis:7.4-alpine}"
NETWORK="$RUN_ID-net"
DB="$RUN_ID-db"
REDIS="$RUN_ID-redis"
APP="$RUN_ID-app"
WORKER="$RUN_ID-worker"
SMOKE_EMAIL="smoke@vereino.test"
SMOKE_PASSWORD="Smoke-1-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
STARTED=()
CAPTURE_DIR="$(mktemp -d)"
CAPTURE_FILE="$CAPTURE_DIR/email-capture.jsonl"

log() { printf '[image-smoke] %s\n' "$*"; }

cleanup() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    for name in "${STARTED[@]}"; do
      printf '\n----- logs of %s -----\n' "$name"
      docker logs --tail 200 "$name" 2>&1 || true
    done
  fi
  for name in "${STARTED[@]}"; do docker rm -f "$name" >/dev/null 2>&1 || true; done
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  if [ "${SKIP_BUILD:-0}" != "1" ]; then docker image rm "$IMAGE" >/dev/null 2>&1 || true; fi
  rm -rf "$CAPTURE_DIR" 2>/dev/null || true
  exit "$code"
}
trap cleanup EXIT

fail() { log "FAIL: $*"; exit 1; }

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  log "building the runner stage as $IMAGE"
  docker build --target runner -t "$IMAGE" .
fi

docker network create "$NETWORK" >/dev/null
docker run -d --name "$DB" --network "$NETWORK" \
  -e POSTGRES_DB=vereino -e POSTGRES_USER=vereino -e POSTGRES_PASSWORD=smoke "$POSTGRES_IMAGE" >/dev/null
STARTED+=("$DB")
docker run -d --name "$REDIS" --network "$NETWORK" "$REDIS_IMAGE" >/dev/null
STARTED+=("$REDIS")

log "waiting for PostgreSQL"
for _ in $(seq 1 60); do
  if docker exec "$DB" pg_isready -U vereino -d vereino -h 127.0.0.1 >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$DB" pg_isready -U vereino -d vereino -h 127.0.0.1 >/dev/null || fail "PostgreSQL did not start"
docker exec "$DB" psql -q -U vereino -d vereino \
  -c 'CREATE EXTENSION IF NOT EXISTS vector;' -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto;'

APP_URL="http://127.0.0.1:3000"
ENV_ARGS=(
  -e "DATABASE_URL=postgres://vereino:smoke@$DB:5432/vereino"
  -e "REDIS_URL=redis://$REDIS:6379"
  -e "JWT_SECRET=$RUN_ID-jwt"
  -e "APP_URL=$APP_URL"
  -e "NEXT_PUBLIC_APP_URL=$APP_URL"
  -e "TENANT_DATA_ENCRYPTION_FALLBACK_KEY=$RUN_ID-encryption"
  -e "OM_ENABLE_ENTERPRISE_MODULES=false"
  -e "OM_DISABLE_EMAIL_DELIVERY=1"
  -e "AUTO_SPAWN_SCHEDULER=false"
)

log "pre-deploy: railway-predeploy.sh on the empty database"
docker run --rm --network "$NETWORK" "${ENV_ARGS[@]}" "$IMAGE" sh ./scripts/railway-predeploy.sh \
  || fail "the pre-deploy script failed"

log "first setup: yarn initialize --no-examples"
docker run --rm --network "$NETWORK" "${ENV_ARGS[@]}" \
  -e "OM_INIT_SUPERADMIN_EMAIL=$SMOKE_EMAIL" -e "OM_INIT_SUPERADMIN_PASSWORD=$SMOKE_PASSWORD" \
  "$IMAGE" yarn initialize --no-examples || fail "yarn initialize failed"

log "app: railway-start.sh (CACHE_STRATEGY defaults to redis)"
# The container user (uid 1001) writes the capture into this run's directory.
chmod 0777 "$CAPTURE_DIR"
docker run -d --name "$APP" --network "$NETWORK" "${ENV_ARGS[@]}" -p 127.0.0.1::3000 \
  -v "$CAPTURE_DIR:/smoke-capture" -e "OM_TEST_MODE=1" -e "OM_TEST_EMAIL_CAPTURE_PATH=/smoke-capture/email-capture.jsonl" \
  "$IMAGE" sh ./scripts/railway-start.sh >/dev/null
STARTED+=("$APP")

log "worker: railway-worker.sh"
docker run -d --name "$WORKER" --network "$NETWORK" "${ENV_ARGS[@]}" \
  "$IMAGE" sh ./scripts/railway-worker.sh >/dev/null
STARTED+=("$WORKER")

PORT="$(docker port "$APP" 3000/tcp | head -n1 | sed 's/.*://')"
BASE_URL="http://127.0.0.1:$PORT"

running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]; }

log "waiting for $BASE_URL/api/healthz"
healthy=0
for _ in $(seq 1 90); do
  running "$APP" || fail "the app container exited"
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/healthz" || true)" = "200" ]; then healthy=1; break; fi
  sleep 2
done
[ "$healthy" = "1" ] || fail "/api/healthz did not answer 200 within 180 s"

log "smoke checks (scripts/smoke.mjs)"
export VEREINO_SMOKE_EMAIL="$SMOKE_EMAIL" VEREINO_SMOKE_PASSWORD="$SMOKE_PASSWORD" VEREINO_SMOKE_EMAIL_CAPTURE="$CAPTURE_FILE"
node scripts/smoke.mjs "$BASE_URL" || fail "scripts/smoke.mjs reported a failed check"

log "authenticated call behind a feature check (GET /api/auth/users)"
# The same sign-in as `smoke.mjs` (the second factor included); prints the token, or the failure on stderr.
TOKEN="$(BASE_URL="$BASE_URL" node --input-type=module -e '
import { captureReader, signIn } from "./scripts/smoke.mjs"
const env = process.env
const result = await signIn({
  baseUrl: env.BASE_URL, fetchImpl: fetch, email: env.VEREINO_SMOKE_EMAIL, password: env.VEREINO_SMOKE_PASSWORD,
  readCapture: captureReader(env),
})
if ("error" in result) { console.error(result.error); process.exitCode = 1 } else process.stdout.write(result.token)
')" || true
[ -n "$TOKEN" ] || fail "sign-in returned no token"
status="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/auth/users?page=1&pageSize=1")"
[ "$status" = "200" ] || fail "GET /api/auth/users answered $status"
if docker logs "$APP" 2>&1 | grep -q "cannot be invoked without 'new'"; then
  fail "the app logged the Redis client construction error"
fi

running "$WORKER" || fail "the worker container exited"
if docker logs "$WORKER" 2>&1 | grep -q "Cannot find package"; then fail "the worker could not resolve a package"; fi

log "PASS: pre-deploy, initialize, app (Redis cache) and worker run from the runner image"
