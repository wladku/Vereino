// BT-TEST-04 of `.ai/specs/2026-11-18-batch-merge-train.md`: the batch trailers round trip, malformed means no batch.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BASE_TRAILER,
  BATCH_TRAILER,
  SUSPECTS_TRAILER,
  formatTrailers,
  parseTrailers,
} from '../../../../scripts/merge-train-trailers.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const BASE = '0123456789abcdef0123456789abcdef01234567'

describe('BT-TEST-04: batch trailers', () => {
  it('formats the batch, the base and the suspects', () => {
    const text = formatTrailers({
      prs: [
        { number: 391, sha: A },
        { number: 392, sha: B },
      ],
      base: BASE,
      suspects: [391, 392, 393],
    })
    assert.equal(
      text,
      [`${BATCH_TRAILER}: #391@${A},#392@${B}`, `${BASE_TRAILER}: ${BASE}`, `${SUSPECTS_TRAILER}: #391,#392,#393`].join(
        '\n',
      ),
    )
    assert.equal(
      formatTrailers({ prs: [{ number: 7, sha: A }], base: BASE }),
      `${BATCH_TRAILER}: #7@${A}\n${BASE_TRAILER}: ${BASE}`,
    )
  })

  it('round trips with and without suspects, inside a full commit message', () => {
    for (const batch of [
      {
        prs: [
          { number: 391, sha: A },
          { number: 392, sha: B },
        ],
        base: BASE,
        suspects: null,
      },
      { prs: [{ number: 392, sha: B }], base: BASE, suspects: [392, 393] },
    ]) {
      const message = `Merge train batch\n\nTests the PRs together.\n\n${formatTrailers(batch)}\n`
      assert.deepEqual(parseTrailers(message), batch)
    }
  })

  it('treats a message without trailers as no batch', () => {
    assert.equal(parseTrailers('Merge pull request #1'), null)
    assert.equal(parseTrailers(''), null)
    assert.equal(parseTrailers(undefined), null)
  })

  const ok = { batch: `#1@${A},#2@${B}`, base: BASE, suspects: null }
  const message = ({ batch, base, suspects }) =>
    [
      batch !== null && `${BATCH_TRAILER}: ${batch}`,
      base !== null && `${BASE_TRAILER}: ${base}`,
      suspects !== null && `${SUSPECTS_TRAILER}: ${suspects}`,
    ]
      .filter(Boolean)
      .join('\n')

  const malformed = {
    'a missing batch': { ...ok, batch: null },
    'a missing base': { ...ok, base: null },
    'a short base SHA': { ...ok, base: 'abc1234' },
    'an upper-case SHA': { ...ok, batch: `#1@${A.toUpperCase()}` },
    'a PR without SHA': { ...ok, batch: '#1' },
    'a PR with two SHAs': { ...ok, batch: `#1@${A}@${B}` },
    'a PR number without #': { ...ok, batch: `1@${A}` },
    'PR number zero': { ...ok, batch: `#0@${A}` },
    'an empty entry': { ...ok, batch: `#1@${A},` },
    'a PR listed twice': { ...ok, batch: `#1@${A},#1@${B}` },
    'a bad suspect': { ...ok, suspects: '#1,#2,x' },
    'a suspect listed twice': { ...ok, suspects: '#1,#2,#2' },
    'a batch PR that is no suspect': { ...ok, suspects: '#1,#3' },
  }
  for (const [name, fields] of Object.entries(malformed)) {
    it(`treats ${name} as no batch`, () => {
      assert.equal(parseTrailers(message(fields)), null)
    })
  }

  it('treats a repeated trailer as no batch', () => {
    const text = message(ok)
    assert.equal(parseTrailers(`${text}\n${BATCH_TRAILER}: #3@${A}`), null)
    assert.equal(parseTrailers(`${text}\n${BASE_TRAILER}: ${BASE}`), null)
    assert.equal(parseTrailers(`${text}\n${SUSPECTS_TRAILER}: #1,#2\n${SUSPECTS_TRAILER}: #1,#2`), null)
    assert.notEqual(parseTrailers(`${text}\n${SUSPECTS_TRAILER}: #1,#2`), null)
  })
})
