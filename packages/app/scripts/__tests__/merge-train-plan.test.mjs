import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONFLICT_LABEL,
  DEFAULT_SKIP_LABELS,
  FAILED_LABEL,
  QA_HOLD_MARKER,
  QA_HOLD_REASON,
  checksState,
  linkedIssue,
  needsQaHoldComment,
  planMergeTrain,
  qaHold,
} from '../../../../scripts/merge-train-plan.mjs'

const REQUIRED = ['gate', 'integration', 'browser-smoke']
const done = (name, conclusion, id = 1) => ({ name, status: 'completed', conclusion, id })

function pr(number, overrides = {}) {
  return { number, draft: false, labels: [], behindBy: 0, conflict: false, checks: 'pending', ...overrides }
}

describe('checksState', () => {
  it('is success when every required check passed, counting skipped and neutral', () => {
    const runs = [done('gate', 'success'), done('integration', 'skipped'), done('browser-smoke', 'neutral')]
    assert.equal(checksState(runs, REQUIRED), 'success')
  })

  it('is failure when a required check failed, even while another runs', () => {
    const runs = [
      done('gate', 'failure'),
      { name: 'integration', status: 'in_progress', conclusion: null, id: 2 },
      done('browser-smoke', 'success'),
    ]
    assert.equal(checksState(runs, REQUIRED), 'failure')
  })

  it('is pending when a required check has not started or still runs', () => {
    assert.equal(checksState([done('gate', 'success')], REQUIRED), 'pending')
  })

  it('reads the newest run of a check, so a passed rerun replaces a failure', () => {
    const runs = [
      done('gate', 'success'),
      done('integration', 'success', 9),
      done('integration', 'failure', 3),
      done('browser-smoke', 'success'),
    ]
    assert.equal(checksState(runs, REQUIRED), 'success')
  })

  it('ignores checks that are not required', () => {
    const runs = [done('gate', 'success'), done('integration', 'success'), done('browser-smoke', 'success')]
    assert.equal(checksState([...runs, done('perf', 'failure')], REQUIRED), 'success')
  })
})

describe('planMergeTrain', () => {
  it('merges an up-to-date green PR before anything else', () => {
    const plan = planMergeTrain([pr(1, { behindBy: 2 }), pr(2, { checks: 'success' })])
    assert.deepEqual(plan, { type: 'merge', pr: 2, labels: [], held: [] })
  })

  it('waits for the PR in flight instead of updating another', () => {
    const plan = planMergeTrain([pr(1, { behindBy: 1, checks: 'success' }), pr(3, { checks: 'pending' })])
    assert.deepEqual(plan, { type: 'wait', pr: 3, labels: [], held: [] })
  })

  it('updates the next PR in queue order when nothing is in flight', () => {
    const plan = planMergeTrain([
      pr(7, { behindBy: 1, labels: ['priority-medium'] }),
      pr(9, { behindBy: 1, labels: ['priority-high'] }),
      pr(5, { behindBy: 1 }),
      pr(8, { behindBy: 3, labels: ['priority-medium'] }),
    ])
    assert.equal(plan.type, 'update')
    assert.equal(plan.pr, 9)
    const order = planMergeTrain([pr(5, { behindBy: 1 }), pr(8, { behindBy: 1, labels: ['priority-medium'] })])
    assert.equal(order.pr, 8)
    const oldest = planMergeTrain([pr(8, { behindBy: 1 }), pr(5, { behindBy: 1 })])
    assert.equal(oldest.pr, 5)
  })

  it('updates a PR that failed on an old main only after the PRs that did not fail', () => {
    const plan = planMergeTrain([pr(1, { behindBy: 1, checks: 'failure' }), pr(2, { behindBy: 1, checks: 'success' })])
    assert.equal(plan.pr, 2)
    const retry = planMergeTrain([pr(1, { behindBy: 1, checks: 'failure' })])
    assert.deepEqual(retry, { type: 'update', pr: 1, labels: [], held: [] })
  })

  it('labels a PR that failed while up to date and skips it', () => {
    const plan = planMergeTrain([pr(1, { checks: 'failure' }), pr(2, { behindBy: 1 })])
    assert.deepEqual(plan, { type: 'update', pr: 2, labels: [{ pr: 1, label: FAILED_LABEL, add: true }], held: [] })
  })

  it('labels a conflicting PR and skips it, and clears the labels once the PR moves on', () => {
    const plan = planMergeTrain([
      pr(1, { conflict: true, behindBy: 1 }),
      pr(2, { checks: 'pending', labels: [FAILED_LABEL, CONFLICT_LABEL] }),
    ])
    assert.deepEqual(plan, {
      type: 'wait',
      pr: 2,
      labels: [
        { pr: 1, label: CONFLICT_LABEL, add: true },
        { pr: 2, label: CONFLICT_LABEL, add: false },
        { pr: 2, label: FAILED_LABEL, add: false },
      ],
      held: [],
    })
  })

  it('keeps drafts and PRs with a skip label out of the train', () => {
    const prs = [
      pr(1, { draft: true, checks: 'success' }),
      pr(2, { labels: ['in-progress'], checks: 'success' }),
      pr(3, { labels: ['do-not-merge'], behindBy: 1 }),
    ]
    assert.deepEqual(planMergeTrain(prs), { type: 'idle', labels: [], held: [] })
    assert.ok(DEFAULT_SKIP_LABELS.includes('in-progress'))
  })

  it('takes a custom skip list', () => {
    const plan = planMergeTrain([pr(2, { labels: ['in-progress'], checks: 'success' })], { skipLabels: ['hold'] })
    assert.equal(plan.type, 'merge')
  })

  it('is idle when only labelled failures and conflicts remain', () => {
    const plan = planMergeTrain([
      pr(1, { checks: 'failure', labels: [FAILED_LABEL] }),
      pr(2, { conflict: true, labels: [CONFLICT_LABEL] }),
    ])
    assert.deepEqual(plan, { type: 'idle', labels: [], held: [] })
  })
})

