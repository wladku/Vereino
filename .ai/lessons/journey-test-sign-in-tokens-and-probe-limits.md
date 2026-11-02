---
title: "In journey tests a UI sign-in resets that user's password and kills their fixture token, and the messaging probe cannot run lock-protected commands"
modules: ["communication", "activities", "people"]
areas: ["testing", "integration"]
topics: ["journeys", "playwright", "fixtures", "auth", "messaging-probe", "optimistic-lock"]
---

# In journey tests a UI sign-in resets that user's password and kills their fixture token, and the messaging probe cannot run lock-protected commands

**Context**: The J-003 journey test (epic #23, 2026-11-02) signs in as several roles in the browser and forces a failed e-mail through the messaging probe.

**Problem**:
- The QA sign-in helper sets a known password for the user before signing in, so every UI sign-in invalidates the API token `familyFor` returned for that user; later API oracles with the old token answer 401.
- The messaging probe runs commands with a context that has no `request`, so it cannot send the optimistic-lock header; a lock-protected command such as the session cancellation fails there with 400 `lock_token_required`.

**Rule**: Keep the token that the sign-in helper returns for each role and use it for that role's API oracles; keep the club administrator's token, never signed into the browser, for setup and cross-role checks. Force a delivery failure on a command without a lock (thread create, `lock: 'none'`), or add a probe operation, instead of driving a versioned command through the probe.

**Applies to**: journey tests and other multi-role Playwright tests under `packages/app/.ai/qa/tests/`.
