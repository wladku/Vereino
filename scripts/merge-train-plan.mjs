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

/** Higher priority first (`priority-high`, then `priority-medium`), then the oldest PR. */
function byQueueOrder(left, right) {
  const rank = (pr) => (pr.labels.includes('priority-high') ? 0 : pr.labels.includes('priority-medium') ? 1 : 2)
  return rank(left) - rank(right) || left.number - right.number
}

/**
 * Plans one step of the train over the open PRs. Each PR is `{ number, draft, labels, behindBy, conflict, checks }`,
 * where `checks` is `checksState` of its head. The answer is one of:
 * - `{ type: 'merge', pr }` — an up-to-date PR is green;
 * - `{ type: 'wait', pr }` — an up-to-date PR is still running its checks (the PR in flight);
 * - `{ type: 'update', pr }` — nothing is in flight, so the next PR takes `main` in and starts its CI;
 * - `{ type: 'idle' }` — no PR can move.
 * `labels` lists the train labels to add or remove on every PR so they match its state.
 *
 * A PR that failed on a head behind `main` gets one update (its failure may come from an old `main`); one that failed
 * while up to date waits for a new commit from its author.
 */
export function planMergeTrain(prs, { skipLabels = DEFAULT_SKIP_LABELS } = {}) {
  const queue = prs
    .filter((pr) => !pr.draft && !pr.labels.some((label) => skipLabels.includes(label)))
    .sort(byQueueOrder)
  const labels = []
  const sync = (pr, label, wanted) => {
    const has = pr.labels.includes(label)
    if (wanted && !has) labels.push({ pr: pr.number, label, add: true })
    if (!wanted && has) labels.push({ pr: pr.number, label, add: false })
  }
  for (const pr of queue) {
    sync(pr, CONFLICT_LABEL, pr.conflict)
    sync(pr, FAILED_LABEL, !pr.conflict && pr.behindBy === 0 && pr.checks === 'failure')
  }
  const movable = queue.filter((pr) => !pr.conflict)
  const upToDate = movable.filter((pr) => pr.behindBy === 0)
  const green = upToDate.find((pr) => pr.checks === 'success')
  if (green) return { type: 'merge', pr: green.number, labels }
  const inFlight = upToDate.find((pr) => pr.checks === 'pending')
  if (inFlight) return { type: 'wait', pr: inFlight.number, labels }
  const behind = movable.filter((pr) => pr.behindBy > 0)
  const next = behind.find((pr) => pr.checks !== 'failure') ?? behind[0]
  if (next) return { type: 'update', pr: next.number, labels }
  return { type: 'idle', labels }
}
