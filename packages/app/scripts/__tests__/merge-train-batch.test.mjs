// BT-TEST-01 (plan) and BT-TEST-02 (judge) of `.ai/specs/2026-11-18-batch-merge-train.md`, phase 1.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BATCH_MAX_AGE_MINUTES,
  BATCH_SKIP_REASONS,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  QA_HOLD_REASON,
  VERDICT_STATUS,
  batchesAlone,
  judgeBatch,
  parseBatchSize,
  planBatch,
  planMergeTrain,
  verdictOf,
} from '../../../../scripts/merge-train-plan.mjs'

const REQUIRED = ['gate', 'integration', 'browser-smoke']
const sha = (n) => String(n).padStart(40, 'a')

function pr(number, overrides = {}) {
  return {
    number,
    draft: false,
    labels: [],
    behindBy: 3,
    conflict: false,
    checks: 'success',
    headSha: sha(number),
    fork: false,
    files: ['packages/app/src/x.ts'],
    verdict: null,
    ...overrides,
  }
}

const numbers = (plan) => plan.batch.map((entry) => entry.number)

describe('BT-TEST-01: parseBatchSize', () => {
  it("reads 1 to MAX_BATCH_SIZE and keeps today's one-PR train otherwise", () => {
    assert.equal(parseBatchSize('4'), 4)
    assert.equal(parseBatchSize(' 2 '), 2)
    assert.equal(parseBatchSize(String(MAX_BATCH_SIZE)), MAX_BATCH_SIZE)
    for (const value of [undefined, null, '', '  ', '0', '-1', '2.5', 'four', String(MAX_BATCH_SIZE + 1)]) {
      assert.equal(parseBatchSize(value), 1, `value ${value}`)
    }
    assert.ok(DEFAULT_BATCH_SIZE <= MAX_BATCH_SIZE)
  })
})

describe('BT-TEST-01: verdictOf and batchesAlone', () => {
  it('reads the newest merge-train/verdict status of a head', () => {
    assert.equal(verdictOf([]), null)
    assert.equal(verdictOf([{ context: 'ci/other', state: 'failure', id: 1 }]), null)
    const statuses = [
      { context: VERDICT_STATUS, state: 'failure', id: 2 },
      { context: VERDICT_STATUS, state: 'success', id: 5 },
      { context: VERDICT_STATUS, state: 'error', id: 3 },
    ]
    assert.equal(verdictOf(statuses), 'success')
    assert.equal(verdictOf(statuses.slice(0, 1)), 'failure')
  })

  it('isolates PRs that change CI or the train, and PRs whose files are unknown (BT-D05)', () => {
    assert.equal(batchesAlone(pr(1)), false)
    assert.equal(batchesAlone(pr(1, { files: ['.github/workflows/ci.yml'] })), true)
    assert.equal(batchesAlone(pr(1, { files: ['README.md', 'scripts/merge-train.mjs'] })), true)
    assert.equal(batchesAlone(pr(1, { files: ['scripts/merge-train-plan.mjs'] })), true)
    assert.equal(batchesAlone(pr(1, { files: ['scripts/verify.mjs', 'docs/.github/x.md'] })), false)
    assert.equal(batchesAlone(pr(1, { files: undefined })), true)
  })
})

