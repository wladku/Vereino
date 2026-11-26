// BT-TEST-03 (merge guard) of `.ai/specs/implemented/2026-11-18-batch-merge-train.md`, phase 2.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BATCHED_LABEL,
  BATCH_BRANCH,
  BUILD_BRANCH,
  DROP_REASONS,
  MERGE_RETRY_DELAYS_MS,
  PAUSED_LABEL,
  VERIFIED_STATUS,
  ageMinutes,
  batchCommitMessage,
  batchLabels,
  buildStep,
  guardBatch,
  intermediateAfter,
  mergeOutcome,
  pauseIssue,
  requiredChecks,
  stampsVerified,
  treeMatches,
} from '../../../../scripts/merge-train-guard.mjs'
import { CONFLICT_LABEL, FAILED_LABEL } from '../../../../scripts/merge-train-plan.mjs'
import { parseTrailers } from '../../../../scripts/merge-train-trailers.mjs'

const sha = (n) => String(n).padStart(40, 'a')
const BASE = 'b'.repeat(40)

describe('BT-TEST-03: names', () => {
  it('builds outside merge-train/** and tests on merge-train/batch', () => {
    assert.equal(BATCH_BRANCH, 'merge-train/batch')
    assert.ok(!BUILD_BRANCH.startsWith('merge-train/'))
    assert.equal(VERIFIED_STATUS, 'merge-train/verified')
    assert.equal(BATCHED_LABEL, 'merge-train-batched')
    assert.equal(PAUSED_LABEL, 'merge-train-paused')
  })
})

describe('BT-TEST-03: buildStep', () => {
  it('reads the Merges API answer', () => {
    assert.equal(buildStep(201), 'merged')
    assert.equal(buildStep(204), 'empty')
    assert.equal(buildStep(409), 'conflict')
    for (const status of [200, 403, 404, 422, 500]) assert.equal(buildStep(status), 'error')
  })
})

