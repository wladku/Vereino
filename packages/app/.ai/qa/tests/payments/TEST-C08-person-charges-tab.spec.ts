import { expect, test } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { birthDateTurning, call, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'
import { listCharges, type CodedBody } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-C08 and the person-tab part of TEST-C02 (payments parity spec phase 5, REQ-C06, REQ-C07, AC-C07, DD-C05;
// issue #295 E12-S05): Kasia owes two charges herself and pays a third, her son's.
// - `GET /api/payments/charges?involvesPersonId=` lists the three; another tenant's administrator gets an empty list for
//   the same id, and a coordinator (no `payments.view`) is refused.
// - B-10 as the administrator: `?tab=charges` opens the "Charges" tab with three rows in the B-21 columns; "Add charge"
//   adds a fourth for Kasia; a row opens B-22.
// - B-10 as a coordinator: no "Charges" tab.
test.describe.configure({ timeout: 300_000 })

type CreateBody = CodedBody & { chargeId?: string; payerMissing?: boolean }

test('TEST-C08 the person record shows the charges a person owes or pays and adds one', async ({ page, request }) => {
  const club = await createClub(request, 'test-c08')
  const otherClub = await createClub(request, 'test-c08-other')
  try {
    let admin = club.adminToken
    const kasia = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Nowak',
      birthDate: birthDateTurning(38),
    })
    const jas = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Nowak',
      birthDate: birthDateTurning(9),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: kasia,
      wardPersonId: jas,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: calendarDate(-30),
    })
    const add = async (personId: string, description: string, amount: number) => {
      const created = await call<CreateBody>(request, 'POST', '/api/payments/charges', admin, {
        data: { personId, description, amount, dueDate: calendarDate(14) },
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      expect(created.body?.payerMissing).toBe(false)
      return String(created.body?.chargeId)
    }
    const kasiaOwn = [await add(kasia, 'Składka członkowska dorosłych', 5000), await add(kasia, 'Koszulka', 8000)]
    const jasCharge = await add(jas, 'Opłata za turniej', 4000)

    const involved = await listCharges(request, admin, `&involvesPersonId=${kasia}`)
    expect(involved.map((charge) => charge.id).sort()).toEqual([...kasiaOwn, jasCharge].sort())
    expect(involved.find((charge) => charge.id === jasCharge)).toMatchObject({ personId: jas, payerPersonId: kasia })
    // Another tenant: the same person id lists nothing (TEST-C02).
    expect(await listCharges(request, otherClub.adminToken, `&involvesPersonId=${kasia}`)).toEqual([])
    // Kasia plays in the coordinator's section, so the coordinator may open her record.
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
    const seniors = await createGroup(request, admin, { sectionId: academy, name: 'Seniorki', kind: 'team' })
    await addMembership(request, admin, {
      groupId: seniors,
      personId: kasia,
      role: 'participant',
      validFrom: calendarDate(-30),
    })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Celina',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })
    const refused = await call(request, 'GET', `/api/payments/charges?involvesPersonId=${kasia}`, coordinator.token)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)

    // B-10 as the administrator: the tab, its rows, "Add charge" and a row opening B-22.
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto(`/backend/people/persons/${kasia}?tab=charges`)
    const chargesTab = page.getByRole('tab', { name: uiText('people.persons.tabs.charges', { exact: true }) })
    await expect(chargesTab).toHaveAttribute('aria-selected', 'true')
    const panel = page.getByTestId('person-charges')
    await expect(panel.getByTestId('charge-open')).toHaveCount(3)
    for (const column of ['person', 'description', 'payer', 'amountDue', 'remaining', 'dueDate', 'status']) {
      await expect(
        panel.getByRole('columnheader', { name: uiText(`payments.charges.columns.${column}`, { exact: true }) }),
      ).toBeVisible()
    }
    await panel.getByTestId('person-add-charge-open').click()
    const dialog = page.getByTestId('add-charge-dialog')
    await expect(dialog.getByTestId('add-charge-person')).toHaveCount(0)
    await dialog.getByTestId('add-charge-description').fill('Opłata za obóz')
    await dialog.getByTestId('add-charge-amount').fill('40')
    await dialog.getByTestId('add-charge-confirm').click()
    await expect(dialog).toBeHidden()
    await expect(panel.getByTestId('charge-open')).toHaveCount(4)
    const added = (await listCharges(request, admin, `&involvesPersonId=${kasia}`)).find(
      (charge) => charge.description === 'Opłata za obóz',
    )
    expect(added).toMatchObject({ personId: kasia, payerPersonId: kasia, amount: 4000, sourceType: 'manual' })
    await panel.getByTestId('charge-open').filter({ hasText: 'Opłata za turniej' }).click()
    await expect(page).toHaveURL(new RegExp(`/backend/payments/charges/${jasCharge}$`))
    await expect(page.getByTestId('charge-title')).toHaveText('Opłata za turniej')

    // B-10 as a coordinator: no "Charges" tab, also with `?tab=charges`.
    await switchBrowserUser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto(`/backend/people/persons/${kasia}?tab=charges`)
    await expect(
      page.getByRole('tab', { name: uiText('people.persons.tabs.details', { exact: true }) }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: uiText('people.persons.tabs.charges', { exact: true }) })).toHaveCount(0)
  } finally {
    await otherClub.cleanup()
    await club.cleanup()
  }
})
