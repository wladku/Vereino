---
title: "Edit i18n catalogs as JSON, never with line-based deletes"
modules: ["platform"]
areas: ["backend-ui", "testing"]
topics: ["i18n", "catalogs", "json", "integration-tests"]
---

# Edit i18n catalogs as JSON, never with line-based deletes

**Context**: Issue #111 (2026-11-08) moved the body of the Today "Payments" tile from `people` to `payments` and removed the unused key `people.club.tiles.payments.description` with `sed -i '/key/d'`.

**Problem**:
- The key was the last entry of both catalogs. Deleting its line left a trailing comma on the line before.
- Neither `yarn typecheck` nor the jest suites parse the module catalogs, so the error stayed hidden.
- It surfaced only after a full production build: the integration runner's `yarn initialize` failed with `JSON does not support trailing commas`, which cost one whole integration cycle.

**Rule**:
- Add or remove catalog keys by parsing the file as JSON, or by an edit that keeps the comma structure valid.
- After touching `i18n/*.json`, run a quick parse of the touched catalogs before any build, for example `node -e "JSON.parse(require('fs').readFileSync(f,'utf8'))"`. `yarn verify` also checks the en/pl key sets.

**Applies to**: `packages/app/src/modules/*/i18n/{en,pl}.json`; any scripted edit of JSON configuration.
