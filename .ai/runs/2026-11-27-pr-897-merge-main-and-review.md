# Run: PR #897 — merge main, review, fix (om-auto-fix-pr)

- **Goal and trigger:** cezar task (owner request): PR #897 (issue #872, E30-S03 event photos) conflicted with `main` again after later merges; merge `main` in without rewriting history, drive the PR to merge-ready, never merge.
- **Spec / issue / branch:** `.ai/specs/implemented/2026-11-26-vereino-event-photos-and-image-consent.md`, #872, `feat/issue-872-event-photos-consent` (worked on a detached HEAD at `origin/feat/issue-872-event-photos-consent`, pushed with `git push origin HEAD:feat/issue-872-event-photos-consent`).

## Steps

1. Claimed the PR (`in-progress` + 🤖 comment). Same-repository head (not a fork).
2. Merged `origin/main` (36d2d16d): the only file both sides changed was `packages/app/src/modules/people/README.md` (main moved the foundation spec link to `implemented/`); git resolved it without a conflict. No link to the moved spec's old path remains.
3. `yarn verify` on the merge result: all 24 steps passed.
4. Code review of `git diff origin/main HEAD` by a review subagent (read-only). One blocking finding, four nits.
5. **Blocking fix (REQ-I02, DD-I08):** `stripImageMetadata` copied everything after the first JPEG start of scan unchanged, so data after the end of image (Motion Photo MP4 with its GPS atom, MPF / Ultra HDR secondary JPEGs with their own EXIF, vendor trailers) and APPn/COM segments between progressive scans reached storage and, once public, any guest. The JPEG walk now skips entropy-coded data (stuffed `FF00` and RSTn stay data), filters every later segment with the same rule, stops at the end of image and drops what follows; a JPEG without an end of image is refused. New TEST-I04 cases: trailing clip and secondary JPEG, a progressive JPEG with COM/XMP between scans, missing EOI, a scan ending on a lone `0xFF`. `@vereino/core` coverage stays 100 %.
6. Nits fixed: the activities isolation inventory was reformatted wholesale (+818/−143); it is back to main's prettier layout with only the new probes (identical JSON content, diff now +94/−5), so parallel PRs adding probes do not conflict. `ACTIVITIES_IMAGE_USAGE` in `activities/di.ts` moved above the `register()` doc comment it had split.
7. Nits filed as follow-ups (design decisions, not blocking): #898 (bytes of a picture whose upload was undone are never released), #899 (undo of a picture's people marks can make it public again without a new confirmation).
8. Integration tests, one id per run: TEST-I05, TEST-I06, TEST-I07, TEST-I08, TEST-I10, ISSUE-628-cross-club-isolation — all passed (1 passed each). TEST-I05 and TEST-I06 re-run after the stripper fix, plus `yarn verify` on the final head.

## Decisions

- A JPEG without an end-of-image marker is refused (`club_event_file_format_unsupported`) instead of being copied to the end: the only safe way to know where the image stops.
- The undo behaviours (#898, #899) change the spec's recorded build decisions (soft-deleted undone pictures, undo restores marks), so they go to the owner as issues rather than being changed in this PR.

## Files changed

- `packages/core/src/image-metadata.ts`, `packages/core/src/__tests__/image-metadata.test.mjs`
- `packages/app/.ai/qa/tests/_fixtures/isolation/inventory/activities.json` (layout only)
- `packages/app/src/modules/activities/di.ts` (comment order only)
- this run log

## Open problems / next steps

- The PR keeps `needs-qa` and `risk-high`: the merge train holds it until the owner runs the QA section of the PR description and sets `qa`.
