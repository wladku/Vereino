---
title: "A new people life-cycle step also changes TEST-L09, which pins the whole step list"
modules: ["people"]
areas: ["testing"]
topics: ["integration-tests", "life-cycle-job", "merge-train"]
---

# A new people life-cycle step also changes TEST-L09, which pins the whole step list

**Context**: #308 / PR #437 (2026-11-20) added step 5 `erasure_names` to `LIFE_CYCLE_STEPS` in `people/lib/life-cycle-rules.ts`. The run updated the unit test and its own TEST-L07 and ran TEST-L03 and TEST-L18 as regressions. The merge train then failed on `integration (shard 6/6)`: `TEST-L09-coming-of-age.spec.ts` asserts `expect(first.steps).toEqual([...])` with the exact list returned by `yarn mercato people life-cycle`, and it received the extra `"erasure_names"`.

**Problem**: The step list is part of the job's CLI output, and an integration spec of another story pins it. Nothing in the module points at that spec, so a run that only reruns its own story's tests hands CI a red shard.

**Rule**: When you add, remove or reorder a step in `LIFE_CYCLE_STEPS`, update the `steps` assertion in TEST-L09 in the same commit and run `--filter TEST-L09` locally before pushing. Find other pins with `grep -rn '\.steps)' packages/app/.ai/qa/tests`.

**Applies to**: `packages/app/src/modules/people/lib/life-cycle-rules.ts`, `people/services/life-cycle.ts`, `packages/app/.ai/qa/tests/people/TEST-L09-coming-of-age.spec.ts`.
