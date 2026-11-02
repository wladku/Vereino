import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  deleteMessage,
  getThread,
  listThreads,
  markCase,
  postReply,
  postThread,
  reviseMessage,
  threadVersion,
} from '../_fixtures/communication'
import { actionLogEntries } from '../_fixtures/people'

// TEST-M09 (foundation III REQ-M09, AC-M09, J-M03; issue #36) and the club spec's TEST-016 (REQ-010, AC-010) in one
// file, on the club spec's TEST-015 family (the academy group Żaki with Anna's wards, the coach Marek, the academy
// coordinator Krystyna and the pool coordinator Bogdan). A thread's history before the marking (an edit and a deletion
// append rows); the marking by the academy coordinator, refused for the coach without `communication.cases.manage`
// (403) and for the pool coordinator (403 `scope_denied`), and only with the thread's version; afterwards every edit and
// deletion answers 409 `case_immutable` — for the authors, the coordinator and the administrator alike — while the
// history stays; the marking is not undoable through the action log and a second one answers 409
// `case_already_open`; the academy coordinator and the administrator read the case, the pool coordinator gets 403;
// subject and bodies are encrypted in the database. The second test drives "Mark as case" by keyboard through its
// confirmation, the read-only banner and the case register, with axe in light and dark mode at 375 px.
test.describe.configure({ timeout: 600_000 })

async function messageRows(threadId: string): Promise<{ kind: string; body: string | null }[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ kind: string; body: string | null }>(
      'select kind, body from communication_thread_messages where thread_id = $1 order by created_at, id',
      [threadId],
    )
    return rows
  })
}

