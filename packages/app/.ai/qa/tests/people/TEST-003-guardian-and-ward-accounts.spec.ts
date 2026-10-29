import { expect, test } from '@playwright/test'
import {
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  expectRoles,
  signInAs,
  uniqueSuffix,
} from '../_fixtures/club'
import { getMe, updateClubSettings } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'

// TEST-003 (club spec *Integration Coverage*; REQ-002): a guardian with an 11-year-old and a 14-year-old child —
// guardianship, consents and account creation. The test club lowers `own_account_min_age` to 13 for the 14-year-old
// fixture (club spec changelog 2026-10-23). The guardian's account gets `vereino_member` + `vereino_payer`, the
// 14-year-old's only `vereino_member`; the 11-year-old → 422; a second primary payer → 409.
test.describe.configure({ timeout: 300_000 })

test('TEST-003 guardian and wards: member + payer for the guardian, member only for the 14-year-old, 11-year-old 422, second primary payer 409', async ({
  request,
}) => {
  const club = await createClub(request, 'test-003')
  try {
    const settings = await updateClubSettings(request, club.adminToken, { ownAccountMinAge: 13 })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)

    const guardianId = await createPerson(request, club.adminToken, {
      firstName: 'Anna',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(39),
    })
    const otherParentId = await createPerson(request, club.adminToken, {
      firstName: 'Tomasz',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(41),
    })
    const elevenId = await createPerson(request, club.adminToken, {
      firstName: 'Ignacy',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(11),
    })
    const fourteenId = await createPerson(request, club.adminToken, {
      firstName: 'Hania',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(14),
    })

    // Guardianship with consents; one primary payer per ward.
    for (const wardId of [elevenId, fourteenId]) {
      await createGuardianship(request, club.adminToken, {
        guardianPersonId: guardianId,
        wardPersonId: wardId,
        isPrimaryPayer: true,
        consents: { regulations: true, image: wardId === fourteenId },
        validFrom: calendarDate(),
      })
    }
    const secondPayer = await createGuardianship(request, club.adminToken, {
      guardianPersonId: otherParentId,
      wardPersonId: elevenId,
      isPrimaryPayer: false,
      validFrom: calendarDate(),
    })
    expect(secondPayer).toBeTruthy()
    const conflicting = await call<{ code?: string }>(request, 'POST', '/api/people/guardianships', club.adminToken, {
      data: {
        guardianPersonId: otherParentId,
        wardPersonId: fourteenId,
        isPrimaryPayer: true,
        validFrom: calendarDate(),
      },
    })
    expect(conflicting.status).toBe(409)
    expect(conflicting.body?.code).toBe('guardianship_primary_payer_conflict')

    // Accounts: the guardian (member + payer), the 14-year-old (member only), the 11-year-old refused.
    const guardianEmail = `anna-${uniqueSuffix()}@example.org`
    const guardian = await createAccount(request, club.adminToken, guardianId, guardianEmail)
    expect(guardian.status, JSON.stringify(guardian.body)).toBe(201)
    const guardianUserId = String(guardian.body?.userId)
    club.extraUserIds.push(guardianUserId)
    const teenEmail = `hania-${uniqueSuffix()}@example.org`
    const teen = await createAccount(request, club.adminToken, fourteenId, teenEmail)
    expect(teen.status, JSON.stringify(teen.body)).toBe(201)
    const teenUserId = String(teen.body?.userId)
    club.extraUserIds.push(teenUserId)
    const eleven = await createAccount(request, club.adminToken, elevenId, `ignacy-${uniqueSuffix()}@example.org`)
    expect(eleven.status).toBe(422)
    expect(eleven.body).toMatchObject({ code: 'account_age_below_threshold', threshold: 13 })
    await expectRoles(request, club, guardianUserId, ['vereino_member', 'vereino_payer'])
    await expectRoles(request, club, teenUserId, ['vereino_member'])

    // The guardian sees both wards with their consents; the 14-year-old sees no ward and no payments.
    const guardianMe = await getMe(request, await signInAs(request, club, guardianUserId, guardianEmail))
    expect(guardianMe.status, JSON.stringify(guardianMe.body)).toBe(200)
    expect(guardianMe.body?.wards.map((ward) => [ward.personId, ward.guardianship.consents.image.granted])).toEqual([
      [fourteenId, true],
      [elevenId, false],
    ])
    expect(guardianMe.body?.wards.every((ward) => ward.guardianship.consents.regulations.granted)).toBe(true)
    const teenMe = await getMe(request, await signInAs(request, club, teenUserId, teenEmail))
    expect(teenMe.body?.wards).toEqual([])
    expect(teenMe.body?.paymentsVisible).toBe(false)
  } finally {
    await club.cleanup()
  }
})
