---
title: "The Vault image loads all of /vault/config, and its CLI cannot read an unseal share from a pipe"
modules: ["platform"]
areas: ["integration"]
topics: ["vault", "docker", "key-store", "secrets"]
---

# The Vault image loads all of /vault/config, and its CLI cannot read an unseal share from a pipe

**Context**: Building the key-store service (`docker/vault/`, #740, 2026-11-26) with the official `hashicorp/vault`
image and an entry script that unseals Vault from two Shamir shares held in environment variables.

**Problem**: (1) The image's `docker-entrypoint.sh server` already passes `-config=/vault/config` (the whole
directory); adding `-config=/vault/config/vault.hcl` loads the file twice and the server dies with
`listen tcp …:8200: bind: address already in use`. Any extra file in `/vault/config` (a policy, notes) is parsed as
server configuration too. (2) `vault operator unseal` takes a share only as an argument or from a terminal: piped into
stdin it fails ("attempted to pipe a value"), and `-` is taken as the share itself. Passing the share as an argument
shows it in `ps`.

**Rule**: Start the server with `docker-entrypoint.sh server` and no `-config`, and keep only server configuration in
`/vault/config` (policies go to another directory, e.g. `/vault/policies`). Unseal from a script through the HTTP API
with the body on stdin: `printf '{"key":"%s"}' "$share" | wget -q -O /dev/null --header 'Content-Type: application/json'
--post-file /dev/stdin "$VAULT_ADDR/v1/sys/unseal"` (`printf` is a shell builtin, so the share is on no command line).
Drill init, restart and a wrong share in a local container before documenting the runbook.

**Applies to**: `docker/vault/Dockerfile`, `docker/vault/vereino-vault-entry.sh`, `docs/ops/key-store.md`.
