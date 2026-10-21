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

The QA gate is off (`qaGate: false`): `needs-qa` is advisory and does not block a merge on its own. User-facing changes are still proven by the author with browser evidence as `AGENTS.md` requires (both locales, 375 px, console without errors). `qa-failed`, `do-not-merge` and `blocked` remain hard blocks, and an active `qa` label means a tester is on the PR right now — never merge under an active tester. To make `needs-qa` a hard block until `qa-approved`, set `qaGate: true` and re-run `om-setup-agent-pipeline`.

## The claim protocol

Before mutating an issue or PR, an agent claims it with all three signals: it assigns itself, adds the `in-progress` label, and posts a `🤖`-prefixed claim comment saying what it is doing. Any agent that finds an existing claim backs off instead of colliding. A PR carrying `in-progress` is also skipped by the merge tooling.

The claim is released when the work finishes — on success and on failure alike. A stale `in-progress` with no recent activity may be cleared by the maintainer.

## The automation contract

The `om-auto-*` skills run this process unattended and are chainable: each accepts the artifact the previous one produced (an issue id, a spec path, or a PR number from the `PR: #<number> (link: <url>)` reference line every PR-producing skill emits), and each detects work already started — an open PR referencing the issue or plan — and continues on it rather than opening a duplicate. A completed autonomous run leaves a **ready** (non-draft), fully labeled PR — one pipeline label, category, QA meta, one priority, one risk — with a run-summary comment, a committed run log in `.ai/runs/`, and, for user-facing changes, screenshots from the working app attached as PR evidence. Draft PRs are reserved for explicitly incomplete states: spec-only design PRs, interrupted hand-offs, or autonomous defaults flagged for human confirmation. Automation never applies `qa-approved`.

## Validation gate

Every PR passes the full validation gate before review sign-off, in this order:

- `yarn verify`

Any non-zero exit fails the gate and blocks the PR. `yarn verify` is the only gate command and is identical locally and in CI (`.github/workflows/ci.yml`); `yarn verify --list` shows its steps and `yarn verify --from <step>` resumes after a fix. CI additionally runs `yarn test:integration:vereino` and the agent-browser login smoke. The implementing skills run the gate before opening a PR, and `om-check-and-commit` runs it before pushing a hand-worked branch. The command list lives in `.ai/agentic.config.json`; when it changes, update it there and in this section together.

## Amending this process

This document and `.ai/agentic.config.json` describe the same process: change them together, and re-run the `om-setup-agent-pipeline` skill when the toolchain or label taxonomy changes. Per-skill deviations — extra review rules, a different PR body template, an added gate step — belong in a repo-local skill of the same name at `.ai/skills/<skill-name>/SKILL.md`, which takes precedence over the installed skill (and can `@`-import or reference it to extend rather than replace it); local rules win, but a repo-local skill cannot grant what the installed skill's safety rules forbid.

<!-- discovery:start -->
The product-layer blocks between `<!-- discovery:start -->` and `<!-- discovery:end -->` are owned by `om-setup-discovery-pipeline`: re-run it to add or refresh them, and edit everything else by hand.
<!-- discovery:end -->
