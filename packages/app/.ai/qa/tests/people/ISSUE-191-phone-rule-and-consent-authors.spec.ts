import { expect, test } from '@playwright/test'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  getPerson,
  signInAs,
} from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { csvFile, familiesCsv, importAction, importRows, previewImport } from '../_fixtures/imports'
import { getMe, updateClubSettings } from '../_fixtures/members'
import { createGuardianship, getGuardianship, setConsents } from '../_fixtures/people'

// Issue #191 (owner decisions of 2026-11-09; club spec DD-47, DD-48): the profile's phone rule (Polish or E.164) also
// holds on the administrator's person form (422 `phone_invalid` with the field error, an unchanged stored value stays
// editable) and in the import (the row is `error` `import_phone_invalid` with its column; the other rows commit); a
// consent author outside the family is shown by role ("Club administrator"), never by name, while a guardian keeps
// their name.
test.describe.configure({ timeout: 300_000 })

test('ISSUE-191 one phone rule on the person form and the import; a consent author outside the family shows as a role', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'issue-191')
  try {
    const token = club.adminToken

    // The person form's API: a phone that is neither Polish nor E.164 is 422 with the field error; valid ones save.
    const refused = await call(request, 'POST', '/api/people/persons', token, {
      data: { firstName: 'Ewa', lastName: 'Telefon', phone: 'call the office' },
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(422)
    expect(refused.body).toMatchObject({ code: 'phone_invalid', fieldErrors: { phone: expect.any(String) } })
    const ewaId = await createPerson(request, token, { firstName: 'Ewa', lastName: 'Telefon', phone: '600 700 800' })
    const ewa = (await getPerson(request, token, ewaId)).body as { updatedAt?: string }
    const badUpdate = await call(request, 'PUT', '/api/people/persons', token, {
      data: { id: ewaId, phone: '12' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(ewa.updatedAt) },
    })
    expect(badUpdate.status, JSON.stringify(badUpdate.body)).toBe(422)
    expect(badUpdate.body).toMatchObject({ code: 'phone_invalid' })
    const goodUpdate = await call<{ updatedAt?: string }>(request, 'PUT', '/api/people/persons', token, {
      data: { id: ewaId, phone: '+49 151 1234 5678', notes: 'unchanged phone is kept' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(ewa.updatedAt) },
    })
    expect(goodUpdate.status, JSON.stringify(goodUpdate.body)).toBe(200)
    expect((await getPerson(request, token, ewaId)).body).toMatchObject({ phone: '+49 151 1234 5678' })

    // The import: the guardian's bad phone makes its row an error naming the column, never the value; the other
    // row commits.
    const sheet = familiesCsv([
      ['Ola', 'Dzwonek', '2016-05-01', null, 'Anna', 'Dzwonek', 'anna.dzwonek@example.org', 'zadzwoń wieczorem', null],
      ['Piotr', 'Dobry', '2016-06-01', null, 'Adam', 'Dobry', 'adam.dobry@example.org', '+48 600 100 200', null],
    ])
    const preview = await previewImport(request, token, csvFile(sheet))
    const rows = await importRows(request, token, preview.id)
    const badRow = rows.find((row) => row.rowNo === 2)
    expect(badRow).toMatchObject({
      classification: 'error',
      errorCode: 'import_phone_invalid',
      errorColumn: 'Telefon rodzica',
    })
    expect(JSON.stringify(badRow)).not.toContain('zadzwoń')
    for (const row of rows.filter((item) => item.needsDecision)) {
      const decided = await call(request, 'PUT', `/api/people/imports/${preview.id}/rows/${row.id}`, token, {
        data: { action: 'create' },
        headers: { [OPTIMISTIC_LOCK_HEADER]: row.updatedAt },
      })
      expect(decided.status, JSON.stringify(decided.body)).toBe(200)
    }
    const current = await call<{ updatedAt?: string }>(request, 'GET', `/api/people/imports/${preview.id}`, token)
    const committed = await importAction(request, token, preview.id, 'commit', current.body?.updatedAt ?? null)
    expect(committed.status, JSON.stringify(committed.body)).toBe(200)
    const after = await importRows(request, token, preview.id)
    expect(after.find((row) => row.rowNo === 2)?.classification).toBe('error')
    expect(after.find((row) => row.rowNo === 3)?.committedAt).toBeTruthy()

    // Consent authors: Kasia (guardian) gives trips, the club administrator gives image on the same guardianship.
    const settings = await updateClubSettings(request, token, { ownAccountMinAge: 13 })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(40),
    })
    const ola = await createStaff(request, club, {
      firstName: 'Ola',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(14),
    })
    const linkId = await createGuardianship(request, token, {
      guardianPersonId: kasia.personId,
      wardPersonId: ola.personId,
      isPrimaryPayer: true,
      validFrom: calendarDate(),
    })
    const kasiaToken = await signInAs(request, club, kasia.userId, kasia.email)
    const link = await getGuardianship(request, kasiaToken, linkId)
    const byKasia = await setConsents(request, kasiaToken, linkId, { trips: true }, link.body?.updatedAt)
    expect(byKasia.status, JSON.stringify(byKasia.body)).toBe(200)
    const byAdmin = await setConsents(request, token, linkId, { image: true }, byKasia.body?.updatedAt)
    expect(byAdmin.status, JSON.stringify(byAdmin.body)).toBe(200)
    const admin = (await getPerson(request, token, club.adminPersonId)).body as { firstName: string; lastName: string }

    // The ward and the guardian both read the administrator as a role, Kasia by name.
    const olaToken = await signInAs(request, club, ola.userId, ola.email)
    const olaMe = await getMe(request, olaToken)
    expect(olaMe.status, JSON.stringify(olaMe.body)).toBe(200)
    const olaConsents = olaMe.body?.guardians[0]?.consents
    expect(olaConsents?.image).toMatchObject({ granted: true, byName: null, byRole: 'club_admin' })
    expect(olaConsents?.trips).toMatchObject({ granted: true, byName: 'Kasia Rodzic', byRole: null })
    expect(JSON.stringify(olaMe.body)).not.toContain(`${admin.firstName} ${admin.lastName}`)
    const kasiaMe = await getMe(request, kasiaToken)
    expect(kasiaMe.body?.wards[0]?.guardianship.consents.image).toMatchObject({ byName: null, byRole: 'club_admin' })

    // The administrator's person form shows the phone error next to the field.
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto('/backend/people/persons/create')
    await page.locator('[data-crud-field-id="firstName"] input').fill('Zenon')
    await page.locator('[data-crud-field-id="lastName"] input').fill('Bezcyfr')
    await page.locator('[data-crud-field-id="phone"] input').fill('abc')
    await page
      .getByRole('button', { name: /^Create$|^Utwórz$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/people\/persons\/create$/)
    await expect(
      page.locator('[data-crud-field-id="phone"]').getByText(/Enter a Polish phone number|Podaj polski numer telefonu/),
    ).toBeVisible()

    // Ola's profile at 375 px: the image consent names the role, the trips consent her mother.
    await page.setViewportSize({ width: 375, height: 812 })
    await switchBrowserUser(page, request, club, ola.userId, ola.email)
    await page.goto('/club/profile')
    const guardian = page.getByTestId('club-profile-guardian').first()
    await expect(guardian.getByTestId('club-consent-image')).toContainText(/Club administrator|Administrator klubu/)
    await expect(guardian.getByTestId('club-consent-trips')).toContainText('Kasia Rodzic')
    await expect(page.locator('body')).not.toContainText(`${admin.firstName} ${admin.lastName}`)
  } finally {
    await club.cleanup()
  }
})
