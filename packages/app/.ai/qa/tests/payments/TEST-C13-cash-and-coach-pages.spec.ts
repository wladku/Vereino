import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { uniqueAddress } from '../_fixtures/messaging'
import { getCampaign, postCampaign, seedOrder, transition } from '../_fixtures/orders'
import { createGuardianship } from '../_fixtures/people'
import { cashToday, createFee, generate, periodFromNow, type CodedBody } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-C13 (payments parity spec phase 10, REQ-C12, AC-C12, J-C02 steps 1–2; issue #300 E12-S10), at 375 px in both
// colour schemes and both locales (#595: M-15 and M-18 run their assertions in English and in Polish). Coach Marek leads Żaki; coordinator Krystyna coordinates the academy and leads Orliki. Bartek (Żaki)
// has an overdue fee and a delivered kit the coach hands over; Ada (Orliki) has her fees; Anna pays for both.
// - `GET /api/payments/group-charges` carries `coachFeeAccess`, each group `own` (the caller's own first) and each
//   order `handedOverAt`; a `groupId` outside the caller's groups answers 403 `scope_denied`.
// - M-18 opens from the Today tile on Żaki with "To pay" (`?group=&due=1`), keeps both on reload, states the club's
//   coach mode in each setting and shows when the kit was handed over; `?group=` of Orliki shows the 403 state and no
//   charges. The coordinator's chips put Orliki first and mark Żaki "(section)"; the chips scroll at 375 px.
// - M-15 names the receiver before saving; after saving "Received today" shows the charge's description over the
//   receipt number (`GET /api/payments/cash` adds `descriptions`).
test.describe.configure({ timeout: 360_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const LOCALES = ['en', 'pl'] as const

type GroupView = CodedBody & {
  coachFeeAccess?: string
  groups?: { id: string; name: string; own: boolean }[]
  groupId?: string | null
  children?: { personId: string; charges: { order: { handedOverAt: string | null } | null }[] }[]
}

function view(request: APIRequestContext, token: string, query = '') {
  return call<GroupView>(request, 'GET', `/api/payments/group-charges${query}`, token)
}

async function setCoachFeeAccess(request: APIRequestContext, token: string, value: string) {
  const current = await call<{ updatedAt?: string | null }>(request, 'GET', '/api/payments/settings', token)
  const lock = current.body?.updatedAt
  const saved = await call(request, 'PUT', '/api/payments/settings', token, {
    data: { coachFeeAccess: value },
    headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
  })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

async function scanSchemes(page: Page, testInfo: Parameters<typeof scanBlockingViolations>[1], name: string) {
  const violations: Record<string, unknown> = {}
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.reload()
    await prepareForAccessibilityScan(page)
    const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
    if (found.length > 0) violations[`${name} (${colorScheme})`] = found
  }
  await expectNoPageOverflow(page)
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  return violations
}

test('TEST-C13 M-15 names the receiver and lists receipts by charge; M-18 keeps the group and filter in the URL', async ({
  page,
  browser,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-c13')
  try {
    const admin = club.adminToken
    // The administrator's API token; replaced when the administrator signs into the browser, which ends the old one.
    let settingsToken = admin
    // A member page in `locale`: the club's default locale (the members here have no preferred one, so the shell
    // resolves to it, DD-34) and the cookie agree; `<html lang>` proves the switch, since `uiText()` matches either.
    const openIn = async (target: Page, locale: (typeof LOCALES)[number], path: string) => {
      expect((await updateClubSettings(request, settingsToken, { defaultLocale: locale })).status).toBe(200)
      await target.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      await target.goto(path)
      await expect(target.locator('html')).toHaveAttribute('lang', locale)
    }
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const since = calendarDate(-120)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const orliki = await createGroup(request, admin, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const anna = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Płatnik',
      birthDate: birthDateTurning(38),
      email: uniqueAddress('anna-c13'),
    })
    const bartek = await createPerson(request, admin, {
      firstName: 'Bartek',
      lastName: 'Płatnik',
      birthDate: birthDateTurning(9),
    })
    const ada = await createPerson(request, admin, {
      firstName: 'Ada',
      lastName: 'Płatnik',
      birthDate: birthDateTurning(11),
    })
    for (const ward of [bartek, ada]) {
      await createGuardianship(request, admin, {
        guardianPersonId: anna,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
    }
    await addMembership(request, admin, { groupId: zaki, personId: bartek, role: 'participant', validFrom: since })
    await addMembership(request, admin, { groupId: orliki, personId: ada, role: 'participant', validFrom: since })
    for (const [name, groupId] of [
      ['Składka Żaki', zaki],
      ['Składka Orliki', orliki],
    ] as const) {
      await createFee(request, admin, { name, groupId, period: 'monthly', amount: 15000, dueDay: 28, validFrom: since })
    }
    for (const period of [periodFromNow(-1), periodFromNow(0)]) {
      expect((await generate(request, admin, period)).status).toBe(200)
    }

    // Bartek's kit, delivered and handed over by the coach.
    const created = await postCampaign(request, admin, {
      name: 'Strój akademii',
      sectionId: academy,
      groupIds: [zaki],
      closesOn: calendarDate(14),
      paymentDueOn: calendarDate(21),
      products: [{ key: 'kit', name: 'Komplet', sizesChild: ['128', '140'], priceChild: 8500, requiredAnswer: true }],
      open: true,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const campaignId = String(created.body?.id)
    const [kitProduct] = (await getCampaign(request, admin, campaignId)).products
    const bartekKit = await seedOrder(scope, {
      campaignId,
      participantPersonId: bartek,
      orderedByPersonId: anna,
      paymentDueOn: calendarDate(21),
      lines: [{ productId: kitProduct.id, size: '140', unitPrice: 8500 }],
    })
    let lock = (await getCampaign(request, admin, campaignId)).updatedAt
    for (const action of ['close', 'mark-ordered', 'mark-delivered']) {
      const moved = await transition(request, admin, campaignId, action, lock)
      expect(moved.status, JSON.stringify(moved.body)).toBe(200)
      lock = String(moved.body?.updatedAt)
    }

    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, { groupId: zaki, personId: coach.personId, role: 'coach', validFrom: since })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Krystyna',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })
    await addMembership(request, admin, {
      groupId: orliki,
      personId: coordinator.personId,
      role: 'coach',
      validFrom: since,
    })
    const handed = await call(request, 'POST', `/api/payments/orders/${bartekKit.orderId}/hand-over`, coach.token, {
      data: { groupId: zaki, confirmUnpaid: true },
    })
    expect(handed.status, JSON.stringify(handed.body)).toBe(200)

    // The API: `coachFeeAccess`, `own` (own first), `handedOverAt`; a group outside the caller's → 403.
    const seen = await view(request, coach.token)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body?.coachFeeAccess).toBe('collect')
    expect(seen.body?.groups?.map((group) => [group.name, group.own])).toEqual([['Żaki', true]])
    const kitRow = seen.body?.children
      ?.find((child) => child.personId === bartek)
      ?.charges.find((charge) => charge.order !== null)
    expect(kitRow?.order?.handedOverAt).toEqual(expect.any(String))
    const foreign = await view(request, coach.token, `?groupId=${orliki}`)
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    expect(foreign.body?.code).toBe('scope_denied')
    expect(foreign.body).not.toHaveProperty('children')
    const coordinated = await view(request, coordinator.token)
    expect(coordinated.body?.groups?.map((group) => [group.name, group.own])).toEqual([
      ['Orliki', true],
      ['Żaki', false],
    ])
    const clubWide = await view(request, admin)
    expect(clubWide.body?.groups?.every((group) => !group.own)).toBe(true)

    // M-18 for the coach on a phone: from the Today tile on Żaki with "To pay", kept on reload.
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    const coachPassword = await signInBrowser(page, request, club, coach.userId, coach.email)
    coach.token = await getAuthToken(request, coach.email, coachPassword)
    const violations: Record<string, unknown> = {}
    for (const locale of LOCALES) {
      await openIn(page, locale, '/club')
      const tile = page.getByTestId('club-tile-coach-payments')
      await expect(tile).toHaveAttribute('href', `/club/coach/payments?group=${zaki}&due=1`)
      await tile.click()
      await expect(page).toHaveURL(new RegExp(`/club/coach/payments\\?group=${zaki}&due=1$`))
      await expect(page.getByTestId('coach-filter-due')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('coach-group-chip')).toHaveAttribute('aria-pressed', 'true')
      await page.reload()
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByTestId('coach-filter-due')).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('coach-filter-all')).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByTestId('coach-group-mode'), locale).toHaveText(
        uiText('payments.coach.mode.collect', { exact: true }),
      )
      const badge = page.getByTestId('coach-kit-handed-over')
      await expect(badge, locale).toHaveText(uiText('payments.coach.handOver.handedOverAt', { exact: true }))
      await expect(badge).toContainText(/\d{1,2}:\d{2}/)
      await page.getByTestId('coach-filter-all').click()
      await expect(page).toHaveURL(new RegExp(`/club/coach/payments\\?group=${zaki}$`))
      await openIn(page, locale, `/club/coach/payments?group=${zaki}&due=1`)
      Object.assign(violations, await scanSchemes(page, testInfo, `/club/coach/payments (${locale})`))
    }

    // The mode line follows the club's "Coaches and payments" setting.
    for (const mode of ['view', 'none'] as const) {
      await setCoachFeeAccess(request, admin, mode)
      for (const locale of LOCALES) {
        await openIn(page, locale, `/club/coach/payments?group=${zaki}&due=1`)
        await expect(page.getByTestId('coach-group-mode'), locale).toHaveText(
          uiText(`payments.coach.mode.${mode}`, { exact: true }),
        )
      }
    }
    await setCoachFeeAccess(request, admin, 'collect')

    // A group outside the coach's: the 403 state, no charges.
    for (const locale of LOCALES) {
      await openIn(page, locale, `/club/coach/payments?group=${orliki}`)
      await expect(page.getByTestId('coach-forbidden'), locale).toBeVisible()
      await expect(page.getByTestId('coach-child')).toHaveCount(0)
    }
    await signOutBrowser(page)

    // The coordinator's chips: own Orliki first, Żaki marked "(section)".
    const coordinatorContext = await browser.newContext({ viewport: { width: 375, height: 812 } })
    try {
      const coordinatorPage = await coordinatorContext.newPage()
      coordinatorPage.setDefaultTimeout(30_000)
      await signInBrowser(coordinatorPage, request, club, coordinator.userId, coordinator.email)
      for (const locale of LOCALES) {
        await openIn(coordinatorPage, locale, '/club/coach/payments')
        const chips = coordinatorPage.getByTestId('coach-group-chip')
        await expect(chips).toHaveCount(2)
        await expect(chips.nth(0)).toHaveAttribute('data-own', 'true')
        await expect(chips.nth(0), locale).not.toContainText(uiText('payments.coach.sectionSuffix'))
        await expect(chips.nth(1)).toHaveAttribute('data-own', 'false')
        await expect(chips.nth(1), locale).toContainText(uiText('payments.coach.sectionSuffix'))
        await expect(coordinatorPage.getByTestId('coach-group-chips')).toHaveCSS('overflow-x', 'auto')
        await expectNoPageOverflow(coordinatorPage)
      }
    } finally {
      await coordinatorContext.close()
    }

    // M-15 for the administrator: "Received by: {name}" before saving, the charge's description after it.
    const me = await call<{ person?: { firstName: string; lastName: string } }>(request, 'GET', '/api/people/me', admin)
    const adminName = `${String(me.body?.person?.firstName)} ${String(me.body?.person?.lastName)}`
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    settingsToken = adminToken
    // Before saving, in both locales; the payment itself is saved once, in the last one.
    for (const locale of LOCALES) {
      await openIn(page, locale, '/club/cash')
      await page.getByTestId('cash-payer-search').fill('Płatnik')
      await page.getByTestId('cash-payer-option').first().click()
      await expect(page.getByTestId('cash-taken-by'), locale).toHaveText(
        uiText('payments.cash.takenBy', { exact: true, params: { name: adminName } }),
      )
    }
    await page.getByTestId('cash-confirm').click()
    await expect(page.getByTestId('cash-today-item')).toHaveCount(1)
    const today = await cashToday(request, adminToken)
    expect(today.body?.items, JSON.stringify(today.body)).toHaveLength(1)
    const [receipt] = today.body?.items ?? []
    expect(receipt.descriptions.length).toBeGreaterThan(1)
    for (const locale of LOCALES) {
      await openIn(page, locale, '/club/cash')
      const item = page.getByTestId('cash-today-item')
      await expect(item).toHaveCount(1)
      await expect(item.getByTestId('cash-today-description'), locale).toHaveText(receipt.descriptions.join(', '))
      await expect(item.getByTestId('cash-today-receipt'), locale).toContainText(receipt.receiptNumber)
      Object.assign(violations, await scanSchemes(page, testInfo, `/club/cash (${locale})`))
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
