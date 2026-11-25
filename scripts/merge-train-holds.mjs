// QA holds for the merge train (MT-D02 of `.ai/specs/2026-11-18-merge-throughput.md`; REQ-QM01 of
// `.ai/specs/2026-11-24-qa-request-email.md`): every PR the plan holds for the owner's manual QA gets one line in the
// train log and one comment. The comment links the PR's QA instruction, or names it missing ("QA instruction missing")
// so the picker queues a run that writes it; when the instruction is written or removed later, the train edits the same
// comment instead of adding another. The train never sets `qa`.
//
// The GitHub client is injected (`api(method, path, body)` → `{ status, body }`, as in `scripts/merge-train.mjs`), so
// QM-TEST-02 drives this file with recorded responses.
import { qaHoldComment, qaHoldCommentAction } from './merge-train-plan.mjs'

const PAGE = 100

async function ok(api, method, path, body) {
  const result = await api(method, path, body)
  if (result.status >= 300) throw new Error(`${method} ${path} → ${result.status} ${JSON.stringify(result.body)}`)
  return result.body
}

async function readComments(api, repo, number) {
  const comments = []
  let page = 0
  let last
  do {
    page += 1
    last = await ok(api, 'GET', `/repos/${repo}/issues/${number}/comments?per_page=${PAGE}&page=${page}`)
    comments.push(...last)
  } while (last.length === PAGE)
  return comments
}

/**
 * Logs and comments every held PR, `held` as the plans list it (`{ pr, reason, instruction }`). In a dry run it only
 * logs. Returns what it did per PR: `create`, `update` or `none`.
 */
export async function announceHolds({ api, repo, held, dryRun = false, log = console.log }) {
  const done = []
  for (const hold of held) {
    log(`#${hold.pr}: held — ${hold.reason}`)
    if (dryRun) continue
    const url = `https://github.com/${repo}/pull/${hold.pr}`
    const wanted = `Merge train: ${qaHoldComment({ instruction: hold.instruction, url })}`
    const action = qaHoldCommentAction(await readComments(api, repo, hold.pr), wanted)
    if (action?.type === 'create') {
      await ok(api, 'POST', `/repos/${repo}/issues/${hold.pr}/comments`, { body: wanted })
    } else if (action?.type === 'update') {
      await ok(api, 'PATCH', `/repos/${repo}/issues/comments/${action.id}`, { body: wanted })
    }
    done.push({ pr: hold.pr, action: action?.type ?? 'none' })
  }
  return done
}
