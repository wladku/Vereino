# Software delivery process

## Purpose

This file documents how work flows from ticket to merged PR in this repository. The agent skills configured in `.ai/agentic.config.json` enforce the process; humans read it here. PRs target `main` (resolved at runtime from the repository's default branch, `baseBranch: "auto"`); issues and PRs live in GitHub, with every tracker operation the skills run defined in `.ai/trackers/github.md` (edit that file to extend or override tracker behavior).

Work enters through two paths: a free-form task brief handed to an agent, or a filed ticket. Both converge on the same review loop, the same validation gate, and the same merge gates. Project rules that apply on every path — spec gate, `.ai/runs/` run logs, `.ai/lessons/` records — live in `AGENTS.md`.

<!-- discovery:start -->
Before any of that, `om-discover` establishes the product context every later decision reads: `.ai/specs/product-brief.md` — who the users are, what hurts, what the product is not, which rules and decisions bind the work. The Definition of Ready below is the contract between that context and Intake.
<!-- discovery:end -->

## Roles

- **Author** — the human or agent who writes the change. Owns the ticket from claim to a merge-ready PR.
- **Reviewer** — reads the diff and approves or requests changes. May be a human or the `om-auto-review-pr` skill; the `om-code-review` checklist applies either way, together with `CODE_REVIEW.md` and `.ai/review-checklist.md`.
- **Product owner** — owns the why and the value: the product brief, the scope split (now, later, not doing), the success criteria, and the ticket-level tier of the Definition of Ready. Confirms the brief before it is written and the backlog tree before it is filed; owns every product decision in the brief that names no other owner. Referenced by role, never by name. <!-- discovery -->
- **Maintainer** — owns branch protection, the label taxonomy, the config, and this document; arbitrates when gates conflict.

## Ticket lifecycle

| Stage | What happens | Driven by | Done when |
|---|---|---|---|
| Discovery | The product context is established before any idea is weighed — problem and who has it, stakeholders, rules, flows, success criteria, scope — from material that exists, with every claim tagged by its evidence and every decision owned by a person; the product owner confirms the brief before it is written. Then an idea, question, or itch is talked through: the problem is questioned, alternatives (including building nothing) are weighed, and the conversation ends in a routing decision. | `om-discover` (product level, with the product owner), `om-synthetic-users` (first panel), `om-mockup-prototype` (optional low-fi flow), `om-discover --refresh`, `om-backlog --dry-run`, and `om-brainstorm` (one idea), or a human | A product brief, or a routed conversation with a brief when the work continues <!-- discovery --> |
| Intake | A ticket or task brief is filed in GitHub and meets the Definition of Ready below. `om-prepare-issue` and `om-backlog` file it with SDLC labels and the ready sections; `om-auto-manage-issues` reports what an existing ticket still lacks. New capability, schema, API contract or multi-phase work goes through a spec in `.ai/specs/` first (see `AGENTS.md`, Axis 3). | Anyone, `om-prepare-issue`, `om-backlog`, `om-auto-manage-issues` | Ticket exists and is ready, or its gaps are named on the ticket <!-- discovery --> |
| Triage | Confirm the issue is real, still unfixed on `main`, and not already claimed or covered by an open PR. Read-only; stops the chain cleanly when there is nothing to do. | `om-verify-in-repo` or a human | Confirmed actionable, or closed as no-action |
| Claim | The author claims the ticket so concurrent agents back off. See the claim protocol below. | `om-fix` / `om-auto-create-pr`, or a human | Claim visible on the ticket |
| Implement | Locate the minimal change surface (`om-root-cause`, read-only), then implement the change with regression tests and run the validation gate. Task briefs without a ticket go through `om-auto-create-pr`, which plans, implements phase by phase in an isolated worktree, and runs the same gate. | `om-root-cause` + `om-fix`, `om-auto-create-pr`, or a human author | Change complete, validation gate green |
| PR | Commit, push, and open a PR against `main` with normalized labels. On a hand-worked branch, `om-check-and-commit` runs the gate, fixes obvious drift, and pushes when green. | `om-open-pr`, `om-auto-create-pr`, or `om-check-and-commit` | Open, labeled PR |
| Review loop | The reviewer reads the diff against the `om-code-review` checklist and approves or requests changes. Requested changes are addressed (`om-auto-continue-pr` resumes agent PRs from the tracking plan) and the PR is re-reviewed until approved. | `om-auto-review-pr` (single PR), `om-review-prs` (sweep), or a human | Approving review submitted |
| Merge | `om-merge-buddy` reports, read-only, which PRs can merge now and which are close but blocked. `om-approve-merge-pr` re-checks every gate, approves, and squash-merges. | `om-merge-buddy` + `om-approve-merge-pr`, or a human | PR squash-merged into `main` |
| Post-merge housekeeping | Close issues the merged PR fixes; comment on issues whose PRs were closed without merging; turn leftover asks or review comments into tracked follow-up issues. | `om-close-fixed-issues`, `om-followup-issue-from-pr` | Tracker reconciled, follow-ups filed |
| Release | The owner cuts a `vX.Y.Z` release from `main`; a maintainer takes it through staging, the demo club and production inside the release window, with release notes for club administrators in Polish and English. See "Releasing to production" below. | A maintainer (`docs/ops/deploy.md`) | Tag deployed to production, checklist recorded |

<!-- discovery:start -->
## Definition of Ready

A ticket is ready for implementation when the answers below are on the ticket or in a spec it links. They come in two tiers, because a spec can supply the second but never the first.

**Ticket-level — only a human can supply these:**

- the problem or need, and who has it (a user or a role);
- the expected outcome, and how it will be checked;
- what is out of scope;
- open questions, each marked blocking or non-blocking — no blocking question left unanswered;
- any autonomous assumption confirmed by a human (the resolved-assumptions comment on a spec PR).

**Spec-level — a covering spec supplies these, and `om-auto-write-spec` writes them when they are missing:**

- acceptance criteria;
- business rules;
- the happy path and the main unhappy paths;
- impact on data and permissions;
- dependencies;
- a link to the prototype or mockups when the change is user-facing.

For a bug, ready means reproducible: `om-verify-in-repo` is that gate, and the list above applies only to its ticket-level items. Enforcement: `om-prepare-issue` files tickets with these sections; `om-auto-manage-issues` records `READY_STATUS` per issue and posts a not-ready comment naming what is missing; `om-auto-fix-issue`'s feature route stops on a ticket that fails the ticket-level tier instead of speccing around the gap, the way `om-verify-in-repo` stops on a bug that is not real. Spec-level gaps are not a stop — the spec is authored. A maintainer may waive an item by saying so on the ticket. This section is what those skills read: a repository whose `SDLC.md` has no Definition of Ready gets no readiness check.

## Product decisions as a protected contract

When `om-discover` has written `.ai/specs/product-brief.md`, its **Non-goals**, **Business rules**, and **Decisions** tables are protected the way `BACKWARD_COMPATIBILITY.md` protects contract surfaces. Each entry carries a stable id (`N01`, `R03`, `D07`), an owner, a status (`active` or `superseded`), a review-by date, and a required path for changing it. The rules:

- A PR that builds something a non-goal excludes, or contradicts a business rule or a decision, without a superseding entry in the same PR is a **blocker** in review, quoting the entry and its id. The way out is never "delete the code": it is "change the decision explicitly" — a superseding row approved by the entry's owner, with the maintainer arbitrating a dispute, as in Roles.
- The decisions in play are surfaced where people work, not remembered: `om-auto-manage-issues` lists them in its implementation-notes comment, `om-spec-writing` carries a *Decisions in play* section, and every PR body carries *Decisions touched*. A newcomer or a new agent reads them at the issue, the spec, or the PR, not in a chat history.
- An autonomous assumption a human confirmed on a spec PR (the resolved-assumptions comment) is recorded as a decision on the next `om-discover --refresh`, with the confirmer as owner, so the reason a thing is the way it is survives the people who decided it.
- Decisions age: an entry past its review-by date is flagged in review as due for a look, not enforced blindly. Which entries block more than they protect is a retro question.
<!-- discovery:end -->

## Label state machine

Pipeline labels are mutually exclusive: a PR carries at most one, and it names where the PR sits in the flow.

- A ready, non-draft PR carries `review`.
- The reviewer moves it: request changes → `changes-requested`; after fixes it returns to `review`; approval → `merge-queue`.
- `qa` and `qa-failed` are set only by a human doing manual QA. Automated skills may request QA with `needs-qa`; they never set `qa`.
- `blocked` and `do-not-merge` are set and cleared by humans and stop the flow wherever it is.

| Group | Labels | Exclusivity | Meaning |
|---|---|---|---|
| Pipeline | `review`, `changes-requested`, `qa`, `qa-failed`, `merge-queue`, `blocked`, `do-not-merge` | one at a time | Workflow state |
| Category | `bug`, `feature`, `refactor`, `security`, `dependencies`, `documentation` | additive | Kind of change |
| Meta | `needs-qa`, `skip-qa`, `qa-approved`, `qa-self-verified`, `in-progress`, `ci-monitoring`, `screenshots` | additive | Process signals |
| Priority | `priority-low`, `priority-medium`, `priority-high`, `priority-extreme` | one at a time; unset = medium | Urgency of the work |
| Risk | `risk-low`, `risk-medium`, `risk-high` | one at a time; unset = medium | Blast radius of the change |

`ci-monitoring` marks a PR whose work is finished and reported while an agent watches CI; it is not a claim (see `.ai/trackers/github.md`). `screenshots` marks a PR that carries UI screenshots from the working app as evidence.

Priority is how urgent the work is; risk is how dangerous the change is to ship. A one-line fix for an outage can be `priority-extreme` and `risk-low`; a large auth refactor that can wait can be `priority-low` and `risk-high`. A PR inherits both from its source issue unless the scope clearly changed. When an automated skill adds or changes a pipeline or meta label, it leaves a short comment explaining why.

When no priority label is set, infer one:

- `priority-extreme` — production outage, data loss, or an active security incident.
- `priority-high` — security hardening or a release-blocking regression.
- `priority-medium` — ordinary bug fixes and net-new features (also the default reading of unset).
- `priority-low` — cosmetic, docs-only, dependency bumps, follow-up cleanup.

When no risk label is set, infer one:

- `risk-high` — auth, sessions, tenant/organization scoping, encryption, money, schema migrations, surfaces listed in `BACKWARD_COMPATIBILITY.md`, or broad cross-cutting edits.
- `risk-medium` — an ordinary single-area change that ships with tests (also the default reading of unset).
- `risk-low` — docs-only, test-only, typo, or isolated cosmetic changes.

When signals conflict, pick the higher label and say why in the label comment. A `risk-high` PR strengthens the case for `needs-qa` and deeper review even when it would otherwise look routine.

One label lives outside this taxonomy: `do-not-close`, applied by humans to issues that housekeeping skills must never auto-close. Skills only ever read it.

## QA

The pipeline's QA gate is off (`qaGate: false`), so for `risk-low` and `risk-medium` PRs `needs-qa` is advisory and does not block a merge on its own. **A `risk-high` PR labelled `needs-qa` does not merge before manual QA** (owner decision MT-D02, 2026-11-18, `.ai/specs/2026-11-18-merge-throughput.md`): the merge train holds it, logs why and comments once on the PR, until the owner tests it and sets `qa`; the train then queues it like any other PR. User-facing changes are still proven by the author with browser evidence as `AGENTS.md` requires (both locales, 375 px, console without errors). `qa-failed`, `do-not-merge` and `blocked` remain hard blocks. Automation never sets `qa`, `qa-failed` or `qa-approved`. To make every `needs-qa` a hard block until `qa-approved`, set `qaGate: true` and re-run `om-setup-agent-pipeline`.

**QA instruction.** A `risk-high` PR that asks for QA (`needs-qa`) carries a short Polish test instruction for the owner in its description, between fixed markers (QM-D01/QM-D02, `.ai/specs/2026-11-24-qa-request-email.md`). Plain language, no jargon, no passwords; 3–7 numbered steps saying where to click and what must show. A PR without screens says what the owner sees instead (for example "nic do klikania — sprawdzenie to polecenie; sesja decyzyjna może je uruchomić za Ciebie").

```markdown
<!-- qa-instruction:start -->
## Jak przetestować (QA)
**Co się zmienia:** 1–2 zdania prostym językiem.
**Przygotowanie:** `node C:\Users\wkuc\vereino-sandbox-env\sandbox.mjs preview <PR>` (5–10 min), potem http://127.0.0.1:4300; konto: … (rola, nie hasło).
**Kroki:**
1. …
**Czego nie sprawdzisz:** np. płatność Stripe, klucze Google — i dlaczego.
**Po teście:** działa → etykieta `qa`; nie działa → `qa-failed` i komentarz, co poszło źle.
<!-- qa-instruction:end -->
```

The train's hold comment links the instruction; when the block is missing or empty (or its markers are out of order), the comment says **QA instruction missing** and carries the hidden marker `<!-- merge-train:qa-instruction-missing -->`, so the picker queues a run that writes the block without changing code. When the block is written later, the train edits the same comment (`scripts/merge-train-holds.mjs`).

## The claim protocol

Before mutating an issue or PR, an agent claims it with all three signals: it assigns itself, adds the `in-progress` label, and posts a `🤖`-prefixed claim comment saying what it is doing. Any agent that finds an existing claim backs off instead of colliding. A PR carrying `in-progress` is also skipped by the merge tooling. A claim belongs to the **run** that made it, not to the GitHub account: agents, forks of a session and orchestrated runs all act as the same user, so a run that did not post the claim backs off (or asks) even when the claim carries its own login. The claim comment names the run's worktree, branch and start time (`.ai/skills/om-auto-fix-issue/SKILL.md` §5).

The claim is released when the work finishes — on success and on failure alike. A stale `in-progress` with no recent activity may be cleared by the maintainer.

## The automation contract

The `om-auto-*` skills run this process unattended and are chainable: each accepts the artifact the previous one produced (an issue id, a spec path, or a PR number from the `PR: #<number> (link: <url>)` reference line every PR-producing skill emits), and each detects work already started — an open PR referencing the issue or plan — and continues on it rather than opening a duplicate. A completed autonomous run leaves a **ready** (non-draft), fully labeled PR — one pipeline label, category, QA meta, one priority, one risk — with a run-summary comment, a committed run log in `.ai/runs/`, and, for user-facing changes, screenshots from the working app attached as PR evidence. Draft PRs are reserved for explicitly incomplete states: spec-only design PRs, interrupted hand-offs, or autonomous defaults flagged for human confirmation. Automation never applies `qa-approved`. The run that adds `needs-qa` to a `risk-high` PR writes the PR's `qa-instruction` block in the same step (see "QA"; `.ai/skills/om-open-pr/SKILL.md`), and any run that rewrites a PR description keeps that block; a run queued for a PR whose hold comment says "QA instruction missing" only writes the block.

## Validation gate

Every PR passes the full validation gate before review sign-off, in this order:

- `yarn verify`

Any non-zero exit fails the gate and blocks the PR. `yarn verify` is the only gate command and is identical locally and in CI (`.github/workflows/ci.yml`); `yarn verify --list` shows its steps and `yarn verify --from <step>` resumes after a fix. CI additionally runs `yarn test:integration:vereino` and the agent-browser login smoke.

**Docs-only PRs skip the heavy jobs** (#777). One CI run is 13 jobs and the plan runs 20 at once, so on `pull_request` events a first job `changes` (`scripts/ci-changes.mjs`, no third-party action) diffs the PR merge commit against the base tip. When every changed path is documentation — `**/*.md`, `docs/**`, `.ai/specs/**`, `.ai/runs/**`, `.ai/lessons/**`, `.ai/decisions/**` or `.ai/qa/scenarios/**` — the integration shards, the browser-smoke work, `image-smoke` and `perf` are skipped, while `gate` runs in full and the required checks `integration` and `browser-smoke` still report success (`integration` passes on shards skipped by this rule; `browser-smoke` runs and skips its own steps). Anything else is code, even a Markdown file under `packages/*/.ai/qa/tests/**`, `.github/**`, `scripts/**` or `.ai/harness/**`; so are config files, lockfiles and an empty diff. A failed classification fails `integration` and `browser-smoke`, never skips them. `push` events (to `main` and to `merge-train/**`) always run the full suite, so every batch and every commit on `main` is fully tested.

**Only the merge train merges into `main`, and only a tree that CI tested.** A GitHub ruleset on `main` (ruleset 26707580) requires the CI jobs `gate`, `integration` and `browser-smoke` to pass. Two PRs that each pass alone must not break `main` together (#149 and #150 did, 2026-11-04); the train guarantees that in one of two modes, set by the repository variable `MERGE_TRAIN_BATCH_SIZE` (`.ai/specs/2026-11-18-batch-merge-train.md`):

- **One PR at a time** (variable unset or `1`): the ruleset also requires a branch that is up to date with `main` (*Require branches to be up to date before merging*). After every merge the next PR is behind and must take `main` in and pass CI again before it can merge.
- **Batch train** (`2` to `8`; switched on by the owner per `docs/ops/batch-train-switch-on.md`): the train tests up to that many PRs that are green on their own heads together on the branch `merge-train/batch`, which it builds on the server from `main` and the PR heads (Merges API). When `gate`, `integration` and `browser-smoke` are green on the batch head, it merges the PRs one by one (squash, exactly the tested head) and after each merge checks that `main`'s tree equals the tree the batch tested at that point. A red batch is bisected: the halves are tested in turn, PRs proven good merge, and the PR that is red alone gets the commit status `merge-train/verdict` = failure on its head and the label `merge-train-failed`; it stays out until its author pushes a new commit. A PR that changes `.github/` or `scripts/merge-train*`, or comes from a fork, never shares a batch. A tree mismatch or a merge that keeps failing opens an issue labelled `merge-train-paused`; while one is open the train only plans and logs, and closing it restarts the train. In this mode the ruleset does not require an up-to-date branch; it requires the commit status **`merge-train/verified`** instead, which the train sets on a PR head immediately before it merges that head (in either mode, whenever the ruleset requires it). A merge by hand or by any other agent therefore fails.

Cezar builds at most three issues at a time (`resources.maxParallel: 3` in the user's `~/.cezar/config.json`; owner decision MT-D04, 2026-11-18): the merge train below lets only tested trees into `main`, so parallel runs raise the build rate without risking `main`, and three is about the rate the one-PR train lands — more only produces PRs that age in the queue. **The merge train moves the queue** (`.github/workflows/merge-train.yml`, `scripts/merge-train.mjs`, decisions in `scripts/merge-train-plan.mjs` and `scripts/merge-train-guard.mjs`). It runs on every CI completion, every push to `main` and every 15 minutes. In one-PR mode each run merges (squash) an up-to-date PR whose required checks are green; otherwise it waits for the one PR in flight; otherwise it updates the next PR from `main`. In batch mode each run settles the batch under test (wait, merge, drop or bisect) and builds the next one. The order is `priority-high`, then `priority-medium`, then the rest, oldest first within each. No CI run is spent on a PR that another merge would make stale.

The train skips drafts and PRs labelled `do-not-merge`, `blocked`, `in-progress`, `changes-requested` or `qa-failed`; the repository variable `MERGE_TRAIN_SKIP_LABELS` replaces the list. Independently of that list it holds a `risk-high` PR with `needs-qa` until `qa` (see "QA"). A PR that failed on an older `main` gets one update before it counts as failed. The train labels a PR `merge-train-failed` when a required check failed on an up-to-date head (in batch mode also when its head broke a batch alone), `merge-train-conflict` when it conflicts with `main`, and `merge-train-batched` while it is in the batch under test. It comments once and skips the PR until a new commit, a green rerun or a resolved conflict clears the label. When the PR's head branch names an issue (`feat/issue-123-…`), the train sets and clears the same label on issue #123, so Cezar's issue-label automation starts a fix run at once; a PR whose branch names no issue is left to the hourly picker.

The train needs the `MERGE_TRAIN_TOKEN` secret: a fine-grained token of the owner with Contents, Pull requests, Issues, Commit statuses and Workflows write on this repository. Issues write mirrors labels onto the linked issue and opens the pause issue; Commit statuses write sets `merge-train/verified` and `merge-train/verdict` (without it a train that has to set one stops before it merges anything). The workflow's own `GITHUB_TOKEN` cannot start the CI an update or a batch needs.

**Stacked PRs** (ST-D04, `.ai/specs/2026-11-24-cezar-stall-prevention.md`). A follow-up may be built on an unmerged PR's branch; its PR then targets that branch, and the queue reads only PRs on `main`. Before the queue step each train run reads the open PRs whose base is not `main` (`scripts/merge-train-stacked.mjs`, decision `planRetargets` in `scripts/merge-train-plan.mjs`) and looks up the PR whose head is that base branch: **merged into `main`** → the train sets the stacked PR's base to `main`, comments once, and the PR joins the queue like any other (an update takes `main` in; a conflict gets `merge-train-conflict` and a repair run); **closed without merging** → the train adds `blocked`, comments once that the PR may carry the base's unmerged commits, and never retargets it; the owner decides. **Still open**, **merged into another branch**, or no PR with that head → nothing. With two levels (C on B on A) only B moves after A merges; C follows once B merges into `main`. The train comments on a closed-base PR once and then leaves it alone, so a `blocked` label the owner removed stays removed. The train log names every stacked PR and what it did. The owner setting *Automatically delete head branches* lets GitHub retarget first; the train is the fallback.

**Never act for the train.** No agent (Cezar, `om-*` skills, side sessions) sets the commit statuses `merge-train/verified` or `merge-train/verdict`, pushes to or deletes a `merge-train/**` or `merge-train-build` branch, adds or removes `merge-train-batched`, closes a `merge-train-paused` issue, or merges a PR. The owner does these by hand only in the rollback of `docs/ops/batch-train-switch-on.md` and closes a pause issue after reading it.

**Nobody else refreshes a PR from `main`.** People and agents (Cezar, `om-auto-fix-pr`, side sessions) do not merge `main` into an open PR just to rerun CI or to clear "behind"; the train does it when the PR's turn comes. A PR's author fixes real failures and real conflicts on its branch and pushes, and the train picks the PR up again. A test that fails on `main` for reasons outside the PR is quarantined (`test.fixme` with a tracking issue) in its own PR labelled `priority-high`, which the train takes first; the PR it blocks does not work around it. One problem gets one fix: before opening a PR for a failure, check the open PRs for one that already addresses it.

**The change guard** (`yarn guard`, `scripts/guard.mjs`, #520) checks what a PR changes, not whether it builds: it compares the branch with its merge base on `origin/main` and blocks a deleted test file, an added `skip`/`only`/`xit`/`xdescribe`, a `test.fixme` without `// quarantine: #<issue>` (same line or the line above, the issue open and labelled `bug`), a lowered coverage threshold or new coverage exclusion, a new entry in `dependencies`/`devDependencies`/`resolutions` of any `package.json` or a new package in `yarn.lock`, and a secret on a changed line (the `secrets:check` matcher). Changes to `AGENTS.md`, `CLAUDE.md`, the skills, `.github/`, `scripts/verify.mjs` and the guard itself are listed as warnings only; lessons never are. CI runs it in the required `gate` job after `yarn verify` and writes the report to the job summary. A blocking finding fails `gate` unless the PR carries `guard-approved`, a label only the owner adds; the label is read when the job runs, so the owner adds it and reruns `gate`. Agents run `yarn guard` before pushing; on a blocking finding they stop, explain it in the PR and ask the owner, and never add the label or work around the guard.

The implementing skills run the gate before opening a PR, and `om-check-and-commit` runs it before pushing a hand-worked branch. The command list lives in `.ai/agentic.config.json`; when it changes, update it there and in this section together.

## Releasing to production

One production instance serves every club, and one deploy updates every club at once (owner decision D-034, `.ai/specs/research/decisions/D-034-many-clubs-on-one-instance.md`). The release process lives in `docs/ops/deploy.md`, section "Production release", with the checklist a maintainer runs for each release. What it asks of every pull request:

- **Expand, then contract.** A migration works with the code of the release before it, because the previous release keeps serving while the new one migrates and comes back on a rollback. A breaking schema change (rename, drop, type change, new `NOT NULL` without a default) is split across two releases: expand in one, contract in a later one after the first has served production for at least a week (engineering standards S5.4). A pull request with a contract step names the release that shipped its expand step.
- **Risky behaviour behind a club setting.** A behaviour that should reach chosen clubs first ships behind a club setting whose default keeps the old behaviour; the maintainer switches it on for the demo club, then for chosen clubs, then for all. There is no feature-flag framework (ADR-019, still valid under D-034).
- **Notes for club administrators.** A pull request that changes what administrators, coaches, guardians or members see or must do says so in plain words in its description, so the release notes in Polish and English can be written from the merged pull requests.

Production releases happen inside the release window (Tuesday to Thursday, 20:30–22:30 Europe/Warsaw); only a `priority-extreme` fix goes outside it.

## Amending this process

This document and `.ai/agentic.config.json` describe the same process: change them together, and re-run the `om-setup-agent-pipeline` skill when the toolchain or label taxonomy changes. Per-skill deviations — extra review rules, a different PR body template, an added gate step — belong in a repo-local skill of the same name at `.ai/skills/<skill-name>/SKILL.md`, which takes precedence over the installed skill (and can `@`-import or reference it to extend rather than replace it); local rules win, but a repo-local skill cannot grant what the installed skill's safety rules forbid.

<!-- discovery:start -->
The product-layer blocks between `<!-- discovery:start -->` and `<!-- discovery:end -->` are owned by `om-setup-discovery-pipeline`: re-run it to add or refresh them, and edit everything else by hand.
<!-- discovery:end -->
