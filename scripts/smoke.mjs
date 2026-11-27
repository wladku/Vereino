#!/usr/bin/env node
// Post-deploy smoke check of a running Vereino instance (engineering standards S14.5, ENG-10; issue #462).
//
//   node scripts/smoke.mjs <base-url>
//
// Checks, in order, and prints one line per check:
//   health            GET /api/healthz answers 2xx;
//   sign-in page      GET /login answers 200 with an HTML page;
//   security headers  the sign-in page carries every header of SECURITY_HEADERS and a CSP without `'unsafe-eval'`
//                     (ENG-TEST-11; HSTS, Permissions-Policy and the CSP decision from E18-S02, #463);
//   no-store          an authenticated response (GET /api/auth/profile) carries `Cache-Control: no-store`. It needs a
//                     test account in VEREINO_SMOKE_EMAIL and VEREINO_SMOKE_PASSWORD and is skipped without them.
//                     An account holding the staff second factor (#736) gets its sign-in code from the app's
//                     `OM_TEST_MODE` e-mail capture file named in VEREINO_SMOKE_EMAIL_CAPTURE; without it the check
//                     fails with that hint (use an account without the second factor on a real deployment).
// Exits 0 when every check passed or was skipped, 1 naming each failed check, 2 on a usage error. Never prints a
// credential, a token or a response body.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Response headers every page of a production build must carry (`packages/app/next.config.ts`, S8.4). */
export const SECURITY_HEADERS = [
  'content-security-policy',
  'referrer-policy',
  'x-content-type-options',
  'x-frame-options',
  'permissions-policy',
  'strict-transport-security',
]

const REQUEST_TIMEOUT_MS = 15_000

/**
 * @typedef {{ name: string, status: 'pass' | 'fail' | 'skip', detail: string }} CheckResult
 * @typedef {(url: string, init?: RequestInit) => Promise<Response>} FetchLike
 */

/**
 * @param {string} raw
 * @returns {string | null} the base URL without a trailing slash, or null when it is not an http(s) URL
 */
export function normalizeBaseUrl(raw) {
  if (!/^https?:\/\/\S+$/.test(raw ?? '')) return null
  return raw.replace(/\/+$/, '')
}

/**
 * @param {FetchLike} fetchImpl
 * @param {string} url
 * @param {RequestInit} [init]
 */
function request(fetchImpl, url, init = {}) {
  return fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...init })
}

/** @param {unknown} error */
const describe = (error) => (error instanceof Error ? error.message : String(error))

/**
 * @param {{ baseUrl: string, fetchImpl: FetchLike }} options
 * @returns {Promise<CheckResult>}
 */
export async function checkHealth({ baseUrl, fetchImpl }) {
  const name = 'health'
  try {
    const response = await request(fetchImpl, `${baseUrl}/api/healthz`)
    if (response.ok) return { name, status: 'pass', detail: `GET /api/healthz ${String(response.status)}` }
    return { name, status: 'fail', detail: `GET /api/healthz answered ${String(response.status)}` }
  } catch (error) {
    return { name, status: 'fail', detail: `GET /api/healthz failed: ${describe(error)}` }
  }
}

/**
 * The sign-in page check and the security-header check, which reads the same response.
 * @param {{ baseUrl: string, fetchImpl: FetchLike }} options
 * @returns {Promise<CheckResult[]>}
 */
export async function checkSignInPage({ baseUrl, fetchImpl }) {
  let response
  try {
    response = await request(fetchImpl, `${baseUrl}/login`)
  } catch (error) {
    const detail = `GET /login failed: ${describe(error)}`
    return [
      { name: 'sign-in page', status: 'fail', detail },
      { name: 'security headers', status: 'fail', detail },
    ]
  }
  const contentType = response.headers.get('content-type') ?? ''
  const page =
    response.status === 200 && contentType.includes('text/html')
      ? { name: 'sign-in page', status: 'pass', detail: 'GET /login 200 text/html' }
      : { name: 'sign-in page', status: 'fail', detail: `GET /login answered ${String(response.status)} (${contentType || 'no content type'})` }
  const missing = SECURITY_HEADERS.filter((header) => !response.headers.get(header))
  const problems = missing.length > 0 ? [`missing: ${missing.join(', ')}`] : []
  if (/'unsafe-eval'/.test(response.headers.get('content-security-policy') ?? '')) {
    problems.push("content-security-policy allows 'unsafe-eval'")
  }
  const headers =
    problems.length === 0
      ? { name: 'security headers', status: 'pass', detail: SECURITY_HEADERS.join(', ') }
      : { name: 'security headers', status: 'fail', detail: problems.join('; ') }
  return /** @type {CheckResult[]} */ ([page, headers])
}

/**
 * The newest sign-in code e-mailed to `email` in an `OM_TEST_MODE` e-mail capture (JSON lines; the code e-mail's
 * subject ends with `123 456`), or null.
 * @param {string} text
 * @param {string} email
 * @returns {string | null}
 */
export function latestSignInCode(text, email) {
  let code = null
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue
    /** @type {{ to?: unknown, subject?: unknown }} */
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.to !== email) continue
    const match = /(\d{3}) (\d{3})\s*$/.exec(String(entry.subject))
    if (match) code = `${match[1]}${match[2]}`
  }
  return code
}

