// Unit tests for the canonical gate runner (engineering standards S2.1).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STEPS, parseArgs, runYarn, verify } from '../../../../scripts/verify.mjs'

function fakeClock() {
  let now = 0
  return () => {
    now += 1500
    return now
  }
}

test('the gate runs generate first and build last', () => {
  assert.equal(STEPS[0].name, 'generate')
  assert.equal(STEPS.at(-1).name, 'build')
  assert.deepEqual(STEPS.find((step) => step.name === 'i18n:check-hardcoded').args, [
    'i18n:check-hardcoded',
    '--strict',
  ])
})

test('parseArgs reads --from and --list and rejects unknown steps', () => {
  assert.deepEqual(parseArgs([]), { from: undefined, list: false })
  assert.deepEqual(parseArgs(['--from', 'lint', '--list']), { from: 'lint', list: true })
  assert.throws(() => parseArgs(['--from', 'nope']), /unknown step for --from: nope/)
  assert.throws(() => parseArgs(['--from']), /unknown step for --from: undefined/)
})

test('--list prints every step without running anything', () => {
  const lines = []
  const ran = []
  assert.equal(verify({ argv: ['--list'], run: (args) => ran.push(args), log: (line) => lines.push(line) }), 0)
  assert.equal(ran.length, 0)
  assert.equal(lines.length, STEPS.length)
  assert.equal(lines[0], 'generate: yarn generate')
})

test('all steps pass in order and the summary reports durations', () => {
  const lines = []
  const ran = []
  const code = verify({
    argv: [],
    run: (args) => (ran.push(args[0]), 0),
    log: (line) => lines.push(line),
    now: fakeClock(),
  })
  assert.equal(code, 0)
  assert.deepEqual(
    ran,
    STEPS.map((step) => step.args[0]),
  )
  assert.ok(lines.includes('  pass  build                  2s'))
  assert.equal(lines.at(-1), `[verify] all ${String(STEPS.length)} step(s) passed`)
})

test('the first failing step stops the gate and its exit code is returned', () => {
  const lines = []
  const ran = []
  const run = (args) => {
    ran.push(args[0])
    return args[0] === 'lint' ? 2 : 0
  }
  const code = verify({ argv: ['--from', 'typecheck:qa'], run, log: (line) => lines.push(line), now: fakeClock() })
  assert.equal(code, 2)
  assert.deepEqual(ran, ['typecheck:qa', 'lint'])
  assert.ok(lines.includes('  FAIL  lint                   2s'))
  assert.equal(lines.at(-1), '[verify] failed at lint; fix it and resume with: yarn verify --from lint')
})

test('verify falls back to the console and the real clock', () => {
  const original = console.log
  const lines = []
  console.log = (line) => lines.push(line)
  try {
    assert.equal(verify({ argv: ['--from', 'build'], run: () => 0 }), 0)
  } finally {
    console.log = original
  }
  assert.ok(lines.some((line) => line.startsWith('  pass  build')))
})

test('runYarn returns the exit status of yarn', () => {
  assert.equal(runYarn(['--version']), 0)
})

test('runYarn treats a step killed by a signal as failed', () => {
  assert.equal(
    runYarn(['build'], () => ({ status: null, signal: 'SIGTERM' })),
    1,
  )
})
