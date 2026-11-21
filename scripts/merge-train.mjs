// The merge train (`.github/workflows/merge-train.yml`): reads the open PRs, asks `planMergeTrain` for one step and
// carries it out. A merge is followed by the next step in the same run; an update or a wait ends the run, and the next
// CI completion, push to `main` or the quarter-hour schedule starts the train again.
//
// Labels set on a PR are mirrored onto the issue its branch names (`issue-N`), so Cezar's issue-label automation starts
// a fix run at once; a PR held for manual QA (MT-D02) gets one comment and a line in the log.
//
// Env: GH_TOKEN (a token whose pushes trigger CI — not the workflow's GITHUB_TOKEN), GITHUB_REPOSITORY (owner/name),
// MERGE_TRAIN_SKIP_LABELS (optional, comma-separated), MERGE_TRAIN_DRY_RUN=1 (log the plan, change nothing),
// MERGE_TRAIN_BATCH_SIZE (batch train, `.ai/specs/2026-11-18-batch-merge-train.md`; phase 1 is dark: a dry run only
// prints the batch it would build, the train still moves one PR at a time).
import {
  BATCH_SKIP_REASONS,
  CONFLICT_LABEL,
  DEFAULT_SKIP_LABELS,
  FAILED_LABEL,
  QA_HOLD_MARKER,
  batchesAlone,
  checksState,
  linkedIssue,
  needsQaHoldComment,
  parseBatchSize,
  planBatch,
  planMergeTrain,
  verdictOf,
} from './merge-train-plan.mjs'

const token = process.env.GH_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const dryRun = process.env.MERGE_TRAIN_DRY_RUN === '1'
const skipLabels = process.env.MERGE_TRAIN_SKIP_LABELS
  ? process.env.MERGE_TRAIN_SKIP_LABELS.split(',').map((label) => label.trim()).filter(Boolean)
  : DEFAULT_SKIP_LABELS
const batchSize = parseBatchSize(process.env.MERGE_TRAIN_BATCH_SIZE)
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

async function changedFiles(number) {
  const files = []
  for (let page = 1; ; page++) {
    const body = await ok('GET', `/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`)
    files.push(...body.map((file) => file.filename))
    if (body.length < 100) return files
  }
}

// What the batch plan reads besides today's fields; only the dry run needs it while the batch train is dark.
async function batchFields(pull) {
  const statuses = await ok('GET', `/repos/${repo}/commits/${pull.head.sha}/statuses?per_page=100`)
  return { fork: false, files: await changedFiles(pull.number), verdict: verdictOf(statuses) }
}

function logBatch(prs) {
  const plan = planBatch(prs, { skipLabels, size: batchSize })
  const batch = plan.batch.map((entry) => `#${entry.number}@${entry.sha.slice(0, 7)}`).join(', ') || 'none'
  const first = prs.find((pr) => pr.number === plan.batch[0]?.number)
  const alone = first && batchesAlone(first) ? ' (alone: it changes CI or the train, BT-D05)' : ''
  console.log(`batch plan (size ${batchSize}, dark — nothing is built): ${batch}${alone}`)
  for (const entry of plan.skipped) console.log(`  #${entry.pr}: not batched — ${BATCH_SKIP_REASONS[entry.reason]}`)
  if (plan.update) console.log(`  #${plan.update}: would get one update-branch (red on its own head, behind main)`)
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
      branch: pull.head.ref,
      headSha: pull.head.sha,
      draft: pull.draft,
      labels: pull.labels.map((label) => label.name),
      behindBy: compare.behind_by,
      conflict: detail.mergeable_state === 'dirty',
      checks: checksState(await headRuns(pull.head.sha), required),
      ...(dryRun ? await batchFields(pull) : {}),
    })
  }
  return prs
}

async function comment(number, body) {
  await ok('POST', `/repos/${repo}/issues/${number}/comments`, { body: `Merge train: ${body}` })
}

// The linked issue is a best effort: a missing issue or a token without Issues write is logged, never stops the train.
async function mirrorLabel(change) {
  const path = `/repos/${repo}/issues/${change.issue}/labels`
  const result = change.add
    ? await api('POST', path, { labels: [change.label] })
    : await api('DELETE', `${path}/${encodeURIComponent(change.label)}`)
  if (result.status >= 300 && result.status !== 404) {
    console.log(`::warning::#${change.issue}: mirroring ${change.label} from #${change.pr} → ${result.status}`)
  }
}

async function syncLabels(changes) {
  for (const change of changes) {
    const onIssue = change.issue ? ` (and issue #${change.issue})` : ''
    console.log(`#${change.pr}: ${change.add ? 'add' : 'remove'} label ${change.label}${onIssue}`)
    if (dryRun) continue
    if (change.add) {
      await ok('POST', `/repos/${repo}/issues/${change.pr}/labels`, { labels: [change.label] })
      const why =
        change.label === FAILED_LABEL
          ? 'a required check failed on this up-to-date head. The train skips this PR until a new commit fixes it or the failed check is rerun green.'
          : 'this PR conflicts with `main`. The train skips it until the conflict is resolved.'
      await comment(change.pr, why)
    } else {
      await api('DELETE', `/repos/${repo}/issues/${change.pr}/labels/${encodeURIComponent(change.label)}`)
    }
    if (change.issue) await mirrorLabel(change)
  }
}

async function announceHolds(held) {
  for (const hold of held) {
    console.log(`#${hold.pr}: held — ${hold.reason}`)
    if (dryRun) continue
    const comments = await ok('GET', `/repos/${repo}/issues/${hold.pr}/comments?per_page=100`)
    if (!needsQaHoldComment(comments.map((entry) => entry.body ?? ''))) continue
    await comment(
      hold.pr,
      `this PR is \`risk-high\` and asks for manual QA (\`needs-qa\`). The train holds it until the owner tests it and sets \`qa\` (SDLC.md "QA", MT-D02). ${QA_HOLD_MARKER}`,
    )
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
    await announceHolds(plan.held)
    const pr = prs.find((candidate) => candidate.number === plan.pr)
    console.log(`plan: ${plan.type}${pr ? ` #${pr.number}` : ''}`)
    if (dryRun) logBatch(prs)
    if (dryRun || plan.type === 'idle' || plan.type === 'wait') return
    if (plan.type === 'update') {
      const update = await api('PUT', `/repos/${repo}/pulls/${pr.number}/update-branch`, { expected_head_sha: pr.headSha })
      console.log(`#${pr.number}: update-branch → ${update.status} ${JSON.stringify(update.body)}`)
      if (update.status === 422 && !String(update.body?.message ?? '').includes('expected head sha')) {
        const issue = linkedIssue(pr.branch)
        await syncLabels([{ pr: pr.number, label: CONFLICT_LABEL, add: true, ...(issue ? { issue } : {}) }])
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
