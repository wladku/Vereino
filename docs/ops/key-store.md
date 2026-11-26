# Key store (HashiCorp Vault)

Issue #740 (E25-S06), spec [`2026-11-26-vereino-key-store-and-key-inventory.md`](../../.ai/specs/2026-11-26-vereino-key-store-and-key-inventory.md).
Owner decision 2026-11-26: HashiCorp Vault as a service in the same Railway project (EU West), read through the
platform's Vault adapter; no new sub-processor. Every key and secret of the instance, with owner and rotation period,
is in [`key-inventory.md`](../compliance/key-inventory.md).

| | |
|---|---|
| What | one Vault node (`docker/vault/Dockerfile`, Vault 1.21 pinned by digest), Raft storage on a Railway volume |
| Holds | one data-encryption key (DEK) per tenant at `secret/data/tenant_key_<tenantId>` (KV v2, field `key`) |
| Reached by | app, worker and scheduler on the private network (`http://<vault private domain>:8200`), token policy `vereino-app` |
| Unseal | automatic after every restart from two of three Shamir shares (DD-K09) |
| State of the rollout | **phase 1**: the service runs in staging and production, the app does not use it yet (`VEREINO_KEY_STORE` unset = `derived`). The cutover (phase 2) waits for the fail-closed write guard (DD-K12) and the `encryption-keys` commands; do **not** set `VEREINO_KEY_STORE=vault` before phase 2 lands |

## Files

| File | Purpose |
|---|---|
| `docker/vault/Dockerfile` | the service image: the official Vault image, `vault.hcl`, the entry script, the policies in `/vault/policies/` |
| `docker/vault/vault.hcl` | Raft storage at `/vault/data/raft`, listener on `[::]:8200` without TLS (private network only, see *Security* below), mlock off |
| `docker/vault/vereino-vault-entry.sh` | starts the server, waits for it, unseals it from `VAULT_UNSEAL_KEY_1` and `VAULT_UNSEAL_KEY_2` through the HTTP API (shares on stdin, never on a command line or in a log), then waits on the server |
| `docker/vault/policies/vereino-app.hcl` | app, worker, scheduler: `create`, `read` on `secret/data/tenant_key_*`; no update, no delete (BR-K2) |
| `docker/vault/policies/vereino-snapshot.hcl` | backup job: `read` on `sys/storage/raft/snapshot` |
| `docker/vault/policies/vereino-key-admin.hcl` | operator token (password manager only): import, inspect and delete tenant keys |

The entry script prints one line per start, which the log filters of [`monitoring.md`](monitoring.md) match:
`[vereino-vault] Vault is unsealed`, `… is not initialised …`, `… VAULT_UNSEAL_KEY_1 or VAULT_UNSEAL_KEY_2 is not set …`,
`… unsealing failed …`, `… did not answer within 60 s …`, `… the Vault server exited during start`.

## Setup of an environment (once; staging first, then production)

Two people take part: the owner and the second person who holds the backup `age` key ([`backups.md`](backups.md)).
Every value marked *secret* below goes straight into both password managers and nowhere else (no chat, no issue, no
terminal history: run the commands in the service shell, which keeps no history after the session).

1. **Service.** In the Railway project add a service from this repository: *Settings → Build → Dockerfile path*
   `docker/vault/Dockerfile`; *Settings → Networking*: **no public domain** (private network only); *Deploy → Restart
   policy*: always. Add a volume mounted at `/vault/data` (1 GB is plenty). Variable
   `VAULT_API_ADDR=http://${{RAILWAY_PRIVATE_DOMAIN}}:8200`. Railway **volume backups of this volume stay off**
   (DD-K10): the nightly Vault snapshot is the backup, and a volume backup would keep deleted keys longer than 30 days.
   Name the service `vault`, so its private domain is `vault.railway.internal`.
2. **Deploy.** The log shows `[vereino-vault] Vault is not initialised: run the setup in docs/ops/key-store.md`.
3. **Initialise.** Open a shell on the service (`railway ssh --service vault`) and run
   `vault operator init -key-shares=3 -key-threshold=2`. It prints three unseal shares and the initial root token
   (*secret*). Store share 1, share 2, share 3 and the root token in both password managers, each as its own entry
   named with the environment (`vereino-production vault unseal share 1`, …).
4. **Unseal once by hand** in the same shell: `vault operator unseal` twice (it asks for a share; paste share 1, then
   share 2). Then, with `export VAULT_TOKEN=` followed by the root token:
   ```sh
   vault secrets enable -path=secret kv-v2
   vault audit enable file file_path=stdout
   vault policy write vereino-app /vault/policies/vereino-app.hcl
   vault policy write vereino-snapshot /vault/policies/vereino-snapshot.hcl
   vault policy write vereino-key-admin /vault/policies/vereino-key-admin.hcl
   vault auth tune -max-lease-ttl=9600h token/
   ```
   (The image carries the policy files of `docker/vault/policies/`.) The audit device writes one JSON line per
   request to the service log with every secret value HMAC'd; Railway keeps it 30 days.
