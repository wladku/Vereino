// ST-TEST-02 of `.ai/specs/2026-11-24-cezar-stall-prevention.md` (REQ-ST01, ST-AC-04): the train's stacked-PR step
// driven with GitHub API fixtures — merged base → PATCH and one comment; closed base → `blocked` and one comment; open
// base or none → nothing; dry run → no write.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { BASE_CLOSED_MARKER, RETARGET_MARKER } from '../../../../scripts/merge-train-plan.mjs'
import {
  BLOCKED_LABEL,
  applyRetargets,
  describeRetarget,
  readStacked,
  retargetComment,
} from '../../../../scripts/merge-train-stacked.mjs'

const REPO = 'wladku/Vereino'
const FIXTURES = JSON.parse(readFileSync(new URL('./fixtures/merge-train-stacked.json', import.meta.url), 'utf8'))

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

function run(api, options = {}) {
  const lines = []
  return applyRetargets({ api, repo: REPO, baseBranch: 'main', log: (line) => lines.push(line), ...options }).then(
    (plan) => ({ plan, lines }),
  )
}

describe('ST-TEST-02: readStacked', () => {
  it('lists same-repository PRs off main and the PRs whose head is their base, without asking for an open base', async () => {
    const { api, calls } = fakeApi()
    const { stacked, basePrs } = await readStacked({ api, repo: REPO, baseBranch: 'main' })
    assert.deepEqual(stacked, [
      { number: 643, base: 'feat/issue-563-sessions', labels: ['feature'] },
      { number: 686, base: 'feat/issue-677-offboarding', labels: ['bug'] },
      { number: 700, base: 'feat/issue-688-exports', labels: [] },
      { number: 701, base: 'release/2026-11', labels: [] },
    ])
    assert.deepEqual(
      basePrs.filter((base) => base.state === 'closed'),
      [
        { number: 563, head: 'feat/issue-563-sessions', base: 'main', state: 'closed', merged: true },
        { number: 677, head: 'feat/issue-677-offboarding', base: 'main', state: 'closed', merged: false },
      ],
    )
    assert.equal(
      calls.some((call) => call.path.includes('head=wladku:feat%2Fissue-688-exports')),
      false,
    )
  })

  it('reads every page of a long listing and skips a PR whose head repository is gone', async () => {
    const many = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1,
      head: { ref: `feat/x-${index}`, repo: { full_name: REPO } },
      base: { ref: 'main' },
      labels: [],
    }))
    const responses = {
      'GET /repos/wladku/Vereino/pulls?state=open&per_page=100&page=1': many,
      'GET /repos/wladku/Vereino/pulls?state=open&per_page=100&page=2': [
        { number: 101, head: { ref: 'feat/y', repo: null }, base: { ref: 'feat/x-0' }, labels: [] },
        { number: 102, head: { ref: 'feat/z', repo: { full_name: REPO } }, base: { ref: 'feat/x-1' }, labels: [] },
      ],
    }
    const { stacked, basePrs } = await readStacked({ api: fakeApi(responses).api, repo: REPO, baseBranch: 'main' })
    assert.deepEqual(stacked, [{ number: 102, base: 'feat/x-1', labels: [] }])
    assert.equal(basePrs.length, 101)
  })

  it('throws on a failed read', async () => {
    const api = async () => ({ status: 502, body: { message: 'Bad Gateway' } })
    await assert.rejects(readStacked({ api, repo: REPO, baseBranch: 'main' }), /→ 502/)
  })
})

