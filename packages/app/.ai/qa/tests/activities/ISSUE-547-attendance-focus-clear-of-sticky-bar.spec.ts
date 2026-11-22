import { expect, test, type APIRequestContext } from '@playwright/test'
import { addDays, createActivity, getOccurrence, moveOccurrence } from '../_fixtures/activities'
import { addParticipants, familyFor, sessionsOf } from '../_fixtures/attendance'
import { calendarDate, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'

// Issue #547 (WCAG 2.2 SC 2.4.11 focus not obscured; found by TEST-083 of club spec amendment B, #532): on a phone
// (375 × 812) the attendance list keeps its actions in a sticky bar above the bottom navigation. With 11 rows and every
// row marked (so each row also shows its "Clear" button), every element Tab reaches in the list stays entirely above
// the bar — before the fix, row radios and "Clear" buttons were scrolled into view underneath it.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

/** Moves the session (as the administrator) to have started `minutes` ago, for 90 minutes, so check-off is open. */
async function startedAgo(request: APIRequestContext, club: Club, id: string, minutes: number): Promise<void> {
  const current = await getOccurrence(request, club.adminToken, id)
  expect(current.status, JSON.stringify(current.body)).toBe(200)
  const startAt = new Date(Date.now() - minutes * 60_000)
  const endAt = new Date(startAt.getTime() + 90 * 60_000)
  const moved = await moveOccurrence(
    request,
    club.adminToken,
    id,
    { startAt: startAt.toISOString(), endAt: endAt.toISOString() },
    current.body?.updatedAt,
  )
  expect(moved.status, JSON.stringify(moved.body)).toBe(200)
}

type Focused = { inList: boolean; inBar: boolean; label: string; top: number; bottom: number; barTop: number }

test('ISSUE-547 the element focused by Tab on the attendance list at 375 px is never hidden behind the sticky action bar', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'issue-547')
  try {
    const family = await familyFor(request, club)
    // Eleven participants of Żaki: the family's three and eight more.
    await addParticipants(request, club, family.zaki, 8)
    const training = await createActivity(request, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening poranny',
      type: 'training',
      coachPersonId: family.coach.personId,
      startsOn: addDays(calendarDate(), 1),
      startTime: '07:00',
      endTime: '08:30',
    })
    const trainingId = (await sessionsOf(request, club, training.id)).at(0)?.id
    if (!trainingId) throw new Error('[test] the training has no session')
    await startedAgo(request, club, trainingId, 10)

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/occurrences/${trainingId}/attendance`)
    const rows = page.getByTestId('club-attendance-row')
    await expect(rows).toHaveCount(11)
    const bar = page.getByTestId('club-attendance-actions')
    await expect(bar).toBeVisible()
    await expect(bar).toHaveCSS('position', 'sticky')
    // Mark every row, so each row has its four radios and a "Clear" button.
    for (let index = 0; index < 11; index += 1) {
      await rows.nth(index).getByRole('radio').first().check()
    }
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(11)

    // From the top of the page, Tab through the whole list; record where every focused list control ends up.
    // A click on the (unfocusable) title moves the browser's Tab starting point above the list; `blur()` would leave
    // it on the last radio checked.
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await page.getByTestId('club-attendance-title').click()
    const hidden: string[] = []
    const trail: string[] = []
    let listStops = 0
    for (let step = 1; step <= 120; step += 1) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate((): Focused | null => {
        const element = document.activeElement
        const actions = document.querySelector('[data-testid="club-attendance-actions"]')
        if (!element || element === document.body || !actions) return null
        const rect = element.getBoundingClientRect()
        const label = `${element.tagName.toLowerCase()} ${element.getAttribute('role') ?? ''} "${
          element.getAttribute('aria-label') ?? element.textContent.trim()
        }"`
        return {
          inList: element.closest('[data-testid="club-attendance-row"]') !== null,
          inBar: actions.contains(element),
          label,
          top: rect.top,
          bottom: rect.bottom,
          barTop: actions.getBoundingClientRect().top,
        }
      })
      trail.push(
        [
          String(step),
          focused ? `${focused.label} list=${String(focused.inList)} bar=${String(focused.inBar)}` : 'body',
        ].join(': '),
      )
      // Before the list (header, navigation) keep tabbing; the first stop after the list ends the walk.
      if (!focused || focused.inBar || !focused.inList) {
        if (listStops > 0) break
        continue
      }
      listStops += 1
      if (focused.bottom > focused.barTop) {
        hidden.push(
          `Tab ${String(step)}: ${focused.label} ${String(Math.round(focused.top))}–${String(Math.round(focused.bottom))}, bar at ${String(Math.round(focused.barTop))}`,
        )
      }
    }
    // Eleven rows, each with one radio stop (arrow keys move inside a group) and a "Clear" button.
    expect(listStops, trail.join('\n')).toBeGreaterThanOrEqual(22)
    expect(hidden).toEqual([])
  } finally {
    await club.cleanup()
  }
})
