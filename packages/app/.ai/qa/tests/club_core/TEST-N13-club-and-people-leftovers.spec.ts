import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { birthDateTurning, call, calendarDate, createClub, createPerson, createStaff } from '../_fixtures/club'
import { create, getOne, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { setUserFeatures } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// Navigation spec TEST-N13 (REQ-N12, AC-N12; #262), the club and people leftovers of the panel: "Add section" assigns
// an adult coordinator, the coordinator picker offers adults only and a forged request for a minor answers 422
// `role_requires_adult`; the section's coordinator reads the Coordinators tab; saving Details stays on the record; an
// institution links to its contracts (`?institutionId=`, 400 for a malformed id) with From, Base, Per unit and Match,
// and back; the people list filters by the facility attendant and has an "Import" button; the person header shows age
// and account, and without `people.pesel.view` the PESEL field is empty and disabled with the hint.
test.describe.configure({ timeout: 300_000 })

type PersonItem = { id: string }
type SectionPeople = { _people?: { coordinators: { personId: string }[] } }

const crudInput = (page: Page, id: string) => page.locator(`[data-crud-field-id="${id}"] input`).first()

test('TEST-N13 sections, contracts and people leftovers of the panel', async ({ page, request }) => {
  const club = await createClub(request, 'test-n13-leftovers')
  try {
    page.setDefaultTimeout(30_000)
    let token = club.adminToken
    const ewa = await createStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Siatkowa',
      birthDate: birthDateTurning(35),
    })
    const kuba = await createPerson(request, token, {
      firstName: 'Kuba',
      lastName: 'Siatkowy',
      birthDate: birthDateTurning(15),
    })
    const hall = await create(request, token, 'places', { name: 'Hala N13', kind: 'hall' })
    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Animator',
      role: 'facility_operator',
      placeId: hall,
    })
    const school = await create(request, token, 'institutions', { name: 'Szkoła N13', type: 'school' })
    const other = await create(request, token, 'institutions', { name: 'Gmina N13', type: 'municipality' })
    for (const partyId of [school, other]) {
      const contract = await call(request, 'POST', '/api/club_core/contracts', token, {
        data: { partyType: 'institution', partyId, kind: 'rental', validFrom: calendarDate(-30), validTo: null },
      })
      expect(contract.status, JSON.stringify(contract.body)).toBe(201)
    }
    const coach = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Stawka',
      birthDate: birthDateTurning(40),
    })
    const coachContract = await call(request, 'POST', '/api/club_core/contracts', token, {
      data: {
        partyType: 'person',
        partyId: coach.personId,
        kind: 'coach',
        validFrom: calendarDate(-30),
        validTo: null,
        terms: { baseMonthly: 150000, unitRate: 8000, matchRate: 10000, travelRate: 5000 },
      },
    })
    expect(coachContract.status, JSON.stringify(coachContract.body)).toBe(201)

    // The picker's source offers adults only; a forged assignment of a minor answers 422 on `personId`.
    const adults = await call<{ items?: PersonItem[] }>(
      request,
      'GET',
      '/api/people/persons?ageFrom=18&pageSize=100',
      token,
    )
    const adultIds = (adults.body?.items ?? []).map((item) => item.id)
    expect(adultIds).toContain(ewa.personId)
    expect(adultIds).not.toContain(kuba)
    const probe = await create(request, token, 'sections', { name: 'Sekcja N13' })
    const forged = await call<{ code?: string; fieldErrors?: Record<string, string> }>(
      request,
      'POST',
      '/api/people/role-assignments',
      token,
      { data: { personId: kuba, role: 'coordinator', sectionId: probe, validFrom: calendarDate(0) } },
    )
    expect(forged.status, JSON.stringify(forged.body)).toBe(422)
    expect(forged.body).toMatchObject({ code: 'role_requires_adult' })
    expect(forged.body?.fieldErrors?.personId).toBeTruthy()

    // The role filter lists the facility attendant.
    const attendants = await call<{ items?: PersonItem[] }>(
      request,
      'GET',
      '/api/people/persons?role=facility_operator',
      token,
    )
    expect((attendants.body?.items ?? []).map((item) => item.id)).toEqual([attendant.personId])

    // The contracts of one institution; a malformed id answers 400.
    const byInstitution = await call<{ items?: { partyId: string }[] }>(
      request,
      'GET',
      `/api/club_core/contracts?institutionId=${school}`,
      token,
    )
    expect(byInstitution.status, JSON.stringify(byInstitution.body)).toBe(200)
    expect((byInstitution.body?.items ?? []).map((item) => item.partyId)).toEqual([school])
    expect((await call(request, 'GET', '/api/club_core/contracts?institutionId=not-a-uuid', token)).status).toBe(400)

    // The administrator in the browser (a fresh API token after the sign-in).
    await page.setViewportSize({ width: 1280, height: 900 })
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    token = await getAuthToken(request, club.tenant.email, password)
    club.adminToken = token

    // "Add section" with Ewa as coordinator: the section and the assignment exist.
    await page.goto('/backend/club/sections/create')
    await crudInput(page, 'name').fill('Siatkówka')
    const picker = page.locator('[data-crud-field-id="coordinatorId"]')
    await picker.getByPlaceholder(uiText('club_core.coordinators.fields.person.search')).fill('Siatkow')
    await expect(picker.getByRole('option', { name: /Ewa Siatkowa/ })).toBeVisible()
    await expect(picker.getByRole('option', { name: /Kuba Siatkowy/ })).toHaveCount(0)
    await picker.getByRole('option', { name: /Ewa Siatkowa/ }).click()
    await page
      .getByRole('button', { name: uiText('club_core.common.create', { exact: true }) })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/club\/sections(\?|$)/)
    const sections = await call<{ items?: ({ id: string; name: string } & SectionPeople)[] }>(
      request,
      'GET',
      '/api/club_core/sections?pageSize=100',
      token,
    )
    const volleyball = (sections.body?.items ?? []).find((item) => item.name === 'Siatkówka')
    expect(volleyball?._people?.coordinators.map((item) => item.personId)).toEqual([ewa.personId])
    const sectionId = String(volleyball?.id)

    // Saving Details stays on the record.
    await page.goto(`/backend/club/sections/${sectionId}/edit?tab=details`)
    await crudInput(page, 'name').fill('Siatkówka plażowa')
    await page
      .getByRole('button', { name: uiText('club_core.common.save', { exact: true }) })
      .first()
      .click()
    await expect(page.getByText(uiText('club_core.sections.flash.saved')).first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/backend/club/sections/${sectionId}/edit`))
    await expect(page.getByTestId('section-edit-name')).toHaveText('Siatkówka plażowa')
    expect((await getOne(request, token, 'sections', sectionId))?.name).toBe('Siatkówka plażowa')

    // Institution → its contracts with the rate columns, and back.
    await page.goto('/backend/club/institutions')
    await page.getByTestId(`institution-contracts-${school}`).click()
    await expect(page).toHaveURL(new RegExp(`/backend/club/contracts\\?institutionId=${school}`))
    const banner = page.getByTestId('contracts-institution-filter')
    await expect(banner).toContainText('Szkoła N13')
    await expect(page.getByRole('row').filter({ hasText: 'Gmina N13' })).toHaveCount(0)
    for (const column of ['from', 'base', 'perUnit', 'match'] as const) {
      await expect(
        page.getByRole('columnheader', { name: uiText(`club_core.contracts.columns.${column}`, { exact: true }) }),
      ).toBeVisible()
    }
    await banner
      .getByRole('link', { name: uiText('club_core.contracts.institutionFilter.all', { exact: true }) })
      .click()
    await expect(page.getByRole('row').filter({ hasText: 'Marek Stawka' })).toContainText(/1\s?500,00\s?zł|1,500\.00/)
    await page.goto(`/backend/club/contracts?institutionId=${school}`)
    await page
      .getByTestId('contracts-institution-filter')
      .getByRole('link', { name: uiText('club_core.contracts.institutionFilter.back', { exact: true }) })
      .click()
    await expect(page).toHaveURL(/\/backend\/club\/institutions(\?|$)/)

    // People list: the "Import" button opens the imports page.
    await page.goto('/backend/people/persons')
    await expect(
      page.getByRole('link', { name: uiText('people.persons.actions.import', { exact: true }) }),
    ).toHaveAttribute('href', '/backend/people/imports')

    // The person header: age, and "has an account" for a person with one.
    await page.goto(`/backend/people/persons/${kuba}`)
    await expect(page.getByTestId('person-record-subtitle')).toHaveText(
      uiText('people.persons.record.age.many', { exact: true, params: { count: 15 } }),
    )
    await page.goto(`/backend/people/persons/${ewa.personId}`)
    await expect(page.getByTestId('person-record-subtitle')).toContainText(uiText('people.persons.record.hasAccount'))

    // The section's coordinator reads the Coordinators tab: the list without assign and end.
    await switchBrowserUser(page, request, club, ewa.userId, ewa.email)
    await page.goto(`/backend/club/sections/${sectionId}/edit?tab=coordinators`)
    const panel = page.getByRole('region', { name: uiText('club_core.coordinators.title', { exact: true }) })
    await expect(panel.getByText('Ewa Siatkowa')).toBeVisible()
    await expect(panel.getByRole('button', { name: uiText('club_core.coordinators.actions.assign') })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: uiText('club_core.coordinators.actions.end') })).toHaveCount(0)

    // Without `people.pesel.view`: the PESEL field is empty and disabled with the hint.
    const clerk = await signedInStaff(request, club, { firstName: 'Olga', lastName: 'Biurowa', role: 'club_admin' })
    await setUserFeatures(request, club, clerk.userId, [
      'people.view',
      'people.manage',
      'people.roles.manage',
      'people.accounts.manage',
    ])
    await switchBrowserUser(page, request, club, clerk.userId, clerk.email)
    await page.goto(`/backend/people/persons/${kuba}`)
    const pesel = crudInput(page, 'pesel')
    await expect(pesel).toBeDisabled()
    await expect(pesel).toHaveValue('')
    await expect(page.getByText(uiText('people.persons.fields.pesel.hintOther', { exact: true }))).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
