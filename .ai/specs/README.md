# Feature Specs — vereino

Specs document business feature design decisions. Source of truth for what was built and why.

## What belongs here

- New domain features (inventory management, order flow, customer portal, etc.)
- Data model decisions (entity design, relationships, indexing strategy)
- API contract definitions for custom endpoints
- Integration design (external services, webhooks, import/export)

## What does NOT belong here

Framework-level decisions belong in the Open Mercato core repo. If you're unsure,
it's almost certainly an app-level decision.

## Naming convention

{YYYY-MM-DD}-{slug}.md
Example: 2026-03-01-inventory-module.md

## Folders and lifecycle

| Folder | Specs in it |
|---|---|
| `.ai/specs/` | active: `Draft`, `Ready for implementation`, `In progress` |
| `.ai/specs/implemented/` | `Implemented` — every phase landed, acceptance criteria met |
| `.ai/specs/archive/` | `Archived` — superseded or abandoned (reason and successor in the Changelog) |
| `.ai/specs/research/` | read-only discovery inputs (interviews, decisions, drafts), not specs |

Specs move between folders with `git mv`, keep their file name, and are never deleted. Rules: `AGENTS.md` → **Project memory (`.ai/`)**.

## Changelog entries

Never append a row to a spec's `## Changelog` table: parallel PRs would all edit its last lines and conflict. Each change is its own file, `.ai/specs/changelog/<spec-file-name-without-.md>/<YYYY-MM-DD>-<slug>.md`, holding one `| date | change |` row. The rows up to 2026-11-05 stay frozen in the spec, and its Changelog section points to the folder. Format and reading order: [`changelog/README.md`](changelog/README.md). `yarn spec-changelogs:check` (a `yarn verify` step) enforces it.

## Workflow

1. Route every new application, multi-module feature, or non-trivial business slice through `om-spec-writing` and `.ai/guides/spec-delivery.md`.
2. After invoking the skill, create the skeleton from `SPEC-000-template.md`; keep it `Draft` while blocking questions or incomplete contracts remain.
3. Set `Ready for implementation` only after the final compliance report and requirement traceability pass and the user approves implementation.
4. Implement through `om-implement-spec` (interactive local) or `om-auto-implement-spec` (whole-spec PR), one dependency-ordered phase at a time; add a changelog entry file (see **Changelog entries**), and update acceptance evidence and phase state as work lands. Local delivery confirms its phase-derived plan before coding and ends with the stable `Spec:` reference without implying PR automation.
