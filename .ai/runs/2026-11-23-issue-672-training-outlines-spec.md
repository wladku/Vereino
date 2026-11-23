# Run: spec for training outlines, the outline library and the medical expiry date (#672)

- **Goal and trigger:** cezar task e42b393d (`om-auto-fix-issue 672`, label `cezar`). The issue asks for a design-only spec PR through `om-auto-write-spec`, with the owner's choices left as Open Questions.
- **Issue / epic / branch:** #672 (E24-S01), epic #671, decision D-037 (recorded in PR #670, not yet on `main`); branch `docs/issue-672-training-outlines-library-medical-expiry`.
- **Started / finished:** 2026-11-23.

## Steps

1. Concurrency check: issue unassigned, no claim, no open PR referencing it. Claimed (assignee, `in-progress`, claim comment naming worktree and branch).
2. Route: feature route → `om-auto-write-spec` → `om-spec-writing`. As in #627, the issue wants the owner's choices as Open Questions, so the spec keeps an Open Questions table with recommended defaults instead of a resolved-assumptions section, and the PR stays draft.
3. Two read-only Explore subagents: code facts (people, activities, groups, club_core, foundation, isolation inventory, scheduling, uploads, CSV reports) and spec/compliance facts (club management spec, many-clubs spec, data-export spec, `docs/compliance/`, house style).
4. PZPN sources: a web-fetch agent found the documents but could not read the PDFs. Extracted the text with `pdfjs-dist` in a temp directory (no poppler or pip on the server; lesson `read-fetched-pdfs-with-pdfjs-in-a-temp-dir`). Found: the schedule definition (Regulamin §3.8), the outline definition (§3.9), outline upload as a PDF per event, attendance statuses Obecny/Nieobecny/Usprawiedliwiony with a 72-hour lock, the red/orange/green medical rule, and no import. The sample outlines are images, so the print layout is a verification item (V-O2).
5. Wrote `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md` (prefix O, REQ-O01…O16, DD-O01…O15, TEST-O01…O14, AC-O01…O13, Q-O01…Q-O10, V-O1/V-O2).
6. A fresh subagent reviewed the spec as a staff engineer and returned 12 findings. All were applied:
   - consent only from the person or a guardian, stored in `StoredConsents`, with a came-of-age rule;
   - the library tenant is not a club, plus the exact AGENTS.md exception text;
   - how an encrypted date is queried;
   - Q-O10 on splitting the spec;
   - the `activities.occurrenceFacts` contract and a new injection spot;
   - session copy life cycle with an explicit `ensure-copy`;
   - dependencies on #527 and E22;
   - erasure of library rater rows;
   - a library image route;
   - the attendance mapping corrected to `declared = no`;
   - compliance-report and measure fixes;
   - a versioned rater secret, plus `auditedRead` for coach reads.
7. Club management spec: the Non-goals line on coaching tools and the product-reference line narrowed to match N01 as narrowed by D-037. Added changelog files for both specs.

## Decisions

- New module `training` for outlines and the library (Q-O09); PZPN exports in `activities` beside the coach-units CSV.
- Library entries in one dedicated library tenant reached only through `trainingLibrary` with configured scope, so the design adds no system-scope query. It still needs an AGENTS.md exception for the cross-tenant write (Ask First).
- The PDF is a print page with "Save as PDF", which adds no dependency (Q-O07).
- Mockups and screenshots (step 5 of `om-auto-write-spec`) were skipped: the spec gives text mockups per page, and no app was started for this documentation-only run.

## Files changed

- `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md` (new)
- `.ai/specs/2026-10-20-vereino-club-management.md` (Non-goals line and product-reference line)
- `.ai/specs/changelog/2026-11-23-vereino-training-outlines-and-medical-expiry/2026-11-23-initial-draft.md`
- `.ai/specs/changelog/2026-10-20-vereino-club-management/2026-11-23-issue-672-coaching-tools-narrowed.md`
- `.ai/lessons/read-fetched-pdfs-with-pdfjs-in-a-temp-dir.md`
- this log

## Results

See the PR for the gate output (`yarn verify`, `yarn guard`). No integration tests ran because the change is documentation only.

## Open problems / next steps

- The owner answers Q-O01…Q-O10, approves the Ask First items, and checks V-O1/V-O2 with a certified club.
- PR #670 (the D-037 record) should merge first; this spec links to it.
- The build stories follow the four phases (E24-S02…S05).
