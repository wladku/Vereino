---
title: "A rule that must answer 422 is checked in the command, not in the Zod request schema, because a parse failure answers 400"
modules: ["club_core", "foundation"]
areas: ["module-data", "testing"]
topics: ["validation", "error-codes", "field-errors", "zod"]
---

# A rule that must answer 422 is checked in the command, not in the Zod request schema, because a parse failure answers 400

**Context**: #87 asked for 422 with a field error for an unknown time zone, a threshold outside 13–18 and a 25-digit bank account. All three were Zod refinements or bounds in the request schema, and `authorizeScoped` turns every parse failure into 400 (TEST-F09 had pinned `ownAccountMinAge: 0` to 400).

**Problem**: Engineering standards S6.7 separate 400 (malformed input) from 422 (a business rule broken by well-formed input). A rule kept in the request schema can never answer 422 or carry an S6.7 code, so the UI cannot translate it or place it next to the field.

**Rule**: The request schema checks only the shape (type, length, `.strict()`). A domain rule is a pure function in `lib/` (for example `clubSettingsRuleProblem`, `normalizeBankAccount`), called in the command after `authorizeScoped`. On failure the command throws the module's coded 422 error with `fieldErrors: { <field>: message }` (`throwFieldError` in `club_core/commands/shared.ts`, `throwNameError` in `sections.ts`). Stored-value schemas (`resolveClubSettings`) may keep the full rule, because they fall back to defaults instead of answering.

**Applies to**: Request validators in `packages/app/src/modules/<id>/data/validators.ts`, the commands that parse them, and the integration tests that assert 400 or 422.
