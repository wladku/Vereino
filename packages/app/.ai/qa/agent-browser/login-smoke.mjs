// Agent-browser smoke test (engineering standards S13.1, ADR-003 amendment): drives the ephemeral app
// started by `yarn test:integration:vereino:start` the way an AI agent does, through the agent-browser
// CLI, and signs in with the account the platform runner seeds.
// Usage: node .ai/qa/agent-browser/login-smoke.mjs
//   BASE_URL           app URL (default http://127.0.0.1:5001)
//   AGENT_BROWSER_BIN  agent-browser binary (default: agent-browser on PATH)
//   SMOKE_EMAIL / SMOKE_PASSWORD  test account (default: the runner's seeded admin, test-only)
//   SMOKE_TIMEOUT_MS   how long each agent-browser wait may take (default 90000, sized for a cold start)
//   SCREENSHOT_DIR     where screenshots and failure diagnostics go (default .ai/qa/test-results/agent-browser)
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
// agent-browser's own default (25 000 ms) is too short for the first sign-in after a cold start of a production
// build (#407). The daemon reads AGENT_BROWSER_DEFAULT_TIMEOUT when the first command starts it.
const waitTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 90_000)
const env = { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: String(waitTimeoutMs) }

// The platform login form renders `data-auth-ready="0"` and a disabled submit button until it hydrates; before that
// Enter submits nothing and the page stays on /login with the fields filled in (#407). Wait for the hydrated form.
const readySubmit = 'form[data-auth-ready="1"] button[type="submit"]:not([disabled])'

// The first command starts a background daemon that inherits stdout; with a pipe, spawnSync would wait
// for that pipe to close and hang, so each command writes to a file and the file is read afterwards.
const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-browser-')), 'output.txt')

function run(args) {
  const fd = fs.openSync(outputFile, 'w')
  try {
    const result = spawnSync(bin, ['--session', session, ...args], {
      env,
      stdio: ['ignore', fd, fd],
      timeout: waitTimeoutMs + 60_000,
    })
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

/** On a failure, keeps what the browser saw (URL, console, page errors, requests) for the next diagnosis. */
function recordDiagnostics() {
  const sections = [
    ['url', ['get', 'url']],
    ['console', ['console']],
    ['page errors', ['errors']],
    ['network requests', ['network', 'requests']],
    ['sign-in requests', ['network', 'requests', '--filter', '/api/auth/']],
  ]
  const report = sections
    .map(([title, args]) => {
      const { status, output } = run(args)
      return `## ${title} (agent-browser ${args.join(' ')}, exit ${String(status)})\n${output}\n`
    })
    .join('\n')
  const file = path.join(screenshotDir, 'login-smoke-diagnostics.md')
  fs.writeFileSync(file, report)
  console.error(`\n${report}\nDiagnostics saved to ${file}`)
}

fs.mkdirSync(screenshotDir, { recursive: true })
let failed = false
try {
  browser('open', `${baseUrl}/login`)
  browser('wait', readySubmit)
  browser('fill', 'input[name="email"]', email)
  browser('fill', 'input[name="password"]', password)
  browser('click', readySubmit)
  browser('wait', '--url', '**/backend**')
  browser('wait', '--load', 'networkidle')
  const url = browser('get', 'url')
  if (!url.includes('/backend')) throw new Error(`expected to land on /backend after sign-in, got ${url}`)
  console.log(`agent-browser smoke: signed in and reached ${url}`)
} catch (error) {
  failed = true
  console.error(error instanceof Error ? error.message : String(error))
  recordDiagnostics()
} finally {
  run(['screenshot', '--full', path.join(screenshotDir, 'login-smoke.png')])
  run(['close'])
}
process.exitCode = failed ? 1 : 0
