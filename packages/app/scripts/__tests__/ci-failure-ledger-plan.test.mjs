import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEDGER_LABELS,
  LEDGER_TITLE,
  MAX_ENTRIES,
  QUARANTINE_LABELS,
  WINDOW_MS,
  parseLedger,
  planLedger,
  quarantinedTestId,
  renderLedger,
  renderQuarantine,
  runSubject,
  testIdOf,
  unexpectedFailures,
  unrelated,
} from '../../../../scripts/ci-failure-ledger-plan.mjs'

const L03 = '.ai/qa/tests/people/TEST-L03-departure.spec.ts'
const LISTS = '.ai/qa/tests/platform/ADMIN-LISTS-LOAD-ONCE.spec.ts'
const KNOWN = new Set([L03, LISTS])
const NOW = new Date('2026-11-18T20:00:00Z')
const REPO = 'wladku/Vereino'

const spec = (file, title, status) => ({ file, title, tests: [{ status }] })
const entry = (overrides = {}) => ({
  testId: 'TEST-L03',
  file: L03,
  prs: [1],
  onMain: false,
  url: 'https://ci/1',
  at: '2026-11-18T19:00:00Z',
  ...overrides,
})
const subject = (overrides = {}) => ({
  prs: [2],
  onMain: false,
  url: 'https://ci/2',
  at: '2026-11-18T19:30:00Z',
  ...overrides,
})
const failure = { testId: 'TEST-L03', file: L03 }

describe('testIdOf', () => {
  it('reads the id a title starts with', () => {
    assert.equal(testIdOf('TEST-L03 a family leaves'), 'TEST-L03')
    assert.equal(testIdOf('ENG-TEST-05 a self-created tenant user can sign in'), 'ENG-TEST-05')
    assert.equal(testIdOf('E02-S03'), 'E02-S03')
  })

  it('is null without an id at the start', () => {
    assert.equal(testIdOf('admin lists load their data once'), null)
    assert.equal(testIdOf('TEST-L03x is not a word boundary'), null)
  })
})

describe('unexpectedFailures', () => {
  it('keeps unexpected tests of known spec files, named by id or by file, once each', () => {
    const report = {
      suites: [
        {
          specs: [spec(L03, 'TEST-L03 a family leaves', 'unexpected'), spec(L03, 'TEST-L03 again', 'unexpected')],
          suites: [{ specs: [spec(LISTS, 'admin lists load their data once', 'unexpected')] }],
        },
      ],
    }
    assert.deepEqual(unexpectedFailures(report, KNOWN), [
      { testId: 'TEST-L03', file: L03 },
      { testId: 'ADMIN-LISTS-LOAD-ONCE', file: LISTS },
    ])
  })

  it('ignores passed and flaky tests, unknown files, other paths and empty reports', () => {
    const report = {
      suites: [
        {
          specs: [
            spec(L03, 'TEST-L03 passes', 'expected'),
            spec(L03, 'TEST-L03 passes on retry', 'flaky'),
            spec('.ai/qa/tests/x/TEST-X01-new.spec.ts', 'TEST-X01 only on the PR', 'unexpected'),
            spec('../../etc/passwd', 'TEST-X02 outside', 'unexpected'),
            { file: L03, title: 'TEST-L03 without tests' },
          ],
        },
        {},
      ],
    }
    assert.deepEqual(unexpectedFailures(report, new Set([...KNOWN, '../../etc/passwd'])), [])
    assert.deepEqual(unexpectedFailures(null, KNOWN), [])
    assert.deepEqual(unexpectedFailures({}, KNOWN), [])
  })
})

describe('runSubject', () => {
  const run = (overrides = {}) => ({
    head_repository: { full_name: REPO },
    repository: { default_branch: 'main' },
    conclusion: 'failure',
    event: 'pull_request',
    head_branch: 'feat/x',
    pull_requests: [{ number: 7 }],
    html_url: 'https://ci/7',
    created_at: '2026-11-18T19:00:00Z',
    ...overrides,
  })

  it('names the PRs of a pull-request run', () => {
    assert.deepEqual(runSubject(run({ conclusion: 'cancelled' }), REPO).prs, [7])
    assert.deepEqual(runSubject(run({ conclusion: 'timed_out' }), REPO).prs, [7])
    assert.deepEqual(runSubject(run(), REPO), {
      url: 'https://ci/7',
      at: '2026-11-18T19:00:00Z',
      prs: [7],
      onMain: false,
    })
  })

  it('marks a push run on the default branch as main', () => {
    assert.deepEqual(runSubject(run({ event: 'push', head_branch: 'main', pull_requests: [] }), REPO), {
      url: 'https://ci/7',
      at: '2026-11-18T19:00:00Z',
      prs: [],
      onMain: true,
    })
  })

  it('skips forks, runs that did not fail and runs without a pull request', () => {
    assert.match(runSubject(run({ head_repository: { full_name: 'someone/Vereino' } }), REPO).skip, /fork/)
    assert.match(runSubject(run({ head_repository: null }), REPO).skip, /fork/)
    assert.match(runSubject(run({ conclusion: 'success' }), REPO).skip, /concluded success/)
    assert.match(runSubject(run({ pull_requests: [] }), REPO).skip, /pull_request run without/)
    assert.match(runSubject(run({ pull_requests: undefined }), REPO).skip, /without/)
    assert.match(runSubject(run({ event: 'push', head_branch: 'feat/x' }), REPO).skip, /push run without/)
    assert.match(runSubject(run({ event: 'push', head_branch: 'main', repository: undefined }), REPO).skip, /push run/)
  })
})

