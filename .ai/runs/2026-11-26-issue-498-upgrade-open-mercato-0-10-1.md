# Run: #498 — upgrade Open Mercato from 0.9.0 to 0.10.1 (ENG-UPG-01)

- **Trigger:** cezar run cfef92b9 (`om-auto-fix-issue 498`), issue labelled `cezar`; owner decision on #498 of 2026-11-26 evening ("start the upgrade 0.9.0 → 0.10.1 now", one build, `risk-high`, `needs-qa`; approves `@open-mercato/*` 0.10.1 and P2 bumps only as the release requires).
- **Issue:** #498. **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` (P1/P2, ADR-001, ADR-023, S8.4). **Branch:** `chore/upgrade-open-mercato-0.10.1`.
- **Upgrade skill:** `.ai/skills/om-auto-upgrade-0.9.0-to-0.10.0/SKILL.md`, copied from `@open-mercato/cli` 0.10.1 (`dist/agentic/shared/ai/skills/`) like the earlier upgrade skills; 0.10.1 ships no separate 0.10.0 → 0.10.1 skill, so the 0.10.0 skill covers the window.
- **Hours spent (input to ADR-001):** see "Time" below.

## Release check

- 0.10.1 was published 2026-11-25 (0.10.0 on 2026-11-23). Same major line (0.x minor), no module Vereino uses removed, no irreversible data migration Vereino needs (the money and staff migrations concern modules Vereino does not enable). No stop condition of the issue applies.
- P5 age gate: `.yarnrc.yml` preapproves `@open-mercato/*`, so the one-day-old release installs without `--no-time-gate`; every third-party package keeps the five-day gate.

## Steps

PLACEHOLDER

## Time

PLACEHOLDER
