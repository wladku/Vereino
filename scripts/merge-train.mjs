// The merge train (`.github/workflows/merge-train.yml`): reads the open PRs, asks `planMergeTrain` for one step and
// carries it out. A merge is followed by the next step in the same run; an update or a wait ends the run, and the next
// CI completion, push to `main` or the quarter-hour schedule starts the train again.
//
// Labels set on a PR are mirrored onto the issue its branch names (`issue-N`), so Cezar's issue-label automation starts
// a fix run at once; a PR held for manual QA (MT-D02) gets one comment and a line in the log.
//
// Env: GH_TOKEN (a token whose pushes trigger CI — not the workflow's GITHUB_TOKEN), GITHUB_REPOSITORY (owner/name),
// MERGE_TRAIN_SKIP_LABELS (optional, comma-separated), MERGE_TRAIN_DRY_RUN=1 (log the plan, change nothing),
// MERGE_TRAIN_BATCH_SIZE (batch train, `.ai/specs/2026-11-18-batch-merge-train.md`): 1 (unset) keeps the one-PR train
// below; 2 or more runs the batch train (`batchTrain`), which builds `merge-train/batch` with the Merges API, merges a
// green batch PR by PR with a tree check after each merge and pauses itself on a mismatch. The owner switches it on in
// phase 3; until then this repository keeps 1. MERGE_TRAIN_REQUIRED_CHECKS (optional, comma-separated) replaces the
// ruleset's required checks, for a repository without rulesets such as the rehearsal repository.
import { appendFileSync } from 'node:fs'
import {
  BATCH_SKIP_REASONS,
  CONFLICT_LABEL,
  DEFAULT_SKIP_LABELS,
  FAILED_LABEL,
  QA_HOLD_MARKER,
  VERDICT_STATUS,
  batchesAlone,
  checksState,
  judgeBatch,
  linkedIssue,
  needsQaHoldComment,
  parseBatchSize,
  planBatch,
  planMergeTrain,
  trainQueue,
  verdictOf,
} from './merge-train-plan.mjs'
import {
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
  treeMatches,
} from './merge-train-guard.mjs'
import { parseTrailers } from './merge-train-trailers.mjs'

const token = process.env.GH_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const dryRun = process.env.MERGE_TRAIN_DRY_RUN === '1'
const skipLabels = process.env.MERGE_TRAIN_SKIP_LABELS
  ? process.env.MERGE_TRAIN_SKIP_LABELS.split(',').map((label) => label.trim()).filter(Boolean)
  : DEFAULT_SKIP_LABELS
const batchSize = parseBatchSize(process.env.MERGE_TRAIN_BATCH_SIZE)
const MAX_MERGES_PER_RUN = 5
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : 'a run outside GitHub Actions'

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

async function rulesetChecks(branch) {
  const rules = await ok('GET', `/repos/${repo}/rules/branches/${branch}`)
  const names = rules
    .filter((rule) => rule.type === 'required_status_checks')
    .flatMap((rule) => rule.parameters.required_status_checks.map((check) => check.context))
  return requiredChecks([...new Set(names)], process.env.MERGE_TRAIN_REQUIRED_CHECKS)
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

// What the batch plan reads besides today's fields: the dry run and the batch train (size 2 or more) need it.
async function batchFields(pull) {
  const statuses = await ok('GET', `/repos/${repo}/commits/${pull.head.sha}/statuses?per_page=100`)
  return { fork: false, files: await changedFiles(pull.number), verdict: verdictOf(statuses) }
}

function logBatch(prs, suspects = null) {
  const plan = planBatch(prs, { skipLabels, size: batchSize, suspects })
  const batch = plan.batch.map((entry) => `#${entry.number}@${entry.sha.slice(0, 7)}`).join(', ') || 'none'
  const first = prs.find((pr) => pr.number === plan.batch[0]?.number)
  const alone = first && batchesAlone(first) ? ' (alone: it changes CI or the train, BT-D05)' : ''
  const mode = batchSize > 1 ? 'nothing is built in this run' : 'dark — nothing is built'
  const bisecting = plan.suspects ? `; suspects ${plan.suspects.map((number) => `#${number}`).join(', ')}` : ''
  console.log(`batch plan (size ${batchSize}, ${mode}): ${batch}${alone}${bisecting}`)
  for (const entry of plan.skipped) console.log(`  #${entry.pr}: not batched — ${BATCH_SKIP_REASONS[entry.reason]}`)
  if (plan.update) console.log(`  #${plan.update}: would get one update-branch (red on its own head, behind main)`)
  return plan
}

async function readQueue(baseBranch, required, withBatchFields = dryRun) {
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
      ...(withBatchFields ? await batchFields(pull) : {}),
    })
  }
  return { prs, baseSha }
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

