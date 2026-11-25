import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

// Issue #738 (E25-S04; engineering standards S8.6): the attempt over the limit in the window answers 429 with
// `Retry-After` on sign-in, password reset and each sessionless route family. The run switches the platform limiter
// off (`OM_INTEGRATION_TEST`); the header `x-om-test-rate-limit: on` hands a request the foundation's enabled
// process-local limiter, through the same code path production uses (the API dispatcher for each route's per-client
// `metadata.rateLimit`, the foundation guard for the per-account and per-token layers).
// - Sign-in: the 11th attempt for one account in 15 minutes (any client) is refused; the platform still answers the
//   first ten (wrong password: 401).
// - Password reset: the 4th request for one address in an hour is refused.
// - Public club pages (`club_core`), public places (`facilities`), personal-link pages (`activities` declaration links,
//   `payments` order links) and the sign-in providers (`foundation`): over the per-client or per-token limit, 429.
// - A personal-link request keeps its uniform 202 over its per-address limit: nothing tells a caller whether the
//   address is known or limited.
// - A request without the header is not counted by the test limiter.
test.describe.configure({ timeout: 300_000 })

const LIMITED = { 'x-om-test-rate-limit': 'on' }

function uniqueEmail(label: string): string {
  return `rl-${label}-${randomUUID()}@example.org`
}

function expectRefusal(response: APIResponse): void {
  expect(response.status()).toBe(429)
  const retryAfter = Number(response.headers()['retry-after'])
  expect(Number.isInteger(retryAfter) && retryAfter > 0, `Retry-After: ${String(retryAfter)}`).toBe(true)
}

/** Sends until the first 429 or `max` attempts; answers the attempt number of the first 429 (0 when none came). */
async function firstRefusal(
  max: number,
  send: () => Promise<APIResponse>,
): Promise<{ attempt: number; response: APIResponse }> {
  let last: APIResponse | null = null
  for (let attempt = 1; attempt <= max; attempt += 1) {
    last = await send()
    if (last.status() === 429) return { attempt, response: last }
  }
  if (!last) throw new Error('no attempt sent')
  return { attempt: 0, response: last }
}

function signIn(request: APIRequestContext, email: string) {
  return request.post('/api/auth/login', {
    form: { email, password: randomBytes(12).toString('hex') },
    headers: LIMITED,
  })
}

test.describe('ISSUE-738 sessionless rate limits', () => {
  test('sign-in refuses the 11th attempt for one account in the window', async ({ request }) => {
    const email = uniqueEmail('signin')
    const { attempt, response } = await firstRefusal(12, () => signIn(request, email))
    expect(attempt).toBe(11)
    expectRefusal(response)
    // A repeated `email` field cannot point the counter at another key: the platform checks the first address.
    const decoyed = await request.post('/api/auth/login', {
      data: new URLSearchParams([
        ['email', email],
        ['email', uniqueEmail('decoy')],
        ['password', randomBytes(12).toString('hex')],
      ]).toString(),
      headers: { ...LIMITED, 'content-type': 'application/x-www-form-urlencoded' },
    })
    expectRefusal(decoyed)
    // Another account is still answered by the platform: the counter is per account.
    const other = await signIn(request, uniqueEmail('signin-other'))
    expect(other.status()).not.toBe(429)
  })

  test('password reset refuses the 4th request for one address in the window', async ({ request }) => {
    const email = uniqueEmail('reset')
    const { attempt, response } = await firstRefusal(5, () =>
      request.post('/api/auth/reset', { form: { email }, headers: LIMITED }),
    )
    expect(attempt).toBe(4)
    expectRefusal(response)
  })

  test('each public route family answers 429 over its limit', async ({ request }) => {
    const slug = `rl-club-${randomBytes(4).toString('hex')}`
    const families: Array<{ name: string; limit: number; path: string }> = [
      { name: 'club_core public club page', limit: 120, path: `/api/club_core/public/${slug}` },
      { name: 'facilities public places', limit: 120, path: `/api/facilities/public/${slug}/places` },
      {
        name: 'activities declaration link page',
        limit: 60,
        path: `/api/activities/declaration-links/${randomBytes(32).toString('base64url')}`,
      },
      {
        name: 'payments order link page',
        limit: 60,
        path: `/api/payments/order-links/${randomBytes(32).toString('base64url')}`,
      },
      { name: 'foundation sign-in providers', limit: 120, path: '/api/foundation/identity/providers' },
    ]
    for (const family of families) {
      const { attempt, response } = await firstRefusal(family.limit + 1, () =>
        request.get(family.path, { headers: LIMITED }),
      )
      expect(attempt, family.name).toBeGreaterThan(0)
      expectRefusal(response)
    }
    // Without the header the test limiter counts nothing (the platform limiter is off in this run).
    const unlimited = await request.get('/api/foundation/identity/providers')
    expect(unlimited.status()).toBe(200)
  })

  test('a personal-link request keeps its uniform 202 over the per-address limit', async ({ request }) => {
    const email = uniqueEmail('link')
    const clubSlug = `rl-club-${randomBytes(4).toString('hex')}`
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request.post('/api/activities/declaration-links', {
        data: { email, clubSlug, occurrencePublicRef: randomUUID() },
        headers: LIMITED,
      })
      expect(response.status(), `attempt ${String(attempt)}`).toBe(202)
      expect(await response.json()).toEqual({ status: 'accepted' })
    }
  })
})
