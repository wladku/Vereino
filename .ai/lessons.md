# Lessons

Each lesson is one record, `.ai/lessons/<kebab-case-slug>.md`, whose front matter (`title`, `modules`, `areas`, `topics`) is the catalog. This file holds no rows: a shared index that every lesson PR edited broke `lessons:check` after merges, so the catalog is printed from the records on demand. Route the task first, then read only records whose **modules**, standalone-harness **areas**, or **topics** match the work.

## Finding lessons

1. Start with the exact module ID when one is named by the task.
2. Add every matching area from the standalone harness router: `architecture`, `module-data`, `umes`, `backend-ui`, `integration`, `ai-workflow`, `debugging`, `testing`, `framework-context`, or `spec-pr`.
3. Use topics to narrow cross-cutting concerns such as `data-scoping`, `optimistic-locking`, `query-index`, or `generated-files`.
4. Open only the matching records; do not bulk-read `.ai/lessons/`.

```bash
yarn lessons:list                      # every record as one row: title, link, areas, modules, topics
yarn lessons:list <term> [<term>...]   # rows containing every term, e.g. yarn lessons:list club_core testing
rg -l '"<area>"|"<module>"|"<topic>"' .ai/lessons/*.md
```

## Adding or updating a lesson

- Copy `.ai/lessons/_template.md` to one focused `.ai/lessons/<kebab-case-slug>.md`; update an existing record instead of duplicating it.
- Preserve the front matter keys `title`, `modules`, `areas`, and `topics`. Use `platform` only when no module or package owns the lesson, and put the primary area first. Keep the title stable when code or specs cite it.
- There is no row to add anywhere else, so branches that add or edit different lessons merge without a conflict, on GitHub and locally.
- Put hard boundaries in `AGENTS.md`; lessons explain recurring evidence and the durable rule.
- Run `yarn lessons:check` before committing.
