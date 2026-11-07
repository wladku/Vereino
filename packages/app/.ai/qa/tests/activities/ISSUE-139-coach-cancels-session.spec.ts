import { expect, test, type Page } from '@playwright/test'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { addDays, cancelOccurrence, readNotifications, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, oneOff } from '../_fixtures/attendance'
import { calendarDate, createClub, signInAs } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { awaitEmails, getThread, listThreads } from '../_fixtures/communication'
import { addMembership } from '../_fixtures/groups'
import { actionLogEntries } from '../_fixtures/people'

// Issue #139 (README M-04, M-05, F-05; club spec REQ-009, R01; foundation III REQ-M07): a coach cancels a session from
// the phone (375 px) and the section's coordinator is told. Marek, the coach of Żaki, cancels from M-04 with "Pitch
// closed": the response records the role `coach`, the audit entry too; Krystyna, the academy's coordinator, gets the
// in-app notice naming "Marek Trener" as the coach and the e-mail, and the session thread reads "Cancelled by Marek
// Trener (coach): Pitch closed". The instructor of the pool group, a coach of another group, is refused with 403.
// Krystyna, who also coaches Żaki, cancels another session from M-05 in the coach role she acted in, and gets no
// coordinator notice about her own cancellation. The club setting `coach_may_cancel` is covered by ISSUE-199.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const SESSION_NOTICE = 'activities.occurrence_cancelled'

type NoticeWithKey = { bodyKey?: string | null; bodyVariables?: Record<string, string> | null }

