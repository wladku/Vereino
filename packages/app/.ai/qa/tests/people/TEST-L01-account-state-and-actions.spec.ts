import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  call,
  createAccount,
  createClub,
  createPerson,
  getPerson,
  signInAs,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { acceptInvitation, capturedEmails } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L1 (#303; REQ-L01, REQ-L02, J-L01): TEST-L01 — the account state on the Account tab,
// the invitation sent again (a new working link, 409 for an active account, 429 after three in five minutes, a warning
// when the e-mail fails); TEST-L02 — the login e-mail change (the invitation follows, 409 `email_taken`), block and
// unblock (sessions end, sign-in refused), 422 `last_club_admin`, closing an account (409 `account_has_purpose`);
// TEST-L20 — the new routes fail closed for another tenant and for a user without `people.accounts.manage`.
test.describe.configure({ timeout: 300_000 })

const capturePath =
  process.env.OM_TEST_EMAIL_CAPTURE_PATH?.trim() || path.join(os.tmpdir(), 'open-mercato-email-capture.jsonl')

type Account = { state?: string; email?: string | null; invitedAt?: string | null; lastSignInAt?: string | null }
type PersonBody = { account?: Account; email?: string | null; userId?: string | null; updatedAt?: string }

async function person(request: APIRequestContext, token: string, id: string): Promise<PersonBody> {
  const result = await getPerson(request, token, id)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as PersonBody
}

async function invitedPerson(request: APIRequestContext, club: Club, firstName: string) {
  const personId = await createPerson(request, club.adminToken, {
    firstName,
    lastName: 'Konto L01',
    birthDate: birthDateTurning(30),
  })
  const email = `${firstName.toLowerCase()}-${uniqueSuffix()}@example.org`
  const created = await createAccount(request, club.adminToken, personId, email)
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  const userId = String(created.body?.userId)
  club.extraUserIds.push(userId)
  return { personId, email, userId }
}

function resend(request: APIRequestContext, token: string, personId: string, headers?: Record<string, string>) {
  return call<{ sentAt?: string; warning?: string; code?: string; retryAfterSeconds?: number }>(
    request,
    'POST',
    `/api/people/persons/${personId}/account/invitation`,
    token,
    { data: {}, headers },
  )
}

async function updateAccount(
  request: APIRequestContext,
  token: string,
  personId: string,
  data: { email?: string; blocked?: boolean },
  version?: string,
) {
  const lock = version ?? (await person(request, token, personId)).updatedAt
  return call<{ account?: Account; code?: string; warning?: string }>(
    request,
    'PUT',
    `/api/people/persons/${personId}/account`,
    token,
    { data, headers: { [OPTIMISTIC_LOCK_HEADER]: String(lock) } },
  )
}

function resetLinks(address: string): string[] {
  return capturedEmails(address).flatMap((mail) => mail.links.filter((link) => link.includes('/reset/')))
}

test('TEST-L01 the account state and the invitation sent again', async ({ page, request }) => {
  const club = await createClub(request, 'test-l01')
  try {
    // A new account is invited: no password, never signed in; the person record says so.
    const kasia = await invitedPerson(request, club, 'Kasia')
    const invited = await person(request, club.adminToken, kasia.personId)
    expect(invited.account).toMatchObject({ state: 'invited', email: kasia.email })
    expect(invited.account?.invitedAt).toBeTruthy()
    expect(invited.account?.lastSignInAt).toBeNull()
    await expect.poll(() => resetLinks(kasia.email).length).toBeGreaterThan(0)
    const before = resetLinks(kasia.email).length

    // Send again: 200, a new link in a new e-mail, and the new link sets a password.
    const sent = await resend(request, club.adminToken, kasia.personId)
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect(sent.body?.sentAt).toBeTruthy()
    expect(sent.body?.warning).toBeUndefined()
    await expect.poll(() => resetLinks(kasia.email).length).toBe(before + 1)
    const again = capturedEmails(kasia.email).at(-1)
    expect(again?.text ?? '').toMatch(/60/)
    await acceptInvitation(request, kasia.email)
    expect((await person(request, club.adminToken, kasia.personId)).account?.state).toBe('active')

    // An active account: 409 `invitation_not_pending`.
    const notPending = await resend(request, club.adminToken, kasia.personId)
    expect(notPending.status).toBe(409)
    expect(notPending.body?.code).toBe('invitation_not_pending')

    // No account: 404.
    const noAccountId = await createPerson(request, club.adminToken, { firstName: 'Bez', lastName: 'Konta L01' })
    const noAccount = await resend(request, club.adminToken, noAccountId)
    expect(noAccount.status).toBe(404)
    expect(noAccount.body?.code).toBe('account_not_found')

    // Three re-sends in five minutes, then 429 with the wait (limiter switched on for this request only).
    const jan = await invitedPerson(request, club, 'Jan')
    const limited = { 'x-om-test-rate-limit': 'on' }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ok = await resend(request, club.adminToken, jan.personId, limited)
      expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    }
    const fourth = await resend(request, club.adminToken, jan.personId, limited)
    expect(fourth.status).toBe(429)
    expect(Number(fourth.response.headers()['retry-after'])).toBeGreaterThan(0)
    expect(fourth.body?.retryAfterSeconds).toBeGreaterThan(0)

    // The e-mail fails: 200 with `warning: invite_email_failed`, and the action stays available.
    const ola = await invitedPerson(request, club, 'Ola')
    if (!fs.existsSync(capturePath)) fs.writeFileSync(capturePath, '')
    fs.chmodSync(capturePath, 0o444)
    let failed: Awaited<ReturnType<typeof resend>>
    try {
      failed = await resend(request, club.adminToken, ola.personId)
    } finally {
      fs.chmodSync(capturePath, 0o644)
    }
    expect(failed.status, JSON.stringify(failed.body)).toBe(200)
    expect(failed.body?.warning).toBe('invite_email_failed')
    expect((await person(request, club.adminToken, ola.personId)).account?.state).toBe('invited')

    // The Account tab: the invited state with its date, then "Send the invitation again" → "Sent again today".
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto(`/backend/people/persons/${ola.personId}?tab=account`)
    await expect(page.getByText(uiText('people.account.state.invited', { exact: true }))).toBeVisible()
    await page.getByRole('button', { name: uiText('people.account.actions.resend') }).click()
    await expect(page.getByText(uiText('people.account.sentAgain'))).toBeVisible()
    // The active account shows no re-send.
    await page.goto(`/backend/people/persons/${kasia.personId}?tab=account`)
    await expect(page.getByText(uiText('people.account.state.active', { exact: true }))).toBeVisible()
    await expect(page.getByRole('button', { name: uiText('people.account.actions.resend') })).toHaveCount(0)
  } finally {
    if (fs.existsSync(capturePath)) fs.chmodSync(capturePath, 0o644)
    await club.cleanup()
  }
})

