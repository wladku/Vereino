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
 * Today's queue: drafts, PRs with a skip label and PRs held by the MT-D02 QA rule left out, then priority and age.
 * `held` names each held PR with its reason.
 */
export function trainQueue(prs, skipLabels) {
  const eligible = prs.filter((pr) => !pr.draft && !pr.labels.some((label) => skipLabels.includes(label)))
  const held = eligible.filter((pr) => qaHold(pr.labels)).map((pr) => ({ pr: pr.number, reason: QA_HOLD_REASON }))
  const queue = eligible.filter((pr) => !qaHold(pr.labels)).sort(byQueueOrder)
  return { queue, held }
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
  const { queue, held } = trainQueue(prs, skipLabels)
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

// Batch train, phase 1 (`.ai/specs/2026-11-18-batch-merge-train.md`): planning and judging only, dark. Nothing below
// builds, merges or labels anything yet; `scripts/merge-train.mjs` prints the batch in a dry run.

/** Commit status the train sets on a PR head whose batch of one failed (REQ-BT03); a new push clears it. */
export const VERDICT_STATUS = 'merge-train/verdict'
/** The size the owner sets with `MERGE_TRAIN_BATCH_SIZE` at the switch-on (phase 3). */
export const DEFAULT_BATCH_SIZE = 4
/** Upper bound of `MERGE_TRAIN_BATCH_SIZE`; a larger or invalid value falls back to 1. */
export const MAX_BATCH_SIZE = 8
/** A batch whose head has no verdict after this long is rebuilt (REQ-BT02). */
export const BATCH_MAX_AGE_MINUTES = 90
/** Why a PR of the queue is not in the batch, as the dry run and the job summary print it. */
export const BATCH_SKIP_REASONS = {
  fork: 'from a fork: forks never join a batch (BT-D05)',
  verdict: `its head carries ${VERDICT_STATUS} = failure: waits for a new push (REQ-BT03)`,
  conflict: 'conflicts with main',
  failure: 'a required check failed on its own head',
  pending: 'its own head is not green yet',
}

/**
 * `MERGE_TRAIN_BATCH_SIZE`: an integer from 1 to `MAX_BATCH_SIZE`. Unset, empty or invalid means 1, today's
 * one-PR train, so the batch train stays dark until the owner sets the variable (spec phase 3).
 */
export function parseBatchSize(value) {
  const size = Number(String(value ?? '').trim() || 1)
  return Number.isInteger(size) && size >= 1 && size <= MAX_BATCH_SIZE ? size : 1
}

/**
 * The train's verdict on a head: the state of the newest `merge-train/verdict` status (`failure`, `success`, …), or
 * `null` when there is none. `statuses` are the head's commit statuses, `{ context, state, id }`.
 */
export function verdictOf(statuses) {
  let newest = null
  for (const status of statuses) {
    if (status.context === VERDICT_STATUS && (!newest || status.id > newest.id)) newest = status
  }
  return newest ? newest.state : null
}

/**
 * Whether a PR must form a batch alone (BT-D05): it changes CI (`.github/`) or the train itself
 * (`scripts/merge-train*`). Unknown files count as such a change, so a PR whose files were not read never shares a batch.
 */
export function batchesAlone(pr) {
  if (!Array.isArray(pr.files)) return true
  return pr.files.some((path) => path.startsWith('.github/') || path.startsWith('scripts/merge-train'))
}

function batchSkipReason(pr) {
  if (pr.fork) return 'fork'
  if (pr.verdict === 'failure') return 'verdict'
  if (pr.conflict) return 'conflict'
  if (pr.checks !== 'success') return pr.checks
  return null
}

/**
 * Plans the next batch (REQ-BT01, REQ-BT03) over the same PRs as `planMergeTrain`, each also carrying `headSha`,
 * `fork`, `files` (changed paths) and `verdict` (`verdictOf` its head). The queue is today's; a batch is its first
 * `size` PRs that are green on their own head, do not conflict, are no fork and carry no failure verdict on their
 * current head. A PR that `batchesAlone` ends the batch: it goes alone when it is first, else it waits to be first.
 *
 * During a bisection `suspects` lists the PRs of a red batch not yet proven good or bad (`Merge-Train-Suspects`); the
 * batch is then the first half of those still batchable, and the other PRs wait. Suspects that left the queue or are no
 * longer batchable drop out; when none is left the plan is the ordinary one.
 *
 * The answer is `{ batch, suspects, skipped, held, update }`: `batch` the PRs in order as `{ number, sha }`, `suspects`
 * the suspects still open (or `null`), `skipped` the queue PRs left out as `{ pr, reason }` (`BATCH_SKIP_REASONS`),
 * `held` as in `planMergeTrain`, and `update` the first PR that is red on its own head while behind `main` and gets one
 * `update-branch`, as today (its failure may come from an old `main`), or `null`.
 */
export function planBatch(prs, { skipLabels = DEFAULT_SKIP_LABELS, size = 1, suspects = null } = {}) {
  const { queue, held } = trainQueue(prs, skipLabels)
  const ready = []
  const skipped = []
  for (const pr of queue) {
    const reason = batchSkipReason(pr)
    if (reason) skipped.push({ pr: pr.number, reason })
    else ready.push(pr)
  }
  let candidates = ready
  let open = null
  const suspected = (suspects ?? []).map((number) => ready.find((pr) => pr.number === number)).filter(Boolean)
  if (suspected.length) {
    open = suspected.map((pr) => pr.number)
    candidates = suspected.slice(0, Math.ceil(suspected.length / 2))
  }
  const batch = []
  for (const pr of candidates) {
    if (batch.length === size) break
    if (batchesAlone(pr)) {
      if (!batch.length) batch.push(pr)
      break
    }
    batch.push(pr)
  }
  const update = queue.find((pr) => batchSkipReason(pr) === 'failure' && pr.behindBy > 0)
  return {
    batch: batch.map((pr) => ({ number: pr.number, sha: pr.headSha })),
    suspects: open,
    skipped,
    held,
    update: update ? update.number : null,
  }
}

/**
 * Judges the batch under test (REQ-BT02, REQ-BT03). `batch` is the parsed trailers of the batch head
 * (`parseTrailers`), `headSha` that head, `runs` check runs as `{ name, status, conclusion, id, headSha }`: only runs
 * of the current head count, so a run of an older head (cancelled by CI's concurrency group) never decides.
 * `ageMinutes` is how long the head has waited for its checks. The answer is one of:
 * - `{ type: 'wait' }` — the checks still run;
 * - `{ type: 'rebuild', reason: 'stale' }` — no verdict after `BATCH_MAX_AGE_MINUTES`;
 * - `{ type: 'merge', prs, suspects }` — green: merge `prs` in order; `suspects` are those still to test (or `null`);
 * - `{ type: 'culprit', pr, sha }` — a batch of one is red: mark that head (`merge-train/verdict` failure and
 *   `merge-train-failed`); the other suspects return to the ordinary queue;
 * - `{ type: 'bisect', suspects }` — a batch of several is red: they become the suspects, the next batch is their
 *   first half (`planBatch`).
 */
export function judgeBatch(batch, { headSha, runs, required, ageMinutes, maxAgeMinutes = BATCH_MAX_AGE_MINUTES }) {
  const state = checksState(runs.filter((run) => run.headSha === headSha), required)
  if (state === 'pending') return ageMinutes >= maxAgeMinutes ? { type: 'rebuild', reason: 'stale' } : { type: 'wait' }
  const numbers = batch.prs.map((pr) => pr.number)
  if (state === 'success') {
    const remaining = (batch.suspects ?? []).filter((number) => !numbers.includes(number))
    return { type: 'merge', prs: batch.prs, suspects: remaining.length ? remaining : null }
  }
  if (batch.prs.length === 1) return { type: 'culprit', pr: batch.prs[0].number, sha: batch.prs[0].sha }
  return { type: 'bisect', suspects: numbers }
}

// Stacked PRs (`.ai/specs/2026-11-24-cezar-stall-prevention.md`, ST-D04, REQ-ST01): a PR built on another PR's branch
// targets that branch, and the train reads only PRs on `main`. Once the base PR merged, the train retargets the stacked
// PR to `main`; a base PR closed without merging holds it. `scripts/merge-train-stacked.mjs` reads and applies the plan.

/** Hidden marker of the one comment the train leaves on a PR it retargeted to `main`. */
export const RETARGET_MARKER = '<!-- merge-train:retarget -->'
/** Hidden marker of the one comment the train leaves on a stacked PR whose base PR was closed without merging. */
export const BASE_CLOSED_MARKER = '<!-- merge-train:base-closed -->'
/** Why a stacked PR gets its action, as the run log prints it. */
export const RETARGET_REASONS = {
  'base-merged': 'its base PR merged',
  'base-closed': 'its base PR was closed without merging',
  'base-open': 'its base PR is still open',
  'no-base-pr': 'no PR has its base branch as head',
}

/**
 * Plans the stacked PRs (REQ-ST01). `stacked` are the open PRs whose base is not `main`, `{ number, base }` with `base`
 * the base branch; `basePrs` are the PRs of this repository whose head is one of those branches,
 * `{ number, head, state: 'open' | 'closed', merged }`. A branch can be the head of several PRs over time: an open one
 * wins (nothing moves while work on the base goes on), then a merged one, then one closed without merging. The answer
 * is one `{ pr, base, action, reason, basePr }` per stacked PR, in its order: `action` is `retarget` (to `main`),
 * `block` (label `blocked`, no retarget) or `none`; `reason` a key of `RETARGET_REASONS`; `basePr` the deciding PR's
 * number, `null` when no PR has that head.
 */
export function planRetargets(stacked, basePrs) {
  return stacked.map((pr) => {
    const bases = basePrs.filter((base) => base.head === pr.base && base.number !== pr.number)
    const decide = (action, reason, base) => ({ pr: pr.number, base: pr.base, action, reason, basePr: base?.number ?? null })
    const open = bases.find((base) => base.state === 'open')
    if (open) return decide('none', 'base-open', open)
    const merged = bases.find((base) => base.merged)
    if (merged) return decide('retarget', 'base-merged', merged)
    if (bases.length) return decide('block', 'base-closed', bases[0])
    return decide('none', 'no-base-pr', null)
  })
}
