---
title: "A change to how staff sign in also reaches the image smoke's sign-in"
modules: ["foundation", "platform"]
areas: ["testing", "debugging"]
topics: ["image-smoke", "second-factor", "sign-in"]
---

# A change to how staff sign in also reaches the image smoke's sign-in

**Context**: PR #831 (staff second factor, #736) updated every integration fixture that signs in, but `image-smoke`
failed: `scripts/smoke.mjs` and `scripts/image-smoke.sh` sign in as the super-admin with a plain
`POST /api/auth/login`, got the provisional `mfa_pending` token and answered `GET /api/auth/profile 401`.

**Problem**: The image smoke signs in through its own code, outside `packages/app/.ai/qa/tests/_fixtures`, and runs
only in CI's `image-smoke` job, so a search through the fixtures misses it and the failure shows up only after the push.

**Rule**: When a change alters what `POST /api/auth/login` answers (a new factor, a new status, a new token shape),
grep `scripts/` and `packages/app/scripts/` for `/api/auth/login` as well as the fixtures, and run
`scripts/image-smoke.sh` locally before pushing. The image smoke reads e-mailed codes from an `OM_TEST_MODE` capture
in a mounted run directory (`VEREINO_SMOKE_EMAIL_CAPTURE`); never relax the gate for the smoke account.

**Applies to**: `scripts/smoke.mjs`, `scripts/image-smoke.sh`, `packages/app/scripts/vereino-capacity-seed.mjs`,
`packages/app/src/app/api/auth/login/route.ts`.
