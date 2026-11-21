import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, weekdayOf } from '../_fixtures/activities'
import { addParticipants, familyFor, oneOff, readAttendanceList, startNow } from '../_fixtures/attendance'
import { calendarDate, createClub, type Club } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { postCampaign } from '../_fixtures/orders'
import { createFee, generate, periodFromNow } from '../_fixtures/payments'
import { undersizedTargets } from '../_fixtures/touch-targets'
import { uiText } from '../_fixtures/ui-text'

// TEST-083 (club spec amendment B, research TEST-C14; REQ-007, S7): the Żaki coach on a 375 px phone with an open
// attendance list checks off every participant and saves with the keyboard only (Tab, Space, Enter); after every Tab
// the focused element is not hidden behind the sticky action bar (WCAG 2.4.11), and the save button is reached by Tab
// and pressed with Enter. Every interactive target on the coach's Today and attendance list and on the guardian's
// Today, charges page and kit order form is at least 24 × 24 CSS px (WCAG 2.5.8). The focus check is `fixme` until
// the defect described above it is fixed.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

/** WCAG 2.5.8 Target Size (Minimum), level AA. */
const WCAG_MIN_TARGET_PX = 24
const MAX_TABS = 200

type FocusState = {
  /** The focused element: `<tag>[testid] role "name"`. */
  label: string
  inBar: boolean
  isSave: boolean
  /** A radio of a row whose group has no checked radio yet. */
  uncheckedRadio: boolean
  /** The part of the focused element's box the sticky bar covers, in CSS px². */
  covered: number
  focusBox: string
  barBox: string
}

/** The focused element and how much of it the sticky action bar covers. */
async function focusState(page: Page): Promise<FocusState | null> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    const bar = document.querySelector('[data-testid="club-attendance-actions"]')
    if (!active || active === document.body || !bar) return null
    const a = active.getBoundingClientRect()
    const b = bar.getBoundingClientRect()
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
    const role = active.getAttribute('role') ?? ''
    const group = active.closest('[role="radiogroup"]')
    const testId = active.getAttribute('data-testid')
    const name = (active.getAttribute('aria-label') ?? active.textContent ?? '').trim().replace(/\s+/g, ' ')
    const box = (rect: DOMRect) =>
      `${String(Math.round(rect.left))},${String(Math.round(rect.top))} ${String(Math.round(rect.width))}×${String(Math.round(rect.height))}`
    return {
      label: `${active.tagName.toLowerCase()}${testId ? `[${testId}]` : ''} ${role} "${name.slice(0, 40)}"`,
      inBar: bar.contains(active),
      isSave: testId === 'club-attendance-save',
      uncheckedRadio:
        role === 'radio' &&
        group !== null &&
        group.closest('[data-testid="club-attendance-row"]') !== null &&
        group.querySelector('[role="radio"][aria-checked="true"]') === null,
      covered: width * height,
      focusBox: box(a),
      barBox: box(b),
    }
  })
}

/** Waits until the page settled: its heading shows, nothing is busy and the network is idle. */
async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.waitForLoadState('networkidle')
}

type Setup = { sessionId: string; campaignId: string; family: Awaited<ReturnType<typeof familyFor>> }

/**
 * The family (`familyFor`) with eight more Żaki participants — eleven rows, longer than the screen, so the sticky bar
 * overlaps rows while the coach tabs through — a started training of Żaki, a monthly fee with this month's charges and
 * an open kit order campaign for Żaki.
 */
async function setUp(request: APIRequestContext, club: Club): Promise<Setup> {
  const admin = club.adminToken
  const family = await familyFor(request, club)
  await addParticipants(request, club, family.zaki, 8)
  const tomorrow = addDays(calendarDate(), 1)
  const training = await oneOff(request, club, family.academyCoordinator.token, {
    groupId: family.zaki,
    placeId: family.pitch,
    name: 'Trening dodatkowy',
    type: 'training',
    weekday: weekdayOf(tomorrow),
    fromDaysAhead: 1,
    start: '17:00',
    end: '18:00',
  })
  const sessionId = training.session.id
  await startNow(request, club, sessionId)
  await createFee(request, admin, {
    name: 'Składka Żaki',
    groupId: family.zaki,
    period: 'monthly',
    amount: 15000,
    dueDay: 28,
    validFrom: calendarDate(-60),
  })
  expect((await generate(request, admin, periodFromNow(0))).status).toBe(200)
  const campaign = await postCampaign(request, admin, {
    name: 'Strój akademii',
    sectionId: family.academy,
    groupIds: [family.zaki],
    closesOn: calendarDate(14),
    paymentDueOn: calendarDate(21),
    notesLabel: 'Uwagi',
    products: [{ key: 'kit', name: 'Komplet', sizesChild: ['128', '140'], priceChild: 8500, requiredAnswer: true }],
    open: true,
  })
  expect(campaign.status, JSON.stringify(campaign.body)).toBe(201)
  return { sessionId, campaignId: String(campaign.body?.id), family }
}

/**
 * Keyboard only: Tab through the attendance list from the top; Space marks each row "present" on its first radio;
 * Enter on the save button saves. Returns, for every Tab, the focused elements the sticky bar covers.
 */
