// Password sign-in for the integration suite, with the staff second factor (`.ai/specs/2026-11-26-vereino-staff-second-
// factor.md` DD-2F09, *Integration Coverage*; #736). A club administrator, a treasurer and the platform super-admin get
// a provisional token and an e-mailed code; these helpers read the code from the `OM_TEST_MODE` e-mail capture and
// complete the challenge, exactly as a person would. No bypass exists in the app.
//
// `getAuthToken` keeps the platform helper's signature (`@open-mercato/core/helpers/integration/api`) and its per-worker
// token cache, so specs switch by changing the import only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { DEFAULT_CREDENTIALS, type Role } from '@open-mercato/core/helpers/integration/auth'

// Read here rather than through `messaging.ts`, which imports `club.ts`: `club.ts` imports this file, and the cycle
// would leave `messaging.ts` without `APP_ROOT` at load time.
const capturePath =
  process.env.OM_TEST_EMAIL_CAPTURE_PATH?.trim() || path.join(os.tmpdir(), 'open-mercato-email-capture.jsonl')

/** The subjects of every captured e-mail to `email`, oldest first. */
function capturedSubjects(email: string): string[] {
  if (!fs.existsSync(capturePath)) return []
  return fs
    .readFileSync(capturePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as { to: string; subject: string })
    .filter((entry) => entry.to === email)
    .map((entry) => entry.subject)
}

const BASE_URL = process.env.BASE_URL?.trim() || null

function resolveUrl(path: string): string {
  return BASE_URL ? `${BASE_URL}${path}` : path
}

export type JsonBody = Record<string, unknown> | null

/** A string field of a JSON body, or '' when it is missing or not a string. */
export function textOf(body: JsonBody, field: string): string {
  const value = body?.[field]
  return typeof value === 'string' ? value : ''
}

/** One password sign-in answer: the status and the JSON body. */
export type LoginAnswer = { status: number; body: JsonBody }

async function jsonOf(response: { text(): Promise<string> }): Promise<JsonBody> {
  const raw = await response.text()
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** `POST /api/auth/login` with a form; no retry, no second factor. */
export async function postLogin(
  request: APIRequestContext,
  email: string,
  password: string,
  extra: Record<string, string> = {},
  headers: Record<string, string> = {},
): Promise<LoginAnswer> {
  const response = await request.post(resolveUrl('/api/auth/login'), {
    form: { email, password, ...extra },
    headers,
  })
  return { status: response.status(), body: await jsonOf(response) }
}

/** True when a sign-in answer is a second-factor challenge. */
export function isChallenge(answer: LoginAnswer): boolean {
  return answer.status === 200 && typeof answer.body?.secondFactor === 'object' && answer.body.secondFactor !== null
}

/** The sign-in codes e-mailed to `email`, from the `since`-th captured message on, newest first. */
export function capturedCodes(email: string, since = 0): string[] {
  return capturedSubjects(email)
    .slice(since)
    .map((subject) => /(\d{3}) (\d{3})\s*$/.exec(subject))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => `${match[1]}${match[2]}`)
    .reverse()
}

/** How many e-mails the capture holds for `email` now (take it before a sign-in, pass it as `since`). */
export function capturedCount(email: string): number {
  return capturedSubjects(email).length
}

/** `POST /api/foundation/second-factor/verify` with the provisional token. */
export async function postVerify(request: APIRequestContext, provisionalToken: string, code: string) {
  const response = await request.post(resolveUrl('/api/foundation/second-factor/verify'), {
    headers: { Authorization: `Bearer ${provisionalToken}`, 'Content-Type': 'application/json' },
    data: { code },
  })
  return { status: response.status(), body: await jsonOf(response) }
}

/**
 * Completes a challenge: waits for the code e-mailed after `since`, then verifies it. Parallel workers signing in the
 * same account (the super-admin) each get their own code; a code of another challenge is answered 400 and the next
 * newest one is tried (five attempts per challenge leave room for that). Returns the full token.
 */
export async function completeSecondFactor(
  request: APIRequestContext,
  email: string,
  provisionalToken: string,
  since: number,
): Promise<string> {
  return (await completeSecondFactorAnswer(request, email, provisionalToken, since)).token
}

