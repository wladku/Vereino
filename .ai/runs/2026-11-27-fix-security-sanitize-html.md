# Run: sanitize-html security override (P6), issue #741

- **Trigger:** Dependabot triage of #741 in a Claude Code session; the owner approved the P6 override on 2026-11-27 ("Tak, zatwierdzam").
- **Branch:** `fix/security-sanitize-html` (from `main`).
- **Spec:** `.ai/specs/2026-10-21-engineering-standards-and-patterns.md` — P4, P6, S16.3.

## Goal

Close Dependabot alerts #25, #26, #35 and #36 (`sanitize-html` 2.17.5, four medium XSS advisories, fixed by 2.18.0). The vulnerable copy is pinned exactly by `@open-mercato/core` and `@open-mercato/shared` 0.9.0 (P1); the app's own `^2.17.5` already resolved to 2.18.1.

## Steps and decisions

1. Root `resolutions`: `sanitize-html: 2.18.1`. Chosen over 2.18.2 because the app already ran 2.18.1, so the platform copy joins the tested one and a single copy remains. 2.18.1 was published 2026-10-14, well past the 5-day release-age gate.
2. `yarn install --mode=update-lockfile`: the `sanitize-html@npm:2.17.5` entry is gone; every dependent resolves to 2.18.1.
3. `CONTRIBUTING.md` → *Root `resolutions` (P4)*: row with reason and removal condition (the platform pins ≥ 2.18.0, #498).

## Validation

Full gate, integration suite and browser smoke in CI on the pull request. No local install or test run.
