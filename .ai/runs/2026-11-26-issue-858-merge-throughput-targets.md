# Run log — #858 merge-throughput targets (MT-AC-01/04/05)

- **Trigger:** Cezar run 42e65dc3 (`om-auto-fix-issue`), `cezar` label on #858, 2026-11-26.
- **Issue:** #858 — found by the spec close-out V (#842).
- **Spec:** `.ai/specs/2026-11-18-merge-throughput.md` (status stays In progress: MT-AC-01 and REQ-MT05 remain open).
- **Branch:** `docs/issue-858-merge-throughput-targets`.

## Goal

Apply the owner's decision of 2026-11-26 (issue comment 7203997104, author association OWNER) to the three open questions of #858, amend the spec, and tick each criterion that is met with evidence.

| Question | Owner decision |
|---|---|
| MT-AC-01 target | CI p50 ≤ 30 min over 10 PR runs (the #834 target), was 22 min |
| MT-AC-04 latency | 30 min from a train label to a started fix run (the picker's cadence), was 10 min; no new label automation |
| MT-D04 build count | Cezar builds at most five issues (`maxParallel: 5`), was three |

## Steps

1. Claimed #858 (assignee, `in-progress`, `🤖` claim comment naming this run); renamed the branch to `docs/issue-858-merge-throughput-targets`.
2. Measured the evidence (below).
3. Amended the spec: success measures, Proposed Solution items 5 and 6, MT-D04, Reuse map, data-flow diagram, Phase 1 exit, Step 3.2, Operations, traceability rows REQ-MT06/REQ-MT10, MT-AC-01/04/05 (with met/open status). The `**Status**` line is left as written (rule *Spec status line*: the state is still In progress).
4. Amended `SDLC.md` → "The automation contract": five builds (`maxParallel: 5`), and the mirrored train label is acted on by the 30 min picker, not an issue-label automation.
5. Added the changelog file `.ai/specs/changelog/2026-11-18-merge-throughput/2026-11-26-issue-858-targets-amended.md`.

## Evidence

### MT-AC-01 — CI p50 ≤ 30 min: **open**

`gh run list --workflow ci.yml --event pull_request --status success --limit 10` (duration = `updatedAt − startedAt`), 2026-11-26 ~21:50Z:

| Run | Started | Min | Branch |
|---|---|---|---|
| 45896021803 | 21:08Z | 32 | docs/issue-851-capacity-cell-model |
| 45894412317 | 20:54Z | 33 | docs/issue-603-polish-review-addendum |
| 45893800483 | 20:49Z | 49 | docs/issue-870-photo-image-consent-spec |
| 45892917617 | 20:41Z | 24 | docs/issue-868-invitation-link-qr |
| 45886018232 | 19:45Z | 88 | fix/issue-833-refuse-oversized-facebook-deletion-bodies |
| 45885474585 | 19:41Z | 97 | feat/issue-832-pin-facebook-graph-api |
| 45884438182 | 19:32Z | 75 | feat/issue-834-self-hosted-ci-runners |
| 45881537453 | 19:09Z | 47 | feat/issue-799-sign-up-form-inbox-waiting-list |
| 45881335952 | 19:08Z | 45 | feat/issue-736-staff-second-factor |
| 45874891806 | 18:18Z | 56 | fix/issue-836-root-em-forks-in-write-transactions |

p50 **48 min** (24–97). Docs-only runs (#777) are in the sample and pull the median down; code PRs alone are slower. Above 30 min, so MT-AC-01 stays open until #834's self-hosted runners land and a new 10-run sample is ≤ 30 min.

### MT-AC-04 — a train label starts a fix run within 30 min: **met**

PRs updated since 2026-11-23: time from a `merge-train-failed` / `merge-train-conflict` label to the next `🤖` agent comment on the PR (the fix run's first report, so an upper bound on when the run started):

| PR | Label | Agent comment | Min |
|---|---|---|---|
| #860 | 11-26 20:30Z | 20:51Z | 21 |
| #854 | 11-26 20:16Z | 20:56Z | 41 |
| #838 | 11-26 18:06Z | 18:09Z | 3 |
| #831 | 11-26 18:06Z | 19:08Z | 62 |
| #830 | 11-26 18:51Z | 19:03Z | 12 |
| #814 | 11-26 08:05Z | 10:58Z | 173 |
| #814 | 11-26 11:23Z | 11:53Z | 30 |
| #814 | 11-26 13:32Z | — | none yet |
| #802 | 11-26 06:36Z | 11:02Z | 265 |
| #790 | 11-25 23:32Z | 23:36Z | 4 |
| #785 | 11-25 22:54Z | 22:55Z | 1 |
| #785 | 11-25 23:32Z | 11-26 00:01Z | 29 |
| #773 | 11-25 20:03Z | 20:04Z | 1 |
| #750 | 11-25 20:03Z | 20:56Z | 53 |
| #746 | 11-25 17:52Z | 18:00Z | 8 |
| #726 | 11-25 11:39Z | 11:56Z | 17 |
| #726 | 11-25 12:51Z | 13:08Z | 17 |
| #726 | 11-25 17:53Z | 18:07Z | 14 |
| #717 | 11-25 07:43Z | 07:46Z | 3 |

18 answered labels: median 17 min, 13 within 30 min, 5 above (41, 53, 62, 173, 265 — the long ones overnight or while all build slots were busy). The spec's evidence for MT-AC-04 is "one observed label-started run within 30 min"; that is observed many times (e.g. #860, #830, #726), so the criterion is ticked. The tail above 30 min is recorded here, not hidden: if the owner wants every label answered within 30 min, the lever is a free build slot for fix runs or the issue-label automation the owner declined on 2026-11-26.

### MT-AC-05 — QA hold and five builds: **met**

- `node --test scripts/__tests__/merge-train-plan.test.mjs` (in `packages/app`): 43 tests, 43 pass; both suites `MT-TEST-05: QA hold (MT-D02)` and `MT-TEST-05: labels mirrored onto the linked issue` pass.
- `~/.cezar/config.json` on the build server: `"maxParallel": 5`.
- `SDLC.md` "The automation contract" now says five (`resources.maxParallel: 5`).
- MT-TEST-05 needed no change: neither its spec text nor its tests encode the build count (it covers the QA hold and the label mirror only).

## Decisions

- The spec's `**Status**` line keeps its text (its "within 10 min" wording is historical); the amendment is in the body and the changelog file, per the *Spec status line* rule.
- `.ai/specs/2026-11-24-cezar-stall-prevention.md` ST-D03 cites "three builds (MT-D04)" in its rationale; left as written (a decision record of another spec; its 5-ready-issues threshold still holds with five builds, but that is its owner's call).

## Files changed

- `.ai/specs/2026-11-18-merge-throughput.md`
- `.ai/specs/changelog/2026-11-18-merge-throughput/2026-11-26-issue-858-targets-amended.md`
- `SDLC.md`
- `.ai/runs/2026-11-26-issue-858-merge-throughput-targets.md`

## Open problems / next steps

- MT-AC-01: re-measure 10 PR runs after #834 lands.
- REQ-MT05 (picker module-spread rule) is still not built; untouched by this issue.
