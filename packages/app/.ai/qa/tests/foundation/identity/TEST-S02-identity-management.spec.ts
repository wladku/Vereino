import { expect, test } from '@playwright/test'
import {
  OPTIMISTIC_LOCK_HEADER,
  call,
  createClub,
  createStaff,
  signInAs,
  uniqueSuffix,
  type Club,
} from '../../_fixtures/club'
import { setUserFeatures } from '../../_fixtures/members'
import { startOAuthFake, type OAuthFake } from './_fixtures/google-fake'
import { cleanHttp, probeClearPassword, probeLink, roundTrip, sessionJar } from './_fixtures/identity'

// TEST-S02 (social sign-in spec; REQ-S02, AC-S02; #566): the own list with `canUnlink`; an own unlink with the lock
// token (204; without it 400, with a stale one 409); the last sign-in method kept (409 `identity_last_method`); the
// club administrator lists a person's identities and unlinks another person's link (204); a user without
// `foundation.identity.manage` gets 403 on the administrator's list and on someone else's link; an administrator of
// another tenant gets 404; deleting the platform user removes its links (the `auth.user.deleted` subscriber).
test.describe.configure({ timeout: 300_000, mode: 'serial' })

type IdentityList = {
  items: Array<{ id: string; provider: string; updatedAt: string }>
  canUnlink: boolean
}

let fake: OAuthFake
test.beforeAll(async () => {
  fake = await startOAuthFake()
})
test.afterAll(async () => {
  await fake.stop()
})

test('TEST-S02 identities are listed and unlinked, the last sign-in method is kept and a deleted user loses its links', async ({
  request,
  playwright,
  baseURL,
}) => {
  const http = cleanHttp(playwright.request, String(baseURL))
  const club = await createClub(request, 'test-s02')
  let other: Club | null = null
  try {
    const marker = uniqueSuffix()
    const link = async (token: string, subject: string) => {
      fake.next({ sub: subject, email: `${subject}@gmail.test` })
      expect((await roundTrip(http, sessionJar(token))).target).toBe('/club/profile?identity=linked&provider=google')
    }
    const me = (token: string) => call<IdentityList>(request, 'GET', '/api/foundation/identity/me', token)
    const unlink = (token: string, id: string, updatedAt?: string) =>
      call<{ code?: string }>(request, 'DELETE', `/api/foundation/identity/${id}`, token, {
        headers: updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: updatedAt } : {},
      })

    // A user with a password: one link, removable; without the lock token 400, with a stale one 409, then 204.
    const ewa = await createStaff(request, club, {
      firstName: 'Ewa',
      lastName: `S02${marker}`,
      birthDate: '1984-02-02',
    })
    const ewaToken = await signInAs(request, club, ewa.userId, ewa.email)
    expect((await me(ewaToken)).body?.items).toEqual([])
    await link(ewaToken, `google-ewa-${marker}`)
    const ewaList = (await me(ewaToken)).body as IdentityList
    expect(ewaList.items).toHaveLength(1)
    expect(ewaList.canUnlink).toBe(true)
    const ewaLink = ewaList.items[0]
    expect((await unlink(ewaToken, ewaLink.id)).body?.code).toBe('lock_token_required')
    const stale = await unlink(ewaToken, ewaLink.id, '2020-01-01T00:00:00.000Z')
    expect(stale.status).toBe(409)
    expect(stale.body?.code).toBe('optimistic_lock_conflict')
    expect((await unlink(ewaToken, ewaLink.id, ewaLink.updatedAt)).status).toBe(204)
    expect((await me(ewaToken)).body?.items).toEqual([])
    expect(probeLink('google', `google-ewa-${marker}`).count).toBe(0)

    // A user whose only sign-in method is Google: the link stays (409), for the user and for the administrator.
    const jan = await createStaff(request, club, {
      firstName: 'Jan',
      lastName: `S02${marker}`,
      birthDate: '1979-09-09',
    })
    const janToken = await signInAs(request, club, jan.userId, jan.email)
    await link(janToken, `google-jan-${marker}`)
    probeClearPassword(jan.userId)
    const janList = (await me(janToken)).body as IdentityList
    expect(janList.canUnlink).toBe(false)
    const last = await unlink(janToken, janList.items[0].id, janList.items[0].updatedAt)
    expect(last.status).toBe(409)
    expect(last.body?.code).toBe('identity_last_method')
    const adminLast = await unlink(club.adminToken, janList.items[0].id, janList.items[0].updatedAt)
    expect(adminLast.body?.code).toBe('identity_last_method')

    // The administrator lists a person's identities and unlinks another person's link.
    const ola = await createStaff(request, club, {
      firstName: 'Ola',
      lastName: `S02${marker}`,
      birthDate: '1988-03-03',
    })
    const olaToken = await signInAs(request, club, ola.userId, ola.email)
    await link(olaToken, `google-ola-${marker}`)
    const adminView = await call<IdentityList>(
      request,
      'GET',
      `/api/foundation/identity?personId=${ola.personId}`,
      club.adminToken,
    )
    expect(adminView.status).toBe(200)
    expect(adminView.body?.items).toHaveLength(1)
    expect(adminView.body?.canUnlink).toBe(true)
    const olaLink = (adminView.body as IdentityList).items[0]

    // Without `foundation.identity.manage`: 403 on the administrator's list and on someone else's link.
    const piotr = await createStaff(request, club, {
      firstName: 'Piotr',
      lastName: `S02${marker}`,
      birthDate: '1975-05-05',
    })
    const piotrToken = await signInAs(request, club, piotr.userId, piotr.email)
    await setUserFeatures(request, club, piotr.userId, ['people.self', 'foundation.identity.self'])
    expect((await call(request, 'GET', `/api/foundation/identity?personId=${ola.personId}`, piotrToken)).status).toBe(
      403,
    )
    expect((await unlink(piotrToken, olaLink.id, olaLink.updatedAt)).status).toBe(403)

    // An administrator of another tenant does not find the link.
    other = await createClub(request, 'test-s02-other')
    expect((await unlink(other.adminToken, olaLink.id, olaLink.updatedAt)).status).toBe(404)
    expect(
      (await call(request, 'GET', `/api/foundation/identity?personId=${ola.personId}`, other.adminToken)).status,
    ).not.toBe(200)

    expect((await unlink(club.adminToken, olaLink.id, olaLink.updatedAt)).status).toBe(204)
    expect((await me(olaToken)).body?.items).toEqual([])

    // Deleting the platform user removes its links.
    const deleted = await call(request, 'DELETE', `/api/auth/users?id=${jan.userId}`, club.superToken)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    await expect.poll(() => probeLink('google', `google-jan-${marker}`).count, { timeout: 30_000 }).toBe(0)
  } finally {
    if (other) await other.cleanup()
    await club.cleanup()
  }
})
