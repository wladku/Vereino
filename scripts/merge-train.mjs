// The merge train (`.github/workflows/merge-train.yml`): reads the open PRs, asks `planMergeTrain` for one step and
// carries it out. A merge is followed by the next step in the same run; an update or a wait ends the run, and the next
// CI completion, push to `main` or the quarter-hour schedule starts the train again.
//
// Env: GH_TOKEN (a token whose pushes trigger CI — not the workflow's GITHUB_TOKEN), GITHUB_REPOSITORY (owner/name),
// MERGE_TRAIN_SKIP_LABELS (optional, comma-separated), MERGE_TRAIN_DRY_RUN=1 (log the plan, change nothing).
import { CONFLICT_LABEL, DEFAULT_SKIP_LABELS, FAILED_LABEL, checksState, planMergeTrain } from './merge-train-plan.mjs'

const token = process.env.GH_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const dryRun = process.env.MERGE_TRAIN_DRY_RUN === '1'
const skipLabels = process.env.MERGE_TRAIN_SKIP_LABELS
  ? process.env.MERGE_TRAIN_SKIP_LABELS.split(',').map((label) => label.trim()).filter(Boolean)
  : DEFAULT_SKIP_LABELS
const MAX_MERGES_PER_RUN = 5

if (!token || !repo) {
  console.log('::notice::merge train: MERGE_TRAIN_TOKEN is not set; nothing to do.')
  process.exit(0)
}

async function api(method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
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
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function ok(method, path, body) {
  const result = await api(method, path, body)
  if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${JSON.stringify(result.body)}`)
  return result.body
}

async function requiredChecks(branch) {
  const rules = await ok('GET', `/repos/${repo}/rules/branches/${branch}`)
  const names = rules
    .filter((rule) => rule.type === 'required_status_checks')
    .flatMap((rule) => rule.parameters.required_status_checks.map((check) => check.context))
  return [...new Set(names)]
}

async function headRuns(sha) {
  const runs = []
  for (let page = 1; ; page++) {
    const body = await ok('GET', `/repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`)
    runs.push(...body.check_runs)
    if (body.check_runs.length < 100) return runs
  }
}

async function readQueue(baseBranch, required) {
  const pulls = await ok('GET', `/repos/${repo}/pulls?state=open&base=${baseBranch}&per_page=100&sort=created`)
  const baseSha = (await ok('GET', `/repos/${repo}/branches/${baseBranch}`)).commit.sha
  const prs = []
  for (const pull of pulls) {
    if (pull.head.repo?.full_name !== repo) continue
    const detail = await ok('GET', `/repos/${repo}/pulls/${pull.number}`)
    const compare = await ok('GET', `/repos/${repo}/compare/${baseSha}...${pull.head.sha}`)
    prs.push({
      number: pull.number,
      title: pull.title,
      headSha: pull.head.sha,
      draft: pull.draft,
      labels: pull.labels.map((label) => label.name),
      behindBy: compare.behind_by,
      conflict: detail.mergeable_state === 'dirty',
      checks: checksState(await headRuns(pull.head.sha), required),
    })
  }
  return prs
}

async function syncLabels(changes) {
  for (const change of changes) {
    console.log(`#${change.pr}: ${change.add ? 'add' : 'remove'} label ${change.label}`)
    if (dryRun) continue
    if (change.add) {
      await ok('POST', `/repos/${repo}/issues/${change.pr}/labels`, { labels: [change.label] })
      const why =
        change.label === FAILED_LABEL
          ? 'a required check failed on this up-to-date head. The train skips this PR until a new commit fixes it or the failed check is rerun green.'
          : 'this PR conflicts with `main`. The train skips it until the conflict is resolved.'
      await ok('POST', `/repos/${repo}/issues/${change.pr}/comments`, { body: `Merge train: ${why}` })
    } else {
      await api('DELETE', `/repos/${repo}/issues/${change.pr}/labels/${encodeURIComponent(change.label)}`)
    }
  }
}

async function main() {
  const baseBranch = (await ok('GET', `/repos/${repo}`)).default_branch
  const required = await requiredChecks(baseBranch)
  console.log(`required checks on ${baseBranch}: ${required.join(', ')}; skip labels: ${skipLabels.join(', ')}`)
  for (let merges = 0; merges <= MAX_MERGES_PER_RUN; merges++) {
    const prs = await readQueue(baseBranch, required)
    for (const pr of prs) console.log(`#${pr.number} behind=${pr.behindBy} conflict=${pr.conflict} checks=${pr.checks} [${pr.labels.join(',')}]`)
    const plan = planMergeTrain(prs, { skipLabels })
    await syncLabels(plan.labels)
    const pr = prs.find((candidate) => candidate.number === plan.pr)
    console.log(`plan: ${plan.type}${pr ? ` #${pr.number}` : ''}`)
    if (dryRun || plan.type === 'idle' || plan.type === 'wait') return
    if (plan.type === 'update') {
      const update = await api('PUT', `/repos/${repo}/pulls/${pr.number}/update-branch`, { expected_head_sha: pr.headSha })
      console.log(`#${pr.number}: update-branch → ${update.status} ${JSON.stringify(update.body)}`)
      if (update.status === 422 && !String(update.body?.message ?? '').includes('expected head sha')) {
        await syncLabels([{ pr: pr.number, label: CONFLICT_LABEL, add: true }])
      }
      return
    }
    const merge = await api('PUT', `/repos/${repo}/pulls/${pr.number}/merge`, {
      merge_method: 'squash',
      sha: pr.headSha,
      commit_title: `${pr.title} (#${pr.number})`,
    })
    console.log(`#${pr.number}: merge → ${merge.status} ${JSON.stringify(merge.body)}`)
    if (merge.status !== 200) return
  }
}

await main()