async function cancelInDialog(page: Page, sessionId: string, reason: string) {
  await page.getByTestId('club-session-cancel').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(/section's coordinators|koordynatorzy sekcji/)
  await dialog.getByTestId('club-session-cancel-reason').fill(reason)
  const answer = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/activities/occurrences/${sessionId}/cancel`) &&
      response.request().method() === 'POST',
  )
  await dialog.getByTestId('club-session-cancel-confirm').click()
  const response = await answer
  expect(response.status()).toBe(200)
  return (await response.json()) as { status?: string; actingRole?: string; notified?: number }
}

test('ISSUE-139 a coach cancels from the phone, the coordinator is told in the app, by e-mail and in the thread, the role is recorded; another group coach is refused', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'issue-139')
  try {
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator
    const inTwoDays = addDays(calendarDate(), 2)
    const first = await oneOff(request, club, coordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening sobotni',
      type: 'training',
      weekday: weekdayOf(addDays(calendarDate(), 1)),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    const second = await oneOff(request, club, coordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Sparing wewnętrzny',
      type: 'training',
      weekday: weekdayOf(inTwoDays),
      fromDaysAhead: 2,
      start: '17:00',
      end: '18:00',
    })
    const firstId = first.session.id
    const secondId = second.session.id

    // A coach of another group (the pool instructor) posts a cancellation: 403, the session stays planned.
    const outside = await cancelOccurrence(
      request,
      family.instructor.token,
      firstId,
      'Nie moje',
      first.session.updatedAt,
    )
    expect(outside.status, JSON.stringify(outside.body)).toBe(403)

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // --- Marek, the coach of Żaki, cancels from M-04 ---
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto(`/club/occurrences/${firstId}?as=coach`)
    await expect(page.getByTestId('club-session-title')).toHaveText('Trening sobotni')
    await expect(page.getByTestId('club-session-coach')).toContainText(
      /The session will not take place|Zajęcia się nie odbędą/,
    )
    const cancelled = await cancelInDialog(page, firstId, 'Pitch closed')
    expect(cancelled).toMatchObject({ status: 'cancelled', actingRole: 'coach' })
    // Żaki's three participants, the two guardians and Krystyna, the section's coordinator.
    expect(cancelled.notified).toBe(6)
    await expect(page.getByTestId('club-session-cancelled')).toContainText('Pitch closed')

    // R01: the audit entry records the coach role (read by the club administrator with the tenant-wide audit view).
    await setRoleAclFeatures(request, club.superToken, {
      roleId: club.tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.view_tenant'],
    })
    const cancelLog = (await actionLogEntries(request, club.adminToken, firstId)).find(
      (entry) => entry.commandId === 'activities.occurrences.cancel',
    )
    expect(cancelLog?.context?.actingRole).toBe('coach')

    // Krystyna gets the in-app notice naming Marek as the coach, and the e-mail.
    const firstNotice = `&type=${SESSION_NOTICE}&sourceEntityId=${firstId}`
    await expect
      .poll(async () => (await readNotifications(request, coordinator.token, firstNotice)).length, {
        timeout: 30_000,
        message: 'the coordinator has the cancellation notice',
      })
      .toBe(1)
    const notice = (await readNotifications(request, coordinator.token, firstNotice)).at(0) as NoticeWithKey
    expect(notice.bodyKey).toBe('activities.notifications.occurrenceCancelled.bodyByCoach')
    expect(notice.bodyVariables).toMatchObject({ name: 'Marek Trener', reason: 'Pitch closed' })
    const [mail] = await awaitEmails(coordinator.email, 'Trening sobotni')
    expect(mail?.text).toContain('Marek Trener')
    expect(mail?.text).toContain('Pitch closed')
    // The coach who cancelled is not told.
    // A browser sign-in revokes the earlier API token: Marek's checks use a fresh one (his browser part is over).
    const marekToken = await signInAs(request, club, family.coach.userId, family.coach.email)
    expect(await readNotifications(request, marekToken, firstNotice)).toEqual([])

    // The session thread names who cancelled and in which role.
    let threadId = ''
    await expect
      .poll(
        async () => {
          const threads = await listThreads(request, club.adminToken, `&scopeType=occurrence&scopeId=${firstId}`)
          threadId = threads.at(0)?.id ?? ''
          return threads.length
        },
        { timeout: 60_000, message: 'the session thread exists' },
      )
      .toBe(1)
    const thread = await getThread(request, coordinator.token, threadId)
    expect(thread.status, JSON.stringify(thread.body)).toBe(200)
    expect(thread.body?.messages.at(0)).toMatchObject({
      system: true,
      authorName: 'Marek Trener',
      actingRole: 'coach',
      body: 'Pitch closed',
      canDelete: false,
    })

    // --- Krystyna, the coordinator, reads the thread on the phone ---
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.goto(`/club/messages/${threadId}`)
    await expect(page.getByTestId('thread-message-cancelled-by')).toHaveText(
      /Cancelled by Marek Trener \(coach\): Pitch closed|Odwołane przez: Marek Trener \(trener\): Pitch closed/,
    )

    // --- Krystyna also coaches Żaki: she cancels from M-05 in the coach role she acted in ---
    await addMembership(request, club.adminToken, {
      groupId: family.zaki,
      personId: coordinator.personId,
      role: 'coach',
      validFrom: addDays(calendarDate(), -30),
    })
    await page.goto(`/club/occurrences/${secondId}/attendance`)
    await expect(page.getByTestId('club-attendance-cancel-section')).toContainText(
      /The session will not take place|Zajęcia się nie odbędą/,
    )
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id]/attendance cancel',
      async () => {
        await expect(page.getByTestId('club-attendance-cancel-section')).toBeVisible()
      },
      { platformBaseline: true },
    )
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    const own = await cancelInDialog(page, secondId, 'Brak sędziego')
    expect(own).toMatchObject({ status: 'cancelled', actingRole: 'coach' })
    await expect(page.getByTestId('club-attendance-cancelled')).toContainText('Brak sędziego')
    await expect(page.getByTestId('club-attendance-cancel-section')).toHaveCount(0)

    // Marek is told (the subscriber ran); Krystyna, who cancelled, gets no notice about her own cancellation.
    const secondNotice = `&type=${SESSION_NOTICE}&sourceEntityId=${secondId}`
    await expect
      .poll(async () => (await readNotifications(request, marekToken, secondNotice)).length, {
        timeout: 30_000,
        message: 'the coach of the group has the cancellation notice',
      })
      .toBe(1)
    const krystynaToken = await signInAs(request, club, coordinator.userId, coordinator.email)
    expect(await readNotifications(request, krystynaToken, secondNotice)).toEqual([])
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
