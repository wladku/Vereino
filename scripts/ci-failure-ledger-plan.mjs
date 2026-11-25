// The CI failure ledger's decision (merge-throughput spec, Phase 2, REQ-MT04): after a CI run it records which
// integration tests failed, and opens a quarantine issue when the same test fails in two independent runs within 48 h,
// or fails on `main` — a failure no single PR explains (SDLC.md "Validation gate": quarantine such a test). Two runs
// are independent when they share no PR and their heads share no commit that is not on `main` (#774: a PR that merged
// another PR's branch carries the same cause under another PR number).
//
// Pure: `scripts/ci-failure-ledger.mjs` reads the run, its Playwright reports and the ledger issue from GitHub, calls
// `planLedger`, and writes the result. Nothing from the run's reports reaches an issue except test ids and spec file
// paths that exist on `main`: the quarantine issue starts an autonomous build, so its text is generated here.

/** How long a failure counts towards a quarantine. */
export const WINDOW_MS = 48 * 60 * 60 * 1000
/** How many entries the ledger keeps at most, newest first. */
export const MAX_ENTRIES = 200
export const LEDGER_TITLE = 'CI failure ledger (automated)'
export const LEDGER_LABELS = ['blocked']
export const QUARANTINE_LABELS = ['bug', 'priority-high', 'risk-low', 'cezar']
export const QUARANTINE_MARKER = 'ci-failure-ledger:quarantine'
/** More quarantines than this in one pass that list the same runs are one storm: one issue for a human, no `cezar`. */
export const STORM_THRESHOLD = 3
export const STORM_LABELS = ['bug', 'priority-high', 'risk-low']

const DATA_START = '<!-- ci-failure-ledger-data'
const DATA_END = '-->'
const TEST_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+(?=\s|$)/
// A cancelled or timed-out run still holds the real failures of the shards that finished (a PR update cancels the
// rest of the run), so it is read too.
const READ_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out'])
const SPEC_FILE = /^\.ai\/qa\/tests\/[\w./-]+\.spec\.ts$/

/** The test id a spec title starts with (`TEST-L03`, `E02-S03`, `ENG-TEST-05`), or `null`. */
export function testIdOf(title) {
  return TEST_ID.exec(title)?.[0] ?? null
}

/**
 * The tests that failed for good in one Playwright JSON report (`status: 'unexpected'`; a `flaky` test passed on
 * retry and does not count). `knownFiles` holds the spec files on `main` (paths relative to `packages/app`): a test
 * in any other file is dropped, and a test whose title carries no id is named after its file.
 */
export function unexpectedFailures(report, knownFiles) {
  const failures = new Map()
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      if (!SPEC_FILE.test(spec.file) || !knownFiles.has(spec.file)) continue
      if (!(spec.tests ?? []).some((test) => test.status === 'unexpected')) continue
      const testId = testIdOf(spec.title) ?? spec.file.split('/').pop().replace(/\.spec\.ts$/, '')
      failures.set(testId, { testId, file: spec.file })
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of report?.suites ?? []) walk(suite)
  return [...failures.values()]
}

/**
 * What a CI run stands for: `{ prs, onMain, url, at, head }`, or `{ skip }` with the reason. Only runs of this repository
 * count: a fork's run is skipped, so no fork data reaches the ledger.
 */
export function runSubject(run, repo) {
  if (run.head_repository?.full_name !== repo) return { skip: 'the run comes from a fork' }
  if (!READ_CONCLUSIONS.has(run.conclusion)) return { skip: `the run concluded ${String(run.conclusion)}` }
  const base = { url: run.html_url, at: run.created_at, head: run.head_sha }
  if (run.event === 'push' && run.head_branch === run.repository?.default_branch) return { ...base, prs: [], onMain: true }
  const prs = (run.pull_requests ?? []).map((pull) => pull.number)
  if (run.event === 'pull_request' && prs.length > 0) return { ...base, prs, onMain: false }
  return { skip: `the run is a ${String(run.event)} run without a pull request of this repository` }
}

/** The entries stored in the ledger issue body; a body without valid data is an empty ledger. */
export function parseLedger(body) {
  const text = body ?? ''
  const start = text.indexOf(DATA_START)
  if (start < 0) return []
  const end = text.indexOf(DATA_END, start + DATA_START.length)
  if (end < 0) return []
  try {
    const entries = JSON.parse(text.slice(start + DATA_START.length, end))
    return Array.isArray(entries) ? entries.filter(isEntry) : []
  } catch {
    return []
  }
}

