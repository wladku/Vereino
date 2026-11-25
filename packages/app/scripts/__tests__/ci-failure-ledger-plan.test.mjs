import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEDGER_LABELS,
  LEDGER_TITLE,
  MAX_ENTRIES,
  QUARANTINE_LABELS,
  STORM_LABELS,
  STORM_THRESHOLD,
  WINDOW_MS,
  headsToCompare,
  offMainCommits,
  parseLedger,
  planLedger,
  quarantinedTestIds,
  renderLedger,
  renderQuarantine,
  renderStorm,
  runSubject,
  splitStorms,
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
    head_sha: 'h7',
    ...overrides,
  })

  it('names the PRs of a pull-request run', () => {
    assert.deepEqual(runSubject(run({ conclusion: 'cancelled' }), REPO).prs, [7])
    assert.deepEqual(runSubject(run({ conclusion: 'timed_out' }), REPO).prs, [7])
    assert.deepEqual(runSubject(run(), REPO), {
      url: 'https://ci/7',
      at: '2026-11-18T19:00:00Z',
      head: 'h7',
      prs: [7],
      onMain: false,
    })
  })

  it('marks a push run on the default branch as main', () => {
    assert.deepEqual(runSubject(run({ event: 'push', head_branch: 'main', pull_requests: [] }), REPO), {
      url: 'https://ci/7',
      at: '2026-11-18T19:00:00Z',
      head: 'h7',
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

describe('offMainCommits', () => {
  const commits = new Map([['h1', new Set(['a'])]])

  it('is empty for a run on main and the compared set for a known head', () => {
    assert.deepEqual(offMainCommits(entry({ onMain: true, prs: [] }), commits), new Set())
    assert.deepEqual(offMainCommits(entry({ head: 'h1' }), commits), new Set(['a']))
  })

  it('is unknown without a head, with a malformed head or with an uncompared head', () => {
    assert.equal(offMainCommits(entry(), commits), null)
    assert.equal(offMainCommits(entry({ head: 1 }), commits), null)
    assert.equal(offMainCommits(entry({ head: 'h9' }), commits), null)
  })
})

describe('unrelated', () => {
  // #746 and #750: different PRs, but #750 merged #746's branch, so both heads carry the commit `b746`.
  const commits = new Map([
    ['h1', new Set(['a1'])],
    ['h2', new Set(['a2'])],
    ['h746', new Set(['b746'])],
    ['h750', new Set(['b746', 'b750'])],
  ])
  const run = (pr, head) => entry({ url: `https://ci/${pr}`, prs: [pr], head })

  it('is true when the runs share no PR and no commit off main', () => {
    assert.equal(unrelated(run(1, 'h1'), run(2, 'h2'), commits), true)
    assert.equal(unrelated(run(1, 'h1'), entry({ url: 'https://ci/m', prs: [], onMain: true }), commits), true)
    assert.equal(
      unrelated(entry({ onMain: true, prs: [] }), entry({ url: 'https://ci/m', prs: [], onMain: true })),
      true,
    )
  })

  it('is false for the same run, a shared PR or a shared commit off main', () => {
    assert.equal(unrelated(run(1, 'h1'), entry({ url: 'https://ci/2', prs: [1, 3], head: 'h2' }), commits), false)
    assert.equal(unrelated(run(1, 'h1'), run(1, 'h1'), commits), false)
    assert.equal(unrelated(run(746, 'h746'), run(750, 'h750'), commits), false)
  })

  it('is false when the commits of either PR run are unknown', () => {
    assert.equal(unrelated(entry(), entry({ url: 'https://ci/2', prs: [2] })), false)
    assert.equal(unrelated(run(1, 'h1'), run(2, 'h-gone'), commits), false)
    assert.equal(unrelated(run(1, 'h-gone'), run(2, 'h2'), commits), false)
  })
})

describe('headsToCompare', () => {
  it('names the heads of PR runs once, the subject first, and skips main runs and entries without a head', () => {
    const entries = [
      entry({ head: 'h1' }),
      entry({ head: 'h1', url: 'https://ci/9' }),
      entry(),
      entry({ onMain: true, head: 'hm' }),
    ]
    assert.deepEqual(headsToCompare(entries, subject({ head: 'h2' })), ['h2', 'h1'])
    assert.deepEqual(headsToCompare([], subject({ onMain: true, head: 'hm' })), [])
  })
})

describe('planLedger', () => {
  const plan = (overrides = {}) =>
    planLedger({ entries: [], failures: [failure], subject: subject(), now: NOW, quarantined: new Set(), ...overrides })

  const independent = new Map([
    ['h1', new Set(['a1'])],
    ['h2', new Set(['a2'])],
  ])

  it('records a first failure without a quarantine, with the head when the run has one', () => {
    const result = plan()
    assert.deepEqual(result.quarantines, [])
    assert.deepEqual(result.storms, [])
    assert.deepEqual(result.entries, [
      { ...failure, prs: [2], onMain: false, url: 'https://ci/2', at: '2026-11-18T19:30:00Z' },
    ])
    assert.equal(plan({ subject: subject({ head: 'h2' }) }).entries[0].head, 'h2')
  })

  it('quarantines a test that failed in an unrelated run within the window', () => {
    const result = plan({
      entries: [entry({ head: 'h1' })],
      subject: subject({ head: 'h2' }),
      branchCommits: independent,
    })
    assert.deepEqual(result.quarantines, [
      { testId: 'TEST-L03', file: L03, evidence: ['https://ci/2', 'https://ci/1'] },
    ])
    assert.deepEqual(
      result.entries.map((item) => item.url),
      ['https://ci/2', 'https://ci/1'],
    )
  })

  it('does not quarantine on runs whose heads share a commit off main or whose commits are unknown', () => {
    const shared = new Map([
      ['h1', new Set(['b746'])],
      ['h2', new Set(['b746', 'b750'])],
    ])
    assert.deepEqual(
      plan({ entries: [entry({ head: 'h1' })], subject: subject({ head: 'h2' }), branchCommits: shared }).quarantines,
      [],
    )
    assert.deepEqual(plan({ entries: [entry()] }).quarantines, [])
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
    const options = { subject: subject({ head: 'h2' }), branchCommits: independent }
    assert.deepEqual(
      plan({ entries: [entry({ head: 'h1' })], quarantined: new Set(['TEST-L03']), ...options }).quarantines,
      [],
    )
  })

  it('turns more than STORM_THRESHOLD quarantines from the same runs into one storm', () => {
    const ids = Array.from({ length: STORM_THRESHOLD + 1 }, (_, index) => `TEST-S0${index}`)
    const failures = ids.map((testId) => ({ testId, file: L03 }))
    const entries = ids.map((testId) => entry({ testId, head: 'h1' }))
    const result = plan({ entries, failures, subject: subject({ head: 'h2' }), branchCommits: independent })
    assert.deepEqual(result.quarantines, [])
    assert.deepEqual(result.storms, [{ tests: failures, evidence: ['https://ci/2', 'https://ci/1'] }])
    const few = plan({
      entries: entries.slice(1),
      failures: failures.slice(1),
      subject: subject({ head: 'h2' }),
      branchCommits: independent,
    })
    assert.equal(few.quarantines.length, STORM_THRESHOLD)
    assert.deepEqual(few.storms, [])
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

describe('splitStorms', () => {
  const quarantine = (testId, evidence) => ({ testId, file: L03, evidence })

  it('groups by the runs listed in any order and keeps smaller groups as single quarantines', () => {
    const storm = ['T-1', 'T-2', 'T-3', 'T-4'].map((testId, index) =>
      quarantine(testId, index % 2 ? ['https://ci/1', 'https://ci/2'] : ['https://ci/2', 'https://ci/1']),
    )
    const alone = quarantine('T-9', ['https://ci/2', 'https://ci/3'])
    const result = splitStorms([...storm, alone])
    assert.deepEqual(result.quarantines, [alone])
    assert.deepEqual(result.storms, [
      { tests: storm.map(({ testId, file }) => ({ testId, file })), evidence: ['https://ci/2', 'https://ci/1'] },
    ])
  })

  it('keeps exactly STORM_THRESHOLD quarantines from the same runs as they are', () => {
    const three = ['T-1', 'T-2', 'T-3'].map((testId) => quarantine(testId, ['https://ci/main']))
    assert.deepEqual(splitStorms(three), { quarantines: three, storms: [] })
    assert.deepEqual(splitStorms([]), { quarantines: [], storms: [] })
  })
})

describe('renderStorm', () => {
  it('writes one triage issue without cezar that names every test and run and carries every marker', () => {
    const tests = [
      { testId: 'TEST-L03', file: L03 },
      { testId: 'ADMIN-LISTS-LOAD-ONCE', file: LISTS },
    ]
    const issue = renderStorm({ tests, evidence: ['https://ci/2', 'https://ci/1'] })
    assert.equal(issue.title, 'test: 2 integration tests fail in the same CI runs, triage before any quarantine')
    assert.deepEqual(issue.labels, STORM_LABELS)
    assert.equal(issue.labels.includes('cezar'), false)
    assert.match(issue.body, /- https:\/\/ci\/1/)
    assert.match(
      issue.body,
      /- `ADMIN-LISTS-LOAD-ONCE` \(`packages\/app\/\.ai\/qa\/tests\/platform\/ADMIN-LISTS-LOAD-ONCE\.spec\.ts`\)/,
    )
    assert.deepEqual(quarantinedTestIds(issue.body), ['TEST-L03', 'ADMIN-LISTS-LOAD-ONCE'])
  })
})

describe('renderQuarantine and quarantinedTestIds', () => {
  it('writes a generated issue whose marker names the test', () => {
    const issue = renderQuarantine({ testId: 'TEST-L03', file: L03, evidence: ['https://ci/2', 'https://ci/1'] })
    assert.equal(issue.title, 'test: quarantine TEST-L03, it fails in CI runs that share no PR')
    assert.deepEqual(issue.labels, QUARANTINE_LABELS)
    assert.match(issue.body, /- https:\/\/ci\/1/)
    assert.match(issue.body, /packages\/app\/\.ai\/qa\/tests\/people\/TEST-L03-departure\.spec\.ts/)
    assert.deepEqual(quarantinedTestIds(issue.body), ['TEST-L03'])
  })

  it('finds no test id in another body', () => {
    assert.deepEqual(quarantinedTestIds('plain text'), [])
    assert.deepEqual(quarantinedTestIds(undefined), [])
  })

  it('exposes the ledger issue constants', () => {
    assert.equal(LEDGER_TITLE, 'CI failure ledger (automated)')
    assert.deepEqual(LEDGER_LABELS, ['blocked'])
  })
})