5. **Tokens** (DD-K13; each *secret*):
   ```sh
   vault token create -orphan -policy=vereino-app -ttl=9600h -display-name=vereino-app
   vault token create -orphan -policy=vereino-snapshot -ttl=9600h -display-name=vereino-snapshot
   vault token create -orphan -policy=vereino-key-admin -ttl=9600h -display-name=vereino-key-admin
   ```
   9600 h = 400 days, non-periodic: the platform does not renew tokens, and the inventory rotates them every 12 months.
   Store the app token and the snapshot token as **sealed** Railway variables later (the app token on app, worker and
   scheduler at the cutover; the snapshot token on the backup job in phase 2). The key-admin token stays in the password
   managers only and is given to a single shell run when needed (`VAULT_ADMIN_TOKEN`, phase 3).
6. **Auto-unseal.** Set `VAULT_UNSEAL_KEY_1` and `VAULT_UNSEAL_KEY_2` (shares 1 and 2) on the **Vault service only**
   and seal both (*Seal* in the variable's menu). Share 3 stays in the password managers only.
7. **Revoke the root token:** `vault token revoke -self`. A root token is generated again from the shares only for an
   administrative task (*Root token for a task* below) and revoked right after.
8. **Exit check** (phase 1 exit gate): restart the service in Railway; the log shows `[vereino-vault] Vault is
   unsealed`, and `vault status` in the service shell shows `Sealed false`, `Storage Type raft`. Record the date in
   [`key-inventory.md`](../compliance/key-inventory.md) (*Environments*).

Drilled on 2026-11-26 against a local container of `docker/vault/Dockerfile` (init 3/2, auto-unseal across restarts,
wrong share leaves it sealed, the `vereino-app` token can create and read but not overwrite or delete a key, snapshot
with the snapshot token, `vault operator rotate`, root token revoked) — the staging and production runs are the
owner's (phase 1 exit gate).

## Root token for a task

Barrier rotation, a policy change or a rekey needs a root token, which does not exist between tasks:

```sh
vault operator generate-root -init            # prints a nonce and a one-time password (OTP)
vault operator generate-root                  # twice, one share each (the second person enters theirs)
vault operator generate-root -decode=<encoded token> -otp=<OTP>
export VAULT_TOKEN=<decoded root token>
# … the task …
vault token revoke -self
```

## Rotation (REQ-K05, DD-K06)

| What | When | How | Downtime |
|---|---|---|---|
| Barrier key (encrypts everything Vault stores) | every 12 months | root token for a task, then `vault operator rotate` | none: old terms stay readable by Vault, no DEK changes |
| App token `vereino-app` | every 12 months, or at once when `encryption-keys status` (phase 2) warns 30 days before expiry | create a new token (step 5), set it on app, worker and scheduler, deploy (rolling), check, then `vault token revoke <old token accessor>` | none |
| Snapshot and key-admin tokens | every 12 months | as the app token | none |
| Unseal shares | when a share holder leaves or a share may have leaked | root token for a task, `vault operator rekey -init -key-shares=3 -key-threshold=2`, two shares; replace the two service variables and the password-manager entries | none (Vault stays unsealed) |
| Tenant DEKs | only on suspected compromise of a DEK | platform `mercato entities rotate-encryption-key`, club in maintenance (spec DD-K06c; integration credentials need re-entry) | the club's data, while it runs |

Record every rotation in [`key-inventory.md`](../compliance/key-inventory.md) (*Rotation log*).

## Security

- **Network.** No public domain. The listener has no TLS of its own: Railway's private network is
  WireGuard-encrypted (D-039). Recorded in the inventory as a decision to revisit with ASVS V12.3 (#735).
- **Unseal shares next to Vault.** Two shares are sealed variables of the Vault service, so anyone who controls the
  Railway project can unseal it — the same trust boundary as today's `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (A-K03,
  confirmed 2026-11-26). Railway two-factor sign-in (P-1a) protects it.
- **Least privilege.** The app token cannot delete or overwrite a key; only the key-admin token, given to one shell
  run, can delete one (DD-K05).
- **Fail-open writes.** In the installed platform a Vault fault makes writes of encrypted fields go out in plaintext
  (lesson `vault-kms-fault-writes-plaintext-and-fallback-key-is-the-pepper`). This is why the cutover waits for the
  fail-closed guard of phase 2 (DD-K12) and why `VAULT_REQUEST_TIMEOUT_MS` is 3000 in `vault` mode (the boot check
  warns below it).

## Boot check

`packages/app/scripts/vereino-boot-env.mjs` (run by the start scripts and `src/instrumentation.ts`) knows
`VEREINO_KEY_STORE` (DD-K03): in `vault` mode it requires `VAULT_ADDR`, `VAULT_TOKEN` and `LOOKUP_HASH_PEPPER`, requires
`VAULT_KV_PATH` (if set) to be `secret/data`, and refuses `TENANT_DATA_ENCRYPTION_FALLBACK_KEY`,
`TENANT_DATA_ENCRYPTION_KEY`, `ALLOW_DERIVED_KMS_FALLBACK` and `TENANT_DATA_ENCRYPTION` off. In `derived` mode (the
default) it refuses `VAULT_ADDR` and `VAULT_TOKEN`, so no environment can run Vault with a derived-key fallback behind it.

## Still to come

- **Phase 2:** the fail-closed write guard (DD-K12), `yarn mercato foundation encryption-keys status|import-derived|verify`,
  the Vault container in the integration harness, the Vault snapshot in the nightly backup and its restore, the cutover
  of staging and then production, the restore drill.
- **Phase 3:** `club_core delete-club` step 5 deletes a club's key; the rotation drill (TEST-K03); ASVS A-3 closed.
