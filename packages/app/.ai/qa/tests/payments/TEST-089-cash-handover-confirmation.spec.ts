import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, call, createClub, createPerson, type Club } from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'
import { chargeOf, createFee, generate, listCharges, periodFromNow, type CodedBody } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// TEST-089 (payments spec REQ-033a, DD-31a, J-010a, AC-033a; D-042, #791): the coach sends a cash handover from the
// phone and the treasurer confirms it on the phone. Coach Rafał holds PLN 535 in three KP receipts. On M-18 he sends
// them all ("Hand over cash", all preselected): a pending `RG/…` handover; the payments stay his ("Cash with you"
// PLN 535) and are reserved — a second send of one of them and the administrator's one-sided acceptance answer 409
// `cash_handover_payment_pending`. He withdraws it and sends again; the treasurer Beata (a member side too) sees the
// Today row "Handovers to confirm", rejects it with a reason on `/club/cash-handovers`, Rafał sees the reason and sends
// a corrected handover without one receipt, Beata confirms it: "Cash with you" keeps only the left-out receipt, the
// custody total adds up, and a confirmed payment cannot be sent again (409 `cash_already_settled`). The left-out
// receipt goes through the administrator's fallback, which tells Rafał. Another coach cannot withdraw Rafał's handover
// (404), a decided handover cannot be decided again (409), a rejection needs a reason (400), and the notices and the
// audit entries of every step are stored. The phone pages fit 375 px and pass axe in en/pl, light and dark.
test.describe.configure({ timeout: 420_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const LOCALES = ['en', 'pl'] as const
const RG = /^RG\/\d{4}\/\d{2}\/\d{3}$/

type Held = CodedBody & {
  held?: { paymentId: string; receiptNumber: string; amount: number; pendingHandoverId: string | null }[]
  total?: number
  handovers?: { id: string; number: string; status: string; rejectionReason: string | null }[]
}
type Sent = CodedBody & { id?: string; number?: string; status?: string; amount?: number; paymentIds?: string[] }
type Custody = CodedBody & {
  items?: {
    collectorPersonId: string
    total: number
    payments: { paymentId: string; pendingHandoverId: string | null }[]
  }[]
  total?: number
}
type Page_ = CodedBody & { items?: { id: string; number: string; status: string; amount: number }[]; total?: number }

const mine = (request: APIRequestContext, token: string) =>
  call<Held>(request, 'GET', '/api/payments/my-cash-handovers', token)
const send = (request: APIRequestContext, token: string, paymentIds: string[]) =>
  call<Sent>(request, 'POST', '/api/payments/my-cash-handovers', token, { data: { paymentIds } })
const decide = (request: APIRequestContext, token: string, id: string, kind: 'confirm' | 'reject', data = {}) =>
  call<Sent>(request, 'POST', `/api/payments/cash-handovers/${id}/${kind}`, token, { data })
const withdraw = (request: APIRequestContext, token: string, id: string) =>
  call<Sent>(request, 'POST', `/api/payments/my-cash-handovers/${id}/withdraw`, token, { data: {} })
const custody = (request: APIRequestContext, token: string) =>
  call<Custody>(request, 'GET', '/api/payments/cash-custody', token)

/** The channels each person got for the dispatch of `key` (the notices go out after the commit). */
async function noticeChannels(club: Club, key: string): Promise<Record<string, string[]>> {
  return withClient(async (client) => {
    const rows = await client.query<{ person_id: string | null; channel: string }>(
      `select r.person_id, r.channel
         from foundation_dispatches d join foundation_deliveries r on r.dispatch_id = d.id
        where d.tenant_id = $1 and d.organization_id = $2 and d.idempotency_key = $3`,
      [club.tenant.tenantId, club.tenant.organizationId, key],
    )
    const result: Record<string, string[]> = {}
    for (const row of rows.rows) {
      if (row.person_id) result[row.person_id] = [...(result[row.person_id] ?? []), row.channel].sort()
    }
    return result
  })
}

/** The audit rows of a handover (`action_logs` is encrypted at rest; only plain columns are matched). */
async function auditCount(handoverId: string): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from action_logs
        where resource_kind = 'payments.cash_handover' and resource_id = $1 and deleted_at is null`,
      [handoverId],
    )
    return Number(rows[0].count)
  })
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

test('TEST-089 the coach sends a cash handover on the phone, the treasurer confirms it on the phone', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-089')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const since = calendarDate(-120)
    // A member page in `locale`: the club's default locale and the cookie agree (`<html lang>` proves the switch).
    const openIn = async (locale: (typeof LOCALES)[number], path: string) => {
      expect((await updateClubSettings(request, admin, { defaultLocale: locale })).status).toBe(200)
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
    }

    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const parent = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName: 'Przekazana',
      birthDate: birthDateTurning(40),
    })
    const children: string[] = []
    for (const firstName of ['Ola', 'Ela', 'Ula']) {
      const child = await createPerson(request, admin, {
        firstName,
        lastName: 'Przekazana',
        birthDate: birthDateTurning(9),
      })
      await createGuardianship(request, admin, {
        guardianPersonId: parent,
        wardPersonId: child,
        relation: 'parent',
        isPrimaryPayer: true,
        validFrom: since,
      })
      await addMembership(request, admin, { groupId: zaki, personId: child, role: 'participant', validFrom: since })
      children.push(child)
    }
    const fee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: zaki,
      period: 'monthly',
      amount: 20000,
      dueDay: 28,
      validFrom: since,
    })
    const period = periodFromNow(0)
    expect((await generate(request, admin, period)).status).toBe(200)
    const charges = await listCharges(request, admin, `&period=${period}`)
    const feeCharges = children.map((child) => chargeOf(charges, child, fee))

    const rafal = await signedInStaff(request, club, { firstName: 'Rafał', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, { groupId: zaki, personId: rafal.personId, role: 'coach', validFrom: since })
    const marek = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Inny', role: 'coach' })
    // The treasurer works from the member side on the phone (`/club`), where D-042 found no handover at all.
    const beata = await signedInStaff(request, club, { firstName: 'Beata', lastName: 'Skarbnik', role: 'treasurer' })

    // Rafał takes PLN 200 + 200 + 135 in three acceptances: three KP receipts with him.
    for (const [charge, amount] of [
      [feeCharges[0], 20000],
      [feeCharges[1], 20000],
      [feeCharges[2], 13500],
    ] as const) {
      const taken = await call<CodedBody>(request, 'POST', '/api/payments/group-charges/cash', rafal.token, {
        data: { groupId: zaki, participantPersonId: charge.personId, chargeIds: [charge.id], amount, paidOn: today },
      })
      expect(taken.status, JSON.stringify(taken.body)).toBe(201)
    }
    const before = await mine(request, rafal.token)
    expect(before.status, JSON.stringify(before.body)).toBe(200)
    expect(before.body?.total).toBe(53500)
    expect(before.body?.held).toHaveLength(3)
    expect(before.body?.handovers).toEqual([])
    const [p1, p2, p3] = (before.body?.held ?? []).map((payment) => payment.paymentId)
    // The confirmers' queue is refused to the coach.
    expect((await call(request, 'GET', '/api/payments/cash-handovers?status=pending', rafal.token)).status).toBe(403)

    // --- The coach sends a handover on the phone: all three preselected. ---
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    const rafalPassword = await signInBrowser(page, request, club, rafal.userId, rafal.email)
    rafal.token = await getAuthToken(request, rafal.email, rafalPassword)
    await openIn('pl', '/club/coach/payments')
    await expect(page.getByTestId('coach-handover')).toBeVisible()
    await page.getByTestId('coach-handover-start').click()
    await expect(page.getByTestId('coach-handover-payment')).toHaveCount(3)
    await expect(page.getByTestId('coach-handover-total')).toHaveText(/535/)
    await page.getByTestId('coach-handover-send').click()
    await expect(page.getByTestId('coach-handover-pending')).toHaveCount(1)
    const firstNumber = String(await page.getByTestId('coach-handover-number').textContent())
    expect(firstNumber).toMatch(RG)
    const afterSend = await mine(request, rafal.token)
    const first = afterSend.body?.handovers?.find((handover) => handover.status === 'pending')
    expect(first?.number).toBe(firstNumber)
    const firstId = String(first?.id)
    // Still his cash, reserved by the pending handover.
    expect(afterSend.body?.total).toBe(53500)
    expect(afterSend.body?.held?.every((payment) => payment.pendingHandoverId === firstId)).toBe(true)
    const grouped = await call<CodedBody & { cash?: { total: number } }>(
      request,
      'GET',
      '/api/payments/group-charges',
      rafal.token,
    )
    expect(grouped.body?.cash?.total).toBe(53500)
    expect(await noticeChannels(club, `payments:cash-handover:${firstId}:sent`)).toEqual(
      expect.objectContaining({ [beata.personId]: expect.arrayContaining(['in_app']) }),
    )

    // A payment of a pending handover cannot be sent again or accepted one-sided.
    const twice = await send(request, rafal.token, [p1])
    expect(twice.status, JSON.stringify(twice.body)).toBe(409)
    expect(twice.body?.code).toBe('cash_handover_payment_pending')
    const fallbackOnPending = await call<Sent>(request, 'POST', '/api/payments/cash-handovers', admin, {
      data: { collectorPersonId: rafal.personId, paymentIds: [p1] },
    })
    expect(fallbackOnPending.status, JSON.stringify(fallbackOnPending.body)).toBe(409)
    expect(fallbackOnPending.body?.code).toBe('cash_handover_payment_pending')
    const reservedRow = await custody(request, admin)
    expect(reservedRow.body?.items?.[0]?.payments.every((payment) => payment.pendingHandoverId === firstId)).toBe(true)

    // Another coach cannot withdraw it (404, like an unknown id); Rafał withdraws it in the browser.
    expect((await withdraw(request, marek.token, firstId)).status).toBe(404)
    await page.getByTestId('coach-handover-withdraw').click()
    await expect(page.getByTestId('coach-handover-pending')).toHaveCount(0)
    await expect(page.getByTestId('coach-handover-latest')).toHaveAttribute('data-status', 'withdrawn')
    expect((await withdraw(request, rafal.token, firstId)).body?.code).toBe('cash_handover_not_pending')
    expect((await mine(request, rafal.token)).body?.held?.every((payment) => payment.pendingHandoverId === null)).toBe(
      true,
    )

    // He sends all three again (API): a new number; the withdrawn one is not reused.
    const second = await send(request, rafal.token, [p1, p2, p3])
    expect(second.status, JSON.stringify(second.body)).toBe(201)
    expect(second.body).toMatchObject({ status: 'pending', amount: 53500 })
    expect(second.body?.number).not.toBe(firstNumber)
    const secondId = String(second.body?.id)

    // --- The treasurer on the phone: the Today row, the list, a rejection with a reason. ---
    const beataPassword = await switchBrowserUser(page, request, club, beata.userId, beata.email)
    beata.token = await getAuthToken(request, beata.email, beataPassword)
    const violations: Record<string, unknown> = {}
    for (const locale of LOCALES) {
      await openIn(locale, '/club')
      const row = page.getByTestId('club-tile-cash-handovers')
      await expect(row).toHaveAttribute('href', '/club/cash-handovers')
      await expect(page.getByTestId('club-tile-cash-handovers-state'), locale).toHaveText(
        uiText('payments.cashHandovers.tile.state', { params: { count: '1' } }),
      )
      await row.click()
      await expect(page).toHaveURL(/\/club\/cash-handovers$/)
      await expect(page.getByTestId('pending-handover')).toHaveCount(1)
      await expect(page.getByTestId('pending-handover-collector')).toHaveText('Rafał Trener')
      await expect(page.getByTestId('pending-handover-number')).toHaveText(String(second.body?.number))
      Object.assign(violations, await scanSchemes(page, testInfo, `/club/cash-handovers (${locale})`))
    }
    // A rejection needs a reason: the form says so, the API answers 400.
    await page.getByTestId('pending-handover-reject').click()
    await page.getByTestId('pending-handover-reject-send').click()
    await expect(page.getByTestId('pending-handover-problem')).toHaveText(
      uiText('payments.cashHandovers.reasonRequired', { exact: true }),
    )
    expect((await decide(request, beata.token, secondId, 'reject', {})).status).toBe(400)
    await page.getByTestId('pending-handover-reason').fill('Brakuje 20 zł')
    await page.getByTestId('pending-handover-reject-send').click()
    await expect(page.getByTestId('pending-handovers-empty')).toBeVisible()
    expect((await decide(request, beata.token, secondId, 'confirm')).body?.code).toBe('cash_handover_not_pending')
    expect(await noticeChannels(club, `payments:cash-handover:${secondId}:rejected`)).toEqual(
      expect.objectContaining({ [rafal.personId]: expect.arrayContaining(['in_app']) }),
    )

    // Rafał sees the reason; the payments are free again. He sends a corrected handover without Ula's receipt.
    const rejected = await mine(request, rafal.token)
    expect(rejected.body?.handovers?.[0]).toMatchObject({
      id: secondId,
      status: 'rejected',
      rejectionReason: 'Brakuje 20 zł',
    })
    expect(rejected.body?.held?.every((payment) => payment.pendingHandoverId === null)).toBe(true)
    const third = await send(request, rafal.token, [p1, p2])
    expect(third.status, JSON.stringify(third.body)).toBe(201)
    const thirdId = String(third.body?.id)

    // Beata confirms it on the phone: the whole handover; the cash leaves "Cash with you".
    await openIn('pl', '/club/cash-handovers')
    await expect(page.getByTestId('pending-handover-amount')).toHaveText(/400/)
    await page.getByTestId('pending-handover-confirm').click()
    await expect(page.getByTestId('pending-handovers-empty')).toBeVisible()
    await openIn('en', '/club')
    await expect(page.getByTestId('club-tile-cash-handovers-state')).toHaveText(
      uiText('payments.cashHandovers.tile.none', { exact: true }),
    )
    const confirmed = await mine(request, rafal.token)
    expect(confirmed.body?.total).toBe(13500)
    expect(confirmed.body?.held?.map((payment) => payment.paymentId)).toEqual([p3])
    expect(confirmed.body?.handovers?.[0]).toMatchObject({ id: thirdId, status: 'confirmed' })
    const settled = await custody(request, beata.token)
    expect(settled.body?.total).toBe(13500)
    expect(settled.body?.items).toEqual([expect.objectContaining({ collectorPersonId: rafal.personId, total: 13500 })])
    const stored = await withClient((client) =>
      client.query<{ status: string; amount: number; settled: string; decided_by_person_id: string | null }>(
        `select h.status, h.amount, h.decided_by_person_id,
                (select count(*) from payments_payments p where p.cash_handover_id = h.id)::text as settled
           from payments_cash_handovers h where h.id = $1`,
        [thirdId],
      ),
    )
    expect(stored.rows).toEqual([
      { status: 'confirmed', amount: 40000, settled: '2', decided_by_person_id: beata.personId },
    ])
    // A confirmed payment cannot be handed over again.
    const again = await send(request, rafal.token, [p1])
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('cash_already_settled')
    expect(await noticeChannels(club, `payments:cash-handover:${thirdId}:confirmed`)).toEqual(
      expect.objectContaining({ [rafal.personId]: expect.arrayContaining(['in_app']) }),
    )

    // The fallback: the administrator accepts Ula's receipt one-sided; Rafał is told.
    const fallback = await call<Sent>(request, 'POST', '/api/payments/cash-handovers', admin, {
      data: { collectorPersonId: rafal.personId, paymentIds: [p3] },
    })
    expect(fallback.status, JSON.stringify(fallback.body)).toBe(201)
    const fallbackId = String(fallback.body?.id)
    expect(await noticeChannels(club, `payments:cash-handover:${fallbackId}:settled`)).toEqual(
      expect.objectContaining({ [rafal.personId]: expect.arrayContaining(['in_app']) }),
    )
    expect(await custody(request, admin)).toMatchObject({ status: 200, body: { items: [], total: 0 } })
    expect((await mine(request, rafal.token)).body?.total).toBe(0)

    // The history: every state, newest first; the pending filter is empty.
    const history = await call<Page_>(request, 'GET', '/api/payments/cash-handovers', admin)
    expect(history.body?.items?.map((item) => [item.id, item.status])).toEqual([
      [fallbackId, 'confirmed'],
      [thirdId, 'confirmed'],
      [secondId, 'rejected'],
      [firstId, 'withdrawn'],
    ])
    expect((await call<Page_>(request, 'GET', '/api/payments/cash-handovers?status=pending', admin)).body?.total).toBe(
      0,
    )

    // The audit log: sent and withdrawn, sent and rejected, sent and confirmed, the fallback.
    expect(await auditCount(firstId)).toBe(2)
    expect(await auditCount(secondId)).toBe(2)
    expect(await auditCount(thirdId)).toBe(2)
    expect(await auditCount(fallbackId)).toBe(1)

    // Rafał's page in both locales and colour schemes, with the latest decision shown.
    await switchBrowserUser(page, request, club, rafal.userId, rafal.email)
    for (const locale of LOCALES) {
      await openIn(locale, '/club/coach/payments')
      await expect(page.getByTestId('coach-handover-latest')).toHaveAttribute('data-status', 'settled')
      Object.assign(violations, await scanSchemes(page, testInfo, `/club/coach/payments (${locale})`))
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