describe('ST-TEST-02: applyRetargets', () => {
  it('retargets the PR on a merged base, blocks the one on a closed base, comments once each and logs every PR', async () => {
    const { api, writes } = fakeApi()
    const { plan, lines } = await run(api)
    assert.deepEqual(
      plan.map((step) => [step.pr, step.action, step.reason]),
      [
        [643, 'retarget', 'base-merged'],
        [686, 'block', 'base-closed'],
        [700, 'none', 'base-open'],
        [701, 'none', 'no-base-pr'],
      ],
    )
    const done = writes()
    assert.deepEqual(
      done.map((call) => `${call.method} ${call.path}`),
      [
        'PATCH /repos/wladku/Vereino/pulls/643',
        'POST /repos/wladku/Vereino/issues/643/comments',
        'POST /repos/wladku/Vereino/issues/686/labels',
        'POST /repos/wladku/Vereino/issues/686/comments',
      ],
    )
    assert.deepEqual(done[0].body, { base: 'main' })
    assert.ok(done[1].body.body.includes(RETARGET_MARKER) && done[1].body.body.includes('#563'))
    assert.deepEqual(done[2].body, { labels: [BLOCKED_LABEL] })
    assert.ok(done[3].body.body.includes(BASE_CLOSED_MARKER) && done[3].body.body.includes('#677'))
    assert.deepEqual(lines, [
      '#643: stacked on feat/issue-563-sessions — its base PR merged into the default branch (#563): retarget to main',
      '#686: stacked on feat/issue-677-offboarding — its base PR was closed without merging (#677): label blocked, no retarget',
      '#700: stacked on feat/issue-688-exports — its base PR is still open (#690): nothing to do',
      '#701: stacked on release/2026-11 — no PR has its base branch as head: nothing to do',
    ])
  })

  it('comments only once and does not relabel a PR already blocked on its closed base', async () => {
    const responses = structuredClone(FIXTURES)
    const open = 'GET /repos/wladku/Vereino/pulls?state=open&per_page=100&page=1'
    responses[open] = responses[open].filter((pull) => pull.number !== 643)
    responses[open].find((pull) => pull.number === 686).labels.push({ name: BLOCKED_LABEL })
    responses['GET /repos/wladku/Vereino/issues/686/comments?sort=created&per_page=100&page=1'].push({
      body: `Merge train: … ${BASE_CLOSED_MARKER}`,
    })
    const { api, writes } = fakeApi(responses)
    await run(api)
    assert.deepEqual(writes(), [])
  })

  it('leaves a closed-base PR alone once commented, so a blocked label the owner removed stays removed', async () => {
    const responses = structuredClone(FIXTURES)
    responses['GET /repos/wladku/Vereino/issues/686/comments?sort=created&per_page=100&page=1'].push({
      body: `Merge train: … ${BASE_CLOSED_MARKER}`,
    })
    const { api, writes } = fakeApi(responses)
    await run(api)
    assert.equal(
      writes().some((call) => call.path.startsWith('/repos/wladku/Vereino/issues/686/')),
      false,
    )
  })

  it('retargets but does not comment twice when the retarget comment is already there', async () => {
    const responses = structuredClone(FIXTURES)
    responses['GET /repos/wladku/Vereino/issues/643/comments?sort=created&per_page=100&page=1'].push({
      body: `Merge train: … ${RETARGET_MARKER}`,
    })
    const { api, writes } = fakeApi(responses)
    await run(api)
    assert.deepEqual(
      writes()
        .filter((call) => call.path.includes('/643'))
        .map((call) => call.method),
      ['PATCH'],
    )
  })

  it('logs a failed comment read as a warning, changes nothing on that PR and goes on with the next', async () => {
    const responses = structuredClone(FIXTURES)
    delete responses['GET /repos/wladku/Vereino/issues/643/comments?sort=created&per_page=100&page=1']
    const failing = async (method, path, body) =>
      path.startsWith('/repos/wladku/Vereino/issues/643/comments')
        ? { status: 500, body: { message: 'Server Error' } }
        : api(method, path, body)
    const { api, writes } = fakeApi(responses)
    const { lines } = await run(failing)
    assert.equal(
      writes().some((call) => call.path.includes('/643')),
      false,
    )
    assert.ok(writes().some((call) => call.path === '/repos/wladku/Vereino/issues/686/comments'))
    assert.ok(lines.some((line) => line.startsWith('::warning::#643: GET /repos/wladku/Vereino/issues/643/comments')))
  })

  it('writes nothing in a dry run and says so in the log', async () => {
    const { api, writes } = fakeApi()
    const { lines } = await run(api, { dryRun: true })
    assert.deepEqual(writes(), [])
    assert.equal(lines.filter((line) => line.endsWith('(dry run: no change)')).length, 2)
    assert.ok(lines[2].endsWith('nothing to do'))
  })

  it('logs a failed write as a warning, skips the comment of a failed retarget and goes on', async () => {
    const { api, writes } = fakeApi(FIXTURES, (method) => (method === 'POST' ? 201 : 422))
    const { lines } = await run(api)
    assert.deepEqual(
      writes().map((call) => `${call.method} ${call.path}`),
      [
        'PATCH /repos/wladku/Vereino/pulls/643',
        'POST /repos/wladku/Vereino/issues/686/labels',
        'POST /repos/wladku/Vereino/issues/686/comments',
      ],
    )
    assert.ok(lines.some((line) => line.startsWith('::warning::#643: PATCH /repos/wladku/Vereino/pulls/643 → 422')))
  })

  it('still comments when adding the label fails', async () => {
    const { api, writes } = fakeApi(FIXTURES, (method, path) => (path.endsWith('/labels') ? 403 : 200))
    const { lines } = await run(api)
    assert.ok(writes().some((call) => call.path === '/repos/wladku/Vereino/issues/686/comments'))
    assert.ok(
      lines.some((line) => line.startsWith('::warning::#686: POST /repos/wladku/Vereino/issues/686/labels → 403')),
    )
  })

  it('logs to the console by default', async (t) => {
    const log = t.mock.method(console, 'log', () => {})
    await applyRetargets({ api: fakeApi().api, repo: REPO, baseBranch: 'main', dryRun: true })
    assert.equal(log.mock.callCount(), 4)
  })
})

describe('ST-TEST-02: describeRetarget and retargetComment', () => {
  it('names the target branch, the base PR and the marker', () => {
    const step = { pr: 2, base: 'feat/a', action: 'retarget', reason: 'base-merged', basePr: 1 }
    assert.equal(
      describeRetarget(step, 'trunk'),
      '#2: stacked on feat/a — its base PR merged into the default branch (#1): retarget to trunk',
    )
    assert.match(retargetComment(step, 'trunk'), /retargeted this PR to `trunk`/)
    const blocked = { ...step, action: 'block', reason: 'base-closed' }
    assert.match(retargetComment(blocked, 'trunk'), /closed without merging.*`blocked`/)
  })
})
