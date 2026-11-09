---
title: "A new people-import row rule goes into planImport, so staged rows are re-checked at the commit"
modules: ["people"]
areas: ["module-data"]
topics: ["import", "validation", "commit"]
---

# A new people-import row rule goes into planImport, so staged rows are re-checked at the commit

**Context**: #191 made the person commands refuse a phone that is neither Polish nor E.164. The import commit writes rows through those commands, re-planning the stored rows (`planStoredImport` → `planImport`) but not re-normalizing them: the stored `raw` row keeps the error the normalization found at upload time.

**Problem**: A rule added only to `normalizeImportRow`/`readField` is missed for an import previewed before the rule shipped; its commit then hits the command's 422 and rolls the whole transaction back with no row named.

**Rule**: When a person command gains a validation the import can violate, add the matching row check to `planImport` (as `phoneProblem` does) so it runs at the preview and again at the commit and turns the row into a per-row `error` with its column; give it an `import_*` code in `IMPORT_ROW_ERRORS` and a `people.imports.rowErrors.*` label in both catalogs.

**Applies to**: `packages/app/src/modules/people/lib/import-rules.ts`, `commands/imports.ts`, `commands/persons.ts`.
