import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createUserFixture } from '@open-mercato/core/helpers/integration/authFixtures'
import {
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createStaff,
  signInAs,
  uniqueSuffix,
} from '../_fixtures/club'
import { getThread, postThread, previewAudience } from '../_fixtures/communication'
import { csvFile, uploadImport } from '../_fixtures/imports'
import { checkOwnPayments } from '../_fixtures/members'

// TEST-155 (#155, follow-up to TEST-076): the refusals written by hand for "the caller has no linked person" answer
// 403 `scope_unlinked` for an account not linked to a person of the club — the member calendar `as=self`, the
// composer's audience preview (also for an unknown target, so nothing reveals whether it exists), a thread read, an
// import upload and the R10 payments gate — and nothing is returned or created. A linked person outside the thread
// still gets 403 `scope_denied`.
test.describe.configure({ timeout: 300_000 })

type Coded = { code?: string; error?: string; id?: string; items?: unknown[] }
type ListBody = { items?: { id: string }[]; total?: number }

const UNLINKED_EN =
  'Your account is not linked to a person of this club, so it has no access to club records. A club administrator must link it. In a new club, the first administrator is set up with: yarn mercato people bootstrap-admin'

test('TEST-155 hand-written "no linked person" refusals answer 403 scope_unlinked; a linked outsider keeps scope_denied', async ({
  request,
}) => {
  const club = await createClub(request, 'test-155')
  try {
    const marker = `Niepowiazany${randomUUID().slice(0, 6)}`
    const thread = await postThread(request, club.adminToken, {
      audience: { kind: 'club' },
      subject: `Ogłoszenie ${marker}`,
      body: 'Treść',
    })
    expect(thread.status, JSON.stringify(thread.body)).toBe(201)
    const threadId = String(thread.body?.threadId)

    // A club administrator account with no person of the club linked to it.
    const email = `unlinked-${uniqueSuffix()}@example.org`
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const unlinkedId = await createUserFixture(request, club.superToken, {
      email,
      password,
      organizationId: club.tenant.organizationId,
      roles: ['vereino_club_admin'],
    })
    club.extraUserIds.push(unlinkedId)
    const unlinkedToken = await getAuthToken(request, email, password)
    const expectUnlinked = (result: { status: number; body: Coded | null }) => {
      expect(result.status, JSON.stringify(result.body)).toBe(403)
      expect(result.body?.code).toBe('scope_unlinked')
      expect(result.body).not.toHaveProperty('items')
      expect(result.body).not.toHaveProperty('id')
    }

    // The member calendar of the caller's own sessions.
    const calendar = await call<Coded>(
      request,
      'GET',
      `/api/activities/calendar?from=${calendarDate()}&to=${calendarDate(7)}&as=self`,
      unlinkedToken,
      { headers: { Cookie: 'locale=en' } },
    )
    expectUnlinked(calendar)
    expect(calendar.body?.error).toBe(UNLINKED_EN)

    // The composer's audience preview: the club, and an unknown section answer alike.
    expectUnlinked(await previewAudience(request, unlinkedToken, { kind: 'club' }))
    expectUnlinked(await previewAudience(request, unlinkedToken, { kind: 'section', ids: [randomUUID()] }))

    // A thread read and a post.
    expectUnlinked(await getThread(request, unlinkedToken, threadId))
    expectUnlinked(
      await postThread(request, unlinkedToken, { audience: { kind: 'club' }, subject: marker, body: 'Treść' }),
    )

    // An import upload: refused, and no import is created.
    const importsBefore = (await call<ListBody>(request, 'GET', '/api/people/imports?pageSize=1', club.adminToken)).body
      ?.total
    expectUnlinked(await uploadImport(request, unlinkedToken, csvFile()))
    const importsAfter = (await call<ListBody>(request, 'GET', '/api/people/imports?pageSize=1', club.adminToken)).body
      ?.total
    expect(importsAfter).toBe(importsBefore)

    // The R10 gate of the caller's own payments.
    expect(checkOwnPayments(club, unlinkedId)).toEqual({ allowed: false, status: 403, code: 'scope_unlinked' })

    // A linked adult who is not a participant of the thread: still 403 `scope_denied`.
    const outsider = await createStaff(request, club, {
      firstName: 'Olek',
      lastName: marker,
      birthDate: birthDateTurning(35),
    })
    const outsiderToken = await signInAs(request, club, outsider.userId, outsider.email)
    const foreign = await getThread(request, outsiderToken, threadId)
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    expect(foreign.body?.code).toBe('scope_denied')
  } finally {
    await club.cleanup()
  }
})