/** `completeSecondFactor` with the landing path the sign-in was heading to. */
export async function completeSecondFactorAnswer(
  request: APIRequestContext,
  email: string,
  provisionalToken: string,
  since: number,
): Promise<{ token: string; redirect: string }> {
  const tried = new Set<string>()
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    for (const code of capturedCodes(email, since)) {
      if (tried.has(code)) continue
      tried.add(code)
      const answer = await postVerify(request, provisionalToken, code)
      if (answer.status === 200 && typeof answer.body?.token === 'string') {
        return { token: answer.body.token, redirect: textOf(answer.body, 'redirect') }
      }
      if (answer.status !== 400) {
        throw new Error(`Second-factor verify failed (status ${String(answer.status)}): ${JSON.stringify(answer.body)}`)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No usable sign-in code for ${email} in the e-mail capture`)
}

/**
 * Signs `email` in with the password and completes the second factor when the account is challenged; retries a 429
 * like the platform helper (1 s, 2 s, 4 s). Returns the full token, or throws with the last status.
 */
export async function signInWithPassword(
  request: APIRequestContext,
  email: string,
  password: string,
  extra: Record<string, string> = {},
): Promise<string> {
  let lastStatus = 0
  for (let retry = 0; retry < 4; retry += 1) {
    const since = capturedCount(email)
    const answer = await postLogin(request, email, password, extra)
    lastStatus = answer.status
    if (isChallenge(answer) && typeof answer.body?.token === 'string') {
      return completeSecondFactor(request, email, answer.body.token, since)
    }
    if (answer.status === 200 && typeof answer.body?.token === 'string') return answer.body.token
    if (answer.status !== 429) break
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** retry))
  }
  throw new Error(`Failed to obtain auth token (status ${String(lastStatus)})`)
}

/** The seeded platform accounts' password, as the platform helper assumes it (`DEFAULT_CREDENTIALS.admin`). */
const SEEDED_PASSWORD = DEFAULT_CREDENTIALS.admin.password

const tokenCache = new Map<string, { token: string; mintedAt: number }>()
const TOKEN_TTL_MS = 45 * 60 * 1000

/** Drops cached tokens (as the platform helper's `clearAuthTokenCache`), e.g. after sessions of a cached user end. */
export function clearAuthTokenCache(): void {
  tokenCache.clear()
}

/**
 * The platform helper's `getAuthToken`, completing the second factor: a role name of `DEFAULT_CREDENTIALS` (with the
 * `<role>@acme.com` / `secret` fallback when no password is given) or an e-mail and a password (default `secret`).
 * Tokens are cached per worker for 45 minutes.
 */
export async function getAuthToken(
  request: APIRequestContext,
  roleOrEmail: string = 'admin',
  password?: string,
): Promise<string> {
  const role = roleOrEmail in DEFAULT_CREDENTIALS ? (roleOrEmail as Role) : null
  const attempts: Array<{ email: string; password: string }> = []
  if (role) {
    attempts.push({ email: DEFAULT_CREDENTIALS[role].email, password: password ?? DEFAULT_CREDENTIALS[role].password })
    if (!password) attempts.push({ email: `${role}@acme.com`, password: SEEDED_PASSWORD })
  } else {
    attempts.push({ email: roleOrEmail, password: password ?? SEEDED_PASSWORD })
  }
  const cacheKey = attempts.map((entry) => `${entry.email}:${entry.password}`).join('|')
  const cached = tokenCache.get(cacheKey)
  if (cached && Date.now() - cached.mintedAt < TOKEN_TTL_MS) return cached.token
  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const token = await signInWithPassword(request, attempt.email, attempt.password)
      tokenCache.set(cacheKey, { token, mintedAt: Date.now() })
      return token
    } catch (error: unknown) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to obtain auth token')
}

/**
 * A browser sign-in through `page.request` (cookies land in the page's context): the password, then the e-mailed code
 * when the account is challenged. Asserts success.
 */
export async function signInBrowserContext(
  request: APIRequestContext,
  email: string,
  password: string,
  extra: Record<string, string> = {},
): Promise<string> {
  return (await signInBrowserAnswer(request, email, password, extra)).token
}

/** `signInBrowserContext` with the landing path: the platform's, or the one after the second factor. */
export async function signInBrowserAnswer(
  request: APIRequestContext,
  email: string,
  password: string,
  extra: Record<string, string> = {},
): Promise<{ token: string; redirect: string }> {
  const since = capturedCount(email)
  const answer = await postLogin(request, email, password, extra)
  expect(answer.status, `POST /api/auth/login ${String(answer.status)} ${JSON.stringify(answer.body)}`).toBe(200)
  const token = textOf(answer.body, 'token')
  if (!isChallenge(answer)) return { token, redirect: textOf(answer.body, 'redirect') }
  return completeSecondFactorAnswer(request, email, token, since)
}

/** The newest code e-mailed to `email` after `since`, waiting up to 30 s for it. */
export async function waitForCode(email: string, since: number): Promise<string> {
  let code: string | undefined
  await expect
    .poll(() => (code = capturedCodes(email, since)[0]), { timeout: 30_000, message: `sign-in code for ${email}` })
    .toBeDefined()
  return String(code)
}

/**
 * After a sign-in typed into the `/login` form: waits until the app left `/login`; when it landed on
 * `/login/second-factor`, types the e-mailed code (from `since`) and waits until it left again.
 */
export async function finishSignInOnPage(page: Page, email: string, since: number): Promise<void> {
  const signedIn = (url: URL) => !url.pathname.startsWith('/login')
  await page.waitForURL((url) => signedIn(url) || url.pathname === '/login/second-factor', { timeout: 30_000 })
  if (new URL(page.url()).pathname !== '/login/second-factor') return
  const field = page.getByTestId('second-factor-code')
  await field.fill(await waitForCode(email, since))
  await field.press('Enter')
  await page.waitForURL(signedIn, { timeout: 30_000 })
}