test('TEST-L02 login e-mail, block and unblock, last administrator, closing an account', async ({ request }) => {
  const club = await createClub(request, 'test-l02')
  try {
    // Invited: the new login gets the invitation; the contact e-mail followed because it equalled the old login.
    const ewa = await invitedPerson(request, club, 'Ewa')
    const newEmail = `ewa-new-${uniqueSuffix()}@example.org`
    const changed = await updateAccount(request, club.adminToken, ewa.personId, { email: newEmail })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body?.account).toMatchObject({ state: 'invited', email: newEmail })
    await expect.poll(() => resetLinks(newEmail).length).toBeGreaterThan(0)
    expect((await person(request, club.adminToken, ewa.personId)).email).toBe(newEmail)

    // An address used in the tenant: 409 `email_taken`; a stale version: 409.
    const taken = await updateAccount(request, club.adminToken, ewa.personId, { email: club.tenant.email })
    expect(taken.status).toBe(409)
    expect(taken.body?.code).toBe('email_taken')
    const stale = await updateAccount(
      request,
      club.adminToken,
      ewa.personId,
      { email: `ewa-stale-${uniqueSuffix()}@example.org` },
      '2020-01-01T00:00:00.000Z',
    )
    expect(stale.status).toBe(409)

    // Active: block ends the session and refuses sign-in; unblock lets the person in again; roles stay.
    const piotr = await invitedPerson(request, club, 'Piotr')
    const piotrToken = await signInAs(request, club, piotr.userId, piotr.email)
    expect((await call(request, 'GET', '/api/people/me', piotrToken)).status).not.toBe(401)
    const blocked = await updateAccount(request, club.adminToken, piotr.personId, { blocked: true })
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(200)
    expect(blocked.body?.account?.state).toBe('blocked')
    expect((await call(request, 'GET', '/api/people/me', piotrToken)).status).toBe(401)
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const reset = await call(request, 'PUT', '/api/auth/users', club.superToken, {
      data: { id: piotr.userId, password, isConfirmed: false },
    })
    expect(reset.status, JSON.stringify(reset.body)).toBe(200)
    const refused = await request.post('/api/auth/login', { form: { email: piotr.email, password } })
    expect(refused.ok()).toBe(false)
    const unblocked = await updateAccount(request, club.adminToken, piotr.personId, { blocked: false })
    expect(unblocked.status, JSON.stringify(unblocked.body)).toBe(200)
    expect(unblocked.body?.account?.state).toBe('active')
    expect(await getAuthToken(request, piotr.email, password)).toBeTruthy()

    // The club's only active administrator can be neither blocked nor closed.
    const lastAdmin = await updateAccount(request, club.adminToken, club.adminPersonId, { blocked: true })
    expect(lastAdmin.status).toBe(422)
    expect(lastAdmin.body?.code).toBe('last_club_admin')
    const lastAdminClose = await call(
      request,
      'DELETE',
      `/api/people/persons/${club.adminPersonId}/account`,
      club.adminToken,
    )
    expect(lastAdminClose.status).toBe(422)
    expect((lastAdminClose.body as { code?: string } | null)?.code).toBe('last_club_admin')

    // With a second active administrator, the first one may block the second.
    const second = await signedInStaff(request, club, { firstName: 'Druga', lastName: 'Admin L02', role: 'club_admin' })
    const blockSecond = await updateAccount(request, club.adminToken, second.personId, { blocked: true })
    expect(blockSecond.status, JSON.stringify(blockSecond.body)).toBe(200)

    // Closing: refused while a role remains; done for a person without any.
    const roleHolder = await call(request, 'DELETE', `/api/people/persons/${second.personId}/account`, club.adminToken)
    expect(roleHolder.status).toBe(409)
    expect((roleHolder.body as { code?: string } | null)?.code).toBe('account_has_purpose')
    const closed = await call(request, 'DELETE', `/api/people/persons/${ewa.personId}/account`, club.adminToken)
    expect(closed.status, JSON.stringify(closed.body)).toBe(204)
    const afterClose = await person(request, club.adminToken, ewa.personId)
    expect(afterClose.userId).toBeNull()
    expect(afterClose.account?.state).toBe('none')
  } finally {
    await club.cleanup()
  }
})

test('TEST-L20 the account routes fail closed for another club and without people.accounts.manage', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l20-a')
  const other = await createClub(request, 'test-l20-b')
  try {
    const target = await invitedPerson(request, club, 'Cel')
    const lock = String((await person(request, club.adminToken, target.personId)).updatedAt)
    const attempts = (token: string) => [
      resend(request, token, target.personId),
      call(request, 'PUT', `/api/people/persons/${target.personId}/account`, token, {
        data: { blocked: true },
        headers: { [OPTIMISTIC_LOCK_HEADER]: lock },
      }),
      call(request, 'DELETE', `/api/people/persons/${target.personId}/account`, token),
    ]
    for (const result of await Promise.all(attempts(other.adminToken))) {
      expect([403, 404], JSON.stringify(result.body)).toContain(result.status)
    }
    const coach = await signedInStaff(request, club, { firstName: 'Trener', lastName: 'L20', role: 'coach' })
    for (const result of await Promise.all(attempts(coach.token))) {
      expect(result.status, JSON.stringify(result.body)).toBe(403)
    }
    const unchanged = await person(request, club.adminToken, target.personId)
    expect(unchanged.account?.state).toBe('invited')
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
