import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor, firstSession, weeklySeries, type Family } from '../_fixtures/attendance'
import { calendarDate, call, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  deleteMessage,
  deliveries,
  getThread,
  listThreads,
  markCase,
  postReply,
  postThread,
  threadVersion,
  type ThreadDetail,
} from '../_fixtures/communication'
import { addMembership } from '../_fixtures/groups'
import { actionLogEntries } from '../_fixtures/people'

// E06-S21 (#103; B-18, B-19; club spec REQ-009, REQ-010, R15; foundation III REQ-M05, REQ-M09, DD-M10, DD-M12) on the
// TEST-015 family (the academy with the group Żaki and its weekly training, the pool with its group; the academy
// coordinator Krystyna, who also coaches the pool group, so she takes part in the pool threads). The thread list
// filters by section — the section's own thread and its group's, activity's and session's, nothing from the pool, also
// not the pool threads Krystyna takes part in, and a forged pool section lists nothing — and by scope type, keeps the old
// `scopeType`/`scopeId` filter, and names the message count and the last message without another family's name
// (R15). The thread page says who may delete which message, shows each of three messages its own delivery counts, and
// refuses a deletion on a case (409 `case_immutable`, no control). The second test drives the filters, the per-message
// recipients and "Delete message" through its confirmation by keyboard as the author, checks the action log, and runs
// axe in light and dark mode at 375 px with the 320 px reflow on the list and the thread page.
test.describe.configure({ timeout: 600_000 })

type Threads = {
  section: string
  group: string
  activity: string
  session: string
  pool: string
  poolGroup: string
  club: string
}

/** Krystyna also coaches the pool group, then each audience gets a thread (a pool group thread reaches her). */
async function threadsFor(request: APIRequestContext, club: Club, family: Family): Promise<Threads> {
  const admin = club.adminToken
  const krystyna = family.academyCoordinator
  await addMembership(request, admin, {
    groupId: family.poolGroup,
    personId: krystyna.personId,
    role: 'coach',
    validFrom: calendarDate(-30),
  })
  const training = await weeklySeries(request, club, krystyna.token, {
    groupId: family.zaki,
    placeId: family.pitch,
    name: 'Trening Żaków',
    type: 'training',
    weekday: 'TU',
    start: '17:00',
    end: '18:30',
  })
  const session = firstSession(training.sessions)
  const post = async (token: string, kind: string, ids: string[] | undefined, subject: string) => {
    const posted = await postThread(request, token, {
      audience: ids ? { kind, ids } : { kind },
      subject,
      body: `${subject}: szczegóły.`,
    })
    expect(posted.status, `${subject}: ${JSON.stringify(posted.body)}`).toBe(201)
    return String(posted.body?.threadId)
  }
  return {
    section: await post(admin, 'section', [family.academy], 'Zebranie sekcji'),
    group: await post(krystyna.token, 'group', [family.zaki], 'Turniej w sobotę'),
    activity: await post(family.coach.token, 'activity', [training.activityId], 'Nowe ćwiczenia'),
    session: await post(family.coach.token, 'occurrence', [session.id], 'Trening przy sztucznym świetle'),
    pool: await post(family.poolCoordinator.token, 'section', [family.pool], 'Basen zamknięty'),
    poolGroup: await post(family.instructor.token, 'group', [family.poolGroup], 'Czepki obowiązkowe'),
    club: await post(admin, 'club', undefined, 'Walne zebranie'),
  }
}

const ids = (items: { id: string }[]) => items.map((item) => item.id).sort()

