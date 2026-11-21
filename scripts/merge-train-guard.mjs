// Batch train, phase 2 (`.ai/specs/2026-11-18-batch-merge-train.md`, REQ-BT04): the decisions around building a batch
// with the Merges API, merging it PR by PR and checking `main`'s tree after every merge. Pure: `scripts/merge-train.mjs`
// does the API calls and asks these helpers what each answer means.
import { CONFLICT_LABEL, FAILED_LABEL, linkedIssue } from './merge-train-plan.mjs'
import { formatTrailers } from './merge-train-trailers.mjs'

/** The branch CI tests a batch on (`ci.yml` runs on a push to `merge-train/**`). */
export const BATCH_BRANCH = 'merge-train/batch'
/** The branch the batch is assembled on; outside `merge-train/**`, so the intermediate merges start no CI run. */
export const BUILD_BRANCH = 'merge-train-build'
/** Commit status the train sets on a PR head immediately before it merges that head (BT-D03). */
export const VERIFIED_STATUS = 'merge-train/verified'
/** Label on the PRs of the batch under test. */
export const BATCHED_LABEL = 'merge-train-batched'
/** Label of the issue that pauses the train: while one is open the train only plans and logs. */
export const PAUSED_LABEL = 'merge-train-paused'
/** Waits before the retries of a squash merge GitHub answered with 405 or 409 (three retries). */
export const MERGE_RETRY_DELAYS_MS = [5000, 15000, 30000]

/**
 * What one Merges API call (`POST /repos/{repo}/merges`) did while building: `merged` (201, a new intermediate commit),
 * `empty` (204, the PR head is already in the batch, so it adds nothing), `conflict` (409, it does not merge cleanly
 * onto the PRs before it) or `error` (anything else, which stops the build).
 */
export function buildStep(status) {
  if (status === 201) return 'merged'
  if (status === 204) return 'empty'
  if (status === 409) return 'conflict'
  return 'error'
}

/**
 * The message of the intermediate commit that adds `prs.at(-1)`: a title and the trailers of the batch so far, so the
 * batch head carries them whichever PR is the last one that merged cleanly.
 */
export function batchCommitMessage({ prs, base, suspects = null }) {
  const title = `merge-train: batch ${prs.map((pr) => `#${pr.number}`).join(', ')}`
  return `${title}\n\n${formatTrailers({ prs, base, suspects })}`
}

/**
 * The merge guard (BT-TEST-03): a batch may merge only while `main` still is its `Merge-Train-Base` and every PR of it
 * is still in the train's queue with the head SHA that was tested. `queue` are the PRs the train would move now
 * (`{ number, headSha }`, drafts, skip labels and held PRs already left out). The answer is `null` when the batch may
 * merge, else `{ reason, pr }`: `base-moved`, `left-queue` (closed, labelled out or made a draft) or `head-moved`.
 */
export function guardBatch(batch, { mainSha, queue }) {
  if (mainSha !== batch.base) return { reason: 'base-moved', pr: null }
  for (const entry of batch.prs) {
    const pr = queue.find((candidate) => candidate.number === entry.number)
    if (!pr) return { reason: 'left-queue', pr: entry.number }
    if (pr.headSha !== entry.sha) return { reason: 'head-moved', pr: entry.number }
  }
  return null
}

/** Why the train dropped a batch, as the run log prints it. */
export const DROP_REASONS = {
  'base-moved': 'main moved since the batch was built',
  'left-queue': 'a PR of the batch left the queue',
  'head-moved': 'a PR head moved since the batch was built',
  stale: 'its checks gave no verdict in time',
}

/**
 * The intermediate commit after the `k`-th PR (1-based) of a batch of `count` PRs. `chain` is the batch head followed by
 * its first parents (`chain[0]` is the head, the commit after the last PR), so the commit after PR `k` is
 * `chain[count - k]`; `undefined` when the chain is too short.
 */
export function intermediateAfter(chain, k, count) {
  return chain[count - k]
}

