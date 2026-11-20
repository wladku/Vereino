import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, call, createAccount, createClub, createPerson } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { createGuardianship } from '../_fixtures/people'
import { cancelCharge, getCharge } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// E20-S03 (#482, docs/ux-concept/tokens.md R01.2, R01.8): every status shows its word and its icon through `StatusTag`.
// - B-21 as the administrator: an open charge, an overdue one ("Overdue" next to its status) and a cancelled one; every
//   status pill holds one decorative icon (`aria-hidden`) and the word, so the pill's accessible text is the word.
// - M-02 as a guardian at 375 px: the ward tile's "Consents: 0 of 3" pill has its icon.
// Both locales, light and dark, desktop and 375 px; screenshots are attached to the report as PR evidence.
test.describe.configure({ timeout: 300_000 })

type CreateBody = { chargeId?: string }

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** Every status pill inside `scope` has exactly one hidden icon before a non-empty word. */
async function expectWordAndIcon(scope: Locator, minimum: number) {
  const tags = scope.locator('[data-status-tag]')
  await expect(tags.first()).toBeVisible()
  const count = await tags.count()
  expect(count).toBeGreaterThanOrEqual(minimum)
  for (let index = 0; index < count; index += 1) {
    const tag = tags.nth(index)
    await expect(tag.locator('svg')).toHaveCount(1)
    await expect(tag.locator('svg')).toHaveAttribute('aria-hidden', 'true')
    await expect(tag.locator('[data-slot="badge-leading-icon"]')).toBeVisible()
    expect((await tag.innerText()).trim()).not.toBe('')
  }
}

test('E20-S03 every status shows its word and its icon', async ({ page, request }, testInfo) => {
  const club = await createClub(request, 'e20-s03')
  try {
    const admin = club.adminToken
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
    const add = async (description: string, dueDate: string) => {
      const created = await call<CreateBody>(request, 'POST', '/api/payments/charges', admin, {
        data: { personId: jas, description, amount: 5000, dueDate },
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      return String(created.body?.chargeId)
    }
    await add('Składka listopad', calendarDate(14))
    await add('Składka wrzesień', calendarDate(-20))
    const cancelled = await add('Opłata za turniej', calendarDate(7))
    const toCancel = await getCharge(request, admin, cancelled)
    const cancelledResult = await cancelCharge(request, admin, cancelled, toCancel.updatedAt, { reason: 'Pomyłka' })
    expect(cancelledResult.status, JSON.stringify(cancelledResult.body)).toBe(200)

    const kasiaEmail = `kasia-${String(Date.now())}@example.com`
    const account = await createAccount(request, admin, kasia, kasiaEmail)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const kasiaUserId = String(account.body?.userId)
    club.extraUserIds.push(kasiaUserId)

    // B-21: desktop, then 375 px; both locales and colour schemes.
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
      for (const locale of ['pl', 'en'] as const) {
        await setLocale(page, locale)
        for (const colorScheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
          await page.goto('/backend/payments/charges?perspective=all')
          const table = page.getByTestId('charge-open').first()
          await expect(table).toBeVisible()
          const main = page.locator('main')
          await expect(main.getByTestId('charge-overdue')).toHaveCount(1)
          await expect(main.getByTestId('charge-overdue')).toContainText(uiText('payments.charges.overdue'))
          // Three charge statuses plus "Overdue".
          await expectWordAndIcon(main, 4)
          await expect(
            main.locator('[data-status-tag="error"]').filter({ hasText: uiText('payments.charges.overdue') }),
          ).toHaveCount(1)
          await testInfo.attach(`b21-charges-${String(width)}-${locale}-${colorScheme}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          })
        }
      }
    }

    // M-02 for Kasia at 375 px: the ward tile's consents pill.
    await switchBrowserUser(page, request, club, kasiaUserId, kasiaEmail)
    await page.setViewportSize({ width: 375, height: 812 })
    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.goto('/club')
        const ward = page.getByTestId('club-ward')
        await expect(ward).toContainText('Jaś')
        await expectWordAndIcon(ward, 1)
        await expect(ward.locator('[data-status-tag="warning"] svg.lucide-clock')).toHaveCount(1)
        await testInfo.attach(`m02-today-375-${locale}-${colorScheme}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        })
        await expectNoPageOverflow(page)
        await page.setViewportSize({ width: 375, height: 812 })
      }
    }
  } finally {
    await club.cleanup()
  }
})