function isEntry(entry) {
  return (
    typeof entry?.testId === 'string' &&
    typeof entry.file === 'string' &&
    typeof entry.url === 'string' &&
    typeof entry.at === 'string' &&
    typeof entry.onMain === 'boolean' &&
    Array.isArray(entry.prs)
  )
}

/**
 * The commits of a run that are not on `main`: none for a run on `main`, the set `branchCommits` holds for its head,
 * or `null` when that is unknown (an entry written before #774 has no head, or the head could not be compared).
 */
export function offMainCommits(run, branchCommits) {
  if (run.onMain) return new Set()
  return (typeof run.head === 'string' && branchCommits.get(run.head)) || null
}

/**
 * Two runs are unrelated (independent) when they are different runs, share no PR, and their heads share no commit
 * that is not on `main`. `branchCommits` maps a head SHA to its commits off `main` (`git log origin/main..<sha>`);
 * a run whose commits are unknown is related to every PR run, so a missing comparison never files a quarantine.
 * A run on `main` has no commit off `main`, so it is unrelated to every other run.
 */
export function unrelated(left, right, branchCommits = new Map()) {
  if (left.url === right.url) return false
  if (left.prs.some((pr) => right.prs.includes(pr))) return false
  const leftCommits = offMainCommits(left, branchCommits)
  const rightCommits = offMainCommits(right, branchCommits)
  if (!leftCommits || !rightCommits) return false
  return ![...leftCommits].some((sha) => rightCommits.has(sha))
}

/** The heads whose commits off `main` `planLedger` needs: the PR runs among `entries` and `subject`, once each. */
export function headsToCompare(entries, subject) {
  const heads = [subject, ...entries].filter((run) => !run.onMain && typeof run.head === 'string').map((run) => run.head)
  return [...new Set(heads)]
}

/**
 * One ledger step. `entries` is the ledger before this run, `failures` this run's `unexpectedFailures`, `subject`
 * its `runSubject`, `now` a Date, `quarantined` the test ids that already have an open quarantine issue,
 * `branchCommits` the commits off `main` of the heads `headsToCompare` names (see `unrelated`).
 * Returns the new entries (this run added, older than the window dropped, newest first, capped), the quarantines to
 * open, each `{ testId, file, evidence }` with the run URLs that prove it, and the storms: more than
 * `STORM_THRESHOLD` quarantines with the same evidence become one `{ tests: [{ testId, file }], evidence }` instead.
 */
export function planLedger({ entries, failures, subject, now, quarantined, branchCommits = new Map() }) {
  const since = now.getTime() - WINDOW_MS
  const head = typeof subject.head === 'string' ? { head: subject.head } : {}
  const added = failures.map((failure) => ({ ...failure, prs: subject.prs, onMain: subject.onMain, url: subject.url, at: subject.at, ...head }))
  const kept = [...added, ...entries.filter((entry) => !added.some((add) => add.testId === entry.testId && add.url === entry.url))]
    .filter((entry) => Date.parse(entry.at) >= since)
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, MAX_ENTRIES)
  const quarantines = []
  for (const failure of added) {
    if (quarantined.has(failure.testId)) continue
    const runs = kept.filter((entry) => entry.testId === failure.testId)
    const current = runs.find((entry) => entry.url === subject.url)
    // A replayed run older than the window has no current entry and proves nothing.
    if (!current) continue
    const proof = subject.onMain ? [] : runs.filter((entry) => unrelated(current, entry, branchCommits))
    if (!subject.onMain && proof.length === 0) continue
    quarantines.push({ testId: failure.testId, file: failure.file, evidence: [subject.url, ...proof.map((entry) => entry.url)] })
  }
  return { entries: kept, ...splitStorms(quarantines) }
}

/** Groups quarantines by the runs they list; a group larger than `STORM_THRESHOLD` becomes one storm. */
export function splitStorms(planned) {
  const groups = new Map()
  for (const quarantine of planned) {
    const key = [...quarantine.evidence].sort().join(' ')
    groups.set(key, [...(groups.get(key) ?? []), quarantine])
  }
  const quarantines = []
  const storms = []
  for (const group of groups.values()) {
    if (group.length > STORM_THRESHOLD) {
      storms.push({ tests: group.map(({ testId, file }) => ({ testId, file })), evidence: group[0].evidence })
    } else quarantines.push(...group)
  }
  return { quarantines, storms }
}

