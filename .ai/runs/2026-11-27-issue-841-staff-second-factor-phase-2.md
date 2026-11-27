# Run: issue #841 — staff second factor, phase 2 (Google required when connected)

- **Goal and trigger:** cezar task 3dc8d4d3 (`om-auto-fix-issue 841`, label `cezar`). Build phase 2 of
  `.ai/specs/implemented/2026-11-26-vereino-staff-second-factor.md` (approved on #805; Q-2F01 answered 2026-11-26:
  refuse): a club administrator or treasurer who connected Google signs in only with Google (J-2F02, REQ-2F02).
- **Issue:** #841 (epic #734, depends on #736 / PR #831, merged) · **Branch:**
  `feat/issue-841-google-required-second-factor` · **Spec:** phase 2 is the last phase, so this PR sets
  `Status: Implemented` and moves the spec to `implemented/`.
- **Ask First:** the phase's deliverables were approved with the spec on #805. One additive contract beyond the spec's
  error table: the 409 `second_factor_reset_required` of `foundation.identity.unlink` (DD-2F07 says the unlink of a
  required person's Google link "goes through this command"; the code is how the plain unlink refuses). No migration,
  no dependency, no new route.

## Steps

1. Claimed #841 (assignee, `in-progress`, 🤖 claim comment naming this worktree and branch); renamed the task branch.
2. Read phase 1: `services/second-factor/{gate,requirement,challenge}.ts`, the identity routes and commands,
   `IdentityLinks`, `SecondFactorReset`, the person-record and profile widgets, TEST-2F03 and TEST-2F04, and checked
   that no other integration test links Google for a required user and then signs in with the password (TEST-S01…S07
   link Google only for people without a staff role).
3. Gate (`services/second-factor/gate.ts`): after the requirement and the issued claims, while Google sign-in is
   configured, a Google identity link of the user in the issued scope answers 403 `second_factor_use_google` after
   deleting the platform session; no challenge, no code, no cookies. A failing lookup answers 503 (fail closed).
4. `GET /api/foundation/identity/me` gains `secondFactorRequired`; `IdentityLinks` shows the profile line (`Alert`,
   information) on the own list. The administrator's list gains `secondFactor.unlinkGoogleThroughReset` (required and
   not oneself); on the person record "Unlink Google" of such a person opens "Reset second factor" (the widget holds
   the dialog state), or stays disabled with a sentence for an administrator without the reset feature.
5. `foundation.identity.unlink`: someone else's Google link of a user holding the requirement answers 409
   `second_factor_reset_required` (error table, test, en/pl). The account holder's own unlink is unchanged.
6. Tests: TEST-2F03 item 9 (password 403 with no code e-mailed, Google admits), `secondFactorRequired` true/false,
   the administrator's plain unlink refused and the link kept, the reset then removes it and the password is
   challenged again; TEST-2F04 checks the routed dialog, that cancelling keeps the link, and the profile line.
7. Docs: ASVS V6.8.4 n/a → partial with the note (summary counts updated), V6.5–V6.6 checklist row, `deploy.md` note;
   spec ACs ticked with evidence, status `Implemented`, moved to `implemented/` with every link fixed; changelog file
   `2026-11-27-issue-841-phase-2.md`.

## Decisions and reasons

- **Refuse only while Google sign-in is configured.** DD-2F06 refuses the password of a Google-linked required user.
  With `VEREINO_OAUTH_GOOGLE_*` unset nobody can sign in with Google, so refusing would lock every such user out; the
  e-mail code (phase 1) is still a second factor. Recorded in the spec changelog file and `deploy.md`.
- **The Google check runs before the hourly challenge cap**, so a refused password never spends a challenge or sends
  a code.
- **Server-side refusal of the plain unlink** rather than only hiding the button: the reset is the audited path with a
  note and ends sessions (DD-2F07); a direct API call must not bypass it. Self-unlink stays allowed: the holder is
  already signed in with the factor and falls back to the password plus e-mail code.
- **V6.8.4 partial, not n/a:** the control (Google as the factor) exists; the named gap is the unverifiable 2-Step
  Verification (Q-2F04 says "stays partial").

## Files changed

- `packages/app/src/modules/foundation/services/second-factor/gate.ts`
- `packages/app/src/modules/foundation/commands/identity.ts`
- `packages/app/src/modules/foundation/api/identity/route.ts`, `api/identity/me/route.ts`
- `packages/app/src/modules/foundation/components/{IdentityLinks.tsx,SecondFactorReset.tsx,identity-client.ts}`
- `packages/app/src/modules/foundation/widgets/injection/person-identities/widget.client.tsx`
- `packages/app/src/modules/foundation/lib/error-codes.ts`, `lib/__tests__/error-codes.test.ts`, `i18n/{en,pl}.json`
- `packages/app/.ai/qa/tests/foundation/second-factor/TEST-2F03-google-and-reset.spec.ts`, `TEST-2F04-reset-dialog.spec.ts`
- `docs/compliance/asvs-checklist.md`, `docs/compliance/asvs-requirements.md`, `docs/ops/deploy.md`
- the spec (moved), its changelog file, and the links to it in code comments, docs, lessons and run logs

## Commands and results

- `yarn install` (the worktree had no dependencies), `yarn prettier --write` on the changed files.
- `yarn verify` — `[verify] all 24 step(s) passed` (generate, typecheck ×3, lint, format, contracts, route isolation,
  qa texts, spec changelogs, unit tests with coverage, build, …).
- `yarn test:integration:vereino --filter TEST-2F03` — 1 passed (TEST-2F03 incl. item 9 and the unlink negative case).
- `yarn test:integration:vereino --filter TEST-2F04` — 1 passed (routed "Unlink Google", profile line).
- `yarn test:integration:vereino --filter TEST-S07` — 1 passed (the person-record identity list, whose component
  changed).
- `yarn guard` — "No blocking findings."

## Open problems

- The phase's exit gate is the owner's, on staging: a Google-linked treasurer is refused with the password and admitted
  with Google.

## Next steps

- Owner: the staging exit gate above.
