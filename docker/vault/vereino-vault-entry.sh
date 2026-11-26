#!/usr/bin/dumb-init /bin/sh
# Entry script of the Vereino key store (#740, DD-K09): start Vault, then unseal it from two Shamir shares.
#
# dumb-init (PID 1) forwards SIGTERM to the server. The shares come from VAULT_UNSEAL_KEY_1 and VAULT_UNSEAL_KEY_2,
# sealed variables of this service only; they go to Vault's unseal endpoint on stdin, never on a command line (which
# `ps` shows) and never to a log. An uninitialised Vault is left running sealed so the operator can run `vault operator
# init` (docs/ops/key-store.md); a share that is missing or wrong leaves Vault sealed and the health check red.
set -eu

DATA_DIR=/vault/data

# Railway mounts the volume owned by root; the server runs as the `vault` user (the image's entrypoint drops to it).
mkdir -p "$DATA_DIR/raft"
if [ "$(id -u)" = "0" ]; then chown -R vault:vault "$DATA_DIR"; fi

# The image's entrypoint loads every file of /vault/config (vault.hcl) and drops to the `vault` user.
/usr/local/bin/docker-entrypoint.sh server &
server_pid=$!

# `vault status` exits 0 when unsealed, 2 when sealed and 1 when the server does not answer (yet).
status=1
attempt=0
while [ "$attempt" -lt 60 ]; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "[vereino-vault] the Vault server exited during start" >&2
    wait "$server_pid" || exit $?
    exit 1
  fi
  set +e
  vault status >/dev/null 2>&1
  status=$?
  set -e
  [ "$status" -ne 1 ] && break
  attempt=$((attempt + 1))
  sleep 1
done

if [ "$status" -eq 1 ]; then
  echo "[vereino-vault] Vault did not answer within 60 s; leaving it to the restart policy" >&2
elif [ "$status" -eq 0 ]; then
  echo "[vereino-vault] Vault is unsealed"
elif ! vault status -format=json 2>/dev/null | grep -q '"initialized": *true'; then
  echo "[vereino-vault] Vault is not initialised: run the setup in docs/ops/key-store.md"
elif [ -z "${VAULT_UNSEAL_KEY_1:-}" ] || [ -z "${VAULT_UNSEAL_KEY_2:-}" ]; then
  echo "[vereino-vault] VAULT_UNSEAL_KEY_1 or VAULT_UNSEAL_KEY_2 is not set: Vault stays sealed" >&2
else
  # The CLI reads a share only from an argument or a terminal, so the shares go to the HTTP API instead: `printf` is a
  # shell builtin and wget reads the body from stdin, so no share appears on a command line.
  for share in "$VAULT_UNSEAL_KEY_1" "$VAULT_UNSEAL_KEY_2"; do
    printf '{"key":"%s"}' "$share" \
      | wget -q -O /dev/null --header 'Content-Type: application/json' --post-file /dev/stdin "$VAULT_ADDR/v1/sys/unseal" \
      || true
  done
  if vault status >/dev/null 2>&1; then
    echo "[vereino-vault] Vault is unsealed"
  else
    echo "[vereino-vault] unsealing failed (wrong or mismatched shares?): Vault stays sealed" >&2
  fi
fi

wait "$server_pid"
