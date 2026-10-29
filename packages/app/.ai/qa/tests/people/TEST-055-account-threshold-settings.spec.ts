import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { birthDateTurning, createAccount, createClub, createPerson, uniqueSuffix } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { updateClubSettings } from '../_fixtures/members'

// TEST-055 (club spec *Integration Coverage*), settings part (REQ-002, D-022): a 14-year-old's account under
// `own_account_min_age` 16 and then 13 — 422 at 16, created at 13 — and the person record's "Create account" button,
// which explains the threshold while the person is below it. The checkout and called-up-children parts belong to
// phases 4 and 2.
test.describe.configure({ timeout: 300_000 })

test('TEST-055 settings part: a 14-year-old gets 422 at the default threshold 16 and an account at 13; the button explains the threshold', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-055')
  try {
    const teenId = await createPerson(request, club.adminToken, {
      firstName: 'Julek',
      lastName: 'Progowy',
      birthDate: birthDateTurning(14),
    })
    const email = `julek-${uniqueSuffix()}@example.org`

    // Default 16: refused with the threshold, and the record says why the button is disabled.
    const refused = await createAccount(request, club.adminToken, teenId, email)
    expect(refused.status).toBe(422)
    expect(refused.body).toMatchObject({ code: 'account_age_below_threshold', threshold: 16 })
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, password)
    await page.goto(`/backend/people/persons/${teenId}`)
    await page.getByRole('tab', { name: /^Account$|^Konto$/ }).click()
    await expect(page.getByText(/Below the account age threshold \(16\)|Poniżej progu wieku.*16/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Create account|Utwórz konto/ })).toBeDisabled()

    // Lowered to 13: the same request creates the account; the button is enabled once an address is entered.
    const lowered = await updateClubSettings(request, club.adminToken, { ownAccountMinAge: 13 })
    expect(lowered.status, JSON.stringify(lowered.body)).toBe(200)
    await page.reload()
    await page.getByRole('tab', { name: /^Account$|^Konto$/ }).click()
    await expect(page.getByText(/Below the account age threshold|Poniżej progu wieku/)).toHaveCount(0)
    await page.getByLabel(/E-mail for the invitation|E-mail do zaproszenia/).fill(email)
    await expect(page.getByRole('button', { name: /Create account|Utwórz konto/ })).toBeEnabled()
    const created = await createAccount(request, club.adminToken, teenId, email)
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    club.extraUserIds.push(String(created.body?.userId))
  } finally {
    await club.cleanup()
  }
})
