// The CI failure ledger (`.github/workflows/ci-failure-ledger.yml`, merge-throughput spec REQ-MT04): after a failed CI
// run of this repository it adds the run's failed integration tests to the ledger issue and opens a quarantine issue
// for a test that no single PR explains, or one triage issue for a storm of them. The decision is `planLedger` in
// `ci-failure-ledger-plan.mjs`; this script also compares each PR run's head with `main` (the commits off `main` that
// decide whether two runs are independent).
//
// Env: GH_TOKEN (issues: write, actions: read, contents: read), GITHUB_REPOSITORY (owner/name), LEDGER_RUN_ID (the CI run),
// LEDGER_REPORTS_DIR (that run's downloaded `playwright-report-shard-*` artifacts), LEDGER_TESTS_DIR (`main`'s
// `packages/app/.ai/qa/tests`), LEDGER_DRY_RUN=1 (log the plan, change nothing).
import fs from 'node:fs'
import path from 'node:path'
import {
  LEDGER_LABELS,
  LEDGER_TITLE,
  headsToCompare,
  parseLedger,
  planLedger,
  quarantinedTestIds,
  renderLedger,
  renderQuarantine,
  renderStorm,
  runSubject,
  unexpectedFailures,
} from './ci-failure-ledger-plan.mjs'

const token = process.env.GH_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const runId = process.env.LEDGER_RUN_ID
const reportsDir = process.env.LEDGER_REPORTS_DIR
const testsDir = process.env.LEDGER_TESTS_DIR
const dryRun = process.env.LEDGER_DRY_RUN === '1'
// Only issues this workflow wrote are read back: another author could plant ledger data or a quarantine marker.
const BOT = 'github-actions[bot]'

if (!token || !repo || !runId || !reportsDir || !testsDir) {
  console.log('::notice::ci failure ledger: GH_TOKEN, GITHUB_REPOSITORY, LEDGER_RUN_ID, LEDGER_REPORTS_DIR or LEDGER_TESTS_DIR is not set; nothing to do.')
  process.exit(0)
}

async function api(method, apiPath, body) {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  if (response.status >= 300) throw new Error(`${method} ${apiPath} → ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}

function filesUnder(dir, name) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { recursive: true })
    .map((file) => path.join(dir, String(file)))
    .filter((file) => path.basename(file) === name || (name === '*.spec.ts' && file.endsWith('.spec.ts')))
}

async function openIssues(label) {
  const issues = []
  for (let page = 1; ; page++) {
    const batch = await api('GET', `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100&page=${page}`)
    issues.push(...batch.filter((issue) => !issue.pull_request && issue.user?.login === BOT))
    if (batch.length < 100) return issues
  }
}

// 500 commits off `main` cover any PR branch here; a longer history is cut, which can only miss a shared commit.
const MAX_COMPARE_PAGES = 5

/** The commits of `head` that are not on the default branch (`git log origin/main..<head>`), or `null` when unknown. */
async function commitsOffMain(defaultBranch, head) {
  if (!/^[0-9a-f]{40}$/.test(head)) return null
  const commits = new Set()
  try {
    for (let page = 1; page <= MAX_COMPARE_PAGES; page++) {
      const result = await api('GET', `/repos/${repo}/compare/${encodeURIComponent(defaultBranch)}...${head}?per_page=100&page=${page}`)
      for (const commit of result.commits ?? []) commits.add(commit.sha)
      if ((result.commits ?? []).length < 100) break
    }
  } catch (error) {
    console.log(`::warning::cannot compare ${head} with ${defaultBranch}: ${error.message.split('\n')[0]}`)
    return null
  }
  return commits
}

async function main() {
  const run = await api('GET', `/repos/${repo}/actions/runs/${runId}`)
  const subject = runSubject(run, repo)
  if (subject.skip) {
    console.log(`run ${runId}: skipped, ${subject.skip}`)
    return
  }
  const knownFiles = new Set(filesUnder(testsDir, '*.spec.ts').map((file) => `.ai/qa/tests/${path.relative(testsDir, file).split(path.sep).join('/')}`))
  const reports = filesUnder(reportsDir, 'results.json')
  console.log(`run ${runId} (${subject.onMain ? 'main' : subject.prs.map((pr) => `#${pr}`).join(', ')}): ${reports.length} report(s), ${knownFiles.size} spec file(s) on main`)
  const failures = new Map()
  for (const report of reports) {
    for (const failure of unexpectedFailures(JSON.parse(fs.readFileSync(report, 'utf8')), knownFiles)) failures.set(failure.testId, failure)
  }
  if (failures.size === 0) {
    console.log('no failed integration test in this run (a shard without a report counts as no data)')
    return
  }
  console.log(`failed: ${[...failures.keys()].join(', ')}`)

  const ledger = (await openIssues(LEDGER_LABELS[0])).find((issue) => issue.title === LEDGER_TITLE)
  const quarantined = new Set((await openIssues('priority-high')).flatMap((issue) => quarantinedTestIds(issue.body)))
  const entries = parseLedger(ledger?.body)
  const failed = new Set(failures.keys())
  const branchCommits = new Map()
  for (const head of headsToCompare(entries.filter((entry) => failed.has(entry.testId)), subject)) {
    const commits = await commitsOffMain(run.repository.default_branch, head)
    if (commits) branchCommits.set(head, commits)
  }
  const plan = planLedger({ entries, failures: [...failures.values()], subject, now: new Date(), quarantined, branchCommits })
  for (const quarantine of plan.quarantines) console.log(`quarantine ${quarantine.testId}: ${quarantine.evidence.join(' ')}`)
  for (const storm of plan.storms) console.log(`storm of ${storm.tests.map((test) => test.testId).join(', ')}: ${storm.evidence.join(' ')}`)
  if (dryRun) {
    console.log(`dry run: the ledger would hold ${plan.entries.length} entr${plan.entries.length === 1 ? 'y' : 'ies'}; nothing written`)
    return
  }
  const body = renderLedger(plan.entries)
  if (ledger) await api('PATCH', `/repos/${repo}/issues/${ledger.number}`, { body })
  else await api('POST', `/repos/${repo}/issues`, { title: LEDGER_TITLE, body, labels: LEDGER_LABELS })
  for (const quarantine of plan.quarantines) {
    // `cezar` is added after creation, so the issue gets its own "labeled" event, which Cezar's automation polls.
    const { title, body: text, labels } = renderQuarantine(quarantine)
    const issue = await api('POST', `/repos/${repo}/issues`, { title, body: text, labels: labels.filter((label) => label !== 'cezar') })
    await api('POST', `/repos/${repo}/issues/${issue.number}/labels`, { labels: ['cezar'] })
    console.log(`opened #${issue.number} for ${quarantine.testId}`)
  }
  for (const storm of plan.storms) {
    const { title, body: text, labels } = renderStorm(storm)
    const issue = await api('POST', `/repos/${repo}/issues`, { title, body: text, labels })
    console.log(`opened #${issue.number} for the storm of ${storm.tests.length} tests`)
  }
}

await main()
