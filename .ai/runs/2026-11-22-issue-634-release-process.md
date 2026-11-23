# Run: release process for one production serving every club (#634)

- **Goal and trigger:** Cezar run of `om-auto-fix-issue` for issue #634 (E22-S08, epic #626), queued by the `cezar`
  label on 2026-11-22.
- **Issue / branch:** #634, `feat/issue-634-release-process-one-production`. No spec: docs-only change (Axis 3
  `direct`); the issue itself names the two files.
- **Decision referenced:** D-034 (one production instance for many clubs), recorded by the open PR #635 at
  `.ai/specs/research/decisions/D-034-many-clubs-on-one-instance.md`. Referenced by id and path, not as a Markdown link,
  so this PR does not depend on #635's merge order.

## Steps

1. Claimed #634 (assignee, `in-progress`, `🤖` claim comment naming this worktree and branch).
2. Read `SDLC.md`, `docs/ops/deploy.md`, `docs/ops/incident.md`, `docs/ops/github-settings.md` §7, `release.yml`,
   ADR-019/ADR-021/S5.4/S14.4–S14.6 of the engineering standards, epic #626 and PR #635.
3. `docs/ops/deploy.md`: D-034 paragraph in the intro; production row of the environments table; new section
   "Production release" (stages staging → demo club → every club, release window, release notes for club
   administrators in PL and EN, expand/contract across two releases, per-club behaviour through club settings and
   whether ADR-019 still holds, a 12-item checklist); production deploy bullet points at the checklist; rollback gains
   a club-setting first step, a decision time and the announcement to club administrators.
4. `SDLC.md`: a `Release` row in the ticket lifecycle and a section "Releasing to production" with what every pull
   request owes the release (expand/contract, club setting for risky behaviour, plain-words note for the release notes).

## Decisions and reasons

- **Release window Tue–Thu 20:30–22:30 Europe/Warsaw:** after evening trainings, before night and 06:00/09:00 jobs
  (charge generation, reminders), away from weekend matches and tournaments, and a maintainer must be free the next
  morning to watch those jobs. Only `priority-extreme` goes outside it.
- **Demo club stage:** code reaches every club in one deploy, so the demo club (synthetic, owned by the maintainers, on
  production) holds back behaviour, not code. Pre-production acceptance happens on staging's seeded demonstration club.
- **Release notes for club administrators:** published in the tag's GitHub release body and sent by e-mail, not as a
  repository file, because repository text is English-only (`AGENTS.md`) and there is no in-app broadcast yet.
- **ADR-019 still holds:** club settings (`club_core_club_settings`) cover per-club rollout; the environment kill
  switches stay all-club incident tools (noted that the app does not read them yet); revisit when a percentage or
  time-based rollout is needed or more than three rollout switches are live. The ADR row in the engineering standards
  still says "one club per instance"; left for the D-034 spec story (#627) rather than widened here.
- **Contract step waits at least a week** after its expand release served production, so a rollback target always
  exists.

## Files changed

- `docs/ops/deploy.md`
- `SDLC.md`
- `.ai/runs/2026-11-22-issue-634-release-process.md`

## Commands and results

- `yarn format:check` → `2033 Vereino file(s), 0 unformatted`
- `yarn secrets:check` → no secrets found
- Checklist size: 19 lines including heading and intro, longest line 119 characters (fits one screen).
- `yarn verify` → `[verify] all 20 step(s) passed`
- `yarn guard` → `No blocking findings.`

No integration test is added or changed (docs only).

## Open problems / next steps

- The production demo club does not exist yet; created by hand once, or by the #630 command when it lands.
- ADR-019's rationale text in the engineering standards still reads "one club per instance"; #627 updates it with DD-02.
