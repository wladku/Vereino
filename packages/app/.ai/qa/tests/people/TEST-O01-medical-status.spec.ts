import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { getAuthToken } from '../_fixtures/auth'
import { familyFor, weeklySeries } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub } from '../_fixtures/club'
import {
  guardianMedicalConsent,
  medicalStatuses,
  personVersion,
  putMedical,
  setGuardianshipMedicalConsent,
  wardOf,
} from '../_fixtures/medical'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { getMe, putMe } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// Training outlines and medical expiry spec, phase 1 (#682; REQ-O01, REQ-O02, AC-O01, AC-O02): TEST-O01 — a guardian
// gives the `medical` consent and sets a ward's date; the administrator sets the date of a ward with a consent and is
// refused (409 `medical_consent_missing`) for one without; staff never give the consent (403
// `medical_consent_subject_only`); a coach cannot write; a coordinator writes for the own section only; a minor cannot
// set their own. The coach of the group reads red / orange / green with the date; the coach of another group reads only
// the players of their own group; ids of another club are left out.
test.describe.configure({ timeout: 420_000 })

test('TEST-O01 medical certificate date: who writes, consent first, and who reads which status', async ({
  request,
}) => {
  const club = await createClub(request, 'test-o01')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const younger = family.younger.personId
    const elder = family.elder.personId
    const otherChild = family.other.child.personId

    // Without a consent nobody stores a date — not even the administrator.
    const refused = await putMedical(
      request,
      admin,
      otherChild,
      calendarDate(60),
      await personVersion(request, admin, otherChild),
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('medical_consent_missing')

    // Staff never give the `medical` consent: the administrator on a guardianship, or on an adult's own consents.
    const otherWard = await wardOf(request, family.other.guardian.token, otherChild)
    const staffConsent = await setGuardianshipMedicalConsent(request, admin, otherWard.guardianship, true)
    expect(staffConsent.status, JSON.stringify(staffConsent.body)).toBe(403)
    expect(staffConsent.body?.code).toBe('medical_consent_subject_only')
    // A guardianship consent change without `medical` still works for the administrator.
    const imageOnly = await call(
      request,
      'POST',
      `/api/people/guardianships/${otherWard.guardianship.id}/consents`,
      admin,
      {
        data: { consents: { image: true, medical: false } },
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(otherWard.guardianship.updatedAt) },
      },
    )
    expect(imageOnly.status, JSON.stringify(imageOnly.body)).toBe(200)

    // The guardian consents for both wards and sets the younger's date: orange (10 days left).
    await guardianMedicalConsent(request, family.guardian.token, younger, true)
    await guardianMedicalConsent(request, family.guardian.token, elder, true)
    const youngerWard = await wardOf(request, family.guardian.token, younger)
    expect(youngerWard.medical).toMatchObject({ consentInForce: true, validUntil: null, status: 'red' })
    const stale = await putMedical(
      request,
      family.guardian.token,
      younger,
      calendarDate(10),
      '2020-01-01T00:00:00.000Z',
    )
    expect(stale.status).toBe(409)
    const set = await putMedical(
      request,
      family.guardian.token,
      younger,
      calendarDate(10),
      youngerWard.medical?.updatedAt ?? null,
    )
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    expect(set.body?.validUntil).toBe(calendarDate(10))

    // The administrator sets the elder's date (a consent is in force): green.
    const adminSet = await putMedical(
      request,
      admin,
      elder,
      calendarDate(90),
      await personVersion(request, admin, elder),
    )
    expect(adminSet.status, JSON.stringify(adminSet.body)).toBe(200)

    // The 16-year-old with an account cannot set their own (422), a coach cannot write at all (403).
    const minorSelf = await putMedical(
      request,
      family.elder.token,
      elder,
      calendarDate(120),
      await personVersion(request, admin, elder),
    )
    expect(minorSelf.status, JSON.stringify(minorSelf.body)).toBe(422)
    expect(minorSelf.body?.code).toBe('consents_minor')
    const coachWrite = await putMedical(
      request,
      family.coach.token,
      younger,
      calendarDate(120),
      await personVersion(request, admin, younger),
    )
    expect(coachWrite.status, JSON.stringify(coachWrite.body)).toBe(403)

    // The coordinator writes for a member of the own section; the pool coordinator not for a Żaki-only player.
    const poolWrite = await putMedical(
      request,
      family.poolCoordinator.token,
      elder,
      calendarDate(91),
      await personVersion(request, admin, elder),
    )
    expect(poolWrite.status, JSON.stringify(poolWrite.body)).toBe(403)
    const academyWrite = await putMedical(
      request,
      family.academyCoordinator.token,
      elder,
      calendarDate(91),
      await personVersion(request, admin, elder),
    )
    expect(academyWrite.status, JSON.stringify(academyWrite.body)).toBe(200)

    // The coach of Żaki reads all three: orange, green, red (missing).
    const ids = [younger, elder, otherChild]
    const coach = await medicalStatuses(request, family.coach.token, ids)
    expect(coach.status).toBe(200)
    expect(coach.byId.get(younger)).toMatchObject({ status: 'orange', state: 'expiring', validUntil: calendarDate(10) })
    expect(coach.byId.get(elder)).toMatchObject({ status: 'green', state: 'valid', validUntil: calendarDate(91) })
    expect(coach.byId.get(otherChild)).toMatchObject({ status: 'red', state: 'missing', validUntil: null })

    // The pool instructor reads only the younger (also in the pool group); a guardian has no `people.medical.view`.
    const instructor = await medicalStatuses(request, family.instructor.token, ids)
    expect(instructor.status).toBe(200)
    expect([...instructor.byId.keys()]).toEqual([younger])
    const guardian = await medicalStatuses(request, family.guardian.token, ids)
    expect(guardian.status).toBe(403)

    // The coach's read was recorded first (ids only, DPIA D-14).
    const logged = await withClient((client) =>
      client.query<{ acting_role: string; resource_ids: string[] }>(
        `select acting_role, resource_ids::text[] as resource_ids from people_data_export_log
          where tenant_id = $1 and organization_id = $2 and purpose = 'medical_status_read'`,
        [club.tenant.tenantId, club.tenant.organizationId],
      ),
    )
    expect(logged.rows.some((row) => row.acting_role === 'coach' && row.resource_ids.includes(otherChild))).toBe(true)

    // An expired date reads red `expired`; clearing reads red `missing`.
    const expired = await putMedical(
      request,
      family.guardian.token,
      younger,
      calendarDate(-1),
      (await wardOf(request, family.guardian.token, younger)).medical?.updatedAt ?? null,
    )
    expect(expired.status, JSON.stringify(expired.body)).toBe(200)
    expect((await medicalStatuses(request, family.coach.token, [younger])).byId.get(younger)).toMatchObject({
      status: 'red',
      state: 'expired',
    })
    const cleared = await putMedical(request, admin, younger, null, await personVersion(request, admin, younger))
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect((await medicalStatuses(request, family.coach.token, [younger])).byId.get(younger)?.state).toBe('missing')
  } finally {
    await club.cleanup()
  }
})

