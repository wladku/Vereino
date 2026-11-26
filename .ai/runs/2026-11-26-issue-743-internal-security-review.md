# Run — issue #743: internal security review before the first real club data

- **Goal:** do the internal part of E25-S09 as the owner decided on 2026-11-26: run `om-auto-sec-report` over the whole codebase and the open E25 findings, keep a redacted report, and file an issue for every finding at high or critical. The external penetration test is the owner's to schedule, so #743 stays open for it.
- **Trigger:** Cezar run 37bf97ef (`om-auto-fix-issue`), issue labelled `cezar`.
- **Branch:** `docs/issue-743-internal-security-review`, cut from `main` 1e45a949.
- **Issue:** #743 (epic #734). This PR refers to the issue but does not close it.

## Steps

1. Claimed #743 with all three signals (assignee, `in-progress`, and a `🤖` comment naming the run, worktree and branch).
2. The skill only knows PR, branch and spec windows, so I adapted the window to "whole codebase at `main` 1e45a949". I split it into seven units, each run in `om-auto-sec-report-pr` sub-unit mode by a read-only subagent working from one shared brief (scratch space is the git-ignored `.ai/tmp/om-auto-sec-report/whole-codebase-2026-11-26/`):
   - U1: sign-in, sessions and sessionless routes.
   - U2: payments.
   - U3: facilities and activities.
   - U4: people, groups and communication.
   - U5: club_core, foundation, training and the example modules.
   - U6: platform configuration, deployment, CI and the shared packages.
   - U7: the 80 rows of `docs/compliance/asvs-requirements.md` owned by #743, i.e. the open E25 findings.
3. U3's activities sub-agent reported back to the coordinator instead of to U3, so I forwarded its result to U3.
4. I added missing finding ids to U1 (U1-1 … U1-10) so the aggregate can cite them.
5. I redacted four lines of the U5 fragment that hinted at where the withheld finding is: the summary vector, the recommended line, a vector-table row and a next step.
6. I checked the one major finding (U5-1) against the code myself and confirmed it: the archive the club administrator can download uses the same format that the operator restore reads, and the restore inserts its rows unchanged. It stays at high severity and withheld.
7. I aggregated the fragments into `.ai/analysis/sec-report-whole-codebase-2026-11-26.md` and rendered an HTML mirror with the installed `marked` (no script, no remote assets). The aggregate has:
   - an executive summary;
   - E25 story status;
   - scope hints for the external test;
   - consolidated next steps, exactly one of them `[recommended]`;
   - an OWASP heatmap;
   - a vector matrix;
   - the seven fragments, verbatim apart from steps 4 and 5;
   - limits and the queue.
8. I ran the pre-publish gate on both files: the disclosure check against U5's withheld tokens, the secret-leak grep and the trailing-whitespace check all came back clean.
9. I filed U5-1 privately as a draft GitHub security advisory (the channel `SECURITY.md` names) and publicly as #806. The public issue carries severity, OWASP category and reachability only.

## Decisions

- **Withheld, not public:** the repository is public and `SECURITY.md` forbids public vulnerability issues. "An issue for every high/critical finding" is therefore met with a detail-free public issue (#806) plus a private advisory.
- **Committed report:** `securityReport.publish` is unset, which means local by default. I committed the report anyway, because the owner's decision on #743 asks to keep it and the acceptance criteria ask for it to be filed. It carries placeholders only.
- **Severity mapping:** blocker = critical, major = high, minor = medium. Medium findings (22) get no issues in this run. They are listed with their next steps in the report for the owner to triage.
- **ASVS files left as they are:** the code-read verdicts are in the report (U7 table). The checklist only counts a row as met with a named test or gate, and other open PRs edit the same files.

## Results

- 7 units complete. Totals: 0 blocker, 1 major (withheld, #806), 22 minor, 12 nit, 19 info.
- No finding lets one club reach another club's data through a request.
- U7 verdicts on the 80 rows: 40 confirmed by code read (each still needs a named test), 30 gaps confirmed, 6 rows that map to 5 findings, and 4 that need a running staging deployment (V4.2.1, V13.4.3, V14.2.1, V16.2.2).
- `yarn verify`: the first run passed every step through `forbidden-packages:check`. It then failed at `lessons:check`: `areas contain a value outside the standalone router taxonomy` on the new lesson. I fixed the areas, and `yarn verify --from lessons:check` passed the 7 remaining steps, `build` included.
- `yarn guard`: no blocking findings.
- No integration test: the change adds no route, page or test.

## Open problems / next steps

- External penetration test of staging: the owner decides budget, tester and date; #743 stays open for it.
- Medium findings: triage and file the ones worth fixing, starting with U1-1 (sign-in lockout), U2-1 (refund race), U2-2/U5-2 (platform `admin` role on club administrators), and U6-1/U6-3/U7-3 (boot check).
- The withheld detail lives only on the run's machine (`.ai/tmp/om-auto-sec-report-pr/withheld/`) and in the private advisory.
