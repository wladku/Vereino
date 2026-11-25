// Stacked PRs for the merge train (`.ai/specs/2026-11-24-cezar-stall-prevention.md`, ST-D04, REQ-ST01): reads the
// open PRs whose base is not `main`, asks `planRetargets` what to do and carries it out before the queue step. A base PR
// that merged → the stacked PR's base becomes `main` and it joins the queue; one closed without merging → `blocked` and
// one comment; one still open, or none at all → nothing. Every stacked PR gets one line in the train log.
//
// The GitHub client is injected (`api(method, path, body)` → `{ status, body }`, as in `scripts/merge-train.mjs`), so
// ST-TEST-02 drives this file with recorded responses.
import { BASE_CLOSED_MARKER, RETARGET_MARKER, RETARGET_REASONS, planRetargets } from './merge-train-plan.mjs'

/** The skip label a stacked PR on a closed base gets; the owner decides what happens to it. */
export const BLOCKED_LABEL = 'blocked'
const PAGE = 100

async function readAll(api, path) {
  const items = []
  let page = 0
  let last
  do {
    page += 1
    const result = await api('GET', `${path}&per_page=${PAGE}&page=${page}`)
    if (result.status >= 300) throw new Error(`GET ${path} → ${result.status} ${JSON.stringify(result.body)}`)
    last = result.body
    items.push(...last)
  } while (last.length === PAGE)
  return items
}

/**
 * Reads the stacked PRs of `repo` and the PRs whose head is one of their bases: the open PRs come from one listing,
 * the closed ones from `GET /pulls?state=closed&head=<owner>:<branch>` per base branch without an open PR. PRs from
 * forks never count, as in the queue.
 */
export async function readStacked({ api, repo, baseBranch }) {
  const open = (await readAll(api, `/repos/${repo}/pulls?state=open`)).filter((pull) => pull.head.repo?.full_name === repo)
  const stacked = open
    .filter((pull) => pull.base.ref !== baseBranch)
    .map((pull) => ({ number: pull.number, base: pull.base.ref, labels: pull.labels.map((label) => label.name) }))
  const basePrs = open.map((pull) => ({ number: pull.number, head: pull.head.ref, state: 'open', merged: false }))
  const owner = repo.split('/')[0]
  for (const branch of new Set(stacked.map((pr) => pr.base))) {
    if (basePrs.some((base) => base.head === branch)) continue
    const closed = await readAll(api, `/repos/${repo}/pulls?state=closed&head=${owner}:${encodeURIComponent(branch)}`)
    for (const pull of closed) {
      basePrs.push({ number: pull.number, head: pull.head.ref, state: 'closed', merged: Boolean(pull.merged_at) })
    }
  }
  return { stacked, basePrs }
}

/** The train log line for one planned step. */
export function describeRetarget(step, baseBranch) {
  const base = step.basePr ? ` (#${step.basePr})` : ''
  const what = { retarget: `retarget to ${baseBranch}`, block: `label ${BLOCKED_LABEL}, no retarget`, none: 'nothing to do' }
  return `#${step.pr}: stacked on ${step.base} — ${RETARGET_REASONS[step.reason]}${base}: ${what[step.action]}`
}

/** The comment bodies, each ending in the hidden marker that makes it a one-time comment. */
export function retargetComment(step, baseBranch) {
  if (step.action === 'retarget') {
    return `Merge train: the base PR #${step.basePr} of this PR (branch \`${step.base}\`) merged, so the train retargeted this PR to \`${baseBranch}\`. It now joins the queue like any PR on \`${baseBranch}\`; a conflict with \`${baseBranch}\` gets \`merge-train-conflict\` and a repair run as usual (ST-D04). ${RETARGET_MARKER}`
  }
  return `Merge train: the base PR #${step.basePr} of this PR (branch \`${step.base}\`) was closed without merging, so this PR may carry its unmerged commits. The train labelled it \`${BLOCKED_LABEL}\` and does not retarget it; the owner decides how it goes on (ST-D04). ${BASE_CLOSED_MARKER}`
}

async function write(api, log, method, path, body, pr) {
  const result = await api(method, path, body)
  if (result.status >= 300) log(`::warning::#${pr}: ${method} ${path} → ${result.status} ${JSON.stringify(result.body)}`)
  return result.status < 300
}

async function commentOnce(api, log, repo, pr, body, marker) {
  const comments = await readAll(api, `/repos/${repo}/issues/${pr}/comments?sort=created`)
  if (comments.some((entry) => (entry.body ?? '').includes(marker))) return
  await write(api, log, 'POST', `/repos/${repo}/issues/${pr}/comments`, { body }, pr)
}

/**
 * Reads, plans and applies the stacked PRs (REQ-ST01) and answers the plan. With `dryRun` it only logs. A write that
 * fails is logged as a warning and the other PRs go on; a failed read throws, and the caller logs it.
 */
export async function applyRetargets({ api, repo, baseBranch, dryRun = false, log = console.log }) {
  const { stacked, basePrs } = await readStacked({ api, repo, baseBranch })
  const plan = planRetargets(stacked, basePrs)
  for (const step of plan) {
    log(`${describeRetarget(step, baseBranch)}${dryRun && step.action !== 'none' ? ' (dry run: no change)' : ''}`)
    if (dryRun || step.action === 'none') continue
    const marker = step.action === 'retarget' ? RETARGET_MARKER : BASE_CLOSED_MARKER
    if (step.action === 'retarget') {
      if (!(await write(api, log, 'PATCH', `/repos/${repo}/pulls/${step.pr}`, { base: baseBranch }, step.pr))) continue
    } else if (!stacked.find((pr) => pr.number === step.pr).labels.includes(BLOCKED_LABEL)) {
      await write(api, log, 'POST', `/repos/${repo}/issues/${step.pr}/labels`, { labels: [BLOCKED_LABEL] }, step.pr)
    }
    await commentOnce(api, log, repo, step.pr, retargetComment(step, baseBranch), marker)
  }
  return plan
}