test('TEST-M09 / TEST-016 cases: history kept, marking by the section coordinator only and once, 409 case_immutable for everyone, no undo, visibility, encrypted at rest', async ({
  request,
}) => {
  const club = await createClub(request, 'test-m09')
  try {
    const family = await familyFor(request, club)
    const coach = family.coach
    const anna = family.guardian
    const coordinatorA = family.academyCoordinator
    const coordinatorB = family.poolCoordinator
    const admin = club.adminToken

    // A thread in the academy: the coach's announcement, Anna's reply (to the staff), the coach's reply.
    const subject = `Spór o skład ${String(Date.now())}`
    const body = 'Mecz w sobotę o 11:00.'
    const posted = await postThread(request, coach.token, {
      audience: { kind: 'group', ids: [family.zaki] },
      subject,
      body,
    })
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    const threadId = String(posted.body?.threadId)
    const announcementId = String(posted.body?.messageId)
    const question = 'Dlaczego Kuba nie gra w sobotę?'
    const annaReply = await postReply(request, anna.token, threadId, question)
    expect(annaReply.status, JSON.stringify(annaReply.body)).toBe(201)
    const annaMessageId = String(annaReply.body?.messageId)
    const coachAnswer = 'Porozmawiamy po treningu.'
    const coachReply = await postReply(request, coach.token, threadId, coachAnswer)
    expect(coachReply.status, JSON.stringify(coachReply.body)).toBe(201)
    const coachReplyId = String(coachReply.body?.messageId)

    // Before the marking: an edit and a deletion append a revision and a tombstone.
    const revisedBody = 'Mecz w sobotę o 11:30.'
    const revised = await reviseMessage(
      request,
      coach.token,
      threadId,
      announcementId,
      revisedBody,
      await threadVersion(request, coach.token, threadId),
    )
    expect(revised.status, JSON.stringify(revised.body)).toBe(200)
    const deleted = await deleteMessage(
      request,
      coordinatorA.token,
      threadId,
      coachReplyId,
      await threadVersion(request, coordinatorA.token, threadId),
    )
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    const historyKinds = ['message', 'message', 'message', 'revision', 'tombstone']
    expect((await messageRows(threadId)).map((row) => row.kind)).toEqual(historyKinds)

    // Who is offered the marking: the academy coordinator and the administrator, not the coach.
    expect((await getThread(request, coach.token, threadId)).body?.canMarkCase).toBe(false)
    expect((await getThread(request, coordinatorA.token, threadId)).body?.canMarkCase).toBe(true)
    expect((await getThread(request, admin, threadId)).body?.canMarkCase).toBe(true)

    // Refusals: the coach has no `communication.cases.manage` (403); the pool coordinator has it, but not for this
    // section (403 `scope_denied`); the academy coordinator needs the thread's version (400 without, 409 stale).
    const version = await threadVersion(request, coordinatorA.token, threadId)
    expect((await markCase(request, coach.token, threadId, version)).status).toBe(403)
    const byPool = await markCase(request, coordinatorB.token, threadId, version)
    expect(byPool.status, JSON.stringify(byPool.body)).toBe(403)
    expect(byPool.body?.code).toBe('scope_denied')
    const withoutToken = await markCase(request, coordinatorA.token, threadId, null)
    expect(withoutToken.status, JSON.stringify(withoutToken.body)).toBe(400)
    expect(withoutToken.body?.code).toBe('lock_token_required')
    const stale = await markCase(request, coordinatorA.token, threadId, '2020-01-01T00:00:00.000Z')
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect((await getThread(request, admin, threadId)).body?.isCase).toBe(false)

    // The academy coordinator marks the thread as a case, in the coordinator role (R01).
    const marked = await markCase(request, coordinatorA.token, threadId, version)
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    expect(marked.body).toMatchObject({ ok: true, threadId, isCase: true, actingRole: 'coordinator' })

    // Every edit and deletion is refused with the current version: the authors, the coordinator, the administrator.
    const attempts: Array<[string, () => Promise<{ status: number; body: { code?: string } | null }>]> = [
      [
        'the coach edits his announcement',
        async () =>
          reviseMessage(
            request,
            coach.token,
            threadId,
            announcementId,
            'Zmiana',
            await threadVersion(request, coach.token, threadId),
          ),
      ],
      [
        'Anna edits her reply',
        async () =>
          reviseMessage(
            request,
            anna.token,
            threadId,
            annaMessageId,
            'Inna treść',
            await threadVersion(request, anna.token, threadId),
          ),
      ],
      [
        'Anna deletes her reply',
        async () =>
          deleteMessage(
            request,
            anna.token,
            threadId,
            annaMessageId,
            await threadVersion(request, anna.token, threadId),
          ),
      ],
      [
        'the academy coordinator deletes Anna’s reply',
        async () =>
          deleteMessage(
            request,
            coordinatorA.token,
            threadId,
            annaMessageId,
            await threadVersion(request, coordinatorA.token, threadId),
          ),
      ],
      [
        'the administrator edits the announcement',
        async () =>
          reviseMessage(
            request,
            admin,
            threadId,
            announcementId,
            'Zmiana',
            await threadVersion(request, admin, threadId),
          ),
      ],
      [
        'the administrator deletes the announcement',
        async () =>
          deleteMessage(request, admin, threadId, announcementId, await threadVersion(request, admin, threadId)),
      ],
    ]
    for (const [label, attempt] of attempts) {
      const refused = await attempt()
      expect(refused.status, `${label}: ${JSON.stringify(refused.body)}`).toBe(409)
      expect(refused.body?.code, label).toBe('case_immutable')
    }
    // The history is unchanged by the refusals.
    expect((await messageRows(threadId)).map((row) => row.kind)).toEqual(historyKinds)

    // A second marking answers 409 `case_already_open`, for the coordinator and the administrator.
    for (const token of [coordinatorA.token, admin]) {
      const again = await markCase(request, token, threadId, await threadVersion(request, token, threadId))
      expect(again.status, JSON.stringify(again.body)).toBe(409)
      expect(again.body?.code).toBe('case_already_open')
    }

    // The marking cannot be undone through the action log: the administrator marks a second thread; its log entry
    // carries no undo token, and the undo endpoint refuses; the thread stays a case.
    const adminPost = await postThread(request, admin, {
      audience: { kind: 'group', ids: [family.zaki] },
      subject: 'Uwagi zarządu',
      body: 'Treść',
    })
    expect(adminPost.status, JSON.stringify(adminPost.body)).toBe(201)
    const secondId = String(adminPost.body?.threadId)
    const adminMarked = await markCase(request, admin, secondId, await threadVersion(request, admin, secondId))
    expect(adminMarked.status, JSON.stringify(adminMarked.body)).toBe(200)
    expect(adminMarked.body?.actingRole).toBe('club_admin')
    const logs = (await actionLogEntries(request, admin, secondId)).filter(
      (entry) => entry.commandId === 'communication.threads.mark_case',
    )
    expect(logs).toHaveLength(1)
    expect(logs[0]?.undoToken ?? null).toBeNull()
    expect(logs[0]?.context?.actingRole).toBe('club_admin')
    const undo = await undoByToken(request, admin, logs[0]?.undoToken ?? 'no-undo-token')
    expect(undo.status(), await undo.text()).toBe(400)
    expect((await getThread(request, admin, secondId)).body?.isCase).toBe(true)
    const secondAgain = await markCase(
      request,
      coordinatorA.token,
      secondId,
      await threadVersion(request, coordinatorA.token, secondId),
    )
    expect(secondAgain.status).toBe(409)
    expect(secondAgain.body?.code).toBe('case_already_open')

    // Visibility: the academy coordinator and the administrator read the case with its full history; the pool
    // coordinator gets 403; Anna, a participant, still reads it.
    const asCoordinator = await getThread(request, coordinatorA.token, threadId)
    expect(asCoordinator.status).toBe(200)
    expect(asCoordinator.body).toMatchObject({
      isCase: true,
      caseOpenedByName: 'Krystyna Koordynator',
      canMarkCase: false,
    })
    expect(asCoordinator.body?.caseOpenedAt).toBeTruthy()
    expect(
      asCoordinator.body?.messages.map((message) => [message.body, message.editedAt !== null, message.deleted]),
    ).toEqual([
      [revisedBody, true, false],
      [question, false, false],
      [null, true, true],
    ])
    const asAdmin = await getThread(request, admin, threadId)
    expect(asAdmin.status).toBe(200)
    expect(asAdmin.body?.isCase).toBe(true)
    const asPool = await getThread(request, coordinatorB.token, threadId)
    expect(asPool.status).toBe(403)
    expect(asPool.body?.code).toBe('scope_denied')
    expect((await getThread(request, anna.token, threadId)).body?.isCase).toBe(true)

    // The case register (`isCase=1`) as each reader sees it.
    const registerA = await listThreads(request, coordinatorA.token, '&isCase=1')
    expect(registerA.map((thread) => thread.id).sort()).toEqual([threadId, secondId].sort())
    expect(registerA.find((thread) => thread.id === threadId)).toMatchObject({
      isCase: true,
      caseOpenedByName: 'Krystyna Koordynator',
    })
    expect((await listThreads(request, admin, '&isCase=1')).map((thread) => thread.id).sort()).toEqual(
      [threadId, secondId].sort(),
    )
    expect(await listThreads(request, coordinatorB.token, '&isCase=1')).toEqual([])

    // Replies are still appended to a case, and kept with its history.
    const later = await postReply(request, coach.token, threadId, 'Spotkanie w poniedziałek o 18:00.')
    expect(later.status, JSON.stringify(later.body)).toBe(201)
    expect((await messageRows(threadId)).map((row) => row.kind)).toEqual([...historyKinds, 'message'])

    // At rest: the case flag with who marked it and when; the subject and every body encrypted.
    const raw = await withClient(async (client) => {
      const { rows } = await client.query<{
        subject: string
        is_case: boolean
        case_opened_at: Date | null
        case_opened_by_person_id: string | null
      }>('select subject, is_case, case_opened_at, case_opened_by_person_id from communication_threads where id = $1', [
        threadId,
      ])
      return rows[0]
    })
    expect(raw.is_case).toBe(true)
    expect(raw.case_opened_at).toBeTruthy()
    expect(raw.case_opened_by_person_id).toBe(coordinatorA.personId)
    expect(raw.subject).toBeTruthy()
    expect(raw.subject).not.toContain('Spór o skład')
    const bodies = (await messageRows(threadId)).flatMap((row) => (row.body ? [row.body] : []))
    expect(bodies.length).toBe(5)
    for (const plain of [body, revisedBody, question, coachAnswer, 'Spotkanie w poniedziałek']) {
      expect(
        bodies.some((stored) => stored.includes(plain)),
        plain,
      ).toBe(false)
    }
  } finally {
    await club.cleanup()
  }
})