describe('BT-TEST-01: planBatch', () => {
  it('builds one batch of four green, non-conflicting PRs in queue order (BT-AC-01)', () => {
    const plan = planBatch([pr(4), pr(2), pr(3, { labels: ['priority-high'] }), pr(1)], { size: 4 })
    assert.deepEqual(plan, {
      batch: [3, 1, 2, 4].map((number) => ({ number, sha: sha(number) })),
      suspects: null,
      skipped: [],
      held: [],
      update: null,
    })
  })

  it("caps the batch at its size; size 1 takes the head of today's queue", () => {
    const prs = [pr(1), pr(2), pr(3), pr(4), pr(5)]
    assert.deepEqual(numbers(planBatch(prs, { size: 4 })), [1, 2, 3, 4])
    assert.deepEqual(numbers(planBatch(prs, { size: 2 })), [1, 2])
    assert.deepEqual(numbers(planBatch(prs)), [1])
  })

  it('leaves out forks, conflicts, PRs not green on their own head and heads with a failure verdict', () => {
    const plan = planBatch(
      [
        pr(1, { fork: true }),
        pr(2, { conflict: true }),
        pr(3, { checks: 'pending' }),
        pr(4, { checks: 'failure', behindBy: 0 }),
        pr(5, { verdict: 'failure' }),
        pr(6),
      ],
      { size: 4 },
    )
    assert.deepEqual(numbers(plan), [6])
    assert.deepEqual(plan.skipped, [
      { pr: 1, reason: 'fork' },
      { pr: 2, reason: 'conflict' },
      { pr: 3, reason: 'pending' },
      { pr: 4, reason: 'failure' },
      { pr: 5, reason: 'verdict' },
    ])
    for (const entry of plan.skipped) assert.ok(BATCH_SKIP_REASONS[entry.reason])
    assert.equal(plan.update, null)
  })

  it('takes a PR back once a new push cleared its verdict (a verdict is tied to the head)', () => {
    assert.deepEqual(numbers(planBatch([pr(5, { verdict: 'success' })], { size: 4 })), [5])
    assert.deepEqual(numbers(planBatch([pr(5, { verdict: null, headSha: sha(55) })], { size: 4 })), [5])
  })

  it('keeps the queue rules: drafts, skip labels and the QA hold stay out', () => {
    const plan = planBatch(
      [
        pr(1, { draft: true }),
        pr(2, { labels: ['blocked'] }),
        pr(3, { labels: ['risk-high', 'needs-qa'] }),
        pr(4, { labels: ['in-progress'] }),
      ],
      { size: 4, skipLabels: ['blocked'] },
    )
    assert.deepEqual(numbers(plan), [4])
    assert.deepEqual(plan.held, [{ pr: 3, reason: QA_HOLD_REASON }])
  })

  it('lets a PR that changes CI or the train go alone (BT-D05)', () => {
    const train = { files: ['scripts/merge-train.mjs'] }
    assert.deepEqual(numbers(planBatch([pr(1, train), pr(2), pr(3)], { size: 4 })), [1])
    assert.deepEqual(numbers(planBatch([pr(1), pr(2), pr(3, train), pr(4)], { size: 4 })), [1, 2])
  })

  it('updates the first PR that is red on its own head and behind main, as today', () => {
    const plan = planBatch(
      [
        pr(1, { checks: 'failure', behindBy: 0 }),
        pr(2, { checks: 'failure', behindBy: 2 }),
        pr(3, { checks: 'failure' }),
      ],
      { size: 4 },
    )
    assert.deepEqual(plan.batch, [])
    assert.equal(plan.update, 2)
    const marked = planBatch([
      pr(2, { checks: 'failure', verdict: 'failure' }),
      pr(3, { checks: 'failure', conflict: true }),
    ])
    assert.equal(marked.update, null)
  })

  it('plans the first half of the suspects during a bisection, the other PRs wait', () => {
    const prs = [pr(1), pr(2), pr(3), pr(4), pr(9)]
    const plan = planBatch(prs, { size: 4, suspects: [2, 3, 4] })
    assert.deepEqual(numbers(plan), [2, 3])
    assert.deepEqual(plan.suspects, [2, 3, 4])
    assert.deepEqual(numbers(planBatch(prs, { size: 4, suspects: [4] })), [4])
  })

  it('drops suspects that left the queue or are no longer batchable, and plans afresh when none is left', () => {
    const prs = [pr(1), pr(2, { checks: 'pending' }), pr(3)]
    const plan = planBatch(prs, { size: 4, suspects: [7, 2, 3] })
    assert.deepEqual(numbers(plan), [3])
    assert.deepEqual(plan.suspects, [3])
    const fresh = planBatch(prs, { size: 4, suspects: [2, 7] })
    assert.deepEqual(numbers(fresh), [1, 3])
    assert.equal(fresh.suspects, null)
  })

  it('is empty when nothing is batchable', () => {
    assert.deepEqual(planBatch([]), { batch: [], suspects: null, skipped: [], held: [], update: null })
  })

  it("leaves today's planMergeTrain untouched by the new PR fields", () => {
    const plan = planMergeTrain([pr(1, { behindBy: 0, verdict: 'failure', fork: true, files: undefined })])
    assert.deepEqual(plan, { type: 'merge', pr: 1, labels: [], held: [] })
  })
})

const run = (name, conclusion, headSha, id = 1) => ({ name, status: 'completed', conclusion, id, headSha })
const green = (headSha) => REQUIRED.map((name, index) => run(name, 'success', headSha, index + 1))
const batchOf = (prNumbers, suspects = null) => ({
  prs: prNumbers.map((number) => ({ number, sha: sha(number) })),
  base: sha(0),
  suspects,
})

