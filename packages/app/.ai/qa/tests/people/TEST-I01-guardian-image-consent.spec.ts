import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { getAuthToken } from '../_fixtures/auth'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  signInAs,
  type Club,
} from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getMe, putMe } from '../_fixtures/members'
import { createGuardianship, setConsents } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// Event photos spec phase 1 (#871; REQ-I06, REQ-I07, AC-I01): TEST-I01 — a ward with two guardians. Kasia gives the
// image consent on the ward page at 375 px (Polish and English, light and dark, axe), sees the effect line, the count of
// public photos (none before phase 2) and the history; Tomek withdraws it on his own guardianship. Both decisions are
// `people_consent_events` rows with the wording hash; the history lists them newest first; the ward's
// `imagePublishable` is false (one guardian's withdrawal is a veto, BR-I02). TEST-I11 (ward page part): the switch and
// the confirmation work by keyboard, the history disclosure opens with Enter.
test.describe.configure({ timeout: 420_000 })

type HistoryBody = {
  items: { granted: boolean; byName: string | null; byRole: string; currentWording: boolean }[]
  total: number
  earlier: unknown[]
  publicPhotos: { count: number; events: unknown[] }
}

type Ward = {
  personId: string
  imagePublishable?: boolean
  guardianship: { id: string; updatedAt: string | null; consents: { image: { granted: boolean } } }
}

async function wardOf(request: APIRequestContext, token: string, wardId: string): Promise<Ward> {
  const me = await getMe(request, token)
  expect(me.status, JSON.stringify(me.body)).toBe(200)
  const ward = (me.body?.wards as Ward[] | undefined)?.find((candidate) => candidate.personId === wardId)
  expect(ward, JSON.stringify(me.body)).toBeTruthy()
  return ward as Ward
}

async function consentEvents(club: Club, personId: string) {
  return withClient(async (client) => {
    const rows = await client.query<{ granted: boolean; by_role: string; wording_sha256: string; locale: string }>(
      `select granted, by_role, wording_sha256, locale from people_consent_events
        where tenant_id = $1 and subject_person_id = $2 and kind = 'image' order by created_at`,
      [club.tenant.tenantId, personId],
    )
    return rows.rows
  })
}

