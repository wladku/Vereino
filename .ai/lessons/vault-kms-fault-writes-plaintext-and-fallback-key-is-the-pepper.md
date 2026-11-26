---
title: "With Vault, a key-store fault writes plaintext, and the fallback key is also the lookup-hash pepper"
modules: ["platform", "foundation"]
areas: ["architecture", "module-data"]
topics: ["encryption", "kms", "vault", "lookup-hash"]
---

# With Vault, a key-store fault writes plaintext, and the fallback key is also the lookup-hash pepper

**Context**: The key-store spec (#740, `.ai/specs/2026-11-26-vereino-key-store-and-key-inventory.md`, 2026-11-26) first
said that writes of encrypted fields "fail closed" when Vault is unreachable. A fresh-context review against the installed
platform (0.9.0) showed the opposite, and a second trap around `TENANT_DATA_ENCRYPTION_FALLBACK_KEY`.

**Problem**: `TenantDataEncryptionService.encryptEntityPayload` returns the payload **unchanged** when
`isEnabled()` is false (the KMS is unhealthy: one 5xx or a 1 s Vault timeout opens the breaker for 30 s) or when no DEK
comes back (an expired or revoked token answers 403). Encryption-map fields are then written in plaintext; only
integration credentials fail closed. The derived KMS never reaches these paths because it is always healthy. Separately,
`hashForLookup` keys lookup hashes with `LOOKUP_HASH_PEPPER`, and when that is unset with
`TENANT_DATA_ENCRYPTION_FALLBACK_KEY`: removing the fallback key without first pinning the pepper to its value breaks
every lookup by e-mail, sign-in included. And while a fallback secret is set next to Vault, `FallbackKmsService`
answers a missing or unreachable Vault key with the derived key, so rows end up under two keys and a deleted key comes
back.

**Rule**: Before running any environment with Vault, make sure writes of encryption-map fields fail while no DEK is
reachable (upstream fix or app guard), pin `LOOKUP_HASH_PEPPER` to the fallback key's value before that key is removed,
and never configure a fallback secret together with Vault in production. Verify KMS failure behavior in the installed
`shared/src/lib/encryption` sources; do not take the "fail closed" wording of comments as the behavior of every path.

**Applies to**: `@open-mercato/shared/lib/encryption` (`kms.ts`, `tenantDataEncryptionService.ts`, `aes.ts`), the
key-store spec (DD-K03, DD-K04, DD-K12), `packages/app/scripts/vereino-boot-env.mjs`, `docs/ops/deploy.md`.
