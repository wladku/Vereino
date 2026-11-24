# Run: record the E24 owner decisions and mark the training outlines spec ready

- **Goal and trigger:** cezar docs task for epic E24 (#671). The owner decided every Open Question of
  `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md` on 2026-11-24
  ([decision comment](https://github.com/wladku/Vereino/issues/671#issuecomment-7123134361)); record the answers and
  approvals and set the spec to `Ready for implementation`.
- **Spec / issue / branch:** the spec above; #671 (epic), #672 (story); branch `docs/issue-671-training-outlines-decisions`
  from `origin/main` at `5683e44c`.

## Steps

1. Read the decision comment on #671 and the spec's Status line, *Ask First items*, *Final Compliance Report* and
   *Open Questions*.
2. Status line → `Ready for implementation` with a link to the decision.
3. Open Questions: Resolution column of Q-O01…Q-O10 filled with the accepted defaults and the date 2026-11-24; the
   lawyer warnings kept on Q-O03 and Q-O06, worded as blocking the production release of phases 4 and 1, not building;
   V-O1 and V-O2 kept open as exit-gate checks of phases 3 and 2.
4. Ask First items: an *Approval* column — the module `training` and every migration of phases 1–4 approved on
   2026-11-24; the other items stay open until their phase; the PDF dependency is not needed (Q-O07).
5. Compliance report: verdict and two evidence cells updated.
6. Changelog file `.ai/specs/changelog/2026-11-23-vereino-training-outlines-and-medical-expiry/2026-11-24-issue-671-ready.md`.

## Decisions

- The owner approved "the new module `training` and every migration the spec defines"; the other Ask First items
  (occurrence-facts contract and spot, library configuration, library tenant and its AGENTS.md scope rule, the new
  isolation probe kind) are not migrations or the module, so they are recorded as still open rather than approved —
  "anything beyond the spec still needs a separate approval" does not stretch to them.
- Status uses the lifecycle value `Ready for implementation` (AGENTS.md *Spec status line*); the spec stays in
  `.ai/specs/`.

## Files changed

- `.ai/specs/2026-11-23-vereino-training-outlines-and-medical-expiry.md`
- `.ai/specs/changelog/2026-11-23-vereino-training-outlines-and-medical-expiry/2026-11-24-issue-671-ready.md`
- `.ai/runs/2026-11-24-issue-671-training-outlines-decisions.md`

## Commands and results

- `yarn secrets:check` — no secrets found.
- `yarn format:check` — 0 unformatted.
- `yarn glossary:check` — 0 problems.
- `yarn lessons:check` — valid.
- `yarn spec-changelogs:check` — valid.
- The code steps of `yarn verify` (typecheck, lint, tests, build) were not run: the change touches only Markdown under
  `.ai/`.

## Open problems and next steps

- Lawyer: Q-O03 (licence and terms) before the production release of phase 4; Q-O06 (legal basis) before the production
  release of phase 1.
- V-O1 and V-O2 at the exit gates of phases 3 and 2.
- The open Ask First items are asked before phases 2 and 4.