describe('BT-TEST-02: judgeBatch', () => {
  const head = 'b'.repeat(40)
  const old = 'c'.repeat(40)

  it('merges a green batch in order', () => {
    const verdict = judgeBatch(batchOf([1, 2, 3]), {
      headSha: head,
      runs: green(head),
      required: REQUIRED,
      ageMinutes: 40,
    })
    assert.deepEqual(verdict, { type: 'merge', prs: batchOf([1, 2, 3]).prs, suspects: null })
  })

  it('ignores runs of an older batch head: a red or cancelled old head never decides (negative case)', () => {
    const runs = [
      run('gate', 'failure', old, 7),
      run('integration', 'cancelled', old, 8),
      run('browser-smoke', 'failure', old, 9),
      run('gate', 'success', head, 2),
    ]
    assert.deepEqual(judgeBatch(batchOf([1, 2]), { headSha: head, runs, required: REQUIRED, ageMinutes: 10 }), {
      type: 'wait',
    })
    const greenOld = judgeBatch(batchOf([1, 2]), {
      headSha: head,
      runs: green(old),
      required: REQUIRED,
      ageMinutes: 10,
    })
    assert.deepEqual(greenOld, { type: 'wait' })
  })

  it('rebuilds a batch that waited BATCH_MAX_AGE_MINUTES without a verdict', () => {
    const args = { headSha: head, runs: [], required: REQUIRED }
    assert.deepEqual(judgeBatch(batchOf([1]), { ...args, ageMinutes: BATCH_MAX_AGE_MINUTES - 1 }), { type: 'wait' })
    assert.deepEqual(judgeBatch(batchOf([1]), { ...args, ageMinutes: BATCH_MAX_AGE_MINUTES }), {
      type: 'rebuild',
      reason: 'stale',
    })
    assert.deepEqual(judgeBatch(batchOf([1]), { ...args, ageMinutes: 30, maxAgeMinutes: 30 }).type, 'rebuild')
  })

  it('bisects a red batch of several and names a red batch of one as the culprit', () => {
    const red = [run('gate', 'failure', head)]
    assert.deepEqual(judgeBatch(batchOf([1, 2, 3]), { headSha: head, runs: red, required: REQUIRED, ageMinutes: 5 }), {
      type: 'bisect',
      suspects: [1, 2, 3],
    })
    assert.deepEqual(
      judgeBatch(batchOf([2], [2, 3]), { headSha: head, runs: red, required: REQUIRED, ageMinutes: 5 }),
      {
        type: 'culprit',
        pr: 2,
        sha: sha(2),
      },
    )
  })

  it('merges a green half and keeps the other suspects for the next batch', () => {
    const verdict = judgeBatch(batchOf([1, 2], [1, 2, 3]), {
      headSha: head,
      runs: green(head),
      required: REQUIRED,
      ageMinutes: 5,
    })
    assert.deepEqual(verdict, { type: 'merge', prs: batchOf([1, 2]).prs, suspects: [3] })
  })
})

describe('BT-TEST-01: bisection of a red batch of three, step by step (REQ-BT03, BT-AC-02)', () => {
  const head = 'd'.repeat(40)
  const judgeStep = (batch, culprit) => {
    const red = batch.prs.some((entry) => entry.number === culprit)
    const runs = red ? [run('gate', 'failure', head)] : green(head)
    return judgeBatch(batch, { headSha: head, runs, required: REQUIRED, ageMinutes: 5 })
  }

  // Drives plan → judge until a culprit is named; returns the merged PRs and the culprit.
  function bisect(culprit) {
    let queue = [pr(1), pr(2), pr(3)]
    let suspects = null
    const merged = []
    for (let step = 0; step < 5; step++) {
      const plan = planBatch(queue, { size: 4, suspects })
      const verdict = judgeStep({ prs: plan.batch, base: sha(0), suspects: plan.suspects }, culprit)
      if (verdict.type === 'culprit') return { merged, culprit: verdict.pr, queue: queue.map((entry) => entry.number) }
      if (verdict.type === 'merge') {
        merged.push(...verdict.prs.map((entry) => entry.number))
        queue = queue.filter((entry) => !merged.includes(entry.number))
      }
      suspects = verdict.suspects
    }
    throw new Error('no culprit')
  }

  for (const culprit of [1, 2, 3]) {
    it(`names #${culprit} and keeps the other two`, () => {
      const result = bisect(culprit)
      assert.equal(result.culprit, culprit)
      const kept = [1, 2, 3].filter((number) => number !== culprit)
      assert.deepEqual([...result.merged, ...result.queue.filter((number) => number !== culprit)].sort(), kept)
    })
  }

  it('re-enters the culprit only after a new push clears its verdict', () => {
    const marked = planBatch([pr(2, { verdict: 'failure' }), pr(3)], { size: 4 })
    assert.deepEqual(numbers(marked), [3])
    assert.deepEqual(numbers(planBatch([pr(2, { headSha: sha(22) }), pr(3)], { size: 4 })), [2, 3])
  })
})
