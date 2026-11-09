import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { call, createClub } from '../_fixtures/club'
import { awaitEmails } from '../_fixtures/communication'
import { listRentals } from '../_fixtures/facilities'
import { publicPitch } from '../_fixtures/public-places'

// Issue #125 (E08-S05), facilities spec P-04, P-05, B-25, J-007, TEST-039: a guest on a phone (375 px) opens the
// public month of the pitch, presses "Request a booking" on the bookable 13:00–16:00 stretch and sees "Valid only after
// administrator approval" before sending; Escape closes the dialog. The form shows the indicative amount of the chosen
// category, passes an axe scan in light and dark mode, and after sending says "Check your inbox — confirm within 1
// hour". The confirmation link from the captured e-mail opens P-05: "Awaiting the administrator’s approval" with the
// summary; the same link again reads "Link expired". The club administrator then sees the request on B-25 with its
// requester, contact and time to expiry, and approves it with a new institution: the request leaves the queue and is
// a `requested` rental.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type QueueBody = { items?: Array<{ id: string; renterDisplayName: string }> }

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('TEST-039 request UI: P-04 dialog at 375 px, e-mail link to P-05, B-25 queue and approval', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-039-request-ui')
  try {
    const admin = club.adminToken
    const slug = `test-039-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, slug)
    const email = `test039-${club.tenant.organizationId.slice(0, 8)}@example.test`
    const requester = 'Akademia Testowa 039'

    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await setGuestLocale(page, 'en')

    // P-04: the bookable stretch of the fixture's Wednesday offers a request (the list on a phone).
    await page.goto(`/p/${slug}/places/${setup.placeSlug}?month=${setup.month}`)
    const day = page.getByTestId(`public-schedule-day-${setup.day}`)
    const open = day.getByTestId(`public-request-open-${setup.day}-1300`)
    await expect(open).toBeVisible()
    await open.click()
    const dialog = page.getByTestId('public-request-dialog')
    await expect(dialog).toBeVisible()
    // The approval message is on screen before anything is sent.
    await expect(dialog.getByTestId('public-request-approval-note')).toContainText(
      'Valid only after administrator approval',
    )
    // Escape closes the dialog; the button opens it again.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await open.click()
    await expect(dialog).toBeVisible()

    // Light and dark mode: no blocking axe violation with the dialog open.
    const violations = await scanInColorSchemes(page, testInfo, 'P-04 request dialog', async () => {
      await page
        .getByTestId(`public-schedule-day-${setup.day}`)
        .getByTestId(`public-request-open-${setup.day}-1300`)
        .click()
      await expect(page.getByTestId('public-request-dialog')).toBeVisible()
    })
    expect(violations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await expectNoPageOverflow(page)

    // The form: a client-side check first (nothing filled), then the real values.
    await dialog.getByTestId('public-request-submit').click()
    await expect(dialog.getByTestId('public-request-problem')).toContainText('Check the highlighted fields.')
    await dialog.getByTestId('public-request-name').fill(requester)
    await dialog.getByTestId('public-request-contact-name').fill('Gabriela Gość')
    await dialog.getByTestId('public-request-contact-phone').fill('600 100 200')
    await dialog.getByTestId('public-request-contact-email').fill(email)
    await dialog.getByTestId('public-request-category').click()
    await page.getByRole('option', { name: 'External / commercial', exact: true }).click()
    // The indicative amount of one unit at the external rate (250 zł per 90 minutes), marked approximate.
    await expect(dialog.getByTestId('public-request-amount')).toContainText('250')
    await expect(dialog.getByTestId('public-request-amount')).toContainText('Approximate')
    await dialog.getByTestId('public-request-purpose').fill('Sparing drużyn młodzieżowych')
    await dialog.getByTestId('public-request-regulations').click()
    await dialog.getByTestId('public-request-submit').click()
    await expect(dialog.getByTestId('public-request-sent')).toContainText('Check your inbox — confirm within 1 hour')
    await dialog.getByTestId('public-request-done').click()
    await expect(dialog).toBeHidden()
    expect(consoleErrors).toEqual([])

    // P-05: the link from the e-mail (sent in the form's language) confirms the request once.
    const [message] = await awaitEmails(email, 'Confirm your booking request')
    const link = message.links.find((href) => href.includes('/requests/verify/'))
    expect(link, 'the confirmation link').toBeTruthy()
    const verifyPath = new URL(String(link)).pathname
    await page.goto(verifyPath)
    await expect(page.getByTestId('public-verify-awaiting')).toContainText('Awaiting the administrator’s approval')
    await expect(page.getByTestId('public-verify-place')).toHaveText('Boisko A')
    await expect(page.getByTestId('public-verify-slot')).toContainText('13:00–14:30')
    await expect(page.getByTestId('public-verify-summary')).not.toContainText(verifyPath.split('/').pop() ?? '')
    await expectNoPageOverflow(page)
    // The link is spent: opening it again reads "Link expired".
    await page.goto(verifyPath)
    await expect(page.getByTestId('public-verify-expired')).toContainText('Link expired')

    // The public month now shows the slot as requested.
    await page.goto(`/p/${slug}/places/${setup.placeSlug}?month=${setup.month}`)
    await expect(page.getByTestId(`public-schedule-day-${setup.day}`)).toContainText('13:00–14:30')
    await expect(day.getByTestId(`public-request-open-${setup.day}-1300`)).toHaveCount(0)

    // B-25: the administrator sees the request with its contact and time to expiry and approves it.
    const queue = await call<QueueBody>(request, 'GET', '/api/facilities/rentals/requests', admin)
    expect(queue.status, JSON.stringify(queue.body)).toBe(200)
    const queued = queue.body?.items?.find((item) => item.renterDisplayName === requester)
    expect(queued, 'the request is in the queue').toBeTruthy()
    const id = String(queued?.id)
    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/backend/facilities/requests')
    const table = page.getByTestId('facilities-requests-table')
    await expect(table).toContainText(requester)
    await expect(table).toContainText(email)
    await expect(page.getByTestId(`facilities-request-expiry-${id}`)).toContainText(/\d+ h \d+ min/)
    await page.getByTestId(`facilities-request-actions-${id}`).getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Approve' }).click()
    const approve = page.getByTestId('facilities-request-approve-dialog')
    await expect(approve).toBeVisible()
    await approve.getByTestId('facilities-request-renter-mode').getByText('New institution').click()
    await expect(approve.getByTestId('facilities-request-institution-name')).toHaveValue(requester)
    await approve.getByTestId('facilities-request-approve-confirm').click()
    await expect(approve).toBeHidden()
    await expect(page.getByTestId(`facilities-request-actions-${id}`)).toHaveCount(0)
    await expect
      .poll(async () => (await listRentals(request, admin, '&tab=active')).find((rental) => rental.id === id)?.status)
      .toBe('requested')
    await page.setViewportSize({ width: 375, height: 812 })
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
