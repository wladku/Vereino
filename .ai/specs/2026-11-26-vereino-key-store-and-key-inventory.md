# Key store with per-club keys and a key inventory

**Date**: 2026-11-26
**Status**: In progress — key store chosen by the owner on #740 (2026-11-26: HashiCorp Vault in the same Railway project, EU, through the platform's Vault adapter; the migration and new required variables named here are approved as this spec defines them). Q-K01…Q-K05 answered by the owner on 2026-11-26 (PR #803): all recommended defaults accepted.

Issue: #740 (E25-S06, epic #734). Parent decision: Q-M07 and DD-M09 of
[`2026-11-22-vereino-many-clubs-one-instance.md`](2026-11-22-vereino-many-clubs-one-instance.md). ASVS open item A-3
([`docs/compliance/asvs-checklist.md`](../../docs/compliance/asvs-checklist.md)).

## TLDR

Production encrypts each club's personal data with a per-tenant key that the platform **derives** from one instance
secret, `TENANT_DATA_ENCRYPTION_FALLBACK_KEY`. Anyone holding that secret holds every club's key, and no club's key can
be destroyed. Before a second club brings real data (Q-M07), the tenants' data-encryption keys (DEKs) move into a
**HashiCorp Vault** service in the same Railway project, read through the adapter the platform already ships
(`HashicorpVaultKmsService`, `@open-mercato/shared/lib/encryption/kms.ts`). The existing club's derived key is
**imported into Vault byte for byte**, so nothing is re-encrypted and nothing stops. Every new club gets a random key,
and `club_core delete-club` destroys it (step 5 of the many-clubs deletion targets). A key inventory in
`docs/compliance/key-inventory.md` lists every key and secret of the instance with owner, location and rotation period,
closing ASVS item A-3. The database schema does not change.

## Problem Statement

- **One secret opens every club.** `DerivedKmsService` computes each tenant key as
  `PBKDF2-SHA512(SHA-256(secret), tenantId, 310 000)`. The secret is in Railway variables and in the team password
  manager. Its leak, together with a database dump, exposes every club, and it cannot be rotated: changing it makes
  all ciphertext unreadable (`docs/ops/deploy.md` says "never change it on a running environment").
- **No crypto-shredding.** A derived key can always be recomputed, so deleting a club cannot make its encrypted columns
  in the 12 monthly backups unreadable (DD-M09, GDPR art. 28(3)(g): a processor deletes on termination).
- **No inventory.** ASVS V11.1 is a **gap**: no written list of keys, owners, locations and rotation periods (A-3).
  The list exists only in people's heads and in `deploy.md` fragments.
- **The pepper is hidden.** `LOOKUP_HASH_PEPPER` is unset in production, so the platform keys every lookup hash
  (e-mail, PESEL, external ids: `hashForLookup` in `shared/lib/encryption/aes.ts`) with
  `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` instead. Removing the fallback key without pinning the pepper first would break
  every lookup by e-mail, including sign-in.

## Overview and Success Measures

- **Primary outcome:** before the second club's real data, production runs with `VEREINO_KEY_STORE=vault`: every
  tenant DEK is read from Vault, no derived-key fallback is configured, and a deleted club's key is gone from Vault and,
  after the snapshot retention (30 days), from every Vault snapshot.
- **Leading indicators:** the staging cutover and the restore drill after a rotation are recorded in
  `docs/ops/restore-drills.md`; TEST-K01 to TEST-K04 pass in CI.
