import { expect, test, type Page } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import {
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  signInAs,
  uniqueSuffix,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { awaitEmails } from '../_fixtures/communication'
import { publicCall } from '../_fixtures/declaration-links'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { uniqueAddress } from '../_fixtures/messaging'
import { getCampaign, postCampaign, transition } from '../_fixtures/orders'
import { createFee, generate, periodFromNow } from '../_fixtures/payments'
import { createGuardianship } from '../_fixtures/people'
import { publish } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// TEST-C12 (payments parity spec phase 9, REQ-C11, AC-C11, J-C06 steps 1–3 and 5; issue #299 E12-S09), at 375 px in
// both locales and both colour schemes. Kasia guards Jaś and Ada (Żaki) and pays for them; Halina Nowak, without an
// account, also guards Jaś; Wojtek Malinowski coaches Żaki.
// - Reads: each order of the form adds `submittedAt`, `handedOverAt` and `handedOverBy`; the personal link adds
//   `guardian`.
// - While the campaign takes orders, Today shows the "Order" tile with "Jaś: ordered — …" and "Ada: not ordered";
//   M-16 shows the stage badge, "orders until" and the payment deadline; M-17 shows the stage, both deadlines, the
//   chips (Jaś with a check mark and a screen-reader text, `aria-current` on the child shown), the order's time and
//   notes; "Pay online {amount}" opens M-08 with the kit charge only ticked.
// - Once the campaign is closed the tile is gone (negative case) and M-16 says "closed on". After the delivery M-16
//   and M-17 say "ready for pickup from the coach"; after the coach's handover M-17 says "Picked up — {time} · handed
//   over by Wojtek Malinowski" and M-16 marks Jaś "picked up".
// - M-19 names Halina Nowak above the form; an expired link answers 410 and shows "This link has expired".
// Each locale pass sets the club's default locale with the cookie and asserts `<html lang>` after every navigation:
// the member shell rewrites a cookie that disagrees with the member's resolved locale, and the `uiText()` patterns
// match either catalog (lesson `panel-language-follows-club-default-locale`, #641).
test.describe.configure({ timeout: 420_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

type FormBody = {
  orders: {
    participantPersonId: string
    chargeId: string
    submittedAt: string
    handedOverAt: string | null
    handedOverBy: { firstName: string; lastName: string } | null
  }[]
}

type Locale = 'en' | 'pl'

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

test('TEST-C12 a guardian follows a kit order on the phone: stage, deadlines, pickup and who handed it over', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-c12')
  try {
    const admin = club.adminToken
    expect((await updateClubSettings(request, admin, { defaultLocale: 'en' })).status).toBe(200)
    const slug = `testc12-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])
    const since = calendarDate(-60)
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })

    const kasiaEmail = uniqueAddress('kasia-c12')
    const kasia = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(38),
      email: kasiaEmail,
    })
    const halinaEmail = uniqueAddress('halina-c12')
    const halina = await createPerson(request, admin, {
      firstName: 'Halina',
      lastName: 'Nowak',
      birthDate: birthDateTurning(66),
      email: halinaEmail,
    })
    const jas = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(8),
    })
    const ada = await createPerson(request, admin, {
      firstName: 'Ada',
      lastName: 'Rodzic',
      birthDate: birthDateTurning(9),
    })
    for (const ward of [jas, ada]) {
      await createGuardianship(request, admin, {
        guardianPersonId: kasia,
        wardPersonId: ward,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
      await addMembership(request, admin, { groupId: zaki, personId: ward, role: 'participant', validFrom: since })
    }
    await createGuardianship(request, admin, {
      guardianPersonId: halina,
      wardPersonId: jas,
      relation: 'grandparent',
      isPrimaryPayer: false,
      validFrom: since,
    })
    // A fee, so that M-08 has another charge the "Pay online" link must leave unticked.
    await createFee(request, admin, {
      name: 'Składka Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 28,
      validFrom: since,
    })
    expect((await generate(request, admin, periodFromNow(0))).status).toBe(200)

    const account = await createAccount(request, admin, kasia, kasiaEmail)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const kasiaUserId = String(account.body?.userId)
    club.extraUserIds.push(kasiaUserId)
    const coach = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Malinowski', role: 'coach' })
    await addMembership(request, admin, { groupId: zaki, personId: coach.personId, role: 'coach', validFrom: since })

    const created = await postCampaign(request, admin, {
      name: 'Strój akademii',
      sectionId: academy,
      groupIds: [zaki],
      closesOn: calendarDate(14),
      paymentDueOn: calendarDate(21),
      notesLabel: 'Uwagi',
      products: [{ key: 'kit', name: 'Komplet', sizesChild: ['128', '140'], priceChild: 8500, requiredAnswer: true }],
      open: true,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const campaignId = String(created.body?.id)
    const [kit] = (await getCampaign(request, admin, campaignId)).products

    // Kasia orders Jaś's kit with a note; the form adds the order's time and an empty handover.
    const kasiaToken = await signInAs(request, club, kasiaUserId, kasiaEmail)
    const placed = await call<{ orderId?: string; chargeId?: string }>(
      request,
      'POST',
      '/api/payments/orders',
      kasiaToken,
      {
        data: {
          campaignId,
          participantPersonId: jas,
          setSelected: false,
          choices: { [kit.id]: '140' },
          notes: 'Dłuższe rękawy',
          contactEmail: kasiaEmail,
          contactPhone: '600 100 200',
        },
      },
    )
    expect(placed.status, JSON.stringify(placed.body)).toBe(201)
    const orderId = String(placed.body?.orderId)
    const chargeId = String(placed.body?.chargeId)
    const form = await call<FormBody>(request, 'GET', `/api/payments/order-campaigns/${campaignId}/form`, kasiaToken)
    expect(form.status, JSON.stringify(form.body)).toBe(200)
    expect(form.body?.orders).toEqual([
      expect.objectContaining({
        participantPersonId: jas,
        chargeId,
        submittedAt: expect.any(String),
        handedOverAt: null,
        handedOverBy: null,
      }),
    ])

    // Halina's personal link names her.
    const requested = await publicCall('POST', `/api/payments/public/order-campaigns/${campaignId}/link-request`, {
      email: halinaEmail,
      clubSlug: slug,
    })
    expect(requested.status, requested.text).toBe(202)
    const [linkMail] = await awaitEmails(halinaEmail, 'Your order link')
    const linkHref = linkMail.links.find((link) => link.includes('/club/o/')) as string
    const linkPath = new URL(linkHref).pathname
    const token = decodeURIComponent(linkPath.split('/').pop() ?? '')
    const linkApi = `/api/payments/order-links/${encodeURIComponent(token)}`
    const linkRead = await publicCall('GET', linkApi)
    expect(linkRead.status, linkRead.text).toBe(200)
    expect(linkRead.body?.guardian).toEqual({ firstName: 'Halina', lastName: 'Nowak' })

    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, kasiaUserId, kasiaEmail)
    // Kasia's language is "club default", so the club setting decides; the cookie follows it for the guest pages.
    let current: Locale = 'en'
    const useLocale = async (locale: Locale) => {
      expect((await updateClubSettings(request, admin, { defaultLocale: locale })).status).toBe(200)
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      current = locale
    }
    const visit = async (path: string) => {
      await page.goto(path)
      await expect(page.locator('html'), path).toHaveAttribute('lang', current)
    }
    const violations: Record<string, unknown> = {}

    // While the campaign takes orders: the Today tile, M-16 and M-17, in both locales.
    for (const locale of ['en', 'pl'] as const) {
      await useLocale(locale)
      await visit('/club')
      const tile = page.getByTestId('club-tile-order')
      await expect(tile, locale).toHaveCount(1)
      await expect(tile, locale).toContainText('Strój akademii')
      await expect(tile, locale).toContainText(uiText('payments.orders.tile.ordersUntil'))
      await expect(tile.locator('[data-testid="club-tile-order-child"][data-child="Jaś"]'), locale).toHaveText(
        uiText('payments.orders.tile.ordered', { params: { child: 'Jaś' } }),
      )
      await expect(tile.locator('[data-testid="club-tile-order-child"][data-child="Ada"]'), locale).toHaveText(
        uiText('payments.orders.tile.notOrdered', { params: { child: 'Ada' }, exact: true }),
      )
      await expect(tile.getByTestId('club-tile-order-link')).toHaveAttribute('href', `/club/orders/${campaignId}`)
      await expectNoPageOverflow(page)

      await visit('/club/orders')
      await expect(page.getByTestId('club-order-stage'), locale).toHaveAttribute('data-stage', 'open')
      await expect(page.getByTestId('club-order-stage'), locale).toHaveText(
        uiText('payments.orders.stage.open', { exact: true }),
      )
      await expect(page.getByTestId('club-order-deadline'), locale).toHaveText(uiText('payments.orders.club.deadline'))
      await expect(page.getByTestId('club-order-payment-due'), locale).toHaveText(
        uiText('payments.orders.club.paymentDue'),
      )
      const jasRow = page.locator('[data-testid="club-order-child"][data-child="Jaś"]')
      await expect(jasRow.getByTestId('club-order-child-payment'), locale).toHaveAttribute('data-state', 'to_pay')
      await expect(jasRow.getByTestId('club-order-child-picked-up')).toHaveCount(0)
      await expectNoPageOverflow(page)

      await visit(`/club/orders/${campaignId}?child=${jas}`)
      await expect(page.getByTestId('order-stage'), locale).toHaveAttribute('data-stage', 'open')
      await expect(page.getByTestId('order-deadlines'), locale).toHaveText(uiText('payments.orders.club.deadlines'))
      const jasChip = page.locator('[data-testid="order-child-chip"][data-child="Jaś"]')
      await expect(jasChip).toHaveAttribute('aria-current', 'page')
      await expect(jasChip).toHaveAttribute('data-ordered', 'true')
      await expect(jasChip.locator('.sr-only'), locale).toHaveText(uiText('payments.orders.club.childOrdered'))
      await expect(page.locator('[data-testid="order-child-chip"][data-child="Ada"]')).not.toHaveAttribute(
        'aria-current',
      )
      await expect(page.getByTestId('order-summary-time'), locale).toHaveText(
        uiText('payments.orders.club.summary.orderOf'),
      )
      await expect(page.getByTestId('order-summary-time')).toContainText(/\d{1,2}:\d{2}/)
      await expect(page.getByTestId('order-summary-notes'), locale).toHaveText(
        uiText('payments.orders.club.summary.notes', { params: { notes: 'Dłuższe rękawy' }, exact: true }),
      )
      await expect(page.getByTestId('order-ready')).toHaveCount(0)
      const pay = page.getByTestId('order-pay-online')
      await expect(pay, locale).toHaveText(uiText('payments.orders.club.pay.onlineAmount'))
      await expect(pay).toHaveAttribute('href', `/club/payments?pay=${chargeId}`)
      await expectNoPageOverflow(page)
    }
    await useLocale('en')
    await visit(`/club/orders/${campaignId}?child=${jas}`)
    Object.assign(violations, await scanSchemes(page, testInfo, '/club/orders/[campaignId] (open)'))

    // The chip leads to Ada's page, keeping the chip state in the URL.
    await page.locator('[data-testid="order-child-chip"][data-child="Ada"]').click()
    await expect(page).toHaveURL(new RegExp(`/club/orders/${campaignId}\\?child=${ada}$`))
    await expect(page.locator('[data-testid="order-child-chip"][data-child="Ada"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByTestId('order-form')).toBeVisible()

    // "Pay online" opens M-08 with the kit charge only ticked.
    await visit(`/club/orders/${campaignId}?child=${jas}`)
    await page.getByTestId('order-pay-online').click()
    await expect(page).toHaveURL(new RegExp(`/club/payments\\?pay=${chargeId}$`))
    const charge = (id: string) =>
      page.locator(`[data-testid="club-charge"][data-charge-id="${id}"]`).getByRole('checkbox')
    await expect(charge(chargeId)).toBeChecked()
    const others = page.locator(`[data-testid="club-charge"]:not([data-charge-id="${chargeId}"])`).getByRole('checkbox')
    expect(await others.count()).toBeGreaterThan(0)
    for (const box of await others.all()) await expect(box).not.toBeChecked()

    // Closed: the tile is gone and M-16 says "closed on".
    let lock = (await getCampaign(request, admin, campaignId)).updatedAt
    const move = async (action: string) => {
      const moved = await transition(request, admin, campaignId, action, lock)
      expect(moved.status, JSON.stringify(moved.body)).toBe(200)
      lock = String(moved.body?.updatedAt)
    }
    await move('close')
    await visit('/club')
    await expect(page.getByTestId('club-tile-payments')).toBeVisible()
    await expect(page.getByTestId('club-tile-order')).toHaveCount(0)
    await visit('/club/orders')
    await expect(page.getByTestId('club-order-stage')).toHaveAttribute('data-stage', 'closed')
    await expect(page.getByTestId('club-order-deadline')).toHaveText(uiText('payments.orders.club.closedOn'))

    // Delivered: "ready for pickup from the coach" on M-16 and M-17.
    await move('mark-ordered')
    await move('mark-delivered')
    await page.reload()
    await expect(page.getByTestId('club-order-stage')).toHaveAttribute('data-stage', 'delivered')
    await expect(page.getByTestId('club-order-deadline')).toHaveText(
      uiText('payments.orders.club.readyForPickup', { exact: true }),
    )
    await visit(`/club/orders/${campaignId}?child=${jas}`)
    await expect(page.getByTestId('order-ready')).toContainText(uiText('payments.orders.club.readyForPickup'))
    await expect(page.getByTestId('order-picked-up')).toHaveCount(0)

    // The coach hands the kit over: who and when, on M-17 and in the read; M-16 marks Jaś "picked up".
    const handed = await call(request, 'POST', `/api/payments/orders/${orderId}/hand-over`, coach.token, {
      data: { groupId: zaki, confirmUnpaid: true },
    })
    expect(handed.status, JSON.stringify(handed.body)).toBe(200)
    for (const locale of ['en', 'pl'] as const) {
      await useLocale(locale)
      await visit(`/club/orders/${campaignId}?child=${jas}`)
      const picked = page.getByTestId('order-picked-up')
      await expect(picked, locale).toContainText(uiText('payments.orders.club.summary.pickedUp'))
      await expect(picked, locale).toContainText(
        uiText('payments.orders.club.summary.handedBy', { params: { by: 'Wojtek Malinowski' } }),
      )
      await expect(picked).toContainText(/\d{1,2}:\d{2}/)
      await expect(page.getByTestId('order-ready')).toHaveCount(0)
      await expectNoPageOverflow(page)
      await visit('/club/orders')
      const jasRow = page.locator('[data-testid="club-order-child"][data-child="Jaś"]')
      await expect(jasRow.getByTestId('club-order-child-picked-up'), locale).toHaveText(
        uiText('payments.orders.club.state.picked_up', { exact: true }),
      )
      await expect(jasRow.getByTestId('club-order-child-payment')).toHaveAttribute('data-state', 'to_pay')
    }
    await useLocale('en')
    await visit('/club/orders')
    Object.assign(violations, await scanSchemes(page, testInfo, '/club/orders (delivered)'))
    await visit(`/club/orders/${campaignId}?child=${jas}`)
    Object.assign(violations, await scanSchemes(page, testInfo, '/club/orders/[campaignId] (picked up)'))

    // M-19: the link names its guardian; Halina's link is still valid while the campaign is delivered.
    await signOutBrowser(page)
    for (const locale of ['en', 'pl'] as const) {
      await useLocale(locale)
      await visit(linkPath)
      const notice = page.getByTestId('order-link-guardian')
      await expect(notice, locale).toContainText(
        uiText('payments.orders.link.personalLink', { params: { name: 'Halina Nowak' } }),
      )
      await expect(notice, locale).toContainText(uiText('payments.orders.link.personalLinkText'))
      await expect(page.getByTestId('order-picked-up'), locale).toContainText('Wojtek Malinowski')
      await expectNoPageOverflow(page)
    }
    await useLocale('en')
    await visit(linkPath)
    Object.assign(violations, await scanSchemes(page, testInfo, '/club/o/[token]'))

    // An expired link answers 410 and the page says so.
    await withClient((client) =>
      client.query(
        `update payments_order_links set expires_at = now() - interval '1 minute' where guardian_person_id = $1`,
        [halina],
      ),
    )
    const expired = await publicCall('GET', linkApi)
    expect(expired.status, expired.text).toBe(410)
    await visit(linkPath)
    await expect(page.getByText(uiText('payments.orders.link.expired.title', { exact: true }))).toBeVisible()
    await expect(page.getByTestId('order-link-guardian')).toHaveCount(0)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
