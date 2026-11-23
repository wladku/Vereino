---
title: "Derived tenant keys cannot be destroyed: crypto-shredding needs a key store"
modules: ["platform", "club_core"]
areas: ["architecture", "module-data"]
topics: ["encryption", "kms", "tenant-deletion", "gdpr"]
---

# Derived tenant keys cannot be destroyed: crypto-shredding needs a key store

**Context**: The first draft of the many-clubs spec (#627, 2026-11-22) promised that deleting a club destroys its tenant
encryption key, so encrypted columns in old backups become unreadable. A review against the installed platform showed
this is impossible on Vereino's production setup.

**Problem**: Without Vault (`VAULT_*`), Open Mercato's `DerivedKmsService`
(`@open-mercato/shared/lib/encryption/kms.js`) derives every tenant's key with PBKDF2 from
`TENANT_DATA_ENCRYPTION_FALLBACK_KEY` and the tenant id. The key is never stored, so it can always be re-derived, and
the KMS interface has `createTenantDek` / `getTenantDek` but no delete. "Per-tenant key" here means per-tenant
*derivation*, not per-tenant *secret*.

**Rule**: Never claim crypto-shredding, key destruction or per-club key isolation on an instance that uses the fallback
key. Check which KMS the target environment runs (`docs/ops/deploy.md` variables); if the design needs destruction,
make a key store (Vault or a managed KMS) an explicit precondition and an owner decision.

**Applies to**: club offboarding and deletion (`.ai/specs/2026-11-22-vereino-many-clubs-one-instance.md`, DD-M09,
Q-M07), person erasure designs, any DPA or compliance text about backups.
