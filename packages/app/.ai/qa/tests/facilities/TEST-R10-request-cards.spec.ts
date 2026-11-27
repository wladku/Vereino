import { expect, test, type Page } from '@playwright/test'
import { addDays, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { create, getOne, update } from '../_fixtures/club-structure'
import { listRentals, postEntryBan, runRequestProbe } from '../_fixtures/facilities'
import {
  decide,
  heldRequest,
  lapseRequestHold,
  queuedRequest,
  requestForm,
  requestQueue,
  requestRow,
} from '../_fixtures/facility-requests'
import { uniqueAddress } from '../_fixtures/messaging'
import { PRIVATE_NAMES, publicPitch } from '../_fixtures/public-places'
import { uiText } from '../_fixtures/ui-text'
import { signInBrowserContext } from '../_fixtures/auth'

// Issue #280 (E11-S06), facilities parity spec phase 6, REQ-R08, TEST-R10, AC-R06, B-25 (DD-R16): three held requests
// on a pitch owned by "Gmina Przykładowo" — a clean one sent through the public form, one colliding with the fixture's
// tournament and one whose requester matches the entry-ban register. The queue answers each fact of a card (the
// collision's label, the payee, the units, when the rules were accepted and the e-mail confirmed) and approving the
// colliding request answers 409. On B-25 every request is a card headed by the renter and the place, with the expiry
// badge, the contact, the purpose, the amount "to the account of" the owner, and the badges as text; the collision
// alert names the tournament. Approve opens a dialog whose first line names the owner, and the approved card leaves
// the queue; a rejected card leaves it too; a card whose hold lapsed meanwhile answers 409 `request_hold_expired` on
// approval and is removed with a message. axe finds no blocking violation at desktop and 768 px, in English and
// Polish, light and dark; the page does not overflow at 320 px.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const OWNER = 'Gmina Przykładowo'

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('TEST-R10 request cards: the facts of REQ-R08, the owner in the approval intro, 409 on a collision and on a lapsed hold', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r10-request-cards')
  try {
    const admin = club.adminToken
    const clubSlug = `test-r10-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, clubSlug)
    const { placeSlug, day } = setup
    const nextWeek = addDays(day, 7)
    const owner = await create(request, admin, 'institutions', { name: OWNER, type: 'municipality' })
    const place = await getOne(request, admin, 'places', setup.pitch)
    const owned = await update(
      request,
      admin,
      'places',
      { id: setup.pitch, ownerInstitutionId: owner },
      place?.updatedAt,
    )
    expect(owned.status, JSON.stringify(owned.body)).toBe(200)

    // The fixture's held request (10:00–11:30 on `day`) is the one whose hold will lapse.
    const held = await requestQueue(request, admin)
    expect(held.status, JSON.stringify(held.body)).toBe(200)
    const lapsingId = held.body?.items?.find(
      (item) => Date.parse(item.startsAt) === Date.parse(zoneInstant(day, '10:00')),
    )?.id
    expect(lapsingId, 'the fixture request').toBeTruthy()
    // A request held on the tournament's hours (stored by the probe: the public form refuses an occupied slot).
    const colliding = String(
      runRequestProbe(club, {
        op: 'seed',
        placeId: setup.pitch,
        startsAt: zoneInstant(day, '17:30'),
        endsAt: zoneInstant(day, '19:00'),
      }).id,
    )
    const cleanEmail = uniqueAddress('clean-r10')
    const clean = await heldRequest(
      clubSlug,
      placeSlug,
      requestForm(zoneInstant(nextWeek, '14:00'), cleanEmail, {
        renterDisplayName: 'FC Blokersi',
        purpose: 'turniej firmowy',
      }),
    )
    const ban = await postEntryBan(request, admin, {
      placeId: setup.pitch,
      subjectType: 'institution',
      subjectId: setup.banned,
      startsOn: calendarDate(),
      reason: 'Zniszczenie bramek',
    })
    expect(ban.status, JSON.stringify(ban.body)).toBe(201)
    const banned = await heldRequest(
      clubSlug,
      placeSlug,
      requestForm(zoneInstant(nextWeek, '11:00'), uniqueAddress('banned-r10'), { renterDisplayName: 'FC Zakazani' }),
    )

    // The queue: the facts of each card.
    const cleanItem = await queuedRequest(request, admin, clean.id)
    expect(cleanItem).toMatchObject({
      units: 1,
      conflicts: [],
      entryBanMatch: false,
      payee: { institutionId: owner, name: OWNER },
      contactEmail: cleanEmail,
      purpose: 'turniej firmowy',
    })
    expect(cleanItem.regulationsAcceptedAt).toBeTruthy()
    expect(cleanItem.emailVerifiedAt).toBeTruthy()
    const collidingItem = await queuedRequest(request, admin, colliding)
    expect(collidingItem.conflicts).toEqual([expect.objectContaining({ kind: 'session', label: PRIVATE_NAMES.event })])
    expect(collidingItem.regulationsAcceptedAt).toBeNull()
    expect((await queuedRequest(request, admin, banned.id)).entryBanMatch).toBe(true)
    // Negative: approving the colliding request answers 409 and leaves it held.
    const refused = await decide(
      request,
      admin,
      colliding,
      'approve',
      { createInstitution: { name: 'Organizator z zewnątrz', type: 'club' } },
      collidingItem.updatedAt,
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect((await requestRow(colliding))?.status).toBe('pending_approval')

    // B-25 in the browser, as the club administrator.
    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    await signInBrowserContext(page.request, club.tenant.email, club.tenant.password)
    await setLocale(page, 'pl')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/backend/facilities/requests')

    const cleanCard = page.getByTestId(`facilities-request-card-${clean.id}`)
    await expect(cleanCard).toBeVisible()
    // Each card is an article headed by the renter and the place.
    await expect(page.getByRole('article', { name: /FC Blokersi — Boisko A/ })).toBeVisible()
    await expect(page.getByTestId(`facilities-request-expiry-${clean.id}`)).toContainText(
      uiText('facilities.requests.card.expires'),
    )
    await expect(cleanCard).toContainText('1 × 90 min')
    await expect(page.getByTestId(`facilities-request-contact-${clean.id}`)).toContainText(cleanEmail)
    await expect(cleanCard).toContainText('turniej firmowy')
    await expect(cleanCard).toContainText('250')
    await expect(page.getByTestId(`facilities-request-payee-${clean.id}`)).toContainText(OWNER)
    await expect(page.getByTestId(`facilities-request-no-conflict-${clean.id}`)).toHaveText(
      uiText('facilities.requests.card.noConflict', { exact: true }),
    )
    await expect(page.getByTestId(`facilities-request-ban-${clean.id}`)).toHaveText(
      uiText('facilities.requests.card.noBan', { exact: true }),
    )
    await expect(page.getByTestId(`facilities-request-rules-${clean.id}`)).toHaveText(
      uiText('facilities.requests.card.rulesAccepted', { exact: true }),
    )
    await expect(page.getByTestId(`facilities-request-email-${clean.id}`)).toHaveText(
      uiText('facilities.requests.card.emailConfirmed', { exact: true }),
    )
    // The collision is an alert naming the tournament; the ban match is a badge.
    const conflictAlert = page.getByTestId(`facilities-request-conflicts-${colliding}`)
    await expect(conflictAlert).toContainText(uiText('facilities.requests.card.conflict'))
    await expect(conflictAlert).toContainText(PRIVATE_NAMES.event)
    await expect(page.getByTestId(`facilities-request-no-conflict-${colliding}`)).toHaveCount(0)
    await expect(page.getByTestId(`facilities-request-ban-${banned.id}`)).toHaveText(
      uiText('facilities.requests.card.banMatch', { exact: true }),
    )
    // The soonest expiry first: the fixture's request comes before the ones sent later.
    const cards = page.locator('[data-testid^="facilities-request-card-"]')
    await expect(cards).toHaveCount(4)
    await expect(cards.first()).toHaveAttribute('data-testid', `facilities-request-card-${String(lapsingId)}`)

    // Desktop and 768 px, Polish and English, light and dark: no blocking axe violation.
    const ready = async () => {
      await expect(page.getByTestId(`facilities-request-card-${clean.id}`)).toBeVisible()
    }
    const violations: Record<string, unknown> = {}
    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      for (const width of [1280, 768]) {
        await page.setViewportSize({ width, height: 900 })
        // The platform's AppShell (sidebar, back and brand links) has known findings; the baseline drops only those.
        Object.assign(
          violations,
          await scanInColorSchemes(page, testInfo, `B-25 ${locale} ${String(width)} px`, ready, {
            platformBaseline: true,
          }),
        )
      }
    }
    expect(violations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.reload()
    await ready()

    // Approve: the dialog's first line names the owner; the approved card leaves the queue.
    await page.getByTestId(`facilities-request-approve-${clean.id}`).click()
    const approve = page.getByTestId('facilities-request-approve-dialog')
    await expect(approve).toBeVisible()
    await expect(approve.getByTestId('facilities-request-approve-intro')).toContainText(OWNER)
    await approve
      .getByTestId('facilities-request-renter-mode')
      .getByText(uiText('facilities.requests.approve.mode.create'))
      .click()
    await approve.getByTestId('facilities-request-approve-confirm').click()
    await expect(approve).toBeHidden()
    await expect(page.getByTestId(`facilities-request-card-${clean.id}`)).toHaveCount(0)
    await expect
      .poll(
        async () => (await listRentals(request, admin, '&tab=active')).find((rental) => rental.id === clean.id)?.status,
      )
      .toBe('requested')

    // Reject the ban match with a reason; its card leaves the queue.
    await page.getByTestId(`facilities-request-reject-${banned.id}`).click()
    const reject = page.getByTestId('facilities-request-reject-dialog')
    await reject.getByTestId('facilities-request-reject-reason').fill('Zakaz wstępu na obiekt')
    await reject.getByTestId('facilities-request-reject-confirm').click()
    await expect(reject).toBeHidden()
    await expect(page.getByTestId(`facilities-request-card-${banned.id}`)).toHaveCount(0)

    // Negative: the hold of a card on screen lapses meanwhile; approval answers 409 and the card is removed with a
    // message.
    await lapseRequestHold(String(lapsingId))
    await page.getByTestId(`facilities-request-approve-${String(lapsingId)}`).click()
    await expect(approve).toBeVisible()
    await approve
      .getByTestId('facilities-request-renter-mode')
      .getByText(uiText('facilities.requests.approve.mode.create'))
      .click()
    const lapsedAnswer = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/rentals/${String(lapsingId)}/approve`) && response.request().method() === 'POST',
    )
    await approve.getByTestId('facilities-request-approve-confirm').click()
    expect((await lapsedAnswer).status()).toBe(409)
    await expect(approve).toBeHidden()
    await expect(page.getByText(uiText('facilities.errors.request_hold_expired')).first()).toBeVisible()
    await expect(page.getByTestId(`facilities-request-card-${String(lapsingId)}`)).toHaveCount(0)
    await expect(page.getByTestId(`facilities-request-card-${colliding}`)).toBeVisible()

    await expectNoPageOverflow(page)
    // The 409 answers above are expected; nothing else may log an error.
    expect(consoleErrors.filter((text) => !text.includes('409'))).toEqual([])
  } finally {
    await club.cleanup()
  }
})
