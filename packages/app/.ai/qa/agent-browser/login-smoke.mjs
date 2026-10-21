// Agent-browser smoke test (engineering standards S13.1, ADR-003 amendment): drives the ephemeral app
// started by `yarn test:integration:ephemeral:start` the way an AI agent does, through the agent-browser
// CLI, and signs in with the account the platform runner seeds.
// Usage: node .ai/qa/agent-browser/login-smoke.mjs
//   BASE_URL           app URL (default http://127.0.0.1:5001)
//   AGENT_BROWSER_BIN  agent-browser binary (default: agent-browser on PATH)
//   SMOKE_EMAIL / SMOKE_PASSWORD  test account (default: the runner's seeded admin, test-only)
//   SCREENSHOT_DIR     where screenshots go (default .ai/qa/test-results/agent-browser)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:5001'
const bin = process.env.AGENT_BROWSER_BIN ?? 'agent-browser'
const email = process.env.SMOKE_EMAIL ?? 'admin@acme.com'
const password = process.env.SMOKE_PASSWORD ?? 'secret'
const screenshotDir = path.resolve(process.env.SCREENSHOT_DIR ?? '.ai/qa/test-results/agent-browser')
const session = `qa-login-smoke-${String(process.pid)}`

// The first command starts a background daemon that inherits stdout; with a pipe, spawnSync would wait
// for that pipe to close and hang, so each command writes to a file and the file is read afterwards.
const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-browser-')), 'output.txt')

function run(args) {
  const fd = fs.openSync(outputFile, 'w')
  try {
    const result = spawnSync(bin, ['--session', session, ...args], { stdio: ['ignore', fd, fd], timeout: 120_000 })
    return { status: result.status, output: fs.readFileSync(outputFile, 'utf8').trim() }
  } finally {
    fs.closeSync(fd)
  }
}

function browser(...args) {
  const { status, output } = run(args)
  if (status !== 0) throw new Error(`agent-browser ${args[0]} failed (exit ${String(status)}): ${output}`)
  return output
}

fs.mkdirSync(screenshotDir, { recursive: true })
let failed = false
try {
  browser('open', `${baseUrl}/login`)
  browser('wait', 'input[name="email"]')
  browser('fill', 'input[name="email"]', email)
  browser('fill', 'input[name="password"]', password)
  browser('press', 'Enter')
  browser('wait', '--url', '**/backend**')
  browser('wait', '--load', 'networkidle')
  const url = browser('get', 'url')
  if (!url.includes('/backend')) throw new Error(`expected to land on /backend after sign-in, got ${url}`)
  console.log(`agent-browser smoke: signed in and reached ${url}`)
} catch (error) {
  failed = true
  console.error(error instanceof Error ? error.message : String(error))
} finally {
  run(['screenshot', '--full', path.join(screenshotDir, 'login-smoke.png')])
  run(['close'])
}
process.exitCode = failed ? 1 : 0
