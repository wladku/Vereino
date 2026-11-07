import { expect, test } from '@playwright/test'
import { addDays, cancelOccurrence, getOccurrence, listOccurrences, weekdayOf } from '../_fixtures/activities'
import { familyFor, oneOff } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { addMembership } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'

// Issue #215 (follow-up of #199; club spec DD-37, README B-15): the backend sessions reads say whether the caller may
// cancel each session (`mayCancel`, from the cancel command's own `cancelRoleOf`). With `coach_may_cancel` off,
// Krystyna — the coordinator of the academy who also coaches the pool group — gets `mayCancel: false` for the pool
// session on the list and the record, and the sessions list and the record page offer her no "Cancel" there; the
// academy session, which she reaches as its coordinator, still offers it.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const CANCEL_ITEM = /^(Cancel session|Odwołaj termin)$/
const OPEN_ACTIONS = /Open actions|Otwórz akcje/

test('ISSUE-215 coach_may_cancel off hides "Cancel" on the backend sessions pages for a session reached only as a coach', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'issue-215')
  try {
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator
    const tomorrow = weekdayOf(addDays(calendarDate(), 1))
    const academy = await oneOff(request, club, coordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening akademii',
      type: 'training',
      weekday: tomorrow,
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    const pool = await oneOff(request, club, family.poolCoordinator.token, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Zajęcia na basenie',
      type: 'training',
      weekday: tomorrow,
      fromDaysAhead: 1,
      start: '19:00',
      end: '20:00',
    })
    // Krystyna also coaches the pool group (section B).
    await addMembership(request, club.adminToken, {
      groupId: family.poolGroup,
      personId: coordinator.personId,
      role: 'coach',
      validFrom: addDays(calendarDate(), -30),
    })

    // The default: she may cancel both.
    const byDefault = await listOccurrences(request, coordinator.token)
    expect(byDefault.status).toBe(200)
    expect(byDefault.items.find((item) => item.id === pool.session.id)).toMatchObject({ mayCancel: true })
    expect(byDefault.items.find((item) => item.id === academy.session.id)).toMatchObject({ mayCancel: true })

    const off = await updateClubSettings(request, club.adminToken, { coachMayCancel: false })
    expect(off.status, JSON.stringify(off.body)).toBe(200)

    // The list and the record: the pool session no longer, the academy session still.
    const list = await listOccurrences(request, coordinator.token)
    expect(list.items.find((item) => item.id === pool.session.id)).toMatchObject({ mayCancel: false })
    expect(list.items.find((item) => item.id === academy.session.id)).toMatchObject({ mayCancel: true })
    expect((await getOccurrence(request, coordinator.token, pool.session.id)).body).toMatchObject({
      mayCancel: false,
      actingRole: 'coach',
    })
    expect((await getOccurrence(request, coordinator.token, academy.session.id)).body).toMatchObject({
      mayCancel: true,
    })
    // The section's own coordinator still may cancel the pool session.
    expect((await getOccurrence(request, family.poolCoordinator.token, pool.session.id)).body).toMatchObject({
      mayCancel: true,
    })
    // The server agrees with the read.
    const forged = await cancelOccurrence(
      request,
      coordinator.token,
      pool.session.id,
      'Basen zamknięty',
      pool.session.updatedAt,
    )
    expect(forged.status, JSON.stringify(forged.body)).toBe(403)
    expect(forged.body?.code).toBe('coach_cancel_disabled')

    // --- The backend pages ---
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto('/backend/activities/occurrences')
    const poolRow = page.getByRole('row').filter({ hasText: 'Zajęcia na basenie' })
    await poolRow.getByRole('button', { name: OPEN_ACTIONS }).click()
    await expect(page.getByRole('menuitem', { name: /^(Open|Otwórz)$/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: CANCEL_ITEM })).toHaveCount(0)
    await page.keyboard.press('Escape')
    const academyRow = page.getByRole('row').filter({ hasText: 'Trening akademii' })
    await academyRow.getByRole('button', { name: OPEN_ACTIONS }).click()
    await expect(page.getByRole('menuitem', { name: CANCEL_ITEM })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.goto(`/backend/activities/occurrences/${pool.session.id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Zajęcia na basenie' })).toBeVisible()
    await expect(page.getByTestId('occurrence-attendance-link')).toBeVisible()
    await expect(page.getByTestId('occurrence-cancel-button')).toHaveCount(0)
    await page.goto(`/backend/activities/occurrences/${academy.session.id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Trening akademii' })).toBeVisible()
    await expect(page.getByTestId('occurrence-cancel-button')).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