- **Baseline:** one club, derived keys, no key store, no inventory (2026-11-26).
- **Market / product reference:** envelope encryption as in AWS KMS / Google Cloud KMS and Vault's own barrier
  (a root key protects data keys; data keys protect data). Adopted: per-tenant DEKs held by the key store, key
  destruction as the deletion mechanism ("crypto-shredding"), periodic rotation of the wrapping layer, which needs no
  data rewrite. Rejected for now: a managed cloud KMS (new sub-processor, owner's decision), Vault Transit
  encrypt-as-a-service (every field read becomes a network call; the platform adapter reads KV-stored DEKs).
  OpenBao (the MPL-licensed fork of Vault, same API) stays a drop-in alternative if the Business Source Licence of
  Vault ≥ 1.14 ever becomes a problem; self-hosting Vault for Vereino's own use is permitted by that licence.

## Goals

- **REQ-K01** — Each club's DEK is a separate key held in the key store; two clubs never share a key, and the app
  never derives a key from an instance secret in production.
- **REQ-K02** — The existing club moves from its derived key to a stored key without downtime, without rewriting any
  ciphertext, and with a rollback that restores the previous state by changing variables only.
- **REQ-K03** — Deleting a club destroys its key in the key store; after that its encrypted columns, in the live
  database and in every database backup, cannot be decrypted. Snapshots of the key store keep a deleted key for at
  most 30 days.
- **REQ-K04** — A database dump restores with the right keys: every backup has a key-store snapshot taken after it, and
  the restore runbook restores both.
- **REQ-K05** — The keys have rotation periods that are actually followed: the key store's wrapping key and the app's
  access token rotate on a schedule without downtime; the DEK rotation policy and its limits are written down.
- **REQ-K06** — An inventory of every key and secret of the instance (owner, location, protection, rotation period,
  what breaks if it is lost or leaked) lives in `docs/compliance/key-inventory.md` and closes ASVS A-3.
- **REQ-K07** — Production refuses to start in an unsafe key configuration (key store mode without Vault variables,
  without a pinned lookup pepper, or with a derived-key fallback still set).

## Non-goals

- Customer-managed keys per club (Enterprise, later; #740 *Out of scope*).
- A managed cloud KMS, Vault auto-unseal through a cloud KMS, or Vault Enterprise features (namespaces, HSM, DR
  replication).
- Re-keying lookup hashes with a new pepper (`LOOKUP_HASH_PEPPER` keeps today's value; the platform has no pepper
  rotation, see Risks).
- A Vereino-built data re-encryption engine. Rotating a DEK means rewriting every column sealed under it; that stays
  the platform's job (`mercato entities rotate-encryption-key`) and its gaps are filed upstream (DD-K07).
- Moving other secrets (JWT, Stripe, backup key) into Vault. They are inventoried and their rotation is described;
  where they live does not change in this spec.

## Proposed Solution

Vault runs as a private Railway service with integrated (Raft) storage on a Railway volume. The app, the worker and
the scheduler reach it on the private network with a token whose policy can read and create tenant keys and nothing
else. The platform adapter stores each tenant DEK at `<VAULT_KV_PATH>/tenant_key_<tenantId>` in a KV v2 engine,
creates it with check-and-set on first use and caches it for 15 minutes.

The existing club's key is copied into Vault before the app is switched over, so the switch only changes where the
same key bytes come from. New clubs get a random key at creation (`setupInitialTenant` → `kms.createTenantDek`).
`club_core delete-club` deletes the key's KV metadata (all versions) as its step 5. The nightly backup job adds a
Vault snapshot, encrypted with the same `age` recipients, to every database dump.

### Design Decisions and Alternatives

| Decision | Rationale | Alternative considered | Why rejected / deferred |
|---|---|---|---|
| **DD-K01** HashiCorp Vault, one node, Raft storage on a Railway volume, in the production Railway project (EU West); a second instance in the staging project. KV v2 engine mounted at `secret/`; the app uses the platform's `HashicorpVaultKmsService` unchanged | Owner's decision (#740, 2026-11-26): no new sub-processor, the platform adapter exists. One node is enough at this size: the app caches each DEK for 15 minutes, and Railway restarts the service on failure | Vault HA cluster (3 nodes); a managed KMS | HA triples cost and operations for a load of a few reads per club per 15 minutes; a managed KMS is a new sub-processor (owner rejected) |
| **DD-K02** The existing club's DEK is **imported**: a Vereino command reads the key the platform derives today and writes the same bytes into Vault with check-and-set 0, then reads it back and compares fingerprints. The app switches to Vault in one deploy that sets the Vault variables and removes the fallback secret together | No ciphertext is rewritten, so there is no window in which some rows are sealed under a key the app does not have; rollback is the previous variable set. Switching in one deploy avoids the mixed state where a Vault outage makes `FallbackKmsService` silently write new rows under the derived key while older rows use the stored one | Rotate the club to a random key during the move (`rotate-encryption-key --old-key`) | The platform rotation walks only encryption-map columns (audit-log columns included). Integration credentials such as the club's Stripe keys are sealed separately with the DEK (`integrations/lib/credentials-service.ts`) and would stay under the old key and become unreadable; index documents are not verified. Re-encryption also makes the club's data unreadable while it runs |
| **DD-K03** `VEREINO_KEY_STORE` (`derived` default, `vault`) states the intended mode; in `vault` mode the boot check requires `VAULT_ADDR`, `VAULT_TOKEN` and `LOOKUP_HASH_PEPPER` and refuses `TENANT_DATA_ENCRYPTION_FALLBACK_KEY`, `TENANT_DATA_ENCRYPTION_KEY` and `ALLOW_DERIVED_KMS_FALLBACK` | With a fallback secret set, the platform answers a missing or unreachable Vault key with a derived one: a Vault outage would write rows under another key, and a deleted club's key would come back. The pepper must be pinned explicitly because today it silently comes from the fallback key | Rely on the deploy runbook only | A forgotten variable silently disables crypto-shredding; the boot check is the place the repository already uses for this (S8.10, `vereino-boot-env.mjs`) |
| **DD-K04** `LOOKUP_HASH_PEPPER` is set to the current value of `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` before the fallback is removed, and never changes afterwards | Keeps every keyed lookup hash (sign-in by e-mail, PESEL, external ids) valid; the platform has no pepper rotation | A new pepper and a backfill of all `*_hash` columns | No platform tool; a missed column breaks sign-in or duplicate detection. Consequence accepted in DD-K08 |
| **DD-K05** Key deletion: `club_core delete-club` step 5 deletes the key's KV v2 metadata, `secret/metadata/tenant_key_<tenantId>` (every version; the mount of `VAULT_KV_PATH` with `data` replaced by `metadata`), with an **operator token** given to that one command run (`VAULT_ADMIN_TOKEN`, from the password manager, never stored in Railway); the app token's policy has no delete. A dry run prints whether the key exists and its fingerprint | Least privilege: a compromised app cannot destroy keys. The command is shell-only already (many-clubs phase 4) | Give the app token delete | A bug or an attacker in the app could make clubs' data unreadable |
| **DD-K06** Rotation layers (REQ-K05): **(a)** Vault's barrier key (`vault operator rotate`) every 12 months — online, no data rewrite; **(b)** the app's Vault token every 12 months — new token, rolling deploy, then revoke the old one; **(c)** DEKs are rotated only on suspected compromise of a DEK, with the platform's rotation command and the club in maintenance; no scheduled DEK rotation | AES-256-GCM with random 96-bit IVs stays far below the 2^32-messages-per-key limit for a club's lifetime (NIST SP 800-38D); rotating the wrapping layer is what limits the exposure of a stored key. Online rotation of the data layer needs two keys readable at once, which the platform does not have (one DEK per tenant, decrypt without key id) | Scheduled DEK rotation | Every run rewrites all of a club's encrypted columns and makes them unreadable while it runs; the gap is filed upstream (DD-K07) — A-K01 (confirmed 2026-11-26) |
| **DD-K07** Platform gaps are filed upstream, not patched locally: fail-closed writes while no DEK is reachable (DD-K12), versioned DEKs with a key id in the envelope (online DEK rotation), rotation of DEK-sealed data outside encryption maps (integration credentials), Vault token renewal, AppRole login | Repository rule: never edit `node_modules`, report platform gaps upstream | Eject the KMS | Ejecting a security primitive multiplies upgrade risk |
| **DD-K08** The existing club keeps its imported key, which stays derivable from the pinned pepper value: its data is **not** crypto-shreddable until the platform can re-key it. Every club created after the cutover has a random key and is | It is the owner's own pilot club; the alternative needs a platform capability that does not exist | Rotate the first club anyway | See DD-K02 — A-K02 (confirmed 2026-11-26) |
| **DD-K09** Unseal: Vault is initialised with 3 Shamir shares, threshold 2. Two shares are sealed variables of the **Vault service only** (`VAULT_UNSEAL_KEY_1`, `VAULT_UNSEAL_KEY_2`) and an entry script unseals it after every restart; all three shares and the root token's recovery are in the password managers of the owner and a second person; the root token is revoked after setup | Railway restarts services on deploys and failures; manual unsealing would make every restart an outage of encrypted data after the 15-minute cache. The protection is the same trust boundary as today's fallback secret (the Railway project), with the gains of random per-club keys, key deletion, an audit log and a revocable app token | Manual unseal by a person; auto-unseal through a cloud KMS | Manual: outage until a person reacts; cloud KMS: a new sub-processor — A-K03 (confirmed 2026-11-26) |
| **DD-K10** Vault snapshots: the nightly backup job runs `vault operator raft snapshot save` **after** `pg_dump`, encrypts it with the same `age` recipients and uploads it as `vault/vereino-vault-YYYY-MM-DD.snap.age`; snapshots are kept **30 days** (daily only, no monthly copies). After `create-club` the runbook checks the key with `encryption-keys status --club` and takes an on-demand snapshot, so a new club's key never depends on the next night; deletion needs none. Railway volume backups of the Vault volume stay **off**. A DEK rotation (DD-K06c) writes a new KV version and keeps the old ones (KV v2 keeps 10 by default), so every snapshot after it still holds the key of older dumps | A snapshot taken after the dump holds every key the dump needs: keys of live clubs are never deleted, only versioned. 30 days bounds how long a deleted key survives in snapshots (REQ-K03) while covering the 30 daily dumps; monthly dumps restore with the newest snapshot, after a rotation with `vault kv rollback` to the version of the dump's date in the scratch Vault | Snapshot retention equal to the dumps' 12 months | A deleted club's key would survive 12 months, defeating crypto-shredding for that period |
| **DD-K11** Key commands work on **every tenant**, not only clubs: the library tenant (`VEREINO_LIBRARY_*`) and any other tenant has encrypted rows (audit logs at least). `import-derived`, `status` and `verify` list tenant ids from the platform `tenants` table (ids only, shell only); this is a new read-only system-scope statement, recorded in `AGENTS.md` with the code in phase 2. Vereino declares no system-scoped encryption map (`keyScope: 'system'`), so no `system:<entityId>` key exists; `status` fails if one appears | A tenant left out of the import gets a new random key at its first write after the cutover, while its older rows stay sealed under the derived key that is no longer configured: two keys, half its data unreadable | Iterate club slugs through `lookupClubForOffboarding` | Misses every tenant without a club slug — A-K07 (confirmed 2026-11-26) |
| **DD-K12** **Fail-closed gate.** In the installed platform a Vault fault switches encryption off for writes: `encryptEntityPayload` returns the payload unchanged when `isEnabled()` is false (one 5xx or a 1 s timeout opens the breaker for 30 s) or when no DEK comes back (an expired or revoked token answers 403). Derived mode never reaches these paths. The production cutover (phase 2) waits until writes of encryption-map fields **fail** while no DEK is reachable: preferably an upstream fix (encryption mode `unavailable` refuses the write), otherwise a Vereino guard that rejects the flush of an encryption-map field whose value is not ciphertext while `VEREINO_KEY_STORE=vault`, answering 503. `VAULT_REQUEST_TIMEOUT_MS` is raised to 3000 to make the breaker less jumpy | Writing personal data in plaintext during an outage would be worse than today's derived keys; the platform comment already names "callers holding secrets fail closed" as the rule (`kms.ts`, `resolveEncryptionMode`) | Accept plaintext during outages | Silent loss of encryption at rest, undetectable afterwards — Q-K04 |
| **DD-K13** App token: the token auth mount's `max_lease_ttl` is raised to 9600 h, and the app token is created non-periodic with an explicit TTL of 400 days and the `vereino-app` policy; `encryption-keys status` warns 30 days before expiry and the inventory rotates it every 12 months | Vault's default maximum TTL is 32 days and the platform does not renew tokens (DD-K07); with DD-K12 not yet in place an expired token means plaintext writes | A periodic token renewed by a sidecar | One more moving part on Railway; renewal failure has the same effect as expiry |

## Domain Vocabulary and Business Rules

| Term / invariant | Precise meaning or rule | Source of truth | Failure behavior |
|---|---|---|---|
| DEK | The 32-byte AES-256-GCM key that seals a tenant's encrypted columns and DEK-sealed payloads | Vault KV v2 entry `tenant_key_<tenantId>`, field `key` (base64) | No DEK reachable → in the installed platform (0.9.0) writes of encryption-map fields go out **in plaintext** and reads return ciphertext; only integration credentials fail closed. DD-K12 makes a fail-closed write path a gate of the cutover |
| Barrier key | Vault's internal key that encrypts everything Vault stores, including the DEKs | Vault keyring | Rotated online; old terms stay readable by Vault |
| Key store mode | `VEREINO_KEY_STORE`: `derived` (today) or `vault` | Railway variables | Boot check refuses unsafe combinations (DD-K03) |
| Key fingerprint | First 12 hex characters of SHA-256 over the DEK's base64 string (the platform's `fingerprintDek` format, `entities/cli.ts`) | computed | Printed by commands instead of keys; never print a key |
| **BR-K1** | One DEK per club tenant; no two tenants share one (REQ-K01) | Vault | TEST-K01 |
| **BR-K2** | The app token can read and create `tenant_key_*`; only an operator token deletes | Vault policy `vereino-app` | Delete with app token → 403 |
| **BR-K3** | A key-store snapshot taken after every database dump exists for as long as the dump is in its 30 daily copies | backup bucket | Backup job fails (`backup.vault.failed`) and alerts like a failed dump |
| **BR-K4** | No production process has a derived-key fallback in `vault` mode | boot check | Refuses to start |

## Users, Permissions, and Scope

| Actor | Allowed outcomes | Scope rule | Required feature IDs |
|---|---|---|---|
| App, worker, scheduler | Read and create tenant DEKs | Vault policy `vereino-app`: `create`, `read` on `secret/data/tenant_key_*` | N/A — no ACL feature; Vault token |
| Operator (owner or second person) | Import keys, delete a club's key, rotate barrier and token, snapshot and restore | shell only (`railway run`), operator token from the password manager | N/A — shell commands |
| Backup job | Take Raft snapshots | Vault policy `vereino-snapshot`: `read` on `sys/storage/raft/snapshot` | N/A |

Trusted scope: every key operation is addressed by a tenant id that the command resolves from a club slug through the
existing approved `lookupClubForOffboarding` lookup (AGENTS.md, many-clubs phase 4); no request carries a tenant id.
The one new system-scope statement is the read-only tenant-id listing of DD-K11 (shell only, ids only, A-K07 (confirmed 2026-11-26)).

## Reuse and Ownership Map

| Capability | Reuse / extend / app-own | Existing module or new module | Integration seam | Why |
|---|---|---|---|---|
| DEK read, create, cache, fallback | reuse | `@open-mercato/shared` `kms.ts` (`createKmsService`, `HashicorpVaultKmsService`) | environment variables | The adapter exists; Vereino only configures it |
| Derived key of the existing club (import source) | reuse | `createKmsService()` with the fallback secret and no Vault variables returns the derived DEK | `getTenantDek(tenantId)` | No re-implementation of the derivation |
| Key import, existence check, deletion, fingerprint | app-own | `foundation` (`lib/key-store.ts` request building and validation; `cli.ts` commands) | Vault HTTP API (KV v2) through `fetch` with a timeout | The platform adapter cannot write a given key or delete one |
| Club key deletion at offboarding | extend | `club_core delete-club` step 5 | calls `foundation`'s public helper from `@/modules/foundation` | Many-clubs DD-M09 names this step |
| Boot check | extend | `packages/app/scripts/vereino-boot-env.mjs` | `findBootEnvProblems` | S8.10 |
| Vault snapshot in the backup | extend | `scripts/backup-dump.mjs`, `docker/backup/Dockerfile` (adds the `vault` CLI binary) | backup job | One job, one schedule, one alert |
| Rotation of DEKs | reuse (limits recorded) | `mercato entities rotate-encryption-key` | CLI | DD-K06, DD-K07 |

## Architecture and Data Flow

```text
create-club ─> setupInitialTenant ─> kms.createTenantDek ──(cas=0)──> Vault KV v2  secret/data/tenant_key_<tenant>
request ─> TenantDataEncryptionService ─> kms.getTenantDek (15-min cache) ─> Vault (private network, token vereino-app)
delete-club step 5 ─> foundation keyStore.deleteTenantKey (VAULT_ADMIN_TOKEN) ─> DELETE secret/metadata/tenant_key_<tenant>
backup job ─> pg_dump | age ─> bucket daily/ ; vault operator raft snapshot save | age ─> bucket vault/
cutover (once) ─> foundation encryption-keys import-derived ─> derived DEK (platform) ─> Vault (cas=0) ─> read back + fingerprint
```

- **Module boundaries:** `foundation` owns the key-store client because two modules use it (`foundation` CLI and
  `club_core delete-club`) and it is listed as a foundation primitive in this spec; `club_core` imports it only from
  `@/modules/foundation`.
- **Extension points:** environment variables of the platform adapter; no platform code is changed or ejected.
- **Alternatives considered:** see DD-K01 to DD-K10.
- **Compatibility:** no route, event, schema or entity changes. New CLI commands and new variables are additive;
  `derived` stays the default, so local development, CI and existing environments behave as today until switched.

## User Journeys

### Journey J-K01 — Cutover of an environment (staging first, then production)

1. Operator deploys the Vault service, initialises it (DD-K09), enables KV v2 at `secret/`, writes the policies
   `vereino-app`, `vereino-snapshot`, creates the app token and the snapshot token, revokes the root token.
2. Operator sets `LOOKUP_HASH_PEPPER` to the current `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` value and deploys
   (no behavior change: the pepper had that value already).
3. Operator runs `yarn mercato foundation encryption-keys import-derived --all --dry-run`, then without `--dry-run`,
   passing the target in `VEREINO_KEY_IMPORT_VAULT_ADDR` and `VEREINO_KEY_IMPORT_VAULT_TOKEN` for that run only. The
   command refuses to start when `VAULT_ADDR` or `VAULT_TOKEN` is set in its environment, so its derived source
   (`createKmsService()` with only the fallback secret) can never be Vault itself and a pre-existing different key is
   reported as `conflict`. It prints, per tenant (clubs by slug, other tenants by id), `imported` / `present (same
   fingerprint)` / `conflict (different key)` and stops on the first conflict.
4. Operator runs `encryption-keys status --all` and `verify --all` with **exactly** the variable set the cutover deploy
   will use (`VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_KV_PATH`, no fallback): every tenant must be `stored`, and every row of
   every encryption map must decrypt with the key from Vault. Output is counts, never values. The boot check also
   requires `VAULT_KV_PATH` to be `secret/data`, the path the policy grants, so a typo cannot create new keys elsewhere.
5. Operator sets `VEREINO_KEY_STORE=vault`, `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_KV_PATH`, removes
   `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (copy stays in the password manager) on app, worker and scheduler, and deploys
   once. Failure: the boot check names any missing or forbidden variable; the previous deployment keeps serving.
6. Rollback: restore the previous variable set and redeploy; keys are the same bytes, nothing to undo in data.

### Journey J-K02 — Club deletion destroys the key

`delete-club --slug <slug> --confirm <slug>` with `VAULT_ADMIN_TOKEN` set runs steps 1–4 of the many-clubs deletion
targets, then step 5 deletes the key metadata and prints `key: deleted (fingerprint …)`. Before step 1 it checks, in
`vault` mode, that Vault answers and that the operator token has `delete` on the key's metadata path
(`sys/capabilities-self`); otherwise it stops with `key_store_token_missing` or `key_store_unreachable`, so a club is
never half-deleted with a surviving key. A stale job of the deleted tenant may later create a **new** random key at the
same path (cas 0 on an empty path); it opens none of the old ciphertext, and `status` lists it as `orphan` (no tenant
row) for deletion. In `derived` mode step 5 prints `key: not stored (derived)`, as today. No extra snapshot is needed: the next nightly snapshot no longer holds the
key, and older ones expire within 30 days.

### Journey J-K03 — Restore a dump

Restore the database dump and the Vault snapshot of the same night (or any later one) into a scratch PostgreSQL and a
scratch Vault, point a scratch app at both, run `encryption-keys verify --all`. A dump older than 30 days restores with
the newest snapshot. The drill is recorded in `docs/ops/restore-drills.md`.

## UI and Interaction Contracts

N/A — no page, widget or menu changes; the feature is configuration, CLI commands and runbooks.

## Data Models

No entity or migration. Key material lives only in Vault:

| Vault path | Content | Written by | Deleted by |
|---|---|---|---|
| `secret/data/tenant_key_<tenantId>` | `{ key: <base64 32 bytes> }`, KV v2 versions | platform `createTenantDek` (cas 0) or `import-derived` (cas 0) | `delete-club` step 5 (`secret/metadata/…`) |

The "migration approved by the owner" on #740 is this **key migration** (J-K01), not a database migration.

## API, Command, and Error Contracts

No HTTP route. New and changed shell commands (`yarn mercato …`, run with `railway run` in an environment):

| Command | Input | Output | Errors |
|---|---|---|---|
| `foundation encryption-keys status` | `--club <slug>` or `--all` | mode, Vault reachable/sealed, token expiry, per tenant: `stored` / `missing` / `derived`, fingerprint; keys without a tenant as `orphan` | `key_store_unreachable`; exit 1 on `missing` or a token expiring within 30 days |
| `foundation encryption-keys import-derived` | `--club <slug>` or `--all`, `--dry-run` | per club `imported` / `present` / `conflict` + fingerprints | `conflict` stops the run (never overwrites); `fallback_secret_missing`; `key_store_unreachable` |
| `foundation encryption-keys verify` | `--club <slug>` or `--all` | per club and encryption map: rows checked, rows that decrypt, rows that do not | exit 1 if any row does not decrypt |
| `club_core delete-club` (changed) | as today | adds step 5 line `key: deleted|not stored (derived)|absent` | `key_store_token_missing`, `key_store_unreachable` (checked before step 1 in `vault` mode) |

`foundation/lib/error-codes.ts` declares the new codes. Every command prints fingerprints only; a key, token or share
never reaches a log line. Commands are idempotent: `import-derived` on an imported club prints `present`.

Contract surfaces: new CLI commands and variables are additive (`BACKWARD_COMPATIBILITY.md`, CLI and configuration
tier); `delete-club` gains a refusal only in the new `vault` mode.

## Events, Jobs, Notifications, and Cross-Module Flows

| Trigger | Producer | Consumer | Side effect | Retry / idempotency / audit behavior |
|---|---|---|---|---|
| Nightly backup | backup job | bucket | Vault snapshot after the dump (DD-K10) | A failed snapshot fails the job: `backup.vault.failed` alert (E18-S04 signal), the dump stays uploaded |
| Vault health | monitoring | operator | `/v1/sys/health` sealed or down → alert | Uptime check as for the app (`docs/ops/monitoring.md`) |
| Vault audit device | Vault | Railway logs | one JSON line per request (HMAC'd values) | 30 days of logs (Railway Pro) |

## Security, Privacy, and Compliance

- **Authorization:** Vault policies per actor (table above); the root token is revoked after setup and regenerated from
  the shares only for an emergency.
- **Tenant isolation:** one key per tenant; a key is addressed by the tenant id resolved from the slug by the approved
  offboarding lookup.
- **Sensitive data:** DEKs never leave Vault except into process memory; commands print fingerprints. Vault listens on
  the private network only (no public domain); Railway's private network is WireGuard-encrypted (D-039), so the
  listener runs without its own TLS — recorded in the inventory as a decision to revisit with ASVS V12.3 (#735).
- **Abuse and failure modes:** a Vault fault must not turn encryption off for writes (DD-K12, TEST-K05); a compromised
  app can read keys (as today) but not delete them; a compromised Railway
  project exposes the unseal shares (DD-K09, A-K03 (confirmed 2026-11-26)); a forgotten fallback secret is refused at boot.
- **GDPR:** no new sub-processor (Vault runs on Railway, P-1, EU West); `processors.md` and `ropa.md` get one line each
  saying where keys are held; crypto-shredding becomes part of the deletion evidence in `retention.md`.

## Key inventory (content of `docs/compliance/key-inventory.md`)

| Key / secret | Protects | Location | Owner | Rotation period | Rotation method | Loss / leak impact |
|---|---|---|---|---|---|---|
| Tenant DEK (one per club) | the club's encrypted columns, integration credentials (Stripe keys), audit payloads, index documents | Vault KV | owner | on suspected compromise (DD-K06c) | platform `rotate-encryption-key`, club in maintenance | loss: the club's encrypted data; leak + dump: that club only |
| Vault barrier key | every DEK at rest in Vault | Vault keyring | owner | 12 months | `vault operator rotate` (online) | — |
| Vault unseal shares (3, threshold 2) | the barrier key | 2 as sealed variables of the Vault service, 3 in password managers | owner + second person | on a person leaving or a suspected leak | `vault operator rekey` | loss of 2: Vault unusable → restore fails; leak of 2 + volume: all DEKs |
| Vault root token | Vault administration | revoked; regenerated from shares when needed | owner | per use | `generate-root`, revoke after | — |
| Vault app token (`vereino-app`) | DEK read/create | sealed variable of app, worker, scheduler | owner | 12 months (token TTL 400 days with raised `max_lease_ttl`, alert at 30 days left) | new token → rolling deploy → revoke old | expiry: encryption unavailable; leak: DEK read |
| Vault snapshot token, operator token | snapshots / key deletion | backup job variable / password manager only | owner | 12 months | as app token | — |
| `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` | derivation root of the first club's key | password manager only after cutover | owner | never (equals the pepper) | — | leak: first club's key (DD-K08) |
| `LOOKUP_HASH_PEPPER` | keyed lookup hashes (e-mail, PESEL, external ids) | sealed variable | owner | never (no platform rotation) | — | leak: offline guessing of hashed values |
| `JWT_SECRET`, `AUTH_SECRET` | session and reset tokens | sealed variables | owner | 12 months or on leak | new value; `JWT_LEGACY_GRACE_MINUTES` window; users sign in again | leak: token forgery |
| Stripe secret and webhook keys (per club) | the club's Stripe account | `integrations` credentials, sealed under the club DEK | club treasurer (club's Stripe account) | on leak or staff change | roll in Stripe dashboard, paste in club settings | leak: payments API of that club |
| `RESEND_API_KEY`, `AWS_*` (SES) | sending e-mail | sealed variables | owner | 12 months | provider console | leak: spam in Vereino's name |
| `BACKUP_S3_*` | backup bucket | backup job variables | owner | 12 months | provider console | leak: read/delete encrypted backups |
| Backup `age` key pair | database dumps and Vault snapshots | public key in repo; private key in two password managers | owner + second person | 24 months | `backups.md` (add new recipient, keep old 12 months) | loss: backups unreadable; leak + bucket: all backups |
| `VEREINO_OAUTH_*_CLIENT_SECRET` | social sign-in | sealed variables | owner | 12 months | provider console | leak: impersonation of the client |
| `VEREINO_LIBRARY_RATER_SECRET` | pseudonymous ratings | sealed variable | owner | never (changing it re-identifies nobody but splits rating history) | — | leak: link ratings to raters by guessing |
| `VEREINO_LICENCE_KEYS` | Enterprise licence verification | sealed variable / file | owner | per licence | — | — |
| Personal-link tokens | declaration/order/rental links | SHA-256 hashes in the database (S8.7) | — | per link (expiry) | — | — |

`KMS_MASTER_KEY` (named on #740) is read by the platform only for `communication_channels` signing secrets, a module
Vereino does not enable; the inventory records it as unused.

## Integration Coverage

The integration harness (`packages/app/scripts/vereino-ephemeral.mjs`) starts a Vault container
(`hashicorp/vault`, version pinned by digest) in server mode with Raft storage, unseals it, enables KV v2 and runs the
app in `vault` mode without a fallback secret, so every integration test runs with production's key configuration.

| Test ID | Level | Setup / fixture | Actions | Assertions | Requirement IDs |
|---|---|---|---|---|---|
| TEST-K01-two-club-keys | integration | two clubs by `create-club` | create a person with a PESEL in each; read the raw column and the Vault entries | two Vault entries with different fingerprints; club A's ciphertext does not decrypt with club B's key; each club reads its own person | REQ-K01 |
| TEST-K02-key-deletion | integration | club with encrypted data | `delete-club` with operator token; restore the club's rows from a pre-deletion SQL copy taken in the test | Vault entry and metadata gone; `encryption-keys verify` on the copied rows reports 0 decryptable; second club unaffected; without the token `key_store_token_missing` and nothing deleted | REQ-K03 |
| TEST-K03-rotation-online | integration | two clubs, a reader/writer loop on an encrypted field through the API | `vault operator rotate` during the loop; then create a second app token, run `encryption-keys status` with it, revoke the first token after the app's cached DEKs are refreshed with the second (the app restart of a real token swap is covered by the runbook drill) | zero failed requests during the loop; all data readable after | REQ-K05 |
| TEST-K05-vault-outage-write | integration | club in `vault` mode | stop the Vault container (and, separately, revoke the app token) while saving a person with a PESEL | the save is refused (503), no row holds a plaintext PESEL, and after Vault returns the same save succeeds encrypted | DD-K12 |
| TEST-K04-import-derived | integration (CLI) | PostgreSQL + Vault containers, a tenant seeded in `derived` mode | `import-derived --all`, switch env to `vault`, `verify --all`; run `import-derived` again | `imported`, then `present`; verify reports all rows decryptable; a pre-written different key gives `conflict` and no overwrite | REQ-K02 |
| unit (`foundation/lib/key-store.ts`, boot env) | unit | — | request building, path validation, fingerprint, mode rules | 100 % coverage; boot check refuses each forbidden combination | REQ-K07 |
| ENG-TEST-10 restore drill after rotation (staging, runbook) | drill | staging after cutover | rotate barrier, take dump + snapshot, restore both into scratch, `verify --all` | recorded in `docs/ops/restore-drills.md` | REQ-K04 |

## Implementation Phases

### Phase 1 — Key store running, boot guard, inventory

- **Depends on:** none (owner's decision of 2026-11-26)
- **Outcome:** staging and production each have an initialised Vault service that the app does not use yet; the
  inventory is written; the boot check knows `VEREINO_KEY_STORE`.
- **Deliverables:** `docker/vault/` (Dockerfile pinning the Vault image, `vault.hcl` with Raft storage and the audit
  device, entry script unsealing from the two share variables); `docs/ops/key-store.md` (setup, policies, tokens,
  rotation, unseal, monitoring); boot check rules of DD-K03 and `.env.example` / `deploy.md` rows;
  `docs/compliance/key-inventory.md`; ASVS V11.1 row and A-3 updated (closed when phase 3 lands);
  `processors.md`/`ropa.md` lines.
- **Requirements closed:** REQ-K06, REQ-K07
- **Tests:** boot-env unit tests
- **Validation:** `yarn verify`
- **Exit gate:** `vault status` on staging and production shows unsealed after a service restart; boot check refuses
  `vault` mode with a fallback secret in a unit test.

### Phase 2 — Key-store client, import, cutover, backups

- **Depends on:** Phase 1 exit gate
- **Outcome:** both environments run in `vault` mode; the first club's key is the imported one; backups carry Vault
  snapshots.
- **Deliverables:** the fail-closed write path of DD-K12 (upstream release or Vereino guard); `foundation/lib/key-store.ts`
  and the `encryption-keys` commands over every tenant (DD-K11, with its `AGENTS.md` entry); harness Vault container;
  `backup-dump.mjs` snapshot step and `backup-restore.mjs` snapshot restore; `backups.md` and `clubs.md` runbook steps;
  staging cutover (J-K01) and restore drill, then production cutover.
- **Requirements closed:** REQ-K01, REQ-K02, REQ-K04
- **Tests:** TEST-K01, TEST-K04, TEST-K05, unit tests, restore drill on staging
- **Validation:** `yarn verify`; `yarn test:integration:vereino --filter TEST-K01-two-club-keys` and
  `--filter TEST-K04-import-derived`
- **Exit gate:** TEST-K05 green; production `encryption-keys status --all` shows every tenant `stored`; the drill
  record exists.

### Phase 3 — Key deletion and rotation

- **Depends on:** Phase 2 exit gate
- **Outcome:** `delete-club` destroys keys; the barrier and token rotations are proven online; the second club may
  bring real data (Q-M07 pre-condition met).
- **Deliverables:** `delete-club` step 5; rotation runbook; upstream issues of DD-K07 filed and linked in the inventory;
  ASVS A-3 closed; many-clubs spec rows for Q-M07 and step 5 updated through its changelog.
- **Requirements closed:** REQ-K03, REQ-K05
- **Tests:** TEST-K02, TEST-K03
- **Validation:** `yarn verify`; the two focused integration runs
- **Exit gate:** TEST-K02 and TEST-K03 green in CI; first barrier rotation done in production and recorded.

## Requirement Traceability

| Requirement | Journey / surface | Data/API/event contracts | Phase | Tests | Acceptance criterion |
|---|---|---|---|---|---|
| REQ-K01 | create-club | Vault `tenant_key_*` | 2 | TEST-K01 | AC-K01 |
| REQ-K02 | J-K01 | `encryption-keys import-derived`, `verify` | 2 | TEST-K04 | AC-K02 |
| REQ-K03 | J-K02 | `delete-club` step 5, snapshot retention | 3 | TEST-K02 | AC-K03 |
| REQ-K04 | J-K03 | backup job snapshot | 2 | restore drill | AC-K04 |
| REQ-K05 | rotation runbook | barrier, tokens | 3 | TEST-K03 | AC-K05 |
| REQ-K06 | inventory | `docs/compliance/key-inventory.md` | 1 | doc review | AC-K06 |
| REQ-K07 | boot | `vereino-boot-env.mjs` | 1 | unit | AC-K07 |

## Rollout, Migration, and Rollback

Order: staging Phase 1 → production Phase 1 → staging cutover + drill → production cutover → Phase 3. The second club's
real data waits for the Phase 3 exit gate. Rollback before Phase 3: restore the previous variables (fallback secret
back, `VEREINO_KEY_STORE=derived`) and redeploy; any club created while in `vault` mode has a random key that the
derived mode cannot read, so rollback after a second club exists is not possible — this is why that club waits for
Phase 3. Vault data loss: restore the newest snapshot (J-K03).

## Risks and Tradeoffs

| Risk / tradeoff | Impact | Mitigation / detection | Residual risk |
|---|---|---|---|
| Vault down or sealed | encrypted reads show ciphertext and encrypted writes fail after the 15-minute cache | auto-unseal (DD-K09), health alert, Railway restart policy | minutes of degraded service per incident |
| Lost Vault volume and snapshots | every club's encrypted data lost | nightly age-encrypted snapshots off-site (second EU provider), drill | as for the database backups |
| Unseal shares next to Vault in Railway | Railway compromise exposes keys | sealed variables, Railway 2FA (P-1a); same boundary as today | A-K03 (confirmed 2026-11-26) |
| First club not shreddable | its backups stay readable to a holder of the pepper until they expire | DD-K08, upstream rotation request | A-K02 (confirmed 2026-11-26) |
| No online DEK rotation | DEK compromise needs a club maintenance window | DD-K06c, upstream request | A-K01 (confirmed 2026-11-26) |
| App token expires | outage of encryption | 400-day TTL with raised `max_lease_ttl` (DD-K13), `encryption-keys status` warns at 30 days left, inventory period 12 months | low |
| Vault fault switches encryption off for writes (platform fails open) | personal data written in plaintext | cutover gated on DD-K12; TEST-K05 | none once the gate holds — Q-K04 |
| Deleted key left in freed Raft/BoltDB pages of the live Vault volume | key readable by someone with the volume **and** two unseal shares | Railway volume backups of Vault off; the 30-day bound covers snapshots, not the live volume's free pages | accepted; a Vault rebuild from a snapshot clears them |
| A tenant missed by the import | its new rows get a second key | DD-K11 walks every tenant; `status --all` must show all `stored` before cutover | low |
| Pepper equal to the old fallback secret | the pepper also derives the first club's key | one secret instead of two; sealed | accepted with A-K02 |
| Vault BSL licence | licence change risk | OpenBao drop-in | low |

## Acceptance Criteria

- [ ] **AC-K01** — Two clubs have different DEKs in Vault and neither can read the other's ciphertext (TEST-K01). — gap: #740 (phase 2: per-club DEKs in Vault, TEST-K01)
- [ ] **AC-K02** — Production and staging run in `vault` mode with no fallback secret; the first club's data stayed
  readable through the cutover with no downtime (TEST-K04, cutover log). — gap: #740 (phase 2: `encryption-keys import-derived`/`verify`, TEST-K04, staging and production cutover log)
- [ ] **AC-K03** — `delete-club` removes the club's key; its ciphertext no longer decrypts; snapshots keep a key ≤ 30
  days (TEST-K02). — gap: #740 (phase 3: `delete-club` key destruction, TEST-K02)
- [ ] **AC-K04** — A dump restores with its Vault snapshot; the drill after a rotation is recorded. — gap: #740 (phase 2: Vault snapshot in `backup-dump.mjs`/`backup-restore.mjs`, drill in `docs/ops/restore-drills.md`)
- [ ] **AC-K05** — Barrier and app-token rotation run without failed requests (TEST-K03) and are in the runbook. — gap: #740 (phase 3: TEST-K03, recorded rotation; the runbook text is in `docs/ops/key-store.md`, PR #826)
- [ ] **AC-K06** — `docs/compliance/key-inventory.md` lists every key above with owner, location and rotation period;
  ASVS A-3 is closed. — gap: #740 (`docs/compliance/key-inventory.md` with owner, location and rotation period landed in PR #826; ASVS A-3 stays open until phases 2–3)
- [x] **AC-K07** — The boot check refuses `vault` mode with a fallback secret or without Vault variables or pepper. — PR #826, `packages/app/scripts/__tests__/vereino-boot-env.test.mjs` (close-out V #842)
- [ ] Every affected command has integration coverage and `yarn verify` passes. — gap: #740 (no integration test of the key commands yet; the harness has no Vault container)

## Final Compliance Report

| Check | Status | Evidence / resolution |
|---|---|---|
| Applicable `AGENTS.md` files and routed guides/skills reviewed | pass | root `AGENTS.md`, `.ai/guides/spec-delivery.md`, platform `shared`/`core` AGENTS (encryption rules) |
| Data models, APIs, events, UI, and tests are internally consistent | pass | traceability table |
| Every workflow completes end to end without a catch-all integration phase | pass | phases 1–3 each close requirements |
| Platform-native reuse and extension points were chosen before custom code | pass | platform Vault adapter reused; only import/delete client added |
| UI contracts identify references, canonical components, and theme/state coverage | pass | N/A — no UI |
| Every phase has dependencies, bounded slices, tests, value, and an observable exit gate | pass | phases |

Verdict: `Ready — Q-K01 to Q-K05 answered by the owner on 2026-11-26 (PR #803)`.

## Resolved assumptions (autonomous defaults)

| ID | Question | Applied default | Why | Confirm? |
|---|---|---|---|---|
| A-K01 | #740 asks for "rotation without downtime". Is it enough that the wrapping layer (Vault barrier key) and the app token rotate online every 12 months, while DEKs rotate only on suspected compromise with a per-club maintenance window? | yes | The platform has one DEK per tenant and no key id in the envelope, so no DEK can rotate online without an upstream change (DD-K07) | confirmed by the owner 2026-11-26 (Q-K01) |
| A-K02 | The first club keeps its imported derived key, so its old backups cannot be crypto-shredded until the platform can re-key all DEK-sealed data | accept | Rotating it now would break its Stripe credentials and audit payloads (DD-K02) | confirmed by the owner 2026-11-26 (Q-K02) |
| A-K03 | Vault unseals itself after restarts from two Shamir shares stored as sealed variables of the Vault service | yes | Manual unsealing turns every Railway restart into an outage; a cloud auto-unseal is a new sub-processor | confirmed by the owner 2026-11-26 (Q-K03) |
| A-K04 | Vault snapshot retention | 30 days, daily | Bounds how long a deleted key survives; covers the 30 daily dumps | reversible |
| A-K05 | One Vault node, no HA | yes | 15-minute DEK cache, low load | reversible |
| A-K06 | `LOOKUP_HASH_PEPPER` takes the fallback key's value | yes | Only way to keep lookup hashes valid | reversible before cutover |
| A-K07 | A new read-only system-scope statement lists tenant ids from `tenants` for the shell-only key commands (DD-K11) | yes | Every tenant, not only clubs, holds encrypted rows; ids only, never from a request | confirmed by the owner 2026-11-26 (Q-K05) |

## Open Questions

| ID | Question | Owner | Blocking? | Resolution / decision date |
|---|---|---|---|---|
| Q-K01 | Confirm A-K01 (rotation scope) | Władek Kuć | phase 3 | answered 2026-11-26 (PR #803): accepted — online rotation of the Vault barrier key and the app token only; DEKs rotate only on suspected compromise (A-K01, DD-K06) |
| Q-K02 | Confirm A-K02 (first club not shreddable for now) | Władek Kuć | phase 2 | answered 2026-11-26 (PR #803): accepted — the first club keeps its imported derived key and is not crypto-shreddable until the platform can re-key it (A-K02, DD-K08) |
| Q-K03 | Confirm A-K03 (auto-unseal from sealed variables) | Władek Kuć | phase 1 | answered 2026-11-26 (PR #803): accepted — auto-unseal from 2 of 3 Shamir shares stored as sealed variables of the Vault service (A-K03, DD-K09) |
| Q-K04 | DD-K12: wait for an upstream fail-closed fix, or build the Vereino guard now (recommended: file upstream at once, build the guard in phase 2 if no release is out by then) | Władek Kuć | phase 2 | answered 2026-11-26 (PR #803): recommended default accepted — report the fail-open write upstream now and build Vereino's own fail-closed guard in phase 2 unless an upstream release that fails closed is out by then (DD-K12) |
| Q-K05 | Confirm A-K07 (tenant-id listing as a new system-scope exception) | Władek Kuć | phase 2 | answered 2026-11-26 (PR #803): accepted — a read-only, ids-only, shell-only system-scope tenant-id listing; recorded in `AGENTS.md` with the code in phase 2 (A-K07, DD-K11) |

## Changelog

Each change is its own file in `.ai/specs/changelog/2026-11-26-vereino-key-store-and-key-inventory/`.
