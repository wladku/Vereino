// QM-TEST-02 of `.ai/specs/2026-11-24-qa-request-email.md` (REQ-QM01): the train's QA-hold comments driven with GitHub
// API fixtures — a held PR with an instruction gets a comment linking it, one without gets "QA instruction missing", a
// comment from before QM-P1 or one whose state changed is edited in place, a current one is left alone, and a dry run
// writes nothing. The train never sets `qa`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { announceHolds } from '../../../../scripts/merge-train-holds.mjs'
import {
  QA_HOLD_MARKER,
  QA_HOLD_REASON,
  QA_INSTRUCTION_MISSING,
  QA_INSTRUCTION_MISSING_MARKER,
  qaHoldComment,
} from '../../../../scripts/merge-train-plan.mjs'

const REPO = 'wladku/Vereino'
const FIXTURES = JSON.parse(readFileSync(new URL('./fixtures/merge-train-holds.json', import.meta.url), 'utf8'))
const MISSING = `${QA_HOLD_REASON}; ${QA_INSTRUCTION_MISSING}`
const url = (number) => `https://github.com/${REPO}/pull/${number}`
const current = (number, instruction) => `Merge train: ${qaHoldComment({ instruction, url: url(number) })}`
const commentsPath = (number, page = 1) => `GET /repos/${REPO}/issues/${number}/comments?per_page=100&page=${page}`

/** A fake GitHub client: GETs answer from `responses` (an unknown GET fails the test), writes answer `writeStatus`. */
function fakeApi(responses = FIXTURES, writeStatus = () => 201) {
  const calls = []
  const api = async (method, path, body) => {
    calls.push({ method, path, body })
    if (method !== 'GET') {
      const status = writeStatus(method, path)
      return { status, body: status >= 300 ? { message: 'Validation Failed' } : {} }
    }
    const key = `GET ${path}`
    assert.ok(key in responses, `unexpected request ${key}`)
    return { status: 200, body: structuredClone(responses[key]) }
  }
  const writes = () => calls.filter((call) => call.method !== 'GET')
  return { api, calls, writes }
}

async function run(api, held, options = {}) {
  const lines = []
  const done = await announceHolds({ api, repo: REPO, held, log: (line) => lines.push(line), ...options })
  return { done, lines }
}

describe('QM-TEST-02: the QA-hold comment', () => {
  it('links the instruction of a held PR that has one', async () => {
    const { api, writes } = fakeApi()
    const { done, lines } = await run(api, [{ pr: 601, reason: QA_HOLD_REASON, instruction: true }])
    assert.deepEqual(done, [{ pr: 601, action: 'create' }])
    assert.deepEqual(lines, [`#601: held — ${QA_HOLD_REASON}`])
    const [post] = writes()
    assert.equal(post.method, 'POST')
    assert.equal(post.path, `/repos/${REPO}/issues/601/comments`)
    assert.ok(post.body.body.startsWith('Merge train: ') && post.body.body.includes(`[PR description](${url(601)})`))
    assert.ok(post.body.body.includes(QA_HOLD_MARKER) && !post.body.body.includes(QA_INSTRUCTION_MISSING))
  })

  it('names the missing instruction on a held PR without one', async () => {
    const { api, writes } = fakeApi()
    const { lines } = await run(api, [{ pr: 602, reason: MISSING, instruction: false }])
    assert.deepEqual(lines, [`#602: held — ${MISSING}`])
    const [post] = writes()
    assert.equal(post.path, `/repos/${REPO}/issues/602/comments`)
    assert.ok(post.body.body.includes(`**${QA_INSTRUCTION_MISSING}**`))
    assert.ok(post.body.body.includes(QA_INSTRUCTION_MISSING_MARKER) && post.body.body.includes(QA_HOLD_MARKER))
  })

  it('edits a hold comment written before QM-P1 instead of adding a second one', async () => {
    const { api, writes } = fakeApi()
    const { done } = await run(api, [{ pr: 603, reason: MISSING, instruction: false }])
    assert.deepEqual(done, [{ pr: 603, action: 'update' }])
    assert.deepEqual(writes(), [
      { method: 'PATCH', path: `/repos/${REPO}/issues/comments/9031`, body: { body: current(603, false) } },
    ])
  })

  it('edits the comment once the instruction is written, then leaves it alone', async () => {
    const responses = { [commentsPath(604)]: [{ id: 9041, body: current(604, false) }] }
    const first = fakeApi(responses)
    await run(first.api, [{ pr: 604, reason: QA_HOLD_REASON, instruction: true }])
    assert.deepEqual(first.writes(), [
      { method: 'PATCH', path: `/repos/${REPO}/issues/comments/9041`, body: { body: current(604, true) } },
    ])
    const again = fakeApi({ [commentsPath(604)]: [{ id: 9041, body: current(604, true) }] })
    const { done } = await run(again.api, [{ pr: 604, reason: QA_HOLD_REASON, instruction: true }])
    assert.deepEqual(done, [{ pr: 604, action: 'none' }])
    assert.deepEqual(again.writes(), [])
  })

  it('reads every page of comments before deciding', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, body: `comment ${index}` }))
    const { api, writes, calls } = fakeApi({
      [commentsPath(605)]: page1,
      [commentsPath(605, 2)]: [{ id: 500, body: current(605, false) }],
    })
    const { done } = await run(api, [{ pr: 605, reason: MISSING, instruction: false }])
    assert.deepEqual(done, [{ pr: 605, action: 'none' }])
    assert.equal(calls.length, 2)
    assert.deepEqual(writes(), [])
  })

  it('logs only in a dry run', async () => {
    const { api, calls } = fakeApi({})
    const { done, lines } = await run(api, [{ pr: 602, reason: MISSING, instruction: false }], { dryRun: true })
    assert.deepEqual(done, [])
    assert.deepEqual(lines, [`#602: held — ${MISSING}`])
    assert.deepEqual(calls, [])
  })

  it('never writes a label, so it never sets qa (MT-D02 stays)', async () => {
    const { api, writes } = fakeApi()
    await run(api, [
      { pr: 601, reason: QA_HOLD_REASON, instruction: true },
      { pr: 602, reason: MISSING, instruction: false },
      { pr: 603, reason: MISSING, instruction: false },
    ])
    assert.equal(writes().length, 3)
    assert.ok(writes().every((call) => call.path.includes('/comments')))
  })

  it('fails loudly when GitHub refuses a read or a write', async () => {
    const down = async () => ({ status: 502, body: { message: 'Bad Gateway' } })
    await assert.rejects(run(down, [{ pr: 601, reason: QA_HOLD_REASON, instruction: true }]), /GET .*601\/comments.* → 502/)
    const { api } = fakeApi(FIXTURES, () => 403)
    await assert.rejects(run(api, [{ pr: 602, reason: MISSING, instruction: false }]), /POST .*602\/comments → 403/)
  })

  it('logs to the console by default', async () => {
    const { api } = fakeApi({})
    const original = console.log
    const lines = []
    console.log = (line) => lines.push(line)
    try {
      await announceHolds({ api, repo: REPO, held: [{ pr: 602, reason: MISSING, instruction: false }], dryRun: true })
    } finally {
      console.log = original
    }
    assert.deepEqual(lines, [`#602: held — ${MISSING}`])
  })
})