test('TEST-M09 / TEST-016 case UI: mark as case by keyboard through its confirmation, read-only banner, case register, axe at 375 px in both schemes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-m09-ui')
  try {
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator
    const subject = `Zachowanie na meczu ${String(Date.now())}`
    const posted = await postThread(request, family.coach.token, {
      audience: { kind: 'group', ids: [family.zaki] },
      subject,
      body: 'Proszę o rozmowę po meczu.',
    })
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    const threadId = String(posted.body?.threadId)
    const reply = await postReply(request, family.guardian.token, threadId, 'Proszę o wyjaśnienie.')
    expect(reply.status, JSON.stringify(reply.body)).toBe(201)

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.reload()
        await ready()
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`${label} (${colorScheme})`] = found
      }
      await expectNoPageOverflow(page)
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }

    // No case yet: the register says so.
    await page.goto('/backend/communication/cases')
    await expect(page.getByTestId('cases-empty')).toBeVisible()

    // The thread page: "Mark as case" by keyboard, through the confirmation (it cannot be undone).
    await page.goto(`/backend/communication/threads/${threadId}`)
    const mark = page.getByTestId('thread-mark-case')
    await expect(mark).toBeVisible()
    await expect(page.getByTestId('thread-case-banner')).toHaveCount(0)
    await mark.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    const confirm = dialog.getByRole('button', { name: /^(Mark as case|Oznacz jako sprawę)$/ })
    await confirm.focus()
    await page.keyboard.press('Enter')
    const banner = page.getByTestId('thread-case-banner')
    await expect(banner).toBeVisible()
    await expect(page.getByTestId('thread-case-opened')).toContainText('Krystyna Koordynator')
    await expect(page.getByTestId('thread-case-badge')).toBeVisible()
    await expect(mark).toHaveCount(0)
    const asAdmin = await getThread(request, club.adminToken, threadId)
    expect(asAdmin.body).toMatchObject({ isCase: true, caseOpenedByName: 'Krystyna Koordynator' })
    await scan('/backend/communication/threads/[id] (case)', async () => {
      await expect(page.getByTestId('thread-case-banner')).toBeVisible()
    })

    // The case register lists it; the thread list marks it.
    await page.goto('/backend/communication/cases')
    await expect(page.getByTestId('case-link').filter({ hasText: subject })).toBeVisible()
    await scan('/backend/communication/cases', async () => {
      await expect(page.getByTestId('case-link').first()).toBeVisible()
    })
    await page.goto('/backend/communication/threads')
    await expect(page.getByTestId('thread-case')).toHaveCount(1)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