// M-O1, M-O2, M-O4 at 375 px in Polish and English, light and dark (axe): the guardian enters the ward's date on the
// ward page; the coach of Żaki sees the chips on the roster and the attendance list, and "Medical: not valid" leaves the
// red player only.
test('TEST-O01 phone pages: the ward page date, the roster and the attendance chips', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-o01-ui')
  try {
    const family = await familyFor(request, club)
    const younger = family.younger.personId
    const elder = family.elder.personId
    const otherChild = family.other.child.personId
    await guardianMedicalConsent(request, family.guardian.token, younger, true)
    await guardianMedicalConsent(request, family.guardian.token, elder, true)
    const elderSet = await putMedical(
      request,
      family.guardian.token,
      elder,
      calendarDate(12),
      (await wardOf(request, family.guardian.token, elder)).medical?.updatedAt ?? null,
    )
    expect(elderSet.status, JSON.stringify(elderSet.body)).toBe(200)
    const series = await weeklySeries(request, club, club.adminToken, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening O01',
      type: 'training',
      weekday: 'WE',
      start: '17:00',
      end: '18:30',
    })
    const session = series.sessions.at(0)
    if (!session) throw new Error('[test] the series has no session')

    // The guardian's ward page, in both languages: the medical section with its consent, then the date via the form.
    const password = await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    const guardianToken = await getAuthToken(request, family.guardian.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      const me = await getMe(request, guardianToken)
      const saved = await putMe(
        request,
        guardianToken,
        { preferredLocale: locale },
        (me.body as { person?: { updatedAt?: string | null } } | null)?.person?.updatedAt,
      )
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      await page.goto(`/club/wards/${younger}`)
      const section = page.getByTestId('club-medical')
      await expect(section).toContainText(uiText('people.club.medical.title'))
      await expect(page.getByTestId('club-medical-status')).toHaveAttribute('data-medical-status', 'red')
      await expectNoPageOverflow(page, 375)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/club/wards/[personId] medical (${locale})`,
          async () => {
            await expect(page.getByTestId('club-medical')).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.getByTestId('club-medical-date').fill(calendarDate(200))
    await page.getByTestId('club-medical-save').click()
    await expect(page.getByTestId('club-medical-status')).toHaveAttribute('data-medical-status', 'green')

    // The coach of Żaki: chips on the roster (green, orange, red) and the filter "Medical: not valid".
    await switchBrowserUser(page, request, club, family.coach.userId, family.coach.email)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/groups/${family.zaki}`)
    const chip = (testId: string, personId: string) =>
      page.locator(`[data-testid="${testId}"][data-person-id="${personId}"]`)
    await expect(chip('club-group-medical', younger)).toHaveAttribute('data-medical-status', 'green')
    await expect(chip('club-group-medical', elder)).toHaveAttribute('data-medical-status', 'orange')
    await expect(chip('club-group-medical', otherChild)).toHaveAttribute('data-medical-status', 'red')
    await page.getByTestId('club-group-medical-filter').click()
    await expect(page.getByTestId('club-group-medical')).toHaveCount(1)
    await expect(chip('club-group-medical', otherChild)).toBeVisible()
    await expectNoPageOverflow(page, 375)
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        '/club/groups/[id] medical chips',
        async () => {
          await expect(chip('club-group-medical', younger)).toBeVisible()
        },
        { platformBaseline: true },
      ),
    )

    // The attendance list of the next session carries the same chips.
    await page.goto(`/club/occurrences/${session.id}/attendance`)
    await expect(chip('club-attendance-medical', otherChild)).toHaveAttribute('data-medical-status', 'red')
    await expect(chip('club-attendance-medical', elder)).toHaveAttribute('data-medical-status', 'orange')
    await page.getByTestId('club-attendance-medical-filter').click()
    await expect(page.getByTestId('club-attendance-medical')).toHaveCount(1)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
