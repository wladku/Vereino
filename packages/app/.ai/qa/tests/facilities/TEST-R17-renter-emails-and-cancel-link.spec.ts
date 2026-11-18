import { expect, test, type Page } from '@playwright/test'
import { addDays, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { createClub } from '../_fixtures/club'
import { emailsTo } from '../_fixtures/communication'
import { getRental, phoneRental, postRental, rentalAction } from '../_fixtures/facilities'
import { queueFilesContain, requestAuditRows } from '../_fixtures/facility-requests'
import { uniqueAddress } from '../_fixtures/messaging'
import { getCharge } from '../_fixtures/payments'
import { publicPitch } from '../_fixtures/public-places'
import {
  cancelByLink,
  cancelLinkOf,
  cancelTokenOf,
  expireRentalLink,
  latestEmail,
  passCancellationDeadline,
  previewCancel,
  rentalDeliveries,
  rentalLinkRows,
} from '../_fixtures/rental-links'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// Issue #286 (E11-S12), facilities parity spec phase 12, TEST-R17 and the preview part of TEST-R14 (REQ-R17, J-R06,
// AC-R13; DD-R13, DD-44, DD-46): a rental staff enter with an e-mail address sends the renter a summary with the
// amount, the deadlines and a cancellation link; a move sends the "moved" e-mail with a fresh link and the old one
// stops working. The preview names the place, the slot, the amount and the payee and no contact data. Cancelling
// before the deadline is `cancelled_free` (the charge cancelled), after it `cancelled_late` (the charge forfeited),
// each with its e-mail; a spent link, a link opened after the start and an unknown one answer 410 with no data. A
// rental without an address gets nothing. The token is in no response, no queue file (events and jobs) and no
// action-log payload; the delivery's secret is wiped once the e-mail is sent. J-R06 runs in the browser at 375 px in
// both locales and colour schemes. The 429 per IP is not integration-tested: `OM_INTEGRATION_TEST` disables rate
// limits; both public routes declare `metadata.POST.rateLimit` (as TEST-024, TEST-036).
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const PREVIEW_KEYS = [
  'amount',
  'cancellationDeadline',
  'club',
  'currency',
  'endsAt',
  'free',
  'payeeName',
  'placeName',
  'startsAt',
  'timeZone',
]

/**
 * The longest fixed part of a Polish catalog text (the club's default language, which a staff entry's e-mails use):
 * the text between its placeholders, so a check never depends on the place, the slot or the amount.
 */
function pl(key: string): string {
  return uiTextIn('pl', key)
    .split(/{[^}]+}/)
    .reduce((longest, part) => (part.length > longest.length ? part : longest), '')
}

