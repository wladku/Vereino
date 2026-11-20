// The merge train's decision (SDLC.md "Validation gate"): `main` takes one PR at a time, and only a PR that is up to
// date with `main` and green on the required checks may merge. The train keeps exactly one PR in flight, so CI runs
// only for the PR that merges next instead of for every open PR after each merge.
//
// Pure: `scripts/merge-train.mjs` reads the PRs from GitHub, calls `planMergeTrain`, and carries out the step.

/** Labels that keep a PR out of the train; a repository variable can replace the list. */
export const DEFAULT_SKIP_LABELS = ['do-not-merge', 'blocked', 'in-progress', 'changes-requested', 'qa-failed']
/** Labels the train sets so the state is visible on the PR list; they never block by themselves. */
export const FAILED_LABEL = 'merge-train-failed'
export const CONFLICT_LABEL = 'merge-train-conflict'
/** Hidden marker of the one comment the train leaves on a PR it holds for manual QA (MT-D02). */
export const QA_HOLD_MARKER = '<!-- merge-train:qa-hold -->'
export const QA_HOLD_REASON = 'risk-high and needs-qa without qa: waits for the owner\'s manual QA (MT-D02)'

const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'startup_failure', 'action_required'])

/**
 * The state of the required checks on a head: `success` when every required check succeeded (`skipped` and `neutral`
 * count as passed), `failure` when one ended badly, `pending` otherwise, including a check that has not started.
 * `runs` are the head's check runs, `{ name, status, conclusion, id }`; a rerun counts, so the newest run per name wins.
 */
export function checksState(runs, required) {
  const latest = new Map()
  for (const run of runs) {
    const seen = latest.get(run.name)
    if (!seen || run.id > seen.id) latest.set(run.name, run)
  }
  let pending = false
  for (const name of required) {
    const run = latest.get(name)
    if (!run || run.status !== 'completed') {
      pending = true
      continue
    }
    if (FAILED_CONCLUSIONS.has(run.conclusion)) return 'failure'
  }
  return pending ? 'pending' : 'success'
}

/**
 * MT-D02 (`.ai/specs/2026-11-18-merge-throughput.md`): a `risk-high` PR that asks for manual QA (`needs-qa`) stays out
 * of the train until the owner sets `qa`. Any other risk merges on green; `needs-qa` alone stays advisory.
 */
export function qaHold(labels) {
  return labels.includes('risk-high') && labels.includes('needs-qa') && !labels.includes('qa')
}

/**
 * The issue a PR works on, read from its head branch: `feat/issue-123-x` → 123. `null` when the branch names none.
 * The train mirrors its labels onto that issue, so an issue-label automation (Cezar) reacts to a broken PR at once.
 */
export function linkedIssue(branch) {
  const match = /(?:^|\/)issue-(\d+)(?=-|$)/.exec(branch ?? '')
  return match ? Number(match[1]) : null
}

/** Whether the train still owes a held PR its one QA-hold comment; `comments` are the PR's comment bodies. */
export function needsQaHoldComment(comments) {
  return !comments.some((body) => body.includes(QA_HOLD_MARKER))
}

/** Higher priority first (`priority-high`, then `priority-medium`), then the oldest PR. */
function byQueueOrder(left, right) {
  const rank = (pr) => (pr.labels.includes('priority-high') ? 0 : pr.labels.includes('priority-medium') ? 1 : 2)
  return rank(left) - rank(right) || left.number - right.number
}

/**
 * Plans one step of the train over the open PRs. Each PR is
 * `{ number, draft, labels, behindBy, conflict, checks, branch }`, where `checks` is `checksState` of its head and
 * `branch` its head branch. The answer is one of:
 * - `{ type: 'merge', pr }` — an up-to-date PR is green;
 * - `{ type: 'wait', pr }` — an up-to-date PR is still running its checks (the PR in flight);
 * - `{ type: 'update', pr }` — nothing is in flight, so the next PR takes `main` in and starts its CI;
 * - `{ type: 'idle' }` — no PR can move.
 * `labels` lists the train labels to add or remove on every PR so they match its state; a change carries `issue` when
 * the PR's branch names one (`linkedIssue`), and the same change applies to that issue. `held` lists the PRs kept out
 * by the MT-D02 QA rule (`qaHold`), `{ pr, reason }`, so the run log names each one and why.
 *
 * A PR that failed on a head behind `main` gets one update (its failure may come from an old `main`); one that failed
 * while up to date waits for a new commit from its author.
 */
export function planMergeTrain(prs, { skipLabels = DEFAULT_SKIP_LABELS } = {}) {
  const eligible = prs.filter((pr) => !pr.draft && !pr.labels.some((label) => skipLabels.includes(label)))
  const held = eligible.filter((pr) => qaHold(pr.labels)).map((pr) => ({ pr: pr.number, reason: QA_HOLD_REASON }))
  const queue = eligible.filter((pr) => !qaHold(pr.labels)).sort(byQueueOrder)
  const labels = []
  const sync = (pr, label, wanted) => {
    const has = pr.labels.includes(label)
    if (wanted === has) return
    const issue = linkedIssue(pr.branch)
    labels.push({ pr: pr.number, label, add: wanted, ...(issue ? { issue } : {}) })
  }
  for (const pr of queue) {
    sync(pr, CONFLICT_LABEL, pr.conflict)
    sync(pr, FAILED_LABEL, !pr.conflict && pr.behindBy === 0 && pr.checks === 'failure')
  }
  const movable = queue.filter((pr) => !pr.conflict)
  const upToDate = movable.filter((pr) => pr.behindBy === 0)
  const green = upToDate.find((pr) => pr.checks === 'success')
  if (green) return { type: 'merge', pr: green.number, labels, held }
  const inFlight = upToDate.find((pr) => pr.checks === 'pending')
  if (inFlight) return { type: 'wait', pr: inFlight.number, labels, held }
  const behind = movable.filter((pr) => pr.behindBy > 0)
  const next = behind.find((pr) => pr.checks !== 'failure') ?? behind[0]
  if (next) return { type: 'update', pr: next.number, labels, held }
  return { type: 'idle', labels, held }
}