/**
 * The tree check after merging PR `k`: `main`'s tree must equal the tree of the batch's intermediate commit `k`, the
 * tree CI tested as a prefix of the batch. Any difference, or a missing intermediate tree, fails.
 */
export function treeMatches(mainTree, intermediateTree) {
  return Boolean(intermediateTree) && mainTree === intermediateTree
}

/**
 * What a squash merge answer means: `merged` (200), `retry` (405 or 409 — not mergeable yet or the base changed under
 * it — while retries are left; `attempt` counts the retries done so far) or `failed`.
 */
export function mergeOutcome(status, attempt, retries = MERGE_RETRY_DELAYS_MS.length) {
  if (status === 200) return 'merged'
  if ((status === 405 || status === 409) && attempt < retries) return 'retry'
  return 'failed'
}

/**
 * The required checks the train judges: `override` (`MERGE_TRAIN_REQUIRED_CHECKS`, comma-separated; for a repository
 * whose plan has no rulesets, such as the rehearsal repository) when set, else the ruleset's. The batch train refuses
 * to merge when the list is empty.
 */
export function requiredChecks(fromRules, override) {
  const names = String(override ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  return names.length ? [...new Set(names)] : fromRules
}

/** Minutes between the batch head's commit time and `now` (both ISO strings or dates). */
export function ageMinutes(committedAt, now) {
  return Math.floor((new Date(now).getTime() - new Date(committedAt).getTime()) / 60000)
}

/**
 * The train labels in batch mode, for the PRs of the queue: `merge-train-conflict` while a PR conflicts with `main`;
 * `merge-train-failed` while its head carries the train's failure verdict (it broke a batch alone) or a required check
 * failed on an up-to-date head; `merge-train-batched` while it is in the batch under test (`batched`, PR numbers). Each
 * change is `{ pr, label, add }`; a failed or conflict change also carries `reason` (`verdict`, `checks`, `conflict`)
 * and `issue` when the PR's branch names one (`linkedIssue`), which the train mirrors the label onto.
 */
export function batchLabels(queue, batched) {
  const changes = []
  for (const pr of queue) {
    const issue = linkedIssue(pr.branch)
    const failed = !pr.conflict && (pr.verdict === 'failure' || (pr.behindBy === 0 && pr.checks === 'failure'))
    const wanted = [
      [CONFLICT_LABEL, pr.conflict, 'conflict'],
      [FAILED_LABEL, failed, pr.verdict === 'failure' ? 'verdict' : 'checks'],
      [BATCHED_LABEL, batched.includes(pr.number), null],
    ]
    for (const [label, want, reason] of wanted) {
      if (want === pr.labels.includes(label)) continue
      const change = { pr: pr.number, label, add: want }
      if (reason) Object.assign(change, { reason }, issue ? { issue } : {})
      changes.push(change)
    }
  }
  return changes
}

/**
 * The issue that pauses the train (stop conditions of the spec): `reason` is `tree-mismatch` or `merge-failed`, `pr` the
 * PR the train stopped at, `merged` the PRs of the batch already on `main`, `batchHead` and `runUrl` where to look.
 */
export function pauseIssue({ reason, pr, merged, batchHead, runUrl }) {
  const what =
    reason === 'tree-mismatch'
      ? `after merging #${pr}, \`main\`'s tree differs from the tree the batch tested at that point`
      : `merging #${pr} failed after ${MERGE_RETRY_DELAYS_MS.length} retries`
  const body = [
    `The merge train paused itself: ${what}.`,
    '',
    `- Batch head: \`${batchHead}\``,
    `- Already merged from this batch: ${merged.length ? merged.map((number) => `#${number}`).join(', ') : 'none'}`,
    `- Train run: ${runUrl}`,
    '',
    "While this issue is open the train only plans and logs. `main`'s push CI run decides whether the quarantine or fix rules apply (SDLC.md \"Validation gate\"). Close this issue to restart the train.",
  ].join('\n')
  return { title: `Merge train paused: ${reason} at #${pr}`, body, labels: [PAUSED_LABEL, 'priority-high'] }
}
