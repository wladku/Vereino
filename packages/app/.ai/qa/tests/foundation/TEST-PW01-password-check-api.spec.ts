import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { call, uniqueSuffix } from '../_fixtures/club'
import { capturedEmails } from '../_fixtures/members'
import { createIsolatedTenant, type IsolatedTenant } from '../_fixtures/tenant'

// TEST-PW01 (password check spec, REQ-PW01, REQ-PW03, PW-AC-01; #779): every API path that sets a password — the
// administrator's `PUT /api/auth/users`, the user's own `PUT /api/auth/profile` and the reset link's
// `POST /api/auth/reset/confirm` — refuses a common, too long, space-bounded or context-word password with its code and
// stores nothing; a good passphrase passes; the current password is checked exactly as typed. The integration runner
// sets the production policy (12 characters, no character classes).
test.describe.configure({ timeout: 180_000 })

const COMMON = 'Qwerty123456'
const GOOD = () => `blue harbour lantern ${uniqueSuffix()}`
const REFUSED: Array<{ candidate: string; code: string }> = [
  { candidate: COMMON, code: 'password_too_common' },
  { candidate: `${'long passphrase '.repeat(4)}x`, code: 'password_too_long' },
  { candidate: 'ż'.repeat(37), code: 'password_too_long' },
  { candidate: ' blue harbour lantern', code: 'password_whitespace' },
  { candidate: 'Vereino2026!!', code: 'password_context_word' },
  { candidate: 'only eleven', code: 'password_policy' },
]

async function expectSignIn(request: APIRequestContext, email: string, password: string): Promise<void> {
  const response = await request.post('/api/auth/login', { form: { email, password } })
  expect(response.ok(), `sign-in ${String(response.status())}`).toBe(true)
}

test('TEST-PW01 the password check on the admin, profile and reset-link paths', async ({ request }) => {
  const superToken = await getAuthToken(request, 'superadmin')
  let tenant: IsolatedTenant | null = null
  try {
    tenant = await createIsolatedTenant(request, 'test-pw01')
    const { email, userId, organizationId, tenantId } = tenant

    // The administrator path: each refusal answers 422 with its code; the user's password stays unchanged.
    for (const { candidate, code } of REFUSED) {
      const refused = await call(request, 'PUT', '/api/auth/users', superToken, {
        data: { id: userId, password: candidate },
      })
      expect(refused.status, `${code} ${JSON.stringify(refused.body)}`).toBe(422)
      expect(refused.body?.code).toBe(code)
    }
    await expectSignIn(request, email, tenant.password)
    let current = GOOD()
    const set = await call(request, 'PUT', '/api/auth/users', superToken, { data: { id: userId, password: current } })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    await expectSignIn(request, email, current)

    // The user's own change: a current password with a trailing space is not the current password (REQ-PW03).
    const token = await getAuthToken(request, email, current)
    const trimmed = await call(request, 'PUT', '/api/auth/profile', token, {
      data: { currentPassword: `${current} `, password: GOOD() },
    })
    expect(trimmed.status, JSON.stringify(trimmed.body)).toBe(400)
    await expectSignIn(request, email, current)

    // The user's own address and the club's name are context words on this path.
    const localPart = email.split('@')[0]
    const ownAddress = await call(request, 'PUT', '/api/auth/profile', token, {
      data: { currentPassword: current, password: `${localPart}!!` },
    })
    expect(ownAddress.status, JSON.stringify(ownAddress.body)).toBe(422)
    expect(ownAddress.body?.code).toBe('password_context_word')
    const renamed = await call(request, 'PUT', '/api/directory/organizations', superToken, {
      data: { id: organizationId, tenantId, name: 'Klub Sportowy Wrona' },
    })
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    const clubName = await call(request, 'PUT', '/api/auth/profile', token, {
      data: { currentPassword: current, password: 'Wrona Klub Sportowy 2026' },
    })
    expect(clubName.status, JSON.stringify(clubName.body)).toBe(422)
    expect(clubName.body?.code).toBe('password_context_word')
    expect(String(clubName.body?.error).length).toBeGreaterThan(0)

    const next = GOOD()
    const changed = await call(request, 'PUT', '/api/auth/profile', token, {
      data: { currentPassword: current, password: next },
    })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    current = next
    await expectSignIn(request, email, current)

    // The reset link: the same refusals before the platform handler, then a good passphrase sets the password.
    const before = capturedEmails(email).length
    const reset = await request.post('/api/auth/reset', { form: { email } })
    expect(reset.ok(), String(reset.status())).toBe(true)
    // Other e-mails to the address may arrive meanwhile: wait for the one with the reset link.
    const resetLink = () =>
      capturedEmails(email)
        .slice(before)
        .flatMap((entry) => entry.links)
        .find((href) => href.includes('/reset/'))
    await expect.poll(resetLink, { timeout: 20_000 }).toBeTruthy()
    const link = resetLink()
    expect(link).toBeTruthy()
    const resetToken = decodeURIComponent(String(link).split('/reset/')[1].split(/[?#]/)[0])
    for (const { candidate, code } of REFUSED) {
      const refused = await request.post('/api/auth/reset/confirm', {
        form: { token: resetToken, password: candidate },
      })
      expect(refused.status(), code).toBe(422)
      expect(await refused.json()).toMatchObject({ ok: false, code })
    }
    await expectSignIn(request, email, current)
    const fresh = GOOD()
    const confirmed = await request.post('/api/auth/reset/confirm', { form: { token: resetToken, password: fresh } })
    expect(confirmed.status(), await confirmed.text()).toBe(200)
    await expectSignIn(request, email, fresh)
  } finally {
    await tenant?.cleanup()
  }
})