test('TEST-I01 a guardian gives the image consent on the phone, the other withdraws it, and the history keeps both', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-i01')
  try {
    const kasia = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Wizerunek',
      birthDate: birthDateTurning(38),
    })
    const tomek = await createStaff(request, club, {
      firstName: 'Tomek',
      lastName: 'Wizerunek',
      birthDate: birthDateTurning(40),
    })
    const jas = await createPerson(request, club.adminToken, {
      firstName: 'Jaś',
      lastName: 'Wizerunek',
      birthDate: birthDateTurning(9),
    })
    for (const guardian of [kasia, tomek]) {
      await createGuardianship(request, club.adminToken, {
        guardianPersonId: guardian.personId,
        wardPersonId: jas,
        isPrimaryPayer: guardian === kasia,
        validFrom: calendarDate(-10),
      })
    }

    // The ward page at 375 px: nothing decided yet; the effect line, no public photos, an empty history.
    const password = await signInBrowser(page, request, club, kasia.userId, kasia.email)
    const kasiaToken = await getAuthToken(request, kasia.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      const me = await getMe(request, kasiaToken)
      const saved = await putMe(request, kasiaToken, { preferredLocale: locale }, me.body?.person.updatedAt)
      expect(saved.status, JSON.stringify(saved.body)).toBe(200)
      await page.goto(`/club/wards/${jas}`)
      const row = page.getByTestId('club-ward-consent-image')
      await expect(row).toBeVisible()
      await expect(page.getByTestId('club-consent-effect-image')).toContainText(
        uiText('people.consents.image.effect', { params: { name: 'Jaś' } }),
      )
      await expect(page.getByTestId('club-image-public-photos')).toContainText(
        uiText('people.consents.image.publicPhotos', { params: { count: '0' } }),
      )
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/wards image consent (${locale})`, async () => {
          await expect(row).toBeVisible()
        }),
      )
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.getByTestId('club-image-history').locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('club-image-history-empty')).toBeVisible()

    // Kasia gives it by keyboard: it saves at once and the history names her with the current wording.
    const image = page.getByTestId('club-ward-consent-image').getByRole('switch')
    await expect(image).not.toBeChecked()
    await image.focus()
    await page.keyboard.press('Space')
    await expect(page.getByText(uiText('people.consents.image.flash.given')).first()).toBeVisible()
    await expect(image).toBeChecked()
    const historyItems = page.getByTestId('club-image-history-item')
    await expect(historyItems).toHaveCount(1)
    await expect(historyItems.first()).toContainText('Kasia Wizerunek')
    await expect(historyItems.first()).toContainText(uiText('people.consents.image.history.currentWording'))
    expect((await wardOf(request, kasiaToken, jas)).imagePublishable).toBe(true)

    // A withdrawal asks first; "Keep the consent" (Escape-free, by keyboard) changes nothing.
    await image.focus()
    await page.keyboard.press('Space')
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(uiText('people.consents.image.confirm.text'))
    await dialog.getByRole('button', { name: uiText('people.consents.image.confirm.keep') }).click()
    await expect(image).toBeChecked()

    // Tomek withdraws on his own guardianship: a veto, whatever Kasia decided.
    const tomekToken = await signInAs(request, club, tomek.userId, tomek.email)
    const tomekWard = await wardOf(request, tomekToken, jas)
    const withdrawn = await setConsents(
      request,
      tomekToken,
      tomekWard.guardianship.id,
      { image: false },
      tomekWard.guardianship.updatedAt,
    )
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200)
    // Withdrawing a consent never given changes nothing (P-08); Tomek first gives, then withdraws.
    const tomekAfter = await wardOf(request, tomekToken, jas)
    const given = await setConsents(
      request,
      tomekToken,
      tomekAfter.guardianship.id,
      { image: true },
      tomekAfter.guardianship.updatedAt,
    )
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    const vetoed = await setConsents(request, tomekToken, tomekAfter.guardianship.id, { image: false }, given.body?.updatedAt)
    expect(vetoed.status, JSON.stringify(vetoed.body)).toBe(200)
    const kasiaView = await wardOf(request, kasiaToken, jas)
    expect(kasiaView.guardianship.consents.image.granted).toBe(true)
    expect(kasiaView.imagePublishable).toBe(false)

    // Three decisions are consent events with the wording hash; the history lists them newest first.
    const events = await consentEvents(club, jas)
    expect(events.map((row) => [row.granted, row.by_role])).toEqual([
      [true, 'guardian'],
      [true, 'guardian'],
      [false, 'guardian'],
    ])
    for (const row of events) expect(row.wording_sha256).toMatch(/^[0-9a-f]{64}$/)
    const history = await call<HistoryBody>(
      request,
      'GET',
      `/api/people/me/consents/${jas}/image-history`,
      kasiaToken,
    )
    expect(history.status, JSON.stringify(history.body)).toBe(200)
    expect(history.body?.total).toBe(3)
    expect(history.body?.items.map((item) => [item.granted, item.byName])).toEqual([
      [false, 'Tomek Wizerunek'],
      [true, 'Tomek Wizerunek'],
      [true, 'Kasia Wizerunek'],
    ])
    expect(history.body?.items.every((item) => item.currentWording)).toBe(true)
    expect(history.body?.publicPhotos).toEqual({ count: 0, events: [] })

    // The page shows the three decisions after a reload.
    await page.reload()
    await page.getByTestId('club-image-history').locator('summary').click()
    await expect(page.getByTestId('club-image-history-item')).toHaveCount(3)
    await expect(page.getByTestId('club-image-history-item').first()).toContainText('Tomek Wizerunek')
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
