import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, createClub, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import {
  acceptedRow,
  applicationDetail,
  applicationIn,
  childApplication,
  confirmedApplication,
  createGroup,
  openApplications,
} from '../_fixtures/enrolment'
import { signedInStaff } from '../_fixtures/groups'
import { chargeOf, createFee, generate, listCharges, periodFromNow } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-J08 (section sign-up form spec phase 3, E26-S04 #800; REQ-J14, Q-J06, AC-J08): the accept sheet names the
// group's fee and the rule — the existing schedule charges from the start day, a part month is not reduced — and the
// charge after an acceptance comes from the existing generation: the next month's charge of the accepted child is the
// full monthly fee. The sheet is used on the phone (375 px), in English and Polish, light and dark, without blocking
// axe findings; the acceptance through the sheet ends with the success notice.
test.describe.configure({ timeout: 360_000 })

test('TEST-J08 the accept sheet names the fee and the charge follows the schedule', async ({
  request,
  page,
}, testInfo) => {
  const club = await createClub(request, 'test-j08-fee')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j08-${tag}`
    const sectionSlug = `pilka-${tag}`
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J08' })
    const zaki = await createGroup(request, admin, {
      sectionId: section,
      name: 'Żaki',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 9,
    })
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [zaki] })
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: '2020-01-01',
    })

    const anna = `anna-${tag}@example.test`
    await confirmedApplication(clubSlug, sectionSlug, childApplication(anna, { groupId: zaki, chooseForUs: false }))
    const ola = await applicationIn(request, admin, 'new', 'Ola Nowak')
    const detail = await applicationDetail(request, admin, String(ola?.id))
    expect(detail.status).toBe(200)
    const groups = detail.body?.groups as { id: string; fees: { amount: number; period: string }[] }[]
    expect(groups.find((group) => group.id === zaki)?.fees).toEqual([
      expect.objectContaining({ amount: 15000, period: 'monthly' }),
    ])
    expect(detail.body?.today).toBe(calendarDate())

    // On the phone: the sheet with the fee line, in both languages and colour schemes; accepted through the sheet.
    const desk = await signedInStaff(request, club, { firstName: 'Ala', lastName: `Admin${tag}`, role: 'club_admin' })
    await signInBrowser(page, request, club, desk.userId, desk.email)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl'] as const) {
      await page
        .context()
        .addCookies([{ name: 'locale', value: locale, url: process.env.BASE_URL || 'http://localhost:3000' }])
      await page.goto(`/club/applications/${String(ola?.id)}`)
      await expect(page.getByTestId('enrolment-application')).toBeVisible()
      await page.getByTestId('enrolment-action-accept').click()
      const sheet = page.getByTestId('enrolment-accept-sheet')
      await expect(sheet).toBeVisible()
      const feeLine = sheet.getByTestId('enrolment-accept-fee')
      await expect(feeLine).toContainText('150')
      await expect(feeLine).toContainText(uiText('enrolment.club.accept.feeRule'))
      await expectNoPageOverflow(page, 375)
      Object.assign(
        violations,
        // The scan reloads the page for each colour scheme, so the sheet is opened again.
        await scanInColorSchemes(page, testInfo, `accept sheet (${locale})`, async () => {
          await expect(page.getByTestId('enrolment-application')).toBeVisible()
          await page.getByTestId('enrolment-action-accept').click()
          await expect(sheet.getByTestId('enrolment-accept-fee')).toBeVisible()
        }),
      )
      if (locale === 'en') {
        await sheet.getByRole('button', { name: uiText('enrolment.club.actions.cancel', { exact: true }) }).click()
        await expect(sheet).toBeHidden()
      }
    }
    const sheet = page.getByTestId('enrolment-accept-sheet')
    await sheet.getByTestId('enrolment-accept-guardian-birth-date').fill('1988-05-01')
    await sheet.getByTestId('enrolment-accept-submit').click()
    await expect(page.getByTestId('enrolment-decision-done')).toBeVisible()
    expect(violations).toEqual({})

    const stored = await acceptedRow(club, String(ola?.id))
    expect(stored.state).toBe('accepted')
    const childId = String(stored.accepted_child_person_id)

    // The existing generation charges the next month in full (no part-month rule, Q-J06).
    const period = periodFromNow(1)
    const generated = await generate(request, admin, period)
    expect(generated.status, JSON.stringify(generated.body)).toBe(200)
    const charge = chargeOf(await listCharges(request, admin, `&period=${period}`), childId, fee)
    expect(charge.amountDue).toBe(15000)
  } finally {
    await club.cleanup()
  }
})
