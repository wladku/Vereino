import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { memberAccount } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { OPTIMISTIC_LOCK_HEADER, birthDateTurning, call, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L7 (#309; REQ-L10, DD-L11, AC-L11): TEST-L12 — the club administrator changes the
// wording of the regulations consent on B-02 (`PUT /api/club_core/settings` `consentTexts`); the read returns the text
// with the instant of the change; the adult participant's phone profile shows the club's text, and the consent given
// before the change reads "given to an earlier wording" and stays given; 1001 characters answer 422
// `consent_text_too_long` on the field; an unchanged text keeps its instant; an empty one restores the built-in text.
// B-02 shows the text with "last changed". The phone profile at 375 px in Polish and English, light and dark (axe).
// TEST-L20 — a coordinator cannot change the texts (403).
test.describe.configure({ timeout: 300_000 })

type TextEntry = { text: string; changedAt: string }
type SettingsBody = { consentTexts?: Record<string, TextEntry>; updatedAt?: string | null; code?: string }
type FieldErrorBody = SettingsBody & { fieldErrors?: Record<string, string> }

async function readSettings(request: APIRequestContext, token: string) {
  const settings = await call<SettingsBody>(request, 'GET', '/api/club_core/settings', token)
  expect(settings.status, JSON.stringify(settings.body)).toBe(200)
  return settings.body as SettingsBody
}

test('TEST-L12 the club changes a consent text; an earlier consent reads "given to an earlier wording" and stays valid', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l12')
  try {
    const admin = club.adminToken
    const adultId = await createPerson(request, admin, {
      firstName: 'Celina',
      lastName: 'Dorosla L12',
      birthDate: birthDateTurning(30),
    })
    const adult = await memberAccount(request, club, adultId, 'celina-l12')

    // The adult gives the regulations consent to the built-in wording.
    const me = await getMe(request, adult.token)
    const given = await call<{ consents?: { regulations: { granted: boolean; at: string } } }>(
      request,
      'PUT',
      '/api/people/me/consents',
      adult.token,
      {
        data: { changes: { regulations: true } },
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(me.body?.person?.updatedAt) },
      },
    )
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    const givenAt = String(given.body?.consents?.regulations.at)
    expect((await readSettings(request, admin)).consentTexts).toEqual({})

    // The club's own wording: the read returns it with the instant of the change.
    const wording = 'Akceptuję regulamin klubu w wersji z listopada 2026 r.'
    const changed = await updateClubSettings(request, admin, { consentTexts: { regulations: `  ${wording}  ` } })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    const afterChange = await readSettings(request, admin)
    const regulations = afterChange.consentTexts?.regulations as TextEntry
    expect(regulations.text).toBe(wording)
    expect(Date.parse(regulations.changedAt)).toBeGreaterThan(Date.parse(givenAt))

    // The same wording again keeps the instant; 1001 characters answer 422 on the field.
    const same = await updateClubSettings(request, admin, { consentTexts: { regulations: wording } })
    expect(same.status).toBe(200)
    expect((await readSettings(request, admin)).consentTexts?.regulations?.changedAt).toBe(regulations.changedAt)
    const tooLong = await updateClubSettings(request, admin, { consentTexts: { image: 'x'.repeat(1001) } })
    expect(tooLong.status).toBe(422)
    const tooLongBody: FieldErrorBody | null = tooLong.body
    expect(tooLongBody?.code).toBe('consent_text_too_long')
    expect(Object.keys(tooLongBody?.fieldErrors ?? {})).toEqual(['consentTexts.image'])
    expect((await readSettings(request, admin)).consentTexts).not.toHaveProperty('image')

    // TEST-L20: a coordinator cannot change the texts.
    const section = await createStructure(request, admin, 'sections', { name: 'Sekcja L12' })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Krystyna',
      lastName: 'Koordynator L12',
      role: 'coordinator',
      sectionId: section,
    })
    const refused = await updateClubSettings(request, coordinator.token, {
      consentTexts: { regulations: 'Inny tekst' },
    })
    expect(refused.status).toBe(403)

    // The member reads the club's text; the consent is still given.
    const profile = await getMe(request, adult.token)
    const profileBody = profile.body as {
      consentTexts?: Record<string, TextEntry>
      ownConsents?: { regulations: { granted: boolean; at: string } }
    } | null
    expect(profileBody?.consentTexts?.regulations?.text).toBe(wording)
    expect(profileBody?.ownConsents?.regulations).toMatchObject({ granted: true, at: givenAt })

    // An empty text restores the built-in wording.
    const restored = await updateClubSettings(request, admin, { consentTexts: { regulations: '' } })
    expect(restored.status, JSON.stringify(restored.body)).toBe(200)
    expect((await readSettings(request, admin)).consentTexts).toEqual({})
  } finally {
    await club.cleanup()
  }
})

test('TEST-L12 B-02 holds the club text; the phone shows it and "given to an earlier wording", then the built-in text again', async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const club = await createClub(request, 'test-l12-ui')
  try {
    const admin = club.adminToken
    const adultId = await createPerson(request, admin, {
      firstName: 'Celina',
      lastName: 'Telefon L12',
      birthDate: birthDateTurning(30),
    })
    const adult = await memberAccount(request, club, adultId, 'celina-l12-ui')
    const me = await getMe(request, adult.token)
    const given = await call(request, 'PUT', '/api/people/me/consents', adult.token, {
      data: { changes: { regulations: true } },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(me.body?.person?.updatedAt) },
    })
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    const wording = 'Akceptuję regulamin klubu w wersji z listopada 2026 r.'
    const changed = await updateClubSettings(request, admin, { consentTexts: { regulations: wording } })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)

    // B-02: the textarea holds the club's text and says when it was last changed. Signing in through the browser ends
    // the administrator's API token, so the later API calls take a fresh one (lesson `sign-in-browser-ends-the-api-token`).
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const freshAdmin = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto('/backend/club/settings')
    const field = page.locator('[data-crud-field-id="consentText_regulations"] textarea')
    await expect(field).toHaveValue(wording)
    await expect(page.locator('[data-crud-field-id="consentText_image"] textarea')).toHaveValue('')

    // The phone at 375 px: the club's wording and "given to an earlier wording", in Polish and English, light and dark.
    const password = await signInBrowser(page, request, club, adult.userId, adult.email)
    const adultToken = await getAuthToken(request, adult.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      const current = await getMe(request, adultToken)
      const saved = await putMe(request, adultToken, { preferredLocale: locale }, current.body?.person?.updatedAt)
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      await page.goto('/club/profile')
      const row = page.getByTestId('club-own-consent-regulations')
      await expect(row).toContainText(wording)
      await expect(row.getByTestId('club-consent-earlier-regulations')).toContainText(
        uiText('people.club.consents.earlierWording'),
      )
      await expect(row.getByRole('switch')).toBeChecked()
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/club/profile consent wording (${locale})`,
          async () => {
            await expect(row).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
    }

    // An empty text restores the built-in wording; the earlier-wording mark goes with it.
    const restored = await updateClubSettings(request, freshAdmin, { consentTexts: { regulations: '' } })
    expect(restored.status, JSON.stringify(restored.body)).toBe(200)
    await page.goto('/club/profile')
    const row = page.getByTestId('club-own-consent-regulations')
    await expect(row).toContainText(uiText('people.club.profile.consents.regulations'))
    await expect(row.getByTestId('club-consent-earlier-regulations')).toHaveCount(0)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