const LABEL_COMMENTS = {
  checks:
    'a required check failed on this up-to-date head. The train skips this PR until a new commit fixes it or the failed check is rerun green.',
  verdict: `this PR broke a batch on its own (\`${VERDICT_STATUS}\` = failure on this head). The train skips it until a new commit is pushed.`,
  conflict: 'this PR conflicts with `main`. The train skips it until the conflict is resolved.',
}

// A change without `reason` (today's train) is a failed or conflict label; `merge-train-batched` changes carry none
// and get no comment.
function labelReason(change) {
  if (change.reason) return change.reason
  if (change.label === FAILED_LABEL) return 'checks'
  return change.label === CONFLICT_LABEL ? 'conflict' : null
}

async function syncLabels(changes) {
  for (const change of changes) {
    const onIssue = change.issue ? ` (and issue #${change.issue})` : ''
    console.log(`#${change.pr}: ${change.add ? 'add' : 'remove'} label ${change.label}${onIssue}`)
    if (dryRun) continue
    if (change.add) {
      await ok('POST', `/repos/${repo}/issues/${change.pr}/labels`, { labels: [change.label] })
      const reason = labelReason(change)
      if (reason) await comment(change.pr, LABEL_COMMENTS[reason])
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

// ---- Batch train (MERGE_TRAIN_BATCH_SIZE 2 or more; spec phase 2) ----

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const short = (sha) => sha.slice(0, 7)
const listPrs = (entries) => entries.map((entry) => `#${entry.number}@${short(entry.sha)}`).join(', ')

function summary(line) {
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)
}

async function openPauseIssues() {
  const issues = await ok('GET', `/repos/${repo}/issues?state=open&labels=${PAUSED_LABEL}&per_page=100`)
  return issues.filter((issue) => !issue.pull_request)
}

// The batch under test: the head of `merge-train/batch`, its commit time and parsed trailers; `null` without the branch.
async function readBatch() {
  const branch = await api('GET', `/repos/${repo}/branches/${BATCH_BRANCH}`)
  if (branch.status === 404) return null
  if (branch.status >= 300) throw new Error(`GET branch ${BATCH_BRANCH} → ${branch.status} ${JSON.stringify(branch.body)}`)
  const commit = branch.body.commit
  return { head: commit.sha, committedAt: commit.commit.committer.date, batch: parseTrailers(commit.commit.message) }
}

async function setRef(branch, sha) {
  const update = await api('PATCH', `/repos/${repo}/git/refs/heads/${branch}`, { sha, force: true })
  if (update.status === 200) return
  await ok('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha })
}

async function deleteRef(branch) {
  const result = await api('DELETE', `/repos/${repo}/git/refs/heads/${branch}`)
  if (result.status >= 300 && result.status !== 404 && result.status !== 422) {
    throw new Error(`DELETE ${branch} → ${result.status} ${JSON.stringify(result.body)}`)
  }
}

async function setStatus(sha, context, state, description, targetUrl) {
  await ok('POST', `/repos/${repo}/statuses/${sha}`, { context, state, description, target_url: targetUrl })
}

// Builds the batch server-side (BT-D02): `merge-train-build` starts at `main`, each PR head is merged onto it with the
// Merges API, and every intermediate commit carries the trailers of the batch so far. The head is then pushed to
// `merge-train/batch` in one ref update, which starts one CI run. No PR code is checked out.
async function buildBatch(plan, baseSha) {
  await setRef(BUILD_BRANCH, baseSha)
  const prs = []
  let head = null
  try {
    for (const entry of plan.batch) {
      const result = await api('POST', `/repos/${repo}/merges`, {
        base: BUILD_BRANCH,
        head: entry.sha,
        commit_message: batchCommitMessage({ prs: [...prs, entry], base: baseSha, suspects: plan.suspects }),
      })
      const step = buildStep(result.status)
      console.log(`build: #${entry.number}@${short(entry.sha)} → ${result.status} (${step})`)
      if (step === 'error') throw new Error(`merging #${entry.number} into the batch → ${result.status} ${JSON.stringify(result.body)}`)
      if (step === 'conflict') console.log(`  #${entry.number}: left out of this batch — it conflicts with the PRs before it`)
      if (step === 'merged') {
        prs.push(entry)
        head = result.body.sha
      }
    }
  } finally {
    await deleteRef(BUILD_BRANCH)
  }
  if (!head) return null
  await setRef(BATCH_BRANCH, head)
  summary(`built ${BATCH_BRANCH} at ${short(head)} on main ${short(baseSha)}: ${listPrs(prs)}`)
  return { head, prs }
}

async function pause(fields) {
  const issue = pauseIssue({ ...fields, runUrl })
  const created = await ok('POST', `/repos/${repo}/issues`, issue)
  summary(`::error::paused: ${issue.title} → #${created.number}`)
}

// Merges a green batch (REQ-BT04): for each PR in order, set `merge-train/verified` on the tested head, squash-merge
// that exact head (405/409 retried), then compare `main`'s tree with the batch's intermediate tree after that PR. A merge
// that keeps failing or a tree mismatch opens the pause issue and stops. Returns whether every PR merged.
async function mergeBatch(current, prs, baseBranch) {
  const { batch, head } = current
  const trees = []
  for (let sha = head; sha && trees.length < batch.prs.length; ) {
    const commit = await ok('GET', `/repos/${repo}/git/commits/${sha}`)
    trees.push(commit.tree.sha)
    sha = commit.parents[0]?.sha
  }
  const merged = []
  for (const [index, entry] of batch.prs.entries()) {
    const title = prs.find((pr) => pr.number === entry.number)?.title ?? `PR #${entry.number}`
    await setStatus(entry.sha, VERIFIED_STATUS, 'success', `tested in batch ${short(head)}`, `https://github.com/${repo}/commit/${head}`)
    let outcome
    for (let attempt = 0; ; attempt++) {
      const result = await api('PUT', `/repos/${repo}/pulls/${entry.number}/merge`, {
        merge_method: 'squash',
        sha: entry.sha,
        commit_title: `${title} (#${entry.number})`,
      })
      outcome = mergeOutcome(result.status, attempt)
      console.log(`#${entry.number}: merge → ${result.status} (${outcome}) ${JSON.stringify(result.body)}`)
      if (outcome !== 'retry') break
      await sleep(MERGE_RETRY_DELAYS_MS[attempt])
    }
    if (outcome === 'failed') {
      await pause({ reason: 'merge-failed', pr: entry.number, merged, batchHead: head })
      return false
    }
    merged.push(entry.number)
    const mainTree = (await ok('GET', `/repos/${repo}/branches/${baseBranch}`)).commit.commit.tree.sha
    const expected = intermediateAfter(trees, index + 1, batch.prs.length)
    const match = treeMatches(mainTree, expected)
    summary(`merged #${entry.number}; tree check ${match ? 'passed' : 'FAILED'}: main ${short(mainTree)}, batch prefix ${index + 1} ${expected ? short(expected) : 'missing'}`)
    if (!match) {
      await pause({ reason: 'tree-mismatch', pr: entry.number, merged, batchHead: head })
      return false
    }
  }
  return true
}

// Settles the batch under test. Answers `{ next: 'keep' }` while its checks run, `{ next: 'stop' }` after a pause, or
// `{ next: 'build', suspects }` once the batch is gone (merged, dropped, rebuilt or bisected).
async function settleBatch(current, prs, baseSha, required, baseBranch) {
  const { batch, head } = current
  const drop = async (why, suspects) => {
    summary(`dropped batch ${short(head)}: ${why}; nothing merges from it`)
    await deleteRef(BATCH_BRANCH)
    return { next: 'build', suspects }
  }
  if (!batch) return drop('its head carries no valid Merge-Train trailers', null)
  summary(`batch ${short(head)} on main ${short(batch.base)}: ${listPrs(batch.prs)}${batch.suspects ? `; suspects ${batch.suspects.map((n) => `#${n}`).join(', ')}` : ''}`)
  const guard = guardBatch(batch, { mainSha: baseSha, queue: trainQueue(prs, skipLabels).queue })
  if (guard) return drop(`${DROP_REASONS[guard.reason]}${guard.pr ? ` (#${guard.pr})` : ''}`, batch.suspects)
  const runs = (await headRuns(head)).map((run) => ({ ...run, headSha: run.head_sha }))
  const verdict = judgeBatch(batch, { headSha: head, runs, required, ageMinutes: ageMinutes(current.committedAt, new Date()) })
  summary(`judge: ${verdict.type}`)
  if (verdict.type === 'wait') return { next: 'keep' }
  if (verdict.type === 'rebuild') return drop(DROP_REASONS.stale, batch.suspects)
  if (verdict.type === 'merge') {
    if (!(await mergeBatch(current, prs, baseBranch))) return { next: 'stop' }
    await deleteRef(BATCH_BRANCH)
    return { next: 'build', suspects: verdict.suspects }
  }
  if (verdict.type === 'culprit') {
    await setStatus(verdict.sha, VERDICT_STATUS, 'failure', 'broke a batch on its own: push a new commit', `https://github.com/${repo}/commit/${head}`)
    return drop(`#${verdict.pr} is red alone: marked on head ${short(verdict.sha)}`, null)
  }
  return drop(`red: bisecting ${verdict.suspects.map((n) => `#${n}`).join(', ')}`, verdict.suspects)
}

async function batchTrain(baseBranch, required) {
  if (!required.length) {
    console.log('::error::merge train: no required checks are known, so the batch train merges nothing.')
    return
  }
  const paused = await openPauseIssues()
  let { prs, baseSha } = await readQueue(baseBranch, required, true)
  for (const pr of prs) console.log(`#${pr.number} behind=${pr.behindBy} conflict=${pr.conflict} checks=${pr.checks} verdict=${pr.verdict} [${pr.labels.join(',')}]`)
  const current = await readBatch()
  if (paused.length || dryRun) {
    if (paused.length) summary(`paused by ${paused.map((issue) => `#${issue.number}`).join(', ')}: plan and log only`)
    if (current) console.log(`batch under test: ${current.head} ${JSON.stringify(current.batch)}`)
    logBatch(prs, current?.batch?.suspects ?? null)
    return
  }
  let settled = { next: 'build', suspects: null }
  if (current) {
    settled = await settleBatch(current, prs, baseSha, required, baseBranch)
    if (settled.next === 'stop') return
    if (settled.next === 'build') ({ prs, baseSha } = await readQueue(baseBranch, required, true))
  }
  const plan = planBatch(prs, { skipLabels, size: batchSize, suspects: settled.suspects })
  await announceHolds(plan.held)
  for (const entry of plan.skipped) console.log(`#${entry.pr}: not batched — ${BATCH_SKIP_REASONS[entry.reason]}`)
  let batched = settled.next === 'keep' ? current.batch.prs : []
  if (settled.next === 'build' && plan.batch.length) {
    const built = await buildBatch(plan, baseSha)
    batched = built ? built.prs : []
  } else if (settled.next === 'build') {
    summary('no batch: no PR is green on its own head')
  }
  const { queue } = trainQueue(prs, skipLabels)
  await syncLabels(batchLabels(queue, batched.map((entry) => entry.number)))
  const update = prs.find((pr) => pr.number === plan.update)
  if (update) {
    const result = await api('PUT', `/repos/${repo}/pulls/${update.number}/update-branch`, { expected_head_sha: update.headSha })
    console.log(`#${update.number}: update-branch → ${result.status} ${JSON.stringify(result.body)}`)
  }
}

async function main() {
  const baseBranch = (await ok('GET', `/repos/${repo}`)).default_branch
  const required = await rulesetChecks(baseBranch)
  console.log(`required checks on ${baseBranch}: ${required.join(', ')}; skip labels: ${skipLabels.join(', ')}`)
  if (batchSize > 1) return batchTrain(baseBranch, required)
  for (let merges = 0; merges <= MAX_MERGES_PER_RUN; merges++) {
    const { prs } = await readQueue(baseBranch, required)
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