/** The thread once every message's deliveries have left the queue (the worker runs after the commit). */
async function settledThread(request: APIRequestContext, token: string, threadId: string): Promise<ThreadDetail> {
  let detail: ThreadDetail | null = null
  await expect
    .poll(
      async () => {
        const result = await getThread(request, token, threadId)
        detail = result.body
        const counted = (detail?.messages ?? []).filter((message) => message.hasDeliveries)
        return (
          result.status === 200 &&
          counted.length === (detail?.messages ?? []).length &&
          counted.every(
            (message) =>
              message.deliveryCounts !== null &&
              message.deliveryCounts.queued === 0 &&
              message.deliveryCounts.sent + message.deliveryCounts.failed + message.deliveryCounts.skipped > 0,
          )
        )
      },
      { timeout: 60_000, message: `the deliveries of every message of ${threadId} settle` },
    )
    .toBe(true)
  return detail as unknown as ThreadDetail
}

const total = (counts: { queued: number; sent: number; failed: number; skipped: number } | null) =>
  counts ? counts.queued + counts.sent + counts.failed + counts.skipped : 0

test('E06-S21 API: section and scope filters within the grants, forged section lists nothing, count and last message without another family, delete rules, own delivery counts per message, 409 on a case', async ({
  request,
}) => {
  const club = await createClub(request, 'e06-s21')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const krystyna = family.academyCoordinator
    const anna = family.guardian
    const piotr = family.other.guardian
    const threads = await threadsFor(request, club, family)
    const academyThreads = [threads.section, threads.group, threads.activity, threads.session].sort()

    // The section filter: the academy's section, group, activity and session threads; nothing from the pool.
    expect(ids(await listThreads(request, krystyna.token, `&sectionId=${family.academy}`))).toEqual(academyThreads)
    expect(ids(await listThreads(request, admin, `&sectionId=${family.academy}`))).toEqual(academyThreads)
    expect(ids(await listThreads(request, admin, `&sectionId=${family.pool}`))).toEqual(
      [threads.pool, threads.poolGroup].sort(),
    )
    // As a coach of the pool group Krystyna takes part in both pool threads: her unfiltered list shows them, the
    // academy filter does not, and a forged pool section lists nothing at all — never another section's threads.
    const unfiltered = ids(await listThreads(request, krystyna.token))
    expect(unfiltered).toContain(threads.poolGroup)
    expect(unfiltered).toContain(threads.pool)
    expect(await listThreads(request, krystyna.token, `&sectionId=${family.pool}`)).toEqual([])
    expect(await listThreads(request, family.poolCoordinator.token, `&sectionId=${family.academy}`)).toEqual([])
    // Combined with the scope type; the old `scopeType` + `scopeId` filter still works; a malformed id is a 400.
    expect(
      ids(await listThreads(request, krystyna.token, `&sectionId=${family.academy}&scopeType=occurrence`)),
    ).toEqual([threads.session])
    expect(ids(await listThreads(request, admin, `&sectionId=${family.academy}&scopeType=club`))).toEqual([])
    expect(ids(await listThreads(request, admin, `&scopeType=club`))).toEqual([threads.club])
    expect(ids(await listThreads(request, krystyna.token, `&scopeType=section&scopeId=${family.academy}`))).toEqual([
      threads.section,
    ])
    const malformed = await call(request, 'GET', '/api/communication/threads?sectionId=not-an-id', krystyna.token)
    expect(malformed.status).toBe(400)

    // The group thread: Krystyna's announcement, her reply, Anna's reply (to the staff only, R15).
    const krystynaReply = await postReply(request, krystyna.token, threads.group, 'Zbiórka o 9:00.')
    expect(krystynaReply.status, JSON.stringify(krystynaReply.body)).toBe(201)
    const annaReply = await postReply(request, anna.token, threads.group, 'Kuba będzie spóźniony.')
    expect(annaReply.status, JSON.stringify(annaReply.body)).toBe(201)
    const annaMessageId = String(annaReply.body?.messageId)

    // The columns: the staff see three messages, the last one Anna's; Piotr (another family) sees two, the last one
    // Krystyna's, and never Anna's name.
    const asStaff = (await listThreads(request, krystyna.token)).find((item) => item.id === threads.group)
    expect(asStaff).toMatchObject({ messageCount: 3, lastMessage: { authorName: 'Anna Kowalska', system: false } })
    const asPiotr = (await listThreads(request, piotr.token, '&as=member')).find((item) => item.id === threads.group)
    expect(asPiotr).toMatchObject({
      messageCount: 2,
      lastMessage: { authorName: 'Krystyna Koordynator', system: false },
    })
    expect(JSON.stringify(asPiotr)).not.toContain('Anna')

    // Who may delete which message: Krystyna (author and coordinator) and the administrator every one; the coach (a
    // participant) none; Anna her own reply only; Piotr, who sees two of them, none.
    const canDelete = async (token: string) =>
      ((await getThread(request, token, threads.group)).body?.messages ?? []).map((message) => message.canDelete)
    expect(await canDelete(krystyna.token)).toEqual([true, true, true])
    expect(await canDelete(admin)).toEqual([true, true, true])
    expect(await canDelete(family.coach.token)).toEqual([false, false, false])
    expect(await canDelete(anna.token)).toEqual([false, false, true])
    expect(await canDelete(piotr.token)).toEqual([false, false])

    // Three messages, each with its own delivery counts, as the author sees them; they match each message's own list.
    const detail = await settledThread(request, krystyna.token, threads.group)
    expect(detail.messages).toHaveLength(3)
    const totals: number[] = []
    for (const message of detail.messages) {
      const list = await deliveries(request, krystyna.token, threads.group, `&messageId=${message.id}`)
      expect(list.status, JSON.stringify(list.body)).toBe(200)
      const items = list.body?.items ?? []
      expect(total(message.deliveryCounts)).toBe(list.body?.total)
      expect(message.deliveryCounts?.sent).toBe(items.filter((item) => item.status === 'sent').length)
      expect(message.deliveryCounts?.failed).toBe(items.filter((item) => item.status === 'failed').length)
      expect(message.deliveryCounts?.skipped).toBe(items.filter((item) => item.status === 'skipped').length)
      totals.push(total(message.deliveryCounts))
    }
    // Anna's reply reaches the staff only, so its counts are not the announcement's.
    expect(totals[2]).toBeLessThan(totals[0])
    // Members see no delivery status.
    for (const token of [anna.token, piotr.token]) {
      const seen = (await getThread(request, token, threads.group)).body?.messages ?? []
      expect(seen.every((message) => message.deliveryCounts === null && !message.hasDeliveries)).toBe(true)
    }

    // A deletion is logged: the administrator deletes Krystyna's reply (the platform role reads its own log entries).
    const krystynaMessageId = String(krystynaReply.body?.messageId)
    const removed = await deleteMessage(
      request,
      admin,
      threads.group,
      krystynaMessageId,
      await threadVersion(request, admin, threads.group),
    )
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    expect(removed.body?.actingRole).toBe('club_admin')
    const deletions = (await actionLogEntries(request, admin, krystynaMessageId)).filter(
      (entry) => entry.commandId === 'communication.messages.delete',
    )
    expect(deletions).toHaveLength(1)
    expect(deletions[0]?.context?.actingRole).toBe('club_admin')
    expect(deletions[0]?.undoToken ?? null).toBeNull()

    // A case: no message can be deleted any more — no control in the read model, 409 `case_immutable` on a forged
    // DELETE by the author of the reply and by the coordinator.
    const marked = await markCase(
      request,
      krystyna.token,
      threads.group,
      await threadVersion(request, krystyna.token, threads.group),
    )
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    expect(await canDelete(krystyna.token)).toEqual([false, false, false])
    expect(await canDelete(anna.token)).toEqual([false, false, false])
    for (const token of [anna.token, krystyna.token]) {
      const refused = await deleteMessage(
        request,
        token,
        threads.group,
        annaMessageId,
        await threadVersion(request, token, threads.group),
      )
      expect(refused.status, JSON.stringify(refused.body)).toBe(409)
      expect(refused.body?.code).toBe('case_immutable')
    }
  } finally {
    await club.cleanup()
  }
})

