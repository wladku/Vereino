# Spec changelog entries

One file per change to a spec, so pull requests that run in parallel never edit the same lines.

Until 2026-11-05 every PR appended a row to the `## Changelog` table at the end of the spec it changed. All of those rows landed on the same last lines, so every merge to `main` put the other open PRs into conflict (on 2026-11-05, 67 of 70 spec-file conflicts between open PRs were only these rows). Those rows stay in the specs, frozen. Each later change is a file here.

## Adding an entry

- Path: `.ai/specs/changelog/<spec-file-name-without-.md>/<YYYY-MM-DD>-<slug>.md`. The folder name is the spec's file name, so it stays the same when the spec moves to `implemented/` or `archive/`.
- Date: the day of the change. Slug: kebab-case, unique within the folder; use the issue and topic (`2026-11-06-issue-92-team-age-category.md`). Add `-2`, `-3` … for a second entry with the same slug.
- Content: exactly one line, a Changelog table row: `| 2026-11-06 | E06-S07 (#92): what changed and why |`. The date in the row matches the file name.
- Never append a row to a spec's own `## Changelog` table. `yarn spec-changelogs:check` (a `yarn verify` step) rejects table rows dated after 2026-11-05.

## Reading the history

The frozen table in the spec holds the rows up to 2026-11-05. The rest, in date order:

```bash
cat .ai/specs/changelog/2026-10-20-vereino-club-management/*.md
```
