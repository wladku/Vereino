import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test'
import { createClub, OPTIMISTIC_LOCK_HEADER, type Club } from '../_fixtures/club'
import { startClubDomainApp, type ClubDomainApp } from '../_fixtures/club-domain'
import { getSettings } from '../_fixtures/publication'

// ISSUE-744 (engineering standards S8.9, ENG-Q-11 answered by the owner on 2026-11-26; E25-S10): `src/proxy.ts` refuses
// a cookie-authenticated `/api` mutation from a foreign `Origin` or with `Sec-Fetch-Site: cross-site` with 403 before it
// reaches the handler. The same request from the app's own origin, from a club subdomain of the instance (a second app
// process with `VEREINO_CLUB_DOMAIN`), with a bearer token, and a Stripe webhook still pass.
test.describe.configure({ mode: 'serial', timeout: 600_000 })

const CODE = 'cross_site_request_refused'
const FOREIGN_ORIGIN = 'https://evil.example'

let club: Club
let app: ClubDomainApp | null = null

/** `PUT /api/club_core/settings` changing the contact phone, authenticated by the session cookie only. */
async function putPhoneWithCookie(
  request: APIRequestContext,
  phone: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const current = await getSettings(request, club.adminToken)
  const response = await request.fetch('/api/club_core/settings', {
    method: 'PUT',
    data: { contactPhone: phone },
    headers: {
      cookie: `auth_token=${club.adminToken}`,
      ...(current.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: current.updatedAt } : {}),
      ...headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  return { status: response.status(), body }
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000)
  club = await createClub(request, 'i744')
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await app?.stop()
  await club.cleanup()
})

test('ISSUE-744 a cookie-authenticated mutation from a foreign origin or a cross-site fetch is refused with 403', async ({
  request,
}) => {
  const before = (await getSettings(request, club.adminToken)).contactPhone

  const foreign = await putPhoneWithCookie(request, '+48 600 000 001', { origin: FOREIGN_ORIGIN })
  expect(foreign.status).toBe(403)
  expect(foreign.body.code).toBe(CODE)

  const crossSite = await putPhoneWithCookie(request, '+48 600 000 002', { 'sec-fetch-site': 'cross-site' })
  expect(crossSite.status).toBe(403)
  expect(crossSite.body.code).toBe(CODE)

  const opaque = await putPhoneWithCookie(request, '+48 600 000 003', { origin: 'null' })
  expect(opaque.status).toBe(403)

  // Nothing reached the handler.
  expect((await getSettings(request, club.adminToken)).contactPhone).toBe(before)
})

test('ISSUE-744 the own origin, a bearer token and a Stripe webhook still pass', async ({ request, baseURL }) => {
  const ownOrigin = new URL(baseURL ?? '').origin
  const own = await putPhoneWithCookie(request, '+48 600 000 010', {
    origin: ownOrigin,
    'sec-fetch-site': 'same-origin',
  })
  expect(own.status, JSON.stringify(own.body)).toBe(200)
  expect((await getSettings(request, club.adminToken)).contactPhone).toBe('+48 600 000 010')

  // Bearer-token requests are exempt: a cross-site page cannot send the header without a preflight.
  const bearer = await putPhoneWithCookie(request, '+48 600 000 011', {
    origin: FOREIGN_ORIGIN,
    authorization: `Bearer ${club.adminToken}`,
  })
  expect(bearer.status, JSON.stringify(bearer.body)).toBe(200)

  // The webhook route is exempt (S8.8): it reaches the platform's signature check, which refuses the unsigned body.
  const webhook = await request.post('/api/payment_gateways/webhook/stripe', {
    data: '{"id":"evt_issue_744","type":"payment_intent.succeeded"}',
    headers: {
      'content-type': 'application/json',
      cookie: `auth_token=${club.adminToken}`,
      origin: FOREIGN_ORIGIN,
      'sec-fetch-site': 'cross-site',
    },
  })
  const webhookBody = (await webhook.json().catch(() => ({}))) as Record<string, unknown>
  expect(webhookBody.code).not.toBe(CODE)
  expect(webhook.status(), JSON.stringify(webhookBody)).toBe(401)
})

test('ISSUE-744 a club subdomain of the instance passes, a foreign host does not', async () => {
  test.setTimeout(300_000)
  app = await startClubDomainApp()
  const clubApp = await playwrightRequest.newContext({ baseURL: app.appUrl })
  try {
    const sibling = await putPhoneWithCookie(clubApp, '+48 600 000 020', {
      origin: app.clubUrl('i744-sibling'),
      'sec-fetch-site': 'same-site',
    })
    expect(sibling.status, JSON.stringify(sibling.body)).toBe(200)

    const bare = await putPhoneWithCookie(clubApp, '+48 600 000 021', { origin: app.bareUrl })
    expect(bare.status, JSON.stringify(bare.body)).toBe(200)

    const lookAlike = await putPhoneWithCookie(clubApp, '+48 600 000 022', {
      origin: `http://a.b.${app.domain}`,
      'sec-fetch-site': 'same-site',
    })
    expect(lookAlike.status).toBe(403)
    expect(lookAlike.body.code).toBe(CODE)
    expect((await getSettings(clubApp, club.adminToken)).contactPhone).toBe('+48 600 000 021')
  } finally {
    await clubApp.dispose()
  }
})