/**
 * @typedef {{ baseUrl: string, fetchImpl: FetchLike, email: string, password: string, readCapture?: () => Promise<string> }} SignInOptions
 */

/**
 * Signs in with e-mail and password (form-encoded, as the login page does). A second-factor challenge (#736) is
 * finished with the newest code of `readCapture`'s e-mail capture. Answers the full token or a failure detail.
 * @param {SignInOptions} options
 * @returns {Promise<{ token: string } | { error: string }>}
 */
export async function signIn({ baseUrl, fetchImpl, email, password, readCapture }) {
  const login = await request(fetchImpl, `${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
  })
  const body = login.ok
    ? /** @type {{ token?: unknown, secondFactor?: unknown }} */ (await login.json().catch(() => ({})))
    : {}
  if (typeof body.token !== 'string' || body.token === '') {
    return { error: `sign-in as the smoke account failed (POST /api/auth/login ${String(login.status)})` }
  }
  if (!body.secondFactor) return { token: body.token }
  if (!readCapture) {
    return { error: 'the smoke account must finish a second factor: set VEREINO_SMOKE_EMAIL_CAPTURE or use another account' }
  }
  const code = latestSignInCode(await readCapture(), email)
  if (code === null) return { error: 'no sign-in code for the smoke account in the e-mail capture' }
  const verify = await request(fetchImpl, `${baseUrl}/api/foundation/second-factor/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${body.token}` },
    body: JSON.stringify({ code }),
  })
  const verified = verify.ok ? /** @type {{ token?: unknown }} */ (await verify.json().catch(() => ({}))) : {}
  if (typeof verified.token !== 'string' || verified.token === '') {
    return { error: `the second factor of the smoke account failed (POST /api/foundation/second-factor/verify ${String(verify.status)})` }
  }
  return { token: verified.token }
}

/**
 * @param {{ baseUrl: string, fetchImpl: FetchLike, email?: string, password?: string, readCapture?: () => Promise<string> }} options
 * @returns {Promise<CheckResult>}
 */
export async function checkNoStore({ baseUrl, fetchImpl, email, password, readCapture }) {
  const name = 'no-store'
  if (!email || !password) {
    return { name, status: 'skip', detail: 'set VEREINO_SMOKE_EMAIL and VEREINO_SMOKE_PASSWORD to check it' }
  }
  try {
    const signedIn = await signIn({ baseUrl, fetchImpl, email, password, readCapture })
    if ('error' in signedIn) return { name, status: 'fail', detail: signedIn.error }
    const profile = await request(fetchImpl, `${baseUrl}/api/auth/profile`, {
      headers: { authorization: `Bearer ${signedIn.token}` },
    })
    const cacheControl = profile.headers.get('cache-control') ?? ''
    if (!profile.ok) return { name, status: 'fail', detail: `GET /api/auth/profile answered ${String(profile.status)}` }
    if (/\bno-store\b/i.test(cacheControl)) return { name, status: 'pass', detail: `Cache-Control: ${cacheControl}` }
    return { name, status: 'fail', detail: `GET /api/auth/profile Cache-Control: ${cacheControl || '(none)'}` }
  } catch (error) {
    return { name, status: 'fail', detail: `authenticated request failed: ${describe(error)}` }
  }
}

/**
 * Reads the e-mail capture file named in `VEREINO_SMOKE_EMAIL_CAPTURE` (empty when the file does not exist yet), or
 * undefined when the variable is not set.
 * @param {Record<string, string | undefined>} env
 * @returns {(() => Promise<string>) | undefined}
 */
export function captureReader(env) {
  const file = env.VEREINO_SMOKE_EMAIL_CAPTURE?.trim()
  if (!file) return undefined
  return async () => (fs.existsSync(file) ? fs.promises.readFile(file, 'utf8') : '')
}

/**
 * @param {{ baseUrl: string, fetchImpl: FetchLike, email?: string, password?: string, readCapture?: () => Promise<string> }} options
 * @returns {Promise<CheckResult[]>}
 */
export async function runChecks({ baseUrl, fetchImpl, email, password, readCapture }) {
  return [
    await checkHealth({ baseUrl, fetchImpl }),
    ...(await checkSignInPage({ baseUrl, fetchImpl })),
    await checkNoStore({ baseUrl, fetchImpl, email, password, readCapture }),
  ]
}

/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, fetchImpl?: FetchLike, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {Promise<number>}
 */
export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
  log = (line) => console.log(line),
  error = (line) => console.error(line),
} = {}) {
  const baseUrl = normalizeBaseUrl(argv[0] ?? '')
  if (baseUrl === null) {
    error('usage: node scripts/smoke.mjs <base-url>   (for example https://staging.example.org)')
    return 2
  }
  log(`smoke: ${baseUrl}`)
  const results = await runChecks({
    baseUrl,
    fetchImpl,
    email: env.VEREINO_SMOKE_EMAIL,
    password: env.VEREINO_SMOKE_PASSWORD,
    readCapture: captureReader(env),
  })
  for (const { name, status, detail } of results) log(`  ${status.toUpperCase().padEnd(4)} ${name} — ${detail}`)
  const failed = results.filter((result) => result.status === 'fail').map((result) => result.name)
  if (failed.length === 0) {
    log('smoke: passed')
    return 0
  }
  error(`smoke: failed: ${failed.join(', ')}`)
  return 1
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli()
}
