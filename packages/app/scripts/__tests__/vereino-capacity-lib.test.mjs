// Unit tests for the shared capacity-test helpers (many-clubs spec TEST-M09, #633): argument parsing, the timed HTTP
// client, the bounded pool, percentiles and summaries, the club calendar day, slugs, weighted picks and sleep.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clubDay,
  clubSlug,
  createApi,
  markdownTable,
  parseArgs,
  percentile,
  pickWeighted,
  pool,
  sleep,
  summarize,
} from '../vereino-capacity-lib.mjs'

const DEFAULTS = { name: 'a', count: 1, verbose: false }

test('parseArgs reads strings, numbers and flags over the defaults', () => {
  assert.deepEqual(parseArgs([], DEFAULTS), DEFAULTS)
  assert.deepEqual(parseArgs(['--name', 'b', '--count', '7', '--verbose'], DEFAULTS), {
    name: 'b',
    count: 7,
    verbose: true,
  })
})

test('parseArgs rejects stray arguments, unknown options, missing values and non-numbers', () => {
  assert.throws(() => parseArgs(['x'], DEFAULTS), /unexpected argument: x/)
  assert.throws(() => parseArgs(['--other'], DEFAULTS), /unknown option: --other/)
  assert.throws(() => parseArgs(['--name'], DEFAULTS), /option --name needs a value/)
  assert.throws(() => parseArgs(['--count', 'many'], DEFAULTS), /option --count needs a number/)
})

test('createApi sends token, cookie, JSON and form bodies and times the call', async () => {
  const seen = []
  let clock = 0
  const fetchImpl = async (url, init) => {
    seen.push({ url, init })
    return { status: 201, text: async () => '{"ok":true}' }
  }
  const call = createApi({ baseUrl: 'http://x', fetchImpl, now: () => (clock += 5) })
  assert.deepEqual(await call('POST', '/a', { token: 't', cookie: 'c=1', json: { a: 1 }, headers: { h: 'v' } }), {
    status: 201,
    body: { ok: true },
    ms: 5,
  })
  assert.deepEqual(seen[0], {
    url: 'http://x/a',
    init: {
      method: 'POST',
      headers: { h: 'v', authorization: 'Bearer t', cookie: 'c=1', 'content-type': 'application/json' },
      redirect: 'manual',
      body: '{"a":1}',
    },
  })
  await call('POST', '/b', { form: 'a=1' })
  assert.deepEqual(seen[1].init, { method: 'POST', headers: {}, redirect: 'manual', body: 'a=1' })
  await call('GET', '/c')
  assert.deepEqual(seen[2].init, { method: 'GET', headers: {}, redirect: 'manual' })
})

test('createApi answers a null body for empty or non-JSON text and an error body when fetch throws', async () => {
  const texts = ['', 'not json']
  const call = createApi({ baseUrl: '', fetchImpl: async () => ({ status: 200, text: async () => texts.shift() }) })
  assert.equal((await call('GET', '/')).body, null)
  const notJson = await call('GET', '/')
  assert.equal(notJson.status, 200)
  assert.equal(notJson.body, null)
  assert.equal(typeof notJson.ms, 'number')

  const failing = createApi({
    baseUrl: '',
    fetchImpl: async (url) => {
      if (url === '/error') throw new Error('refused')
      throw 'plain'
    },
  })
  assert.deepEqual((await failing('GET', '/error')).body, { error: 'refused' })
  const plain = await failing('GET', '/other', {})
  assert.deepEqual({ ...plain, ms: 0 }, { status: 0, body: { error: 'plain' }, ms: 0 })
})

test('createApi uses the global fetch by default (an unparsable URL fails before any network)', async () => {
  const call = createApi({ baseUrl: 'not a url' })
  const result = await call('GET', '/x')
  assert.equal(result.status, 0)
  assert.equal(typeof result.body.error, 'string')
})

test('pool keeps the order and runs at least one worker', async () => {
  let active = 0
  let peak = 0
  const results = await pool([1, 2, 3, 4, 5], 2, async (item, index) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setImmediate(resolve))
    active -= 1
    return item * 10 + index
  })
  assert.deepEqual(results, [10, 21, 32, 43, 54])
  assert.equal(peak, 2)
  assert.deepEqual(await pool([], 4, async () => 1), [])
  assert.deepEqual(await pool([3], 0, async (item) => item), [3])
})

test('percentile answers the nearest rank, clamped, and null for no values', () => {
  assert.equal(percentile([], 50), null)
  assert.equal(percentile([1, 2, 3, 4], 0), 1)
  assert.equal(percentile([1, 2, 3, 4], 50), 2)
  assert.equal(percentile([1, 2, 3, 4], 100), 4)
})

test('summarize groups by label and counts failures and 429s; markdownTable prints dashes for nulls', () => {
  const samples = [
    { label: 'b', status: 200, ms: 10.4 },
    { label: 'a', status: 0, ms: 3 },
    { label: 'b', status: 503, ms: 30 },
    { label: 'b', status: 429, ms: 20 },
  ]
  const summary = summarize(samples, 2)
  assert.deepEqual(
    summary.rows.map((entry) => entry.label),
    ['a', 'b'],
  )
  assert.deepEqual(summary.rows[1], {
    label: 'b',
    count: 3,
    rps: 1.5,
    errors: 1,
    limited: 1,
    p50: 20,
    p95: 30,
    p99: 30,
    max: 30,
  })
  assert.equal(summary.total.count, 4)
  assert.equal(summary.total.errors, 2)

  const empty = summarize([], 0)
  assert.deepEqual(empty, {
    rows: [],
    total: { label: 'all', count: 0, rps: null, errors: 0, limited: 0, p50: null, p95: null, p99: null, max: null },
  })
  const table = markdownTable(empty).split('\n')
  assert.equal(table.length, 3)
  assert.match(table[0], /^\| Route \| Requests/)
  assert.equal(table[2], '| all | 0 | – | 0 | 0 | – | – | – | – |')
  assert.match(markdownTable(summary), /\| b \| 3 \| 1\.5 \| 1 \| 1 \| 20 \| 30 \| 30 \| 30 \|/)
})

test('clubDay answers the date and weekday of the club time zone', () => {
  const instant = new Date('2026-11-24T23:30:00Z')
  assert.deepEqual(clubDay(instant, 'Europe/Warsaw'), { date: '2026-11-25', weekday: 'WE' })
  assert.deepEqual(clubDay(instant, 'UTC'), { date: '2026-11-24', weekday: 'TU' })
})

test('clubSlug pads the index', () => {
  assert.equal(clubSlug(1), 'cap-001')
  assert.equal(clubSlug(1234), 'cap-1234')
})

test('pickWeighted picks by weight and falls back to the last entry', () => {
  const entries = [
    ['a', 1],
    ['b', 3],
  ]
  assert.equal(
    pickWeighted(entries, () => 0),
    'a',
  )
  assert.equal(
    pickWeighted(entries, () => 0.5),
    'b',
  )
  assert.equal(
    pickWeighted(entries, () => 1),
    'b',
  )
  assert.ok(['a', 'b'].includes(pickWeighted(entries)))
})

test('sleep resolves after the delay', async () => {
  assert.equal(await sleep(1), undefined)
})