describe('MT-TEST-05: QA hold (MT-D02)', () => {
  it('holds a risk-high PR that needs QA until qa is set', () => {
    assert.equal(qaHold(['risk-high', 'needs-qa']), true)
    assert.equal(qaHold(['risk-high', 'needs-qa', 'qa']), false)
    assert.equal(qaHold(['risk-medium', 'needs-qa']), false)
    assert.equal(qaHold(['risk-high']), false)
  })

  it('skips a held PR with a logged reason and moves the next one', () => {
    const plan = planMergeTrain([
      pr(1, { labels: ['risk-high', 'needs-qa', 'priority-high'], checks: 'success' }),
      pr(2, { behindBy: 1 }),
    ])
    assert.deepEqual(plan, { type: 'update', pr: 2, labels: [], held: [{ pr: 1, reason: QA_HOLD_REASON }] })
  })

  it('queues the same PR once the owner sets qa', () => {
    const plan = planMergeTrain([pr(1, { labels: ['risk-high', 'needs-qa', 'qa'], checks: 'success' })])
    assert.deepEqual(plan, { type: 'merge', pr: 1, labels: [], held: [] })
  })

  it('queues a risk-medium PR that needs QA (negative case)', () => {
    const plan = planMergeTrain([pr(1, { labels: ['risk-medium', 'needs-qa'], checks: 'success' })])
    assert.deepEqual(plan, { type: 'merge', pr: 1, labels: [], held: [] })
  })

  it('leaves a skip label in charge: a held PR that also has a skip label is not listed as held', () => {
    const plan = planMergeTrain([pr(1, { labels: ['risk-high', 'needs-qa', 'blocked'] })])
    assert.deepEqual(plan, { type: 'idle', labels: [], held: [] })
  })

  it('comments on a held PR only the first time', () => {
    assert.equal(needsQaHoldComment([]), true)
    assert.equal(needsQaHoldComment(['Merge train: other']), true)
    assert.equal(needsQaHoldComment([`Merge train: held ${QA_HOLD_MARKER}`]), false)
  })
})

describe('MT-TEST-05: labels mirrored onto the linked issue', () => {
  it('reads the issue from the head branch', () => {
    assert.equal(linkedIssue('feat/issue-123-x'), 123)
    assert.equal(linkedIssue('issue-7'), 7)
    assert.equal(linkedIssue('fix/issue-45'), 45)
    assert.equal(linkedIssue('feat/tissue-12-x'), null)
    assert.equal(linkedIssue('feat/issue-12x'), null)
    assert.equal(linkedIssue('chore/no-issue'), null)
    assert.equal(linkedIssue(undefined), null)
  })

  it('adds the conflict label to issue #123 for a conflicting PR on feat/issue-123-x', () => {
    const plan = planMergeTrain([pr(9, { branch: 'feat/issue-123-x', conflict: true, behindBy: 1 })])
    assert.deepEqual(plan.labels, [{ pr: 9, label: CONFLICT_LABEL, add: true, issue: 123 }])
  })

  it('removes the label from the issue together with the PR', () => {
    const plan = planMergeTrain([pr(9, { branch: 'feat/issue-123-x', labels: [CONFLICT_LABEL], checks: 'pending' })])
    assert.deepEqual(plan.labels, [{ pr: 9, label: CONFLICT_LABEL, add: false, issue: 123 }])
  })

  it('mirrors the failed label too', () => {
    const plan = planMergeTrain([pr(4, { branch: 'fix/issue-8-y', checks: 'failure' })])
    assert.deepEqual(plan.labels, [{ pr: 4, label: FAILED_LABEL, add: true, issue: 8 }])
  })

  it('labels no issue when the branch names none', () => {
    const plan = planMergeTrain([pr(9, { branch: 'feat/batch-train', conflict: true })])
    assert.deepEqual(plan.labels, [{ pr: 9, label: CONFLICT_LABEL, add: true }])
  })
})