/** The ledger issue body: a readable table plus the data `parseLedger` reads back. */
export function renderLedger(entries) {
  const rows = entries.map(
    (entry) => `| ${entry.at} | \`${entry.testId}\` | ${entry.onMain ? 'main' : entry.prs.map((pr) => `#${pr}`).join(', ')} | [run](${entry.url}) |`,
  )
  return [
    'Failures of integration tests in CI runs of this repository over the last 48 h, written by `scripts/ci-failure-ledger.mjs` after each failed CI run (merge-throughput spec, REQ-MT04).',
    'A test that fails in two runs sharing no PR and no commit that is not on `main`, or that fails on `main`, gets a quarantine issue; more than three such tests failing in the same runs get one issue for a human instead. Do not edit this issue; it is labelled `blocked` so no build picks it up.',
    '',
    '| When (UTC) | Test | Run of | Link |',
    '|---|---|---|---|',
    ...(rows.length > 0 ? rows : ['| — | — | — | — |']),
    '',
    `${DATA_START}`,
    JSON.stringify(entries),
    DATA_END,
  ].join('\n')
}

/** The quarantine issue for one test: generated text only. */
export function renderQuarantine({ testId, file, evidence }) {
  return {
    title: `test: quarantine ${testId}, it fails in CI runs that share no PR`,
    labels: QUARANTINE_LABELS,
    body: [
      `<!-- ${QUARANTINE_MARKER}:${testId} -->`,
      `\`${testId}\` (\`packages/app/${file}\`) failed in CI runs that share no pull request and no commit that is not on \`main\`, or on \`main\`, so no single PR explains the failure:`,
      '',
      ...evidence.map((url) => `- ${url}`),
      '',
      'Per `SDLC.md` ("Validation gate"), open one pull request labelled `priority-high` that marks this test `test.fixme` with the comment `// quarantine: #<this issue>` on the same line or the line above (`yarn guard` accepts a `fixme` only with it, while this issue is open and labelled `bug`), so the train stops failing unrelated PRs. Reference this issue with `Refs #`, not `Closes #`: the issue stays open as the tracking item for the real fix (find the cause, fix the test or the code, remove the `fixme`).',
      '',
      'Before quarantining, check `main` and the open PRs: if a fix for this failure already exists, comment the link here instead.',
    ].join('\n'),
  }
}

/**
 * The issue for one storm: many tests failing in the same runs point to one cause (a change those runs share, or a
 * broken environment), not to many flaky tests, so a human triages it and no autonomous build starts (no `cezar`).
 * It carries the quarantine marker of every test, so the next runs do not file them one by one.
 */
export function renderStorm({ tests, evidence }) {
  return {
    title: `test: ${tests.length} integration tests fail in the same CI runs, triage before any quarantine`,
    labels: STORM_LABELS,
    body: [
      ...tests.map(({ testId }) => `<!-- ${QUARANTINE_MARKER}:${testId} -->`),
      `${tests.length} integration tests failed in the same CI runs, which the ledger counts as independent (they share no pull request and no commit that is not on \`main\`, or one of them ran on \`main\`):`,
      '',
      ...evidence.map((url) => `- ${url}`),
      '',
      'Tests:',
      '',
      ...tests.map(({ testId, file }) => `- \`${testId}\` (\`packages/app/${file}\`)`),
      '',
      'So many tests failing together usually share one cause: a change these runs have in common, test data, or the CI environment, rather than flaky tests. This issue is not labelled `cezar`, so no autonomous build quarantines them one by one. Find the cause first; quarantine a test (`test.fixme` with `// quarantine: #<this issue>`, `SDLC.md` "Validation gate") only when it is flaky on its own, and close this issue when the cause is fixed.',
    ].join('\n'),
  }
}

/** The test ids of a quarantine or storm issue body, in order; none for another body. */
export function quarantinedTestIds(body) {
  return [...(body ?? '').matchAll(new RegExp(`<!-- ${QUARANTINE_MARKER}:([^ ]+) -->`, 'g'))].map((match) => match[1])
}