describe('BT-TEST-03: batchCommitMessage', () => {
  it('carries the trailers of the batch so far, which parse back', () => {
    const prs = [
      { number: 3, sha: sha(3) },
      { number: 5, sha: sha(5) },
    ]
    const message = batchCommitMessage({ prs, base: BASE })
    assert.match(message, /^merge-train: batch #3, #5\n\n/)
    assert.deepEqual(parseTrailers(message), { prs, base: BASE, suspects: null })
    const bisecting = batchCommitMessage({ prs: prs.slice(0, 1), base: BASE, suspects: [3, 5] })
    assert.deepEqual(parseTrailers(bisecting), { prs: prs.slice(0, 1), base: BASE, suspects: [3, 5] })
  })
})

describe('BT-TEST-03: guardBatch', () => {
  const batch = {
    prs: [
      { number: 1, sha: sha(1) },
      { number: 2, sha: sha(2) },
    ],
    base: BASE,
    suspects: null,
  }
  const queue = [
    { number: 1, headSha: sha(1) },
    { number: 2, headSha: sha(2) },
    { number: 9, headSha: sha(9) },
  ]

  it('lets the batch merge while main and every head are unchanged', () => {
    assert.equal(guardBatch(batch, { mainSha: BASE, queue }), null)
  })

  it('drops the batch when main moved', () => {
    assert.deepEqual(guardBatch(batch, { mainSha: sha(7), queue }), { reason: 'base-moved', pr: null })
  })

  it('drops the batch when a PR head moved', () => {
    const moved = queue.map((pr) => (pr.number === 2 ? { ...pr, headSha: sha(22) } : pr))
    assert.deepEqual(guardBatch(batch, { mainSha: BASE, queue: moved }), { reason: 'head-moved', pr: 2 })
  })

  it('drops the batch when a PR left the queue', () => {
    assert.deepEqual(guardBatch(batch, { mainSha: BASE, queue: queue.slice(1) }), { reason: 'left-queue', pr: 1 })
  })

  it('names every reason for the log', () => {
    for (const reason of ['base-moved', 'left-queue', 'head-moved', 'stale']) assert.ok(DROP_REASONS[reason])
  })
})

describe('BT-TEST-03: tree comparison per prefix', () => {
  // chain[0] is the batch head (after the last PR), then its first parents.
  const chain = ['t3', 't2', 't1']

  it('finds the intermediate tree after each PR', () => {
    assert.equal(intermediateAfter(chain, 1, 3), 't1')
    assert.equal(intermediateAfter(chain, 2, 3), 't2')
    assert.equal(intermediateAfter(chain, 3, 3), 't3')
    assert.equal(intermediateAfter(['t1'], 1, 1), 't1')
    assert.equal(intermediateAfter(['t2'], 1, 2), undefined)
  })

  it("passes only when main's tree equals the prefix tree", () => {
    assert.equal(treeMatches('t2', 't2'), true)
    assert.equal(treeMatches('t2', 't1'), false)
    assert.equal(treeMatches('t2', undefined), false)
  })
})

describe('BT-TEST-03: mergeOutcome', () => {
  it('retries 405 and 409 three times, then fails', () => {
    assert.equal(MERGE_RETRY_DELAYS_MS.length, 3)
    assert.equal(mergeOutcome(200, 0), 'merged')
    assert.equal(mergeOutcome(200, 3), 'merged')
    for (const status of [405, 409]) {
      assert.equal(mergeOutcome(status, 0), 'retry')
      assert.equal(mergeOutcome(status, 2), 'retry')
      assert.equal(mergeOutcome(status, 3), 'failed')
    }
    assert.equal(mergeOutcome(422, 0), 'failed')
    assert.equal(mergeOutcome(409, 0, 0), 'failed')
  })
})

describe('BT-TEST-03: requiredChecks', () => {
  it('takes the override when set, else the ruleset', () => {
    assert.deepEqual(requiredChecks(['gate'], undefined), ['gate'])
    assert.deepEqual(requiredChecks(['gate'], ' , '), ['gate'])
    assert.deepEqual(requiredChecks([], 'gate, integration,gate'), ['gate', 'integration'])
    assert.deepEqual(requiredChecks([], ''), [])
  })

  it('never judges the train’s own merge-train/verified status (#698)', () => {
    const ruleset = ['gate', 'integration', 'browser-smoke', VERIFIED_STATUS]
    assert.deepEqual(requiredChecks(ruleset, undefined), ['gate', 'integration', 'browser-smoke'])
    assert.deepEqual(requiredChecks([], `gate,${VERIFIED_STATUS}`), ['gate'])
    assert.deepEqual(requiredChecks([VERIFIED_STATUS], undefined), [])
  })
})

describe('BT-TEST-03: stampsVerified', () => {
  it('is true only while the ruleset requires merge-train/verified (#698)', () => {
    assert.equal(stampsVerified(['gate', 'integration', 'browser-smoke', VERIFIED_STATUS]), true)
    assert.equal(stampsVerified(['gate', 'integration', 'browser-smoke']), false)
    assert.equal(stampsVerified([]), false)
  })
})

describe('BT-TEST-03: ageMinutes', () => {
  it('counts whole minutes since the batch head was committed', () => {
    assert.equal(ageMinutes('2026-11-21T10:00:00Z', '2026-11-21T11:30:59Z'), 90)
    assert.equal(ageMinutes('2026-11-21T10:00:00Z', new Date('2026-11-21T10:00:30Z')), 0)
  })
})

describe('BT-TEST-03: batchLabels', () => {
  const pr = (number, overrides = {}) => ({
    number,
    branch: `feat/issue-${number + 100}-x`,
    labels: [],
    conflict: false,
    verdict: null,
    behindBy: 2,
    checks: 'success',
    ...overrides,
  })

  it('marks the batch under test and clears the mark afterwards', () => {
    assert.deepEqual(batchLabels([pr(1), pr(2, { labels: [BATCHED_LABEL] })], [1]), [
      { pr: 1, label: BATCHED_LABEL, add: true },
      { pr: 2, label: BATCHED_LABEL, add: false },
    ])
    assert.deepEqual(batchLabels([pr(1, { labels: [BATCHED_LABEL] })], [1]), [])
  })

  it('labels a culprit head failed, and clears it once the head changed', () => {
    assert.deepEqual(batchLabels([pr(3, { verdict: 'failure' })], []), [
      { pr: 3, label: FAILED_LABEL, add: true, reason: 'verdict', issue: 103 },
    ])
    assert.deepEqual(batchLabels([pr(3, { labels: [FAILED_LABEL] })], []), [
      { pr: 3, label: FAILED_LABEL, add: false, reason: 'checks', issue: 103 },
    ])
  })

  it('labels a red up-to-date head failed, but not a red head behind main', () => {
    assert.deepEqual(batchLabels([pr(4, { behindBy: 0, checks: 'failure', branch: 'fix/x' })], []), [
      { pr: 4, label: FAILED_LABEL, add: true, reason: 'checks' },
    ])
    assert.deepEqual(batchLabels([pr(4, { checks: 'failure' })], []), [])
  })

  it('labels a conflict and nothing else on that PR', () => {
    assert.deepEqual(batchLabels([pr(5, { conflict: true, verdict: 'failure' })], []), [
      { pr: 5, label: CONFLICT_LABEL, add: true, reason: 'conflict', issue: 105 },
    ])
  })
})

describe('BT-TEST-03: pauseIssue', () => {
  it('describes a tree mismatch with the PRs already merged', () => {
    const issue = pauseIssue({
      reason: 'tree-mismatch',
      pr: 2,
      merged: [1, 2],
      batchHead: sha(9),
      runUrl: 'https://run',
    })
    assert.equal(issue.title, 'Merge train paused: tree-mismatch at #2')
    assert.deepEqual(issue.labels, [PAUSED_LABEL, 'priority-high'])
    assert.match(issue.body, /after merging #2, `main`'s tree differs/)
    assert.match(issue.body, /Already merged from this batch: #1, #2/)
    assert.match(issue.body, /Train run: https:\/\/run/)
  })

  it('describes a merge that failed after its retries', () => {
    const issue = pauseIssue({ reason: 'merge-failed', pr: 1, merged: [], batchHead: sha(9), runUrl: 'https://run' })
    assert.match(issue.body, /merging #1 failed after 3 retries/)
    assert.match(issue.body, /Already merged from this batch: none/)
  })
})
