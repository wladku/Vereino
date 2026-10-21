// The single canonical gate (engineering standards S2): every step is blocking and runs in order.
// Usage: yarn verify [--from <step>] [--list]
// Adding a check means adding a step here and nowhere else.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const STEPS = [
  { name: 'generate', args: ['generate'] },
  { name: 'typecheck', args: ['typecheck'] },
  { name: 'typecheck:packages', args: ['typecheck:packages'] },
  { name: 'typecheck:qa', args: ['typecheck:qa'] },
  { name: 'lint', args: ['lint'] },
  { name: 'format:check', args: ['format:check'] },
  { name: 'ds:check', args: ['ds:check'] },
  { name: 'i18n:check-hardcoded', args: ['i18n:check-hardcoded', '--strict'] },
  { name: 'contracts:check', args: ['contracts:check'] },
  { name: 'lessons:check', args: ['lessons:check'] },
  { name: 'test', args: ['test'] },
  { name: 'test:scripts', args: ['test:scripts'] },
  { name: 'build', args: ['build'] },
]

export function parseArgs(argv) {
  const fromIndex = argv.indexOf('--from')
  const from = fromIndex >= 0 ? argv[fromIndex + 1] : undefined
  if (fromIndex >= 0 && !STEPS.some((step) => step.name === from)) {
    throw new Error(`unknown step for --from: ${String(from)} (steps: ${STEPS.map((step) => step.name).join(', ')})`)
  }
  return { from, list: argv.includes('--list') }
}

function formatSeconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(0)}s`
}

// A step killed by a signal has no status and counts as failed.
export function runYarn(args, spawn = spawnSync) {
  const result = spawn('yarn', args, { stdio: 'inherit', shell: process.platform === 'win32' })
  return result.status ?? 1
}

// Runs the steps in order and returns the exit code of the first failing step (0 when all pass).
export function verify({ argv, run = runYarn, log = console.log, now = Date.now }) {
  const { from, list } = parseArgs(argv)
  if (list) {
    for (const step of STEPS) log(`${step.name}: yarn ${step.args.join(' ')}`)
    return 0
  }
  const steps = from ? STEPS.slice(STEPS.findIndex((step) => step.name === from)) : STEPS
  const results = []
  for (const step of steps) {
    log(`\n[verify] ${step.name}: yarn ${step.args.join(' ')}`)
    const started = now()
    const status = run(step.args)
    results.push({ name: step.name, status, duration: now() - started })
    if (status !== 0) break
  }
  log('\n[verify] summary')
  for (const { name, status, duration } of results) {
    log(`  ${status === 0 ? 'pass' : 'FAIL'}  ${name.padEnd(22)} ${formatSeconds(duration)}`)
  }
  const failed = results.find((result) => result.status !== 0)
  if (failed) {
    log(`[verify] failed at ${failed.name}; fix it and resume with: yarn verify --from ${failed.name}`)
    return failed.status
  }
  log(`[verify] all ${String(results.length)} step(s) passed`)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = verify({ argv: process.argv.slice(2) })
}
