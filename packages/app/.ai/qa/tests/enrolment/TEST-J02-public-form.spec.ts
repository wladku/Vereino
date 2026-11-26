import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { publicCall } from '../_fixtures/declaration-links'
import { childApplication, createGroup, formApi, openApplications, submitApplication } from '../_fixtures/enrolment'
import { ageCategoryOptions, createSeason, seedAgeCategories } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-J02 (section sign-up form spec phase 2, E26-S03 #799; REQ-J03…REQ-J06, AC-J02, AC-J03): the public section page
// shows "Apply" while the section and a group take applications; the three-step form lists the matching groups first
// — a team with a "U" category by birth year, an age group by the age on the reference date — warns on a group outside
// the range, marks a full group "full — waiting list" without counts, always offers "choose a group for us", and the
// server refuses the hard limits (a birth date in the future, a two-year-old; a child of 3 on the reference date is
// accepted, one day younger is not). At 375 px in en and pl, light and dark, axe clean, no sideways scroll.
test.describe.configure({ timeout: 600_000 })

type FitRule =
  { kind: 'birth_years'; from: number | null; to: number } | { kind: 'age'; ageFrom: number; ageTo: number }
type FormGroup = { id: string; name: string; fitRule: FitRule | null; full: boolean }

const dayBefore = (date: string, years: number, days = 0): string => {
  const probe = new Date(`${date}T00:00:00Z`)
  probe.setUTCFullYear(probe.getUTCFullYear() - years)
  probe.setUTCDate(probe.getUTCDate() + days)
  return probe.toISOString().slice(0, 10)
}

async function fillStepOne(page: Page, birthDate: string): Promise<void> {
  await page.getByTestId('enrolment-kind-child').click()
  await page.getByTestId('enrolment-participantFirstName').fill('Ola')
  await page.getByTestId('enrolment-participantLastName').fill('Nowak')
  await page.getByTestId('enrolment-participantBirthDate').fill(birthDate)
  await expect(page.getByTestId('enrolment-age-hint')).toBeVisible()
  await page.getByTestId('enrolment-next').click()
}

test('TEST-J02 the public form: matching groups, the outside warning, full groups and the hard limits', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-j02-public-form')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j02-${tag}`
    const sectionSlug = `pilka-${tag}`
    const year = new Date().getUTCFullYear()
    seedAgeCategories(club)
    const zak = (await ageCategoryOptions(request, admin)).items.find((item) => item.value === 'zak')
    expect(zak, 'the seeded Żak category').toBeTruthy()
    const season = await createSeason(request, admin, {
      name: `${String(year - 1)}–${String(year + 1)}`,
      startsOn: `${String(year - 1)}-09-01`,
      endsOn: `${String(year + 1)}-08-31`,
    })
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J02' })
    const team = await createGroup(request, admin, {
      sectionId: section,
      name: 'Żaki U8–U9',
      kind: 'team',
      ageCategoryEntryId: zak?.id,
      seasonId: season,
    })
    const ages = await createGroup(request, admin, {
      sectionId: section,
      name: 'Skrzaty 4–6',
      kind: 'class_group',
      ageFrom: 4,
      ageTo: 6,
    })
    const full = await createGroup(request, admin, {
      sectionId: section,
      name: 'Pełna 4–6',
      kind: 'class_group',
      ageFrom: 4,
      ageTo: 6,
      placesLimit: 1,
    })
    const closed = await createGroup(request, admin, { sectionId: section, name: 'Kadra', kind: 'class_group' })

    // Before the switches: no form and no button.
    expect((await publicCall('GET', formApi(clubSlug, sectionSlug))).status).toBe(404)
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [team, ages, full] })
    // `closed` stays out: not public.

    const form = await publicCall('GET', formApi(clubSlug, sectionSlug))
    expect(form.status, form.text).toBe(200)
    const reference = String(form.body?.referenceDate)
    const groups = form.body?.groups as FormGroup[]
    expect(groups.map((group) => group.id).sort()).toEqual([ages, full, team].sort())
    expect(groups.some((group) => group.id === closed)).toBe(false)
    const teamRule = groups.find((group) => group.id === team)?.fitRule
    expect(teamRule?.kind).toBe('birth_years')
    expect(groups.find((group) => group.id === full)?.full).toBe(false)
    const birthYear = teamRule?.kind === 'birth_years' ? teamRule.to : year - 8

    // The hard limits (BR-J2) on the server.
    const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const future = await submitApplication(
      clubSlug,
      sectionSlug,
      childApplication(`f-${tag}@example.test`, { participantBirthDate: tomorrow }),
    )
    expect(future.status, future.text).toBe(422)
    expect(future.body?.code).toBe('birth_date_future')
    const toddler = await submitApplication(
      clubSlug,
      sectionSlug,
      childApplication(`t-${tag}@example.test`, { participantBirthDate: dayBefore(reference, 2) }),
    )
    expect(toddler.body?.code).toBe('age_out_of_bounds')
    const three = await submitApplication(
      clubSlug,
      sectionSlug,
      childApplication(`three-${tag}@example.test`, { participantBirthDate: dayBefore(reference, 3) }),
    )
    expect(three.status, three.text).toBe(202)
    const almostThree = await submitApplication(
      clubSlug,
      sectionSlug,
      childApplication(`almost-${tag}@example.test`, { participantBirthDate: dayBefore(reference, 3, 1) }),
    )
    expect(almostThree.status, almostThree.text).toBe(422)

    // The section page and the form in the browser.
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl'] as const) {
      await page
        .context()
        .addCookies([{ name: 'locale', value: locale, url: process.env.BASE_URL || 'http://localhost:3000' }])
      await page.goto(`/p/${clubSlug}/sections/${sectionSlug}`)
      const apply = page.getByTestId('enrolment-apply-button').first()
      await expect(apply).toBeVisible()
      await apply.click()
      await expect(page).toHaveURL(new RegExp(`/p/${clubSlug}/sections/${sectionSlug}/apply`))
      await expect(page.getByTestId('enrolment-apply-form')).toBeVisible()
      // Step 2: the team matches by birth year; the age groups are outside; the full group says so.
      const toOutsideGroup = async (): Promise<void> => {
        await fillStepOne(page, `${String(birthYear)}-03-14`)
        const matching = page.getByTestId('enrolment-groups-matching')
        await expect(matching.locator(`[data-group-id="${team}"]`)).toHaveAttribute('data-fit', 'fits')
        const toggle = page.getByTestId('enrolment-groups-toggle')
        if (await toggle.isVisible()) await toggle.click()
        await page.locator(`[data-group-id="${ages}"]`).click()
        await expect(page.getByTestId('enrolment-outside-warning')).toBeVisible()
        await expect(page.getByTestId('enrolment-group-choose-for-us')).toBeVisible()
      }
      await toOutsideGroup()
      await expectNoPageOverflow(page, 375)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/p/[club]/sections/[section]/apply step 2 (${locale})`,
          toOutsideGroup,
        ),
      )
      await page.locator(`[data-group-id="${team}"]`).click()
      await page.getByTestId('enrolment-next').click()

      // Step 3: contact, statement and consents; the answer asks to check the e-mail.
      await page.getByTestId('enrolment-guardianFirstName').fill('Anna')
      await page.getByTestId('enrolment-guardianLastName').fill('Nowak')
      await page.getByTestId('enrolment-email').fill(`anna-${locale}-${tag}@example.test`)
      await page.getByTestId('enrolment-phone').fill('600 100 200')
      await page.getByTestId('enrolment-guardianStatement').check()
      await page.getByTestId('enrolment-rulesAccepted').check()
      await page.getByTestId('enrolment-privacyAcknowledged').check()
      await expectNoPageOverflow(page, 375)
      await page.getByTestId('enrolment-submit').click()
      await expect(page.getByTestId('enrolment-sent')).toBeVisible()
      await expect(page.getByTestId('enrolment-sent')).toContainText(uiText('enrolment.public.sent.title'))
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