test('E06-S21 UI: section filter and columns, delivery counts and recipients per message, delete by the author through a keyboard confirmation with an action-log entry, no control on a case, axe at 375 px in both schemes with the 320 px reflow', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s21-ui')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const krystyna = family.academyCoordinator
    const threads = await threadsFor(request, club, family)

    // The group thread: Krystyna's announcement, Anna's reply, Krystyna's reply (the one she deletes).
    const annaReply = await postReply(request, family.guardian.token, threads.group, 'Kuba będzie spóźniony.')
    expect(annaReply.status, JSON.stringify(annaReply.body)).toBe(201)
    const ownReply = await postReply(request, krystyna.token, threads.group, 'Dziękuję, zapisuję.')
    expect(ownReply.status, JSON.stringify(ownReply.body)).toBe(201)
    const ownReplyId = String(ownReply.body?.messageId)
    // A case in the academy: the coach's announcement, marked by Krystyna.
    const casePost = await postThread(request, family.coach.token, {
      audience: { kind: 'group', ids: [family.zaki] },
      subject: 'Zachowanie na meczu',
      body: 'Proszę o rozmowę.',
    })
    expect(casePost.status, JSON.stringify(casePost.body)).toBe(201)
    const caseId = String(casePost.body?.threadId)
    const caseMessageId = String(casePost.body?.messageId)
    const marked = await markCase(request, krystyna.token, caseId, await threadVersion(request, krystyna.token, caseId))
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    const settled = await settledThread(request, admin, threads.group)

    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    const password = await signInBrowser(page, request, club, krystyna.userId, krystyna.email)
    const token = await getAuthToken(request, krystyna.email, password)
    await prepareForAccessibilityScan(page)
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      await page.setViewportSize({ width: 375, height: 812 })
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.reload()
        await ready()
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`${label} (${colorScheme})`] = found
      }
      await expectNoPageOverflow(page)
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 1280, height: 900 })
    }

    // The list: Krystyna's academy is the only section offered; filtering by it keeps the academy's section, group,
    // activity and session threads and drops the pool group thread she takes part in.
    await page.goto('/backend/communication/threads')
    const links = page.getByTestId('thread-link')
    const linkTo = (threadId: string) => page.locator(`[data-testid="thread-link"][href$="/${threadId}"]`)
    await expect(linkTo(threads.poolGroup)).toBeVisible()
    const section = page.getByTestId('threads-filter-section')
    await expect(section.locator('option')).toHaveCount(2)
    await expect(section.locator(`option[value="${family.academy}"]`)).toHaveText('Akademia piłkarska')
    await section.focus()
    await section.selectOption(family.academy)
    await expect(linkTo(threads.poolGroup)).toHaveCount(0)
    for (const threadId of [threads.section, threads.group, threads.activity, threads.session, caseId]) {
      await expect(linkTo(threadId)).toBeVisible()
    }
    await expect(links).toHaveCount(5)
    // The scope type narrows further; "Clear filters" brings everything back.
    const scopeType = page.getByTestId('threads-filter-scope-type')
    await scopeType.focus()
    await scopeType.selectOption('occurrence')
    await expect(links).toHaveCount(1)
    await expect(linkTo(threads.session)).toBeVisible()
    await page.getByTestId('threads-filters-clear').focus()
    await page.keyboard.press('Enter')
    await expect(linkTo(threads.poolGroup)).toBeVisible()
    // The columns of the group thread: three messages, the last one Krystyna's.
    const groupRow = page.getByRole('row').filter({ has: linkTo(threads.group) })
    await expect(groupRow.getByTestId('thread-message-count')).toHaveText('3')
    await expect(groupRow.getByTestId('thread-last-message')).toContainText('Krystyna Koordynator')
    await scan('/backend/communication/threads', async () => {
      await expect(page.getByTestId('thread-link').first()).toBeVisible()
    })

    // The thread page: each of the three messages shows its own counts; the first one's recipients are open, the
    // third one's open by keyboard with as many rows as its counts.
    await page.goto(`/backend/communication/threads/${threads.group}`)
    const messages = page.getByTestId('thread-message')
    await expect(messages).toHaveCount(3)
    for (const [index, message] of settled.messages.entries()) {
      const counts = messages.nth(index).getByTestId('thread-message-deliveries')
      await expect(counts).toHaveAttribute('data-sent', String(message.deliveryCounts?.sent))
      await expect(counts).toHaveAttribute('data-failed', String(message.deliveryCounts?.failed))
    }
    await expect(page.getByTestId('delivery-status-list')).toHaveCount(1)
    await expect(messages.nth(0).getByTestId('delivery-status-list')).toBeVisible()
    const third = messages.nth(2)
    const toggle = third.getByTestId('thread-message-deliveries-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(third.getByTestId('delivery-row')).toHaveCount(
      (settled.messages[2]?.deliveryCounts?.sent ?? 0) +
        (settled.messages[2]?.deliveryCounts?.failed ?? 0) +
        (settled.messages[2]?.deliveryCounts?.skipped ?? 0),
    )

    // "Delete message" on her own reply: Escape cancels the confirmation; Enter on "Delete message" deletes it.
    // The action log's command id and context are encrypted at rest, so the entry is found by the message, the actor
    // and the time: one more entry of Krystyna's on her reply (the reply itself is the first).
    const logRows = () =>
      withClient(async (client) => {
        const { rows } = await client.query<{ actor_user_id: string; parent_resource_id: string | null }>(
          `select actor_user_id, parent_resource_id from action_logs
            where resource_kind = 'communication.thread_message' and resource_id = $1 and deleted_at is null
            order by created_at`,
          [ownReplyId],
        )
        return rows
      })
    expect(await logRows()).toHaveLength(1)
    await expect(page.getByTestId('thread-message-delete')).toHaveCount(3)
    const own = page.locator(`[data-testid="thread-message"][data-message-id="${ownReplyId}"]`)
    const deleteOwn = own.getByTestId('thread-message-delete')
    await deleteOwn.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(own.getByTestId('thread-message-body')).toHaveText('Dziękuję, zapisuję.')
    await deleteOwn.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    const confirm = dialog.getByRole('button', { name: /^(Delete message|Usuń wiadomość)$/ })
    await confirm.focus()
    await page.keyboard.press('Enter')
    await expect(own).toContainText(/This message was deleted\.|Ta wiadomość została usunięta\./)
    await expect(own.getByTestId('thread-message-body')).toHaveCount(0)
    await expect(own.getByTestId('thread-message-delete')).toHaveCount(0)
    await expect(page.getByTestId('thread-message-delete')).toHaveCount(2)
    const after = await getThread(request, admin, threads.group)
    expect(after.body?.messages.find((message) => message.id === ownReplyId)).toMatchObject({
      deleted: true,
      body: null,
      canDelete: false,
    })
    // The action log records the deletion by Krystyna under the thread.
    const logged = await logRows()
    expect(logged).toHaveLength(2)
    expect(logged[1]).toEqual({ actor_user_id: krystyna.userId, parent_resource_id: threads.group })
    await scan('/backend/communication/threads/[id]', async () => {
      await expect(page.getByTestId('thread-message')).toHaveCount(3)
      await expect(page.getByTestId('delivery-status-list').getByTestId('delivery-row').first()).toBeVisible()
    })

    // A case: the banner, no "Delete message" anywhere, and a forged DELETE answers 409 `case_immutable`.
    await page.goto(`/backend/communication/threads/${caseId}`)
    await expect(page.getByTestId('thread-case-banner')).toBeVisible()
    await expect(page.getByTestId('thread-message')).toHaveCount(1)
    await expect(page.getByTestId('thread-message-delete')).toHaveCount(0)
    const forged = await deleteMessage(
      request,
      token,
      caseId,
      caseMessageId,
      await threadVersion(request, token, caseId),
    )
    expect(forged.status, JSON.stringify(forged.body)).toBe(409)
    expect(forged.body?.code).toBe('case_immutable')

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
