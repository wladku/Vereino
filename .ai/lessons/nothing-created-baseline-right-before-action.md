---
title: "Take a 'nothing was created' count right before the refused action, after every fixture"
modules: ["people", "platform"]
areas: ["testing"]
topics: ["integration-tests", "fixtures", "assertions", "counts"]
---

# Take a 'nothing was created' count right before the refused action, after every fixture

**Context**: TEST-076 (#76, 2026-11-03) checked that a refused person create leaves the club's person count unchanged.

**Problem**: The test read the count at the start, then `createStaff` added a coordinator for a later step, so the final count was one higher and the test failed although the refused create wrote nothing.

**Rule**: Read the baseline for a "nothing created" assertion immediately before the refused request or form submit, never at the start of the test; any fixture that creates a person, group or account changes the count.

**Applies to**: `packages/app/.ai/qa/tests/**` that assert a refusal wrote nothing.
