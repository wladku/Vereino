# Run: #740 key store, phase 1 (Vault service, boot guard, key inventory)

- **Trigger:** cezar task 24eb1e63 (`om-auto-fix-issue 740`), unattended, 2026-11-26.
- **Issue / spec / branch:** #740 (E25-S06); `.ai/specs/2026-11-26-vereino-key-store-and-key-inventory.md` (merged in
  #803, Q-K01…Q-K05 answered by the owner 2026-11-26); branch `feat/issue-740-key-store-phase-1`.
- **Goal:** phase 1 of the spec — Vault service files, boot check of DD-K03, key inventory, key-store runbook,
  compliance lines. Phases 2 and 3 ship on their own PRs.

## Steps

1. Claim: no open PR for #740, previous claim (run 2a3efd79) released after #803; assignee, `in-progress`, `🤖` claim
   comment naming this run.
2. `docker/vault/`: Dockerfile on `hashicorp/vault:1.21` pinned by digest (`sha256:4e33b1…`), `vault.hcl` (Raft,
   listener `[::]:8200` without TLS, mlock off), entry script (start, wait, auto-unseal from `VAULT_UNSEAL_KEY_1/2`),
   three policies.
3. Local drill of the image (own container and volume `vereino-vault-test-740`, removed afterwards): uninitialised start
   message; `operator init` 3/2; restart with two shares → unsealed, twice; a wrong share → stays sealed; no share in
   the logs; `kv-v2` at `secret/`, file audit to stdout, policies, `auth tune -max-lease-ttl=9600h`, app token with TTL
   ≈ 9599 h; the app token creates (cas 0) and reads a key, cannot overwrite it (cas 0 refused, value unchanged), and
   cannot delete metadata (`permission denied`, capabilities `deny`); snapshot with the snapshot token; `operator
   rotate`; key still readable; root token revoked.
4. Boot check `KEY_STORE_RULES` + Vault-timeout warning in `packages/app/scripts/vereino-boot-env.mjs`, unit tests.
5. Docs: `docs/ops/key-store.md` (new), `docs/compliance/key-inventory.md` (new), `deploy.md`, `.env.example`,
   `BACKWARD_COMPATIBILITY.md`, `monitoring.md` (log filters), `asvs-checklist.md` (V11.1, A-3),
   `asvs-requirements.md` (V11.1.1, V11.1.2), compliance `README.md`, `processors.md`, `ropa.md`.
6. Spec status `In progress` + changelog file; lesson `vault-container-unseal-and-config-dir`.

## Decisions

- **Derived mode refuses `VAULT_ADDR`/`VAULT_TOKEN`.** Not spelled out in DD-K03, but it is the mixed state DD-K02 and
  the lesson `vault-kms-fault-writes-plaintext-and-fallback-key-is-the-pepper` warn about (Vault plus a derived
  fallback). No environment sets them today (grep of scripts, CI and `.env.example`), so nothing breaks.
- **`vault` mode also refuses `TENANT_DATA_ENCRYPTION` off:** the platform then uses the noop KMS and writes plaintext.
- **`VAULT_KV_PATH` unset is accepted:** the platform default is `secret/data`, the path the policy grants.
- **Audit device at setup, not in `vault.hcl`:** enabled once with `vault audit enable file file_path=stdout` and kept
  in Raft; recorded as a deviation in the spec changelog.
- **Unseal through the HTTP API:** the CLI cannot read a share from a pipe, and an argument shows in `ps` (lesson).
- **Policies in `/vault/policies`, not `/vault/config`:** the image's entrypoint loads every file of `/vault/config` as
  server configuration (lesson).
- **No `VEREINO_KEY_STORE=vault` before phase 2:** the runbook says so; the fail-closed guard (DD-K12) is phase 2.

## Commands and results

- `yarn test:scripts` → `pass 643`, `fail 0`; `vereino-boot-env.mjs` 100 % lines, branches, functions (first run
  98.88 % branches: an unreachable `?? ''`, removed).
- `yarn lessons:check` → valid.
- `yarn verify` → see *Gate* below.
- No integration test: phase 1 adds no route, command or page; its tests are the boot-env unit tests (spec phase 1).

## Gate

- First `yarn verify`: failed at `format:check` (`packages/app/scripts/__tests__/vereino-boot-env.test.mjs is not formatted`); `yarn format`, then `yarn verify --from format:check` → `[verify] all 17 step(s) passed` (the steps before it had passed in the first run: generate, typecheck ×3, lint, secrets:check).
- `yarn guard` → "No blocking findings."

## Open problems / next steps

- Owner: phase 1 exit gate — create the Vault service in staging and production (`docs/ops/key-store.md` *Setup*),
  restart check, dates in `key-inventory.md` *Environments*; approve `key-inventory.md`.
- Phase 2 (own PR): fail-closed guard (DD-K12, upstream report first), `foundation encryption-keys` commands and the
  tenant-id listing with its `AGENTS.md` entry, Vault in the integration harness, backup snapshots, cutover, drill.
- Phase 3 (own PR): `delete-club` step 5, rotation drill, ASVS A-3 closed.