const SUMMARY = pl('facilities.email.rentalSummary.subject')
const MOVED = pl('facilities.email.rentalMoved.subject')
const CANCELLED = pl('facilities.email.rentalCancelled.subject')

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('TEST-R17 renter e-mails and cancellation link: summary, moved, free and late cancellation, 410s, no token leaks, J-R06 at 375 px', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r17-renter-link')
  try {
    const admin = club.adminToken
    const clubSlug = `test-r17-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, clubSlug)
    const nextWeek = addDays(setup.day, 7)
    const enter = async (time: string, email: string | null) => {
      const created = await postRental(request, admin, {
        ...phoneRental(setup.pitch, setup.neighbours, zoneInstant(nextWeek, time)),
        ...(email ? { contactEmail: email } : {}),
      })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      return String(created.body?.id)
    }

    // --- The summary of a staff entry, then the "moved" e-mail with a fresh link ---
    const renter = uniqueAddress('renter-r17')
    const first = await enter('08:00', renter)
    const summary = await latestEmail(renter, SUMMARY)
    expect(summary.text).toMatch(/250[.,]00/)
    expect(summary.text).toContain(pl('facilities.email.requestApproved.cancellationDeadline'))
    expect(summary.text).toContain(pl('facilities.email.rental.cancelLink'))
    expect(cancelLinkOf(summary)).toContain(`/p/${clubSlug}/rentals/cancel/`)
    const summaryToken = cancelTokenOf(summary)
    // Only the hash is stored, valid until the rental starts.
    const [link] = await rentalLinkRows(first)
    expect(link).toMatchObject({ purpose: 'cancel', used_at: null })
    expect(link.token_hash).not.toContain(summaryToken)
    expect(new Date(link.expires_at).toISOString()).toBe(new Date(zoneInstant(nextWeek, '08:00')).toISOString())

    const moved = await rentalAction(request, admin, first, 'move', { startsAt: zoneInstant(nextWeek, '09:30') })
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    const movedMail = await latestEmail(renter, MOVED)
    expect(movedMail.text).toContain('09:30')
    const token = cancelTokenOf(movedMail)
    expect(token).not.toBe(summaryToken)
    expect(await rentalLinkRows(first)).toHaveLength(1)
    // The summary's link no longer works: 410 with no data.
    const old = await previewCancel(summaryToken)
    expect(old.status, old.text).toBe(410)
    expect(Object.keys(old.body ?? {}).sort()).toEqual(['code', 'error'])

    // --- The preview (TEST-R14 preview part): what cancelling does, no contact data ---
    const preview = await previewCancel(token)
    expect(preview.status, preview.text).toBe(200)
    expect(Object.keys(preview.body ?? {}).sort()).toEqual(PREVIEW_KEYS)
    expect(preview.body).toMatchObject({ placeName: 'Boisko A', amount: 25_000, free: true })
    expect(preview.body?.startsAt).toBe(new Date(zoneInstant(nextWeek, '09:30')).toISOString())
    for (const contact of ['Jan Kontakt', '600 000 001', renter, token]) expect(preview.text).not.toContain(contact)

    // --- Cancel before the deadline: `cancelled_free`, the charge cancelled, the e-mail, the link spent ---
    const unconfirmed = await cancelByLink(token, false)
    expect(unconfirmed.status, unconfirmed.text).toBe(400)
    const cancelled = await cancelByLink(token)
    expect(cancelled.status, cancelled.text).toBe(200)
    expect(cancelled.body).toEqual({ status: 'cancelled_free' })
    const freeRental = await getRental(request, admin, first)
    expect(freeRental.status).toBe('cancelled_free')
    if (freeRental.chargeId) expect((await getCharge(request, admin, freeRental.chargeId)).status).toBe('cancelled')
    const freeMail = await latestEmail(renter, CANCELLED)
    expect(freeMail.text).toContain(pl('facilities.email.rentalCancelled.free'))
    expect(cancelLinkOf(freeMail)).toBeNull()
    expect((await rentalLinkRows(first))[0].used_at).not.toBeNull()
    // A spent link: 410 `token_link_used`, for the preview too; an unknown token reads the same.
    const twice = await cancelByLink(token)
    expect(twice.status, twice.text).toBe(410)
    expect(twice.body?.code).toBe('token_link_used')
    expect((await previewCancel(token)).status).toBe(410)
    expect((await previewCancel('x'.repeat(43))).status).toBe(410)

    // --- After the deadline: the forfeit is stated, `cancelled_late`, the charge forfeited ---
    const lateRenter = uniqueAddress('late-r17')
    const second = await enter('11:00', lateRenter)
    const lateToken = cancelTokenOf(await latestEmail(lateRenter, SUMMARY))
    await passCancellationDeadline(second)
    const latePreview = await previewCancel(lateToken)
    expect(latePreview.status, latePreview.text).toBe(200)
    expect(latePreview.body?.free).toBe(false)
    const late = await cancelByLink(lateToken)
    expect(late.status, late.text).toBe(200)
    expect(late.body).toEqual({ status: 'cancelled_late' })
    const lateRental = await getRental(request, admin, second)
    if (lateRental.chargeId) expect((await getCharge(request, admin, lateRental.chargeId)).status).toBe('forfeited')
    expect((await latestEmail(lateRenter, CANCELLED)).text).toContain(pl('facilities.email.rentalCancelled.late'))

    // --- A link opened after the rental started: 410 with no data ---
    const startedRenter = uniqueAddress('started-r17')
    const third = await enter('12:30', startedRenter)
    const startedToken = cancelTokenOf(await latestEmail(startedRenter, SUMMARY))
    await expireRentalLink(third)
    const started = await previewCancel(startedToken)
    expect(started.status, started.text).toBe(410)
    expect(started.body?.code).toBe('token_link_expired')
    expect((await cancelByLink(startedToken)).status).toBe(410)
    expect((await getRental(request, admin, third)).status).toBe('requested')

    // --- No address: nothing sent, no link ---
    const silent = await enter('14:00', null)
    await rentalAction(request, admin, silent, 'cancel')
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    expect(await rentalDeliveries(silent)).toEqual([])
    expect(await rentalLinkRows(silent)).toEqual([])

    // --- DD-44: the token only in the delivery secret, wiped once sent ---
    for (const raw of [summaryToken, token, lateToken, startedToken]) expect(queueFilesContain(raw)).toBe(false)
    const audit = await requestAuditRows(first)
    // The staff entry and move keep their payloads; the renter's cancellation keeps none.
    expect(audit.at(-1)?.has_payload).toBe(false)
    await expect
      .poll(async () => (await rentalDeliveries(first)).map((row) => [row.template_id, row.status, row.has_secret]))
      .toEqual([
        ['facilities.rental_summary', 'sent', false],
        ['facilities.rental_moved', 'sent', false],
        ['facilities.rental_cancelled', 'sent', false],
      ])

    // --- J-R06 in the browser: 375 px, both locales, light and dark ---
    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    const browserRenter = uniqueAddress('browser-r17')
    await enter('19:30', browserRenter)
    const freePath = new URL(String(cancelLinkOf(await latestEmail(browserRenter, SUMMARY)))).pathname
    await setGuestLocale(page, 'en')
    await page.goto(freePath)
    await expect(page.getByTestId('public-cancel-terms')).toContainText(uiText('facilities.public.cancel.free.title'))
    await expect(page.getByTestId('public-cancel-place')).toHaveText('Boisko A')
    await expect(page.getByTestId('public-cancel-summary')).not.toContainText('Jan Kontakt')
    const violations = await scanInColorSchemes(page, testInfo, 'J-R06 cancellation page', async () => {
      await expect(page.getByTestId('public-cancel-confirm')).toBeVisible()
    })
    expect(violations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await expectNoPageOverflow(page)
    await setGuestLocale(page, 'pl')
    await page.reload()
    await expect(page.getByTestId('public-cancel-confirm')).toHaveText(
      uiText('facilities.public.cancel.action', { exact: true }),
    )
    await page.getByTestId('public-cancel-confirm').click()
    await expect(page.getByTestId('public-cancel-done-cancelled_free')).toContainText(
      uiText('facilities.public.cancel.done.title'),
    )
    // The spent link shows no data.
    await page.reload()
    await expect(page.getByTestId('public-cancel-expired')).toBeVisible()
    await expect(page.getByTestId('public-cancel-summary')).toHaveCount(0)

    // After the deadline the forfeit is stated before the button (dark mode, Polish).
    const lateBrowserRenter = uniqueAddress('browser-late-r17')
    const lateBrowser = await enter('08:00', lateBrowserRenter)
    const latePath = new URL(String(cancelLinkOf(await latestEmail(lateBrowserRenter, SUMMARY)))).pathname
    await passCancellationDeadline(lateBrowser)
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.goto(latePath)
    await expect(page.getByTestId('public-cancel-terms')).toContainText(uiText('facilities.public.cancel.late.title'))
    await page.getByTestId('public-cancel-confirm').click()
    await expect(page.getByTestId('public-cancel-done-cancelled_late')).toBeVisible()
    await expectNoPageOverflow(page)
    // The spent link's 410 is the one expected console line.
    expect(consoleErrors.filter((line) => !line.includes('410'))).toEqual([])
    // No e-mail went to an address without a rental of its own.
    expect(emailsTo(renter, SUMMARY)).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