describe('parseLedger and renderLedger', () => {
  it('round-trips the entries and renders a readable table', () => {
    const entries = [entry(), entry({ prs: [], onMain: true, url: 'https://ci/3', testId: 'E02-S03' })]
    const body = renderLedger(entries)
    assert.deepEqual(parseLedger(body), entries)
    assert.match(body, /\| `TEST-L03` \| #1 \| \[run\]\(https:\/\/ci\/1\) \|/)
    assert.match(body, /\| `E02-S03` \| main \|/)
  })

  it('renders an empty ledger', () => {
    assert.match(renderLedger([]), /\| — \| — \| — \| — \|/)
    assert.deepEqual(parseLedger(renderLedger([])), [])
  })

  it('reads no data from a missing, unterminated, invalid or foreign body, and drops malformed entries', () => {
    assert.deepEqual(parseLedger(undefined), [])
    assert.deepEqual(parseLedger('no data here'), [])
    assert.deepEqual(parseLedger('<!-- ci-failure-ledger-data [] '), [])
    assert.deepEqual(parseLedger('<!-- ci-failure-ledger-data not json -->'), [])
    assert.deepEqual(parseLedger('<!-- ci-failure-ledger-data {"a":1} -->'), [])
    assert.deepEqual(parseLedger(`<!-- ci-failure-ledger-data ${JSON.stringify([entry(), { testId: 1 }, null])} -->`), [
      entry(),
    ])
  })
})

describe('unrelated', () => {
  it('is true when the runs share no PR and false for the same run or a shared PR', () => {
    assert.equal(unrelated(entry(), entry({ url: 'https://ci/2', prs: [2] })), true)
    assert.equal(unrelated(entry(), entry({ url: 'https://ci/2', prs: [], onMain: true })), true)
    assert.equal(unrelated(entry(), entry({ url: 'https://ci/2', prs: [1, 3] })), false)
    assert.equal(unrelated(entry(), entry()), false)
  })
})

describe('planLedger', () => {
  const plan = (overrides = {}) =>
    planLedger({ entries: [], failures: [failure], subject: subject(), now: NOW, quarantined: new Set(), ...overrides })

  it('records a first failure without a quarantine', () => {
    const result = plan()
    assert.deepEqual(result.quarantines, [])
    assert.deepEqual(result.entries, [
      { ...failure, prs: [2], onMain: false, url: 'https://ci/2', at: '2026-11-18T19:30:00Z' },
    ])
  })

  it('quarantines a test that failed in an unrelated run within the window', () => {
    const result = plan({ entries: [entry()] })
    assert.deepEqual(result.quarantines, [
      { testId: 'TEST-L03', file: L03, evidence: ['https://ci/2', 'https://ci/1'] },
    ])
    assert.deepEqual(
      result.entries.map((item) => item.url),
      ['https://ci/2', 'https://ci/1'],
    )
  })

  it('does not quarantine on a run of the same PR, on another test, or outside the window', () => {
    assert.deepEqual(plan({ entries: [entry({ prs: [2] })] }).quarantines, [])
    assert.deepEqual(plan({ entries: [entry({ testId: 'E02-S03' })] }).quarantines, [])
    const old = entry({ at: new Date(NOW.getTime() - WINDOW_MS - 1).toISOString() })
    const result = plan({ entries: [old] })
    assert.deepEqual(result.quarantines, [])
    assert.equal(result.entries.length, 1)
  })

  it('quarantines any failure on main at once', () => {
    const result = plan({ subject: subject({ prs: [], onMain: true, url: 'https://ci/main' }) })
    assert.deepEqual(result.quarantines, [{ testId: 'TEST-L03', file: L03, evidence: ['https://ci/main'] }])
  })

  it('skips a test that already has an open quarantine issue', () => {
    assert.deepEqual(plan({ entries: [entry()], quarantined: new Set(['TEST-L03']) }).quarantines, [])
  })

  it('records a replayed run only once and proves nothing with a run older than the window', () => {
    const again = plan({ entries: [entry({ url: 'https://ci/2', prs: [2], at: '2026-11-18T19:30:00Z' })] })
    assert.equal(again.entries.length, 1)
    const stale = plan({ subject: subject({ at: '2026-11-10T00:00:00Z' }), entries: [entry()] })
    assert.deepEqual(stale.quarantines, [])
  })

  it('keeps at most MAX_ENTRIES entries, newest first', () => {
    const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, index) =>
      entry({
        testId: `T-${index}`,
        url: `https://ci/x${index}`,
        at: new Date(NOW.getTime() - (index + 1) * 1000).toISOString(),
      }),
    )
    const result = plan({ entries: many, subject: subject({ at: NOW.toISOString() }) })
    assert.equal(result.entries.length, MAX_ENTRIES)
    assert.equal(result.entries[0].url, 'https://ci/2')
  })
})

describe('renderQuarantine and quarantinedTestId', () => {
  it('writes a generated issue whose marker names the test', () => {
    const issue = renderQuarantine({ testId: 'TEST-L03', file: L03, evidence: ['https://ci/2', 'https://ci/1'] })
    assert.equal(issue.title, 'test: quarantine TEST-L03, it fails in CI runs that share no PR')
    assert.deepEqual(issue.labels, QUARANTINE_LABELS)
    assert.match(issue.body, /- https:\/\/ci\/1/)
    assert.match(issue.body, /packages\/app\/\.ai\/qa\/tests\/people\/TEST-L03-departure\.spec\.ts/)
    assert.equal(quarantinedTestId(issue.body), 'TEST-L03')
  })

  it('finds no test id in another body', () => {
    assert.equal(quarantinedTestId('plain text'), null)
    assert.equal(quarantinedTestId(undefined), null)
  })

  it('exposes the ledger issue constants', () => {
    assert.equal(LEDGER_TITLE, 'CI failure ledger (automated)')
    assert.deepEqual(LEDGER_LABELS, ['blocked'])
  })
})
