// Social sign-in test helpers (#566): the identity probe, and the OAuth round trip driven over HTTP with the cookies
// handled by hand — the app runs with NODE_ENV=production, so its cookies are `Secure`, and a hand-kept jar sends
// them to `http://127.0.0.1` the way the browser does for a local origin.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { expect, type APIRequest } from '@playwright/test'
import { APP_ROOT } from '../../../_fixtures/club'

const PROBE = path.join(APP_ROOT, '.ai', 'qa', 'tests', '_fixtures', 'identity-probe', 'probe.mjs')

export type ProbeLink = {
  count: number
  userId: string | null
  tenantId: string | null
  organizationId: string | null
  lastSignedInAt: string | null
  emailStoredPlain: boolean
  emailStored: boolean
}

export function runIdentityProbe(steps: Array<Record<string, unknown> & { op: string }>): unknown[] {
  const run = spawnSync(process.execPath, [PROBE, JSON.stringify({ steps })], {
    cwd: APP_ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  })
  const last = run.stdout.trimEnd().split(/\r?\n/).pop() ?? ''
  if (run.status !== 0 || !last.startsWith('{')) {
    throw new Error(
      `[internal] the identity probe exited ${String(run.status)}: ${run.stderr}\n${run.stdout.slice(-4000)}`,
    )
  }
  const result = JSON.parse(last) as { failure: string | null; outputs: unknown[] }
  if (result.failure) throw new Error(`[internal] identity probe failed: ${result.failure}`)
  return result.outputs
}

export function probeLink(provider: string, subject: string, email?: string): ProbeLink {
  return runIdentityProbe([{ op: 'link', provider, subject, email }])[0] as ProbeLink
}

export function probeUserCount(): number {
  return (runIdentityProbe([{ op: 'userCount' }])[0] as { count: number }).count
}

export function probeClearPassword(userId: string): void {
  runIdentityProbe([{ op: 'clearPassword', userId }])
}

/** A minimal cookie jar: name → value, set from `set-cookie` headers (a `Max-Age=0` removes the cookie). */
export class CookieJar {
  private readonly cookies = new Map<string, string>()

  constructor(initial: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(initial)) this.cookies.set(name, value)
  }

  take(headers: Array<{ name: string; value: string }>): void {
    for (const header of headers) {
      if (header.name.toLowerCase() !== 'set-cookie') continue
      const [pair, ...attributes] = header.value.split(';')
      const index = pair.indexOf('=')
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))
      if (expired || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  get(name: string): string | undefined {
    return this.cookies.get(name)
  }

  set(name: string, value: string): void {
    this.cookies.set(name, value)
  }

  header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

export const STATE_COOKIE = 'vereino_identity_state'

/** One HTTP answer, read before its request context is disposed. */
export type Answer = { status: number; location: string | null; setCookie: string; body: string; url: string }

/**
 * GETs without following redirects, each in a fresh request context, so no cookie of an earlier sign-in (the
 * `request` fixture keeps the cookies of `getAuthToken`) rides along: only the jar's cookies are sent, and the jar
 * takes the answer's cookies.
 */
export type Http = { get(url: string, jar?: CookieJar): Promise<Answer> }

export function cleanHttp(api: APIRequest, baseURL: string): Http {
  return {
    async get(url, jar = new CookieJar()) {
      const context = await api.newContext({ baseURL })
      try {
        const cookie = jar.header()
        const response = await context.get(url, { headers: cookie ? { cookie } : {}, maxRedirects: 0 })
        const headers = response.headersArray()
        jar.take(headers)
        return {
          status: response.status(),
          location: response.headers().location ?? null,
          setCookie: headers
            .filter((header) => header.name.toLowerCase() === 'set-cookie')
            .map((header) => header.value)
            .join('\n'),
          body: await response.text(),
          url: response.url(),
        }
      } finally {
        await context.dispose()
      }
    },
  }
}

export function location(answer: Answer): string {
  expect(answer.location, `redirect from ${answer.url} (${String(answer.status)})`).toBeTruthy()
  return answer.location as string
}

/** The path and query of a redirect target on the app (drops the origin). */
export function appPath(target: string): string {
  const url = new URL(target, 'http://127.0.0.1')
  return `${url.pathname}${url.search}`
}

/** `start` → the fake's `/authorize`; returns the provider URL and the redirect back to the callback. */
export async function startRoundTrip(
  http: Http,
  jar: CookieJar,
  options: { provider?: string; redirect?: string } = {},
): Promise<{ authorizeUrl: string; callbackUrl: string }> {
  const query = options.redirect ? `?redirect=${encodeURIComponent(options.redirect)}` : ''
  const start = await http.get(`/api/foundation/identity/${options.provider ?? 'google'}/start${query}`, jar)
  expect(start.status, start.body).toBe(302)
  expect(jar.get(STATE_COOKIE), 'state cookie set by start').toBeTruthy()
  const authorizeUrl = location(start)
  const authorize = await http.get(authorizeUrl)
  expect(authorize.status).toBe(302)
  return { authorizeUrl, callbackUrl: appPath(location(authorize)) }
}

/** The whole round trip; returns the callback answer (its jar holds the session cookies after a sign-in). */
export async function roundTrip(
  http: Http,
  jar: CookieJar,
  options: { provider?: string; redirect?: string } = {},
): Promise<{ answer: Answer; target: string; callbackUrl: string }> {
  const { callbackUrl } = await startRoundTrip(http, jar, options)
  const answer = await http.get(callbackUrl, jar)
  expect(answer.status, answer.body).toBe(303)
  return { answer, target: appPath(location(answer)), callbackUrl }
}

/** A jar signed in as the token's user (the platform reads `auth_token`). */
export function sessionJar(token: string): CookieJar {
  return new CookieJar({ auth_token: token })
}
