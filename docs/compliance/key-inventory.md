# Key inventory

**Status:** draft, written 2026-11-26 (#740, phase 1 of
[`2026-11-26-vereino-key-store-and-key-inventory.md`](../../.ai/specs/2026-11-26-vereino-key-store-and-key-inventory.md));
awaiting the owner's approval. Closes ASVS open item A-3 (V11.1 cryptographic inventory) when phase 3 of that spec
lands ([`asvs-checklist.md`](asvs-checklist.md)).

Every key and secret of a Vereino instance (staging and production each hold their own values): what it protects,
where it lives, who owns it, how often it rotates and what happens when it is lost or leaked. A new key or secret gets
a row here in the pull request that introduces it. Values never appear here, in an issue or in a log; commands print
fingerprints only (first 12 hex characters of SHA-256 over the key's base64 string).

"Sealed variable" = a Railway variable sealed in its menu (`deploy.md`, L-3): given to deployments, never shown or
returned by the API. "Password managers" = the team password managers of the owner and the second person.

## Keys and secrets

| Key / secret | Protects | Location | Owner | Rotation period | Rotation method | Loss / leak impact |
|---|---|---|---|---|---|---|
| Tenant DEK (one per tenant: each club, the training library tenant) | the tenant's encrypted columns (encryption maps), integration credentials (Stripe keys), audit payloads, index documents; AES-256-GCM | today derived from `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (PBKDF2-SHA512, salt = tenant id); after the phase 2 cutover Vault KV `secret/data/tenant_key_<tenantId>` ([`key-store.md`](../ops/key-store.md)) | owner | on suspected compromise only (DD-K06c) | platform `mercato entities rotate-encryption-key`, club in maintenance; integration credentials re-entered | loss: the tenant's encrypted data; leak + database dump: that tenant only (today: every tenant, see the fallback key) |
| Vault barrier key | every DEK at rest in Vault | Vault keyring (Raft volume) | owner | 12 months | `vault operator rotate` (online, [`key-store.md`](../ops/key-store.md) *Rotation*) | — (protected by the unseal shares) |
| Vault unseal shares (3, threshold 2) | the barrier key | shares 1 and 2: sealed variables `VAULT_UNSEAL_KEY_1`, `VAULT_UNSEAL_KEY_2` of the Vault service only; all 3: password managers | owner + second person | when a holder leaves or a share may have leaked | `vault operator rekey` | loss of 2 (and the Vault service variables): Vault cannot be unsealed, restore fails; leak of 2 + the Vault volume or a snapshot: every stored DEK |
| Vault root token | Vault administration | revoked after setup; generated from 2 shares for a task and revoked after | owner | per use | `vault operator generate-root`, then `vault token revoke -self` | — |
| Vault app token (policy `vereino-app`) | reading and creating DEKs | sealed variable `VAULT_TOKEN` of app, worker, scheduler (from the cutover) | owner | 12 months (TTL 400 days, `max_lease_ttl` 9600 h; alert 30 days before expiry from phase 2) | new token → rolling deploy → revoke the old | expiry or revocation: encryption unavailable (and, until the DD-K12 guard, plaintext writes); leak: every DEK readable, none deletable |
| Vault snapshot token (`vereino-snapshot`) | Raft snapshots | sealed variable of the backup job (phase 2) | owner | 12 months | as the app token | leak: a snapshot (still sealed by the barrier key) |
| Vault key-admin token (`vereino-key-admin`) | import, inspection and deletion of DEKs | password managers only; given to one shell run as `VAULT_ADMIN_TOKEN` / `VEREINO_KEY_IMPORT_VAULT_TOKEN` | owner | 12 months | as the app token | leak: DEKs readable and deletable (data loss) |
| `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` | derivation root of every tenant DEK today; after the cutover only of the first club's imported key (DD-K08) | sealed variable of app and worker today; password managers only after the cutover | owner | never (changing it makes all derived ciphertext unreadable; it equals the pepper) | — | loss before the cutover: every tenant's encrypted data; leak + dump: every tenant today, the first club only after the cutover |
| `LOOKUP_HASH_PEPPER` | keyed lookup hashes (e-mail, PESEL, external ids; `hashForLookup`) | sealed variable; unset today, so the platform uses the fallback key's value; set to that value before the cutover (DD-K04) | owner | never (no platform rotation; a change breaks sign-in by e-mail and duplicate detection) | — | leak: offline guessing of hashed values |
| `JWT_SECRET`, `AUTH_SECRET` | session tokens, password-reset and sign-in tokens, cookie signing | sealed variables of app and worker | owner | 12 months or on leak | new value; `JWT_LEGACY_GRACE_MINUTES` keeps the old tokens valid for a window; users sign in again | leak: token forgery (impersonation of any user) |
| Stripe secret key and webhook signing secret (per club) | the club's Stripe account | `integrations` credentials, sealed under the club's DEK | club treasurer (the club's own Stripe account) | on leak or staff change | roll in the Stripe dashboard, paste in the club's payment settings | leak: the payments API of that club |
| `RESEND_API_KEY`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (SES) | sending e-mail | sealed variables of app and worker | owner | 12 months | provider console: new key, deploy, delete the old | leak: e-mail sent in Vereino's name |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | the off-site backup bucket | sealed variables of the backup job | owner | 12 months | provider console | leak: encrypted backups readable or deletable |
| Backup `age` key pair | database dumps (and Vault snapshots from phase 2) | public key `docker/backup/age-recipients.txt`; private key only in the password managers | owner + second person | 24 months | [`backups.md`](../ops/backups.md): add the new recipient, keep the old private key 12 months | loss: backups unreadable; leak + bucket: every backup |
| `VEREINO_OAUTH_*_CLIENT_SECRET` | social sign-in clients | sealed variables of app | owner | 12 months | provider console | leak: impersonation of the OAuth client |
| `VEREINO_LIBRARY_RATER_SECRET` | pseudonymous ratings in the training library | sealed variable | owner | never (a change splits the rating history) | — | leak: ratings linkable to raters by guessing |
| `VEREINO_LICENCE_KEYS` | Enterprise licence verification (signed keys; the public keys are in the repository) | sealed variable or file | owner | per licence (expiry) | issue a new key | — (a key is bound to one instance) |
| Personal-link tokens | declaration, order, request, rental links | 32 random bytes sent once; SHA-256 hash in the database (S8.7, `foundation/lib/token-link.ts`) | — | per link (expiry) | — | leak of a link: that link's action until it expires |
| `KMS_MASTER_KEY` | platform signing secrets of `communication_channels`, a module Vereino does not enable | not set | — | — | — | unused |

Other secrets in `packages/app/.env.example` (AI provider keys, MCP, document collaboration, MFA setup) belong to
platform features Vereino does not run in production; one gets a row here before it is set in an environment.

## Environments

| Environment | Vault service set up | Auto-unseal checked after a restart | Key store mode | Cutover |
|---|---|---|---|---|
| staging | _(date, phase 1 exit gate)_ | _(date)_ | `derived` | _(phase 2)_ |
| production | _(date, phase 1 exit gate)_ | _(date)_ | `derived` | _(phase 2)_ |

## Decisions to revisit

- The Vault listener runs without TLS on Railway's WireGuard-encrypted private network (D-039); revisit with ASVS
  V12.3 (#735).
- Two unseal shares live next to Vault as sealed variables (A-K03, confirmed 2026-11-26): same trust boundary as the
  fallback key today.
- The first club keeps its imported derived key and is not crypto-shreddable until the platform can re-key DEK-sealed
  data (A-K02, confirmed 2026-11-26).

## Rotation log

| Date | Environment | What | By | Notes |
|---|---|---|---|---|
