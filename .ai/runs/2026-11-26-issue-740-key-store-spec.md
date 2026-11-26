# Run: #740 — spec for the key store with per-club keys and the key inventory

- **Goal and trigger:** cezar task (om-auto-fix-issue 740, feature route → om-auto-write-spec). The owner's decision on
  #740 (2026-11-26) chose HashiCorp Vault in the same Railway project and asked to start with the spec.
- **Issue / spec / branch:** #740 (E25-S06, epic #734); `.ai/specs/2026-11-26-vereino-key-store-and-key-inventory.md`;
  branch `docs/issue-740-key-store-per-club-keys`.

## Steps

1. Claimed #740 (assignee, `in-progress`, 🤖 claim comment naming the worktree and branch). No open PR referenced it.
2. Read the many-clubs spec (Q-M07, DD-M09, deletion step 5), ASVS A-3, `docs/ops/backups.md`, `deploy.md`, the boot
   check, `.env.example`, and the installed platform sources: `shared/src/lib/encryption/kms.ts`, `aes.ts`,
   `tenantDataEncryptionService.ts`, `core/src/modules/entities/cli.ts` (`rotate-encryption-key`).
3. Wrote the spec (autonomous defaults) and its changelog entry.
4. Fresh-context review by a subagent against the installed code. It found two critical gaps, both confirmed by reading
   the code: (a) a Vault fault makes the platform write encryption-map fields in plaintext
   (`encryptEntityPayload` returns the payload when `isEnabled()` is false or no DEK comes back); (b) non-club tenants
   (the training library tenant) would be missed by a per-club import and get a second key. Also: token TTL above
   Vault's 32-day default, the import could read Vault as its own "derived" source, `VAULT_KV_PATH` mismatch, snapshot
   consistency, pre-checks of `delete-club`, fingerprint format. All addressed in the spec (DD-K11, DD-K12, DD-K13,
   TEST-K05, J-K01/J-K02 changes, Q-K04, Q-K05).
5. Recorded the lesson `vault-kms-fault-writes-plaintext-and-fallback-key-is-the-pepper`.

## Decisions

- The key migration imports the existing club's derived DEK into Vault byte for byte (no ciphertext rewrite, rollback by
  variables). Rotating it to a random key now would break DEK-sealed data outside encryption maps (Stripe credentials).
- `LOOKUP_HASH_PEPPER` is pinned to the fallback key's value before the fallback is removed (otherwise sign-in breaks).
- Production cutover is gated on fail-closed writes (DD-K12).
- No database migration: the "migration" approved on #740 is the key migration.
- Spec status stays Draft; five owner questions (Q-K01–Q-K05, four ⚠ assumptions) keep the PR a draft.

## Files changed

- `.ai/specs/2026-11-26-vereino-key-store-and-key-inventory.md` (new)
- `.ai/specs/changelog/2026-11-26-vereino-key-store-and-key-inventory/2026-11-26-initial-draft.md` (new)
- `.ai/lessons/vault-kms-fault-writes-plaintext-and-fallback-key-is-the-pepper.md` (new)
- this run log

## Commands and results

- `yarn spec-changelogs:check` — valid
- `yarn spec-questions:check` — valid
- `yarn format:check` — 0 unformatted
- `yarn lessons:check` — valid; `yarn secrets:check` — no secrets found; `yarn guard` — no blocking findings
- No integration tests: design-only change, no code.

## Open problems / next steps

- Owner answers Q-K01–Q-K05 on the spec PR; then the spec moves to `Ready for implementation` and phase 1 starts.
- Upstream issues of DD-K07 (fail-closed writes, versioned DEKs, rotation of credentials, token renewal) are filed in
  phase 3, or earlier if the owner chooses the upstream route for Q-K04.

## Follow-up run (2026-11-26): owner answers recorded

- **Trigger:** cezar task `om-auto-fix-pr 803` — the owner accepted all recommended defaults for Q-K01…Q-K05 (PR #803
  comment "Owner decision (2026-11-26)").
- **Steps:** merged `origin/main` into the PR branch (clean); recorded each answer in the Open Questions table, marked
  A-K01, A-K02, A-K03 and A-K07 confirmed (and their ⚠ references in the design table, scope and risks), set the
  compliance verdict to ready and the status line to `Ready for implementation`; added the changelog file
  `2026-11-26-owner-answers-ready.md`; promoted the PR from draft to ready for review.
- **Decision:** Q-K04 keeps the recommended wording — report the fail-open write upstream now, build Vereino's own guard
  in phase 2 unless an upstream release that fails closed is out by then. Filing the upstream report is an
  outward-facing action left to the owner or the phase 2 run; this run did not file it.
- **Commands:** `yarn spec-changelogs:check`, `yarn spec-questions:check`, `yarn format:check`, `yarn guard` (results
  in the PR comment of this run).
- **Next steps:** phase 1 (Vault service, boot guard, key inventory) via `om-auto-implement-spec`; the upstream
  fail-closed report before phase 2.