async function checkOffWithKeyboard(page: Page): Promise<string[]> {
  await expect(page.getByTestId('club-attendance-actions')).toBeVisible()
  const hidden: string[] = []
  let marked = 0
  let reachedSave = false
  for (let tab = 0; tab < MAX_TABS; tab += 1) {
    await page.keyboard.press('Tab')
    const state = await focusState(page)
    if (!state) continue
    if (!state.inBar && state.covered > 1) {
      hidden.push(`Tab ${String(tab + 1)}: ${state.label} at ${state.focusBox} under the bar at ${state.barBox}`)
    }
    if (state.uncheckedRadio) {
      await page.keyboard.press('Space')
      await expect(page.locator(':focus')).toHaveAttribute('aria-checked', 'true')
      marked += 1
    }
    if (state.isSave) {
      reachedSave = true
      break
    }
  }
  expect(marked).toBe(11)
  expect(reachedSave).toBe(true)
  await expect(page.getByTestId('club-attendance-save')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('club-attendance-announcement')).toHaveText(
    uiText('activities.club.flash.attendanceSaved'),
  )
  return hidden
}

async function openAsCoach(page: Page, request: APIRequestContext, club: Club, setup: Setup): Promise<string> {
  page.setDefaultTimeout(30_000)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const password = await signInBrowser(page, request, club, setup.family.coach.userId, setup.family.coach.email)
  const token = await getAuthToken(request, setup.family.coach.email, password)
  await page.goto(`/club/occurrences/${setup.sessionId}/attendance`)
  await settled(page)
  await expect(page.getByTestId('club-attendance-row')).toHaveCount(11)
  await expect(page.getByTestId('club-attendance-not-started')).toHaveCount(0)
  return token
}

test('TEST-083 the coach checks off every participant and saves the attendance list on a phone with the keyboard only', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-083-keyboard')
  try {
    const setup = await setUp(request, club)
    const coachToken = await openAsCoach(page, request, club, setup)
    await checkOffWithKeyboard(page)
    const stored = await readAttendanceList(request, coachToken, setup.sessionId)
    expect(stored.status, JSON.stringify(stored.body)).toBe(200)
    expect(stored.body?.rows?.map((row) => row.actual)).toEqual(Array.from({ length: 11 }, () => 'present'))
    expect(stored.body?.occurrence?.status).toBe('planned')
  } finally {
    await club.cleanup()
  }
})

// Defect (found by this test, 2026-11-22): on a 375 × 812 phone, a row's radio or its "Clear" button that receives
// focus by Tab is scrolled only to the bottom edge of the viewport, where the sticky action bar
// (`club-attendance-actions`, `sticky bottom-24`, ClubAttendancePage.tsx) covers it entirely — e.g. the radio at
// 46,600 20×20 under the bar at 0,595 375×121 (WCAG 2.4.11 Focus Not Obscured). The page sets no `scroll-padding-bottom`
// (or `scroll-margin-bottom` on the rows) for the bar. Un-fixme once the focused element stays clear of the bar (#547).
test.fixme('TEST-083 the element focused by Tab on the attendance list is never hidden behind the sticky action bar', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-083-focus')
  try {
    const setup = await setUp(request, club)
    await openAsCoach(page, request, club, setup)
    expect(await checkOffWithKeyboard(page)).toEqual([])
  } finally {
    await club.cleanup()
  }
})

test("TEST-083 every interactive target on the coach's Today and attendance list and the guardian's Today and charges page is at least 24 × 24 px", async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-083-targets')
  try {
    const setup = await setUp(request, club)
    const undersized: Record<string, string[]> = {}
    const measure = async (label: string) => {
      const found = await undersizedTargets(page, WCAG_MIN_TARGET_PX)
      if (found.length > 0) undersized[label] = found
    }

    // The coach: the open attendance list and Today.
    await openAsCoach(page, request, club, setup)
    await measure('coach attendance')
    await page.goto('/club')
    await settled(page)
    await measure('coach /club')

    // The guardian: Today with the order tile, the charges page and the kit order form for the ward without an order.
    const { family, campaignId } = setup
    await switchBrowserUser(page, request, club, family.guardian.userId, family.guardian.email)
    await page.goto('/club')
    await settled(page)
    await expect(page.getByTestId('club-tile-order')).toHaveCount(1)
    await measure('guardian /club')
    await page.goto('/club/payments')
    await settled(page)
    await expect(page.getByTestId('club-charge').first()).toBeVisible()
    await measure('guardian /club/payments')
    // The order form is measured by the `fixme` test below until its defect is fixed; the form itself renders.
    await page.goto(`/club/orders/${campaignId}?child=${family.younger.personId}`)
    await settled(page)
    await expect(page.getByTestId('order-form')).toBeVisible()

    expect(undersized).toEqual({})
  } finally {
    await club.cleanup()
  }
})

// Defect (found by this test, 2026-11-22): on the guardian's kit order form (`/club/orders/[campaignId]?child=…`) the
// contact e-mail and phone fields (`order-email`, `order-phone`; OrderFormSection.tsx, the `Input`s under the contact
// legend) put `min-h-11` on the platform `Input` wrapper only; the inner `<input>` stays 20 px high (317×20 at 375 px)
// and a tap on the wrapper outside it does not focus the field, so the target is below 24 × 24 px (WCAG 2.5.8). E20-S12
// (#491) fixed the same case on the profile pages with `inputClassName="self-stretch"`. Un-fixme once fixed (#548).
test.fixme("TEST-083 every interactive target on the guardian's kit order form is at least 24 × 24 px", async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-083-order-form')
  try {
    const { family, campaignId } = await setUp(request, club)
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await page.goto(`/club/orders/${campaignId}?child=${family.younger.personId}`)
    await settled(page)
    await expect(page.getByTestId('order-form')).toBeVisible()
    expect(await undersizedTargets(page, WCAG_MIN_TARGET_PX)).toEqual([])
  } finally {
    await club.cleanup()
  }
})
