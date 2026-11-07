import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, readNotifications } from '../_fixtures/activities'
import { familyFor, firstSession, weeklySeries } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson, uniqueSuffix, type Club } from '../_fixtures/club'
import { switchBrowserUser } from '../_fixtures/club-structure'
import {
  awaitEmails,
  deleteMessage,
  emailsTo,
  getThread,
  listThreads,
  reviseMessage,
  settledDeliveries,
  threadVersion,
} from '../_fixtures/communication'
import { addMembership } from '../_fixtures/groups'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'
import { runProbe, uniqueAddress } from '../_fixtures/messaging'
import { createGuardianship } from '../_fixtures/people'
import { publicGet, publish } from '../_fixtures/publication'

// J-003 (club spec *User Journeys*, phase 3) steps 1, 2, 4 and 5, end to end on one fresh tenant — the phase 3 exit gate
// of epic #23. Step 3 (the "send me a link" form and the personal link) and step 5's second error (a link request for
// an unknown e-mail) belong to REQ-017, foundation I phase C (foundation III Q12): the public session page offers a
// sign-in instead, which is all this test asserts of step 3. The pages are driven the way the coordinator, the coach
// and the guardians use them; the API is used for the setup J-003 does not describe (the club, its section, the group,
// the series, the staff and the families), for oracles the UI cannot show (the in-app notices, the e-mails of the
// `OM_TEST_MODE` capture, the delivery rows, the public API's fields, the 409 refusals — the UI has no edit or delete
// control) and, for step 5, to force a provider rejection with the messaging probe the way TEST-M05 does (the running
// app's sender cannot be scripted). The exit gate rides on the same tenant: axe with the platform baseline in light and
// dark mode at 375 px plus the 320 px reflow on the coordinator's thread page with its delivery list, the case
// register, the member inbox and a member thread, and the public session page; e-mails are read in each recipient's
// language. The en + pl catalogs of `communication` are checked by the `i18n` steps of `yarn verify`, not here. Where
// the installed product differs from J-003's wording, the installed behaviour accepted with #71, #35 and #36 is
// asserted (see the comments and the club spec's phase 3 exit-gate note).
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const CLUB_ZONE = 'Europe/Warsaw'
const TRAINING = 'Trening Żaków'
// J-003's reason "downpour", written in the club's language.
const REASON = 'Ulewa'
const ANNOUNCEMENT_SUBJECT = 'Turniej w sobotę'
const ANNOUNCEMENT_BODY = 'W sobotę gramy turniej o 10:00, zbiórka o 9:15 przy boisku.'
const PARENT_REPLY = 'Czy Hania może dojechać na 9:45? Wcześniej mamy wizytę u lekarza.'
const FAILED_SUBJECT = 'Trening w przyszły wtorek na hali'

const CANCELLED_PL = `Odwołane: ${TRAINING}`
const CANCELLED_EN = `Cancelled: ${TRAINING}`
const REPLY_PL = 'Nowa odpowiedź'
const REPLY_EN = 'New reply'

type Account = { personId: string; userId: string; email: string }

/** Signs `user` in to the browser (a new password ends the user's earlier tokens) and returns a fresh API token. */
async function signIn(page: Page, request: APIRequestContext, club: Club, user: Account): Promise<string> {
  const password = await switchBrowserUser(page, request, club, user.userId, user.email)
  return getAuthToken(request, user.email, password)
}

/**
 * The exit-gate scan of the current page: axe with the platform baseline in light and dark mode at 375 px (each scheme
 * after a reload), then the 320 px reflow; the page is left in light mode at the desktop size.
 */
async function gateScan(
  page: Page,
  testInfo: Parameters<typeof scanInColorSchemes>[1],
  label: string,
  ready: () => Promise<void>,
): Promise<Record<string, unknown>> {
  await prepareForAccessibilityScan(page)
  await page.setViewportSize({ width: 375, height: 812 })
  const violations = await scanInColorSchemes(page, testInfo, label, ready, { platformBaseline: true })
  await expectNoPageOverflow(page)
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 720 })
  return violations
}

test('J-003 cancellation and announcement on a fresh tenant, without the REQ-017 link steps: the cancellation with in-app notices and e-mails in each language, the session thread, the share text and the public session page, the parent reply to the staff only, the case with its read-only history, an undelivered e-mail with its status; phase 3 exit gate', async ({
  page,
  request,
  browser,
}, testInfo) => {
  const club = await createClub(request, 'j-003')
  try {
    page.setDefaultTimeout(30_000)
    const admin = club.adminToken
    const since = addDays(calendarDate(), -30)

    // --- Setup J-003 does not describe ---
    // The club reads Polish and publishes its public page, so the share text links to the public session page.
    const settings = await updateClubSettings(request, admin, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const slug = `j003-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])
    // The TEST-015 family (`familyFor`): the academy section with the group Żaki; Anna (account) is the guardian of
    // Hania (14, no account) and Kuba (16, his own account), Piotr (account) of Stanisław (12); the coach Marek and the
    // academy coordinator Krystyna have accounts. Piotr reads English.
    const family = await familyFor(request, club)
    const anna = family.guardian
    const kuba = family.elder
    const piotr = family.other.guardian
    const marek = family.coach
    const coordinator = family.academyCoordinator
    const me = await getMe(request, piotr.token)
    const english = await putMe(request, piotr.token, { preferredLocale: 'en' }, me.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    // A minor without an account whose guardian has an e-mail address only (no account), reading English.
    const tomaszAddress = uniqueAddress('tomasz')
    const tomasz = {
      personId: await createPerson(request, admin, {
        firstName: 'Tomasz',
        lastName: 'Wiśniewski',
        birthDate: birthDateTurning(42),
        email: tomaszAddress,
        preferredLocale: 'en',
      }),
      email: tomaszAddress,
    }
    const zosia = await createPerson(request, admin, {
      firstName: 'Zosia',
      lastName: 'Wiśniewska',
      birthDate: birthDateTurning(8),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: tomasz.personId,
      wardPersonId: zosia,
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: since,
    })
    await addMembership(request, admin, {
      groupId: family.zaki,
      personId: zosia,
      role: 'participant',
      validFrom: since,
    })
    // The Żaki training, Tuesdays 17:00–18:30 on the pitch with coach Marek, created by the coordinator.
    const { sessions } = await weeklySeries(request, club, coordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: TRAINING,
      type: 'training',
      weekday: 'TU',
      start: '17:00',
      end: '18:30',
    })
    const session = firstSession(sessions)
    const sessionStart = new Date(String(session.startAt))
    const recipients = {
      pl: [anna.email, kuba.email, marek.email],
      en: [piotr.email, tomasz.email],
    }

    let coordinatorToken = ''
    let sessionThreadId = ''
    await test.step('step 1: the coordinator cancels the Tuesday session with the reason "downpour"; the guardians, the participant with an account and the coach get the in-app notice, everyone with an address gets the e-mail in their language, the session thread carries the reason, the canceller gets nothing', async () => {
      coordinatorToken = await signIn(page, request, club, coordinator)
      await page.goto(`/backend/activities/occurrences/${session.id}`)
      await expect(page.getByRole('heading', { level: 1, name: TRAINING })).toBeVisible()
      await page.getByTestId('occurrence-cancel-button').click()
      await page.getByTestId('occurrence-cancel-reason').fill(REASON)
      const [cancelled] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/activities/occurrences/${session.id}/cancel`) &&
            response.request().method() === 'POST',
        ),
        page.getByTestId('occurrence-cancel-confirm').click(),
      ])
      expect(cancelled.status()).toBe(200)
      // R01: the cancellation is recorded in the coordinator role.
      expect(await cancelled.json()).toMatchObject({ status: 'cancelled', actingRole: 'coordinator' })
      await expect(page.getByTestId('occurrence-cancelled')).toContainText(REASON)
      await expect(page.getByTestId('occurrence-cancel-button')).toHaveCount(0)

      // The in-app notice (the phase 2 `activities.occurrence_cancelled`): Anna and Piotr as guardians, Kuba as a
      // participant with an account, Marek as the coach. Tomasz has no account; the coordinator who cancelled has none.
      const notice = `&type=activities.occurrence_cancelled&sourceEntityId=${session.id}`
      for (const [who, token] of [
        ['Anna', anna.token],
        ['Kuba', kuba.token],
        ['Piotr', piotr.token],
        ['Marek', marek.token],
      ] as const) {
        await expect
          .poll(async () => (await readNotifications(request, token, notice)).length, {
            timeout: 30_000,
            message: `${who} has the cancellation notice`,
          })
          .toBe(1)
      }
      expect(await readNotifications(request, coordinatorToken, notice)).toEqual([])

      // The session thread: one, opened by the system, with the system message carrying the reason.
      await expect
        .poll(
          async () => {
            const threads = await listThreads(request, admin, `&scopeType=occurrence&scopeId=${session.id}`)
            sessionThreadId = threads.at(0)?.id ?? ''
            return threads.length
          },
          { timeout: 60_000, message: 'the session thread exists' },
        )
        .toBe(1)
      const thread = await getThread(request, admin, sessionThreadId)
      expect(thread.body?.authorName ?? null).toBeNull()
      expect(thread.body?.messages).toHaveLength(1)
      // #139: the system message names the coordinator who cancelled, in the coordinator role (R01).
      expect(thread.body?.messages.at(0)).toMatchObject({ system: true, body: REASON, actingRole: 'coordinator' })

      // The e-mail goes to everyone with an address — the five of them, e-mail only (the in-app notice is the phase 2
      // one) — and to nobody else.
      const delivered = await settledDeliveries(request, admin, sessionThreadId)
      expect(delivered.map((item) => `${String(item.personId)}:${item.channel}:${item.status}`).sort()).toEqual(
        [anna, kuba, piotr, marek, tomasz].map((person) => `${person.personId}:email:sent`).sort(),
      )

      // Each e-mail in the recipient's language (the club's Polish, English for Piotr and Tomasz), with the reason and
      // the link to the member thread; one per recipient.
      for (const address of recipients.pl) {
        const mail = (await awaitEmails(address, CANCELLED_PL)).at(0)
        expect(mail?.text).toContain('jest odwołane.')
        // #139: the e-mail names who cancelled and in which role (R01).
        expect(mail?.text).toContain('Odwołane przez:')
        expect(mail?.text).toContain('(koordynator).')
        // The capture joins the rendered text with single spaces.
        expect(mail?.text).toContain(`Powód: ${REASON}`)
        expect(mail?.links.some((link) => link.includes(`/club/messages/${sessionThreadId}`))).toBe(true)
        expect(emailsTo(address, CANCELLED_PL), address).toHaveLength(1)
        expect(emailsTo(address, CANCELLED_EN), address).toEqual([])
      }
      for (const address of recipients.en) {
        const mail = (await awaitEmails(address, CANCELLED_EN)).at(0)
        expect(mail?.text).toContain('is cancelled.')
        expect(mail?.text).toContain('Cancelled by ')
        expect(mail?.text).toContain('(coordinator).')
        expect(mail?.text).toContain(`Reason: ${REASON}`)
        expect(mail?.links.some((link) => link.includes(`/club/messages/${sessionThreadId}`))).toBe(true)
        expect(emailsTo(address, CANCELLED_EN), address).toHaveLength(1)
        expect(emailsTo(address, CANCELLED_PL), address).toEqual([])
      }
      // The canceller is not e-mailed.
      expect(emailsTo(coordinator.email, TRAINING)).toEqual([])
    })

    let publicPath = ''
    await test.step('step 2: the coordinator copies the ready-made share text of the session; signed out, its link opens the public session page with the activity, the date, the time and the status only, and a sign-in (step 3 with REQ-017)', async () => {
      // J-003's "copies the ready-made text": the text is offered on the session thread's page ("Copy text for group
      // chat"), reached from the thread list; the session page itself has no share action.
      await page.goto('/backend/communication/threads')
      await page
        .locator(`[data-testid="thread-link"][href="/backend/communication/threads/${sessionThreadId}"]`)
        .first()
        .click()
      await expect(page).toHaveURL(new RegExp(`/backend/communication/threads/${sessionThreadId}$`))
      await expect(page.getByTestId('thread-message')).toHaveCount(1)
      await expect(page.getByTestId('thread-message')).toContainText(REASON)
      // The delivery list of the cancellation: the five e-mails sent.
      const list = page.getByTestId('delivery-status-list')
      await expect(list.locator('[data-testid="delivery-row"][data-status="sent"]')).toHaveCount(5)

      await page.getByTestId('thread-share').click()
      const shareLine = page.getByTestId('thread-share-text')
      await expect(shareLine).toBeVisible()
      // Copied, or — where the browser refuses the clipboard — shown for copying by hand; the text is the same.
      await expect(page.getByTestId('thread-share-status')).toHaveText(
        /copied|skopiowany|Copying is not available|Kopiowanie nie jest/,
      )
      const text = (await shareLine.textContent()) ?? ''
      // J-003: "Żaki training on Tuesday 17:00 canceled — details: {link}", in the club's language: the activity, the
      // day ("wt., 10 lis"), the time, "odwołane" and the link to the public session page.
      const day = new Intl.DateTimeFormat('pl', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: CLUB_ZONE,
      }).format(sessionStart)
      expect(text).toContain(`${TRAINING}, ${day} 17:00`)
      expect(text).toContain('odwołane')
      const link = /https?:\/\/\S+/.exec(text)?.[0] ?? ''
      publicPath = new URL(link).pathname
      expect(publicPath).toBe(`/p/${slug}/s/${session.id}`)
      for (const name of ['Hania', 'Kuba', 'Zosia', 'Anna', 'Marek', REASON]) expect(text).not.toContain(name)

      // The public API behind the page, signed out: exactly the name, the date, the time, the gathering
      // time (club spec DD-43, #136; none on this session) and the status.
      const api = await publicGet(request, `/api/activities/public/${slug}/sessions/${session.id}`)
      expect(api.status).toBe(200)
      expect(Object.keys(api.body?.session as object).sort()).toEqual(
        ['activityName', 'endAt', 'gatheringAt', 'occurrenceDate', 'startAt', 'status', 'timeZone'].sort(),
      )
      expect(api.body?.session).toMatchObject({ activityName: TRAINING, status: 'cancelled', gatheringAt: null })
      for (const name of ['Hania', 'Kowalsk', 'Nowak', 'Wiśniew', 'Marek', 'Trener', 'Krystyna', REASON]) {
        expect(api.bytes.toString('utf8'), name).not.toContain(name)
      }
    })

    await test.step('step 2 and exit gate: a parent who is not signed in opens the link; the public session page at 375 px in light and dark mode, and the 320 px reflow', async () => {
      const guest = await browser.newContext({ baseURL: testInfo.project.use.baseURL, timezoneId: CLUB_ZONE })
      try {
        const guestPage = await guest.newPage()
        guestPage.setDefaultTimeout(30_000)
        await guestPage.goto(publicPath)
        await expect(guestPage.getByTestId('public-session-activity')).toHaveText(TRAINING)
        await expect(guestPage.getByTestId('public-session-when')).toContainText('17:00–18:30')
        await expect(guestPage.getByTestId('public-session-when')).toContainText(
          String(Number(String(session.occurrenceDate).slice(8, 10))),
        )
        await expect(guestPage.getByTestId('public-session-when')).toContainText(/Tuesday|wtorek/)
        await expect(guestPage.getByTestId('public-session-status')).toHaveAttribute('data-status', 'cancelled')
        // No names, no roster, no reason.
        const body = guestPage.locator('body')
        for (const name of ['Hania', 'Kowalsk', 'Nowak', 'Wiśniew', 'Marek', 'Krystyna', REASON]) {
          await expect(body).not.toContainText(name)
        }
        // Step 3 is not walked: until REQ-017 the page offers a sign-in, not the "send me a link" form (Q12).
        await expect(guestPage.getByTestId('public-session-sign-in')).toBeVisible()
        await expect(guestPage.getByTestId('public-session-sign-in')).toHaveAttribute('href', '/login')
        await expect(guestPage.locator('input[type="email"]')).toHaveCount(0)

        const violations = await gateScan(guestPage, testInfo, '/p/[clubSlug]/s/[occurrenceId]', async () => {
          await expect(guestPage.getByTestId('public-session-activity')).toBeVisible()
        })
        expect(violations).toEqual({})
      } finally {
        await guest.close()
      }
    })

    let groupThreadId = ''
    await test.step('step 4: coach Marek posts an announcement to the group Żaki in the composer', async () => {
      await signIn(page, request, club, marek)
      await page.goto('/backend/communication/threads/create')
      await page.waitForLoadState('networkidle')
      await page.getByTestId('audience-picker-kind').selectOption('group')
      const targets = page.getByTestId('audience-picker-targets')
      await targets.getByRole('radio', { name: /Żaki/ }).check()
      // Anna, Kuba, Piotr and Tomasz; the coach is the author.
      await expect(page.getByTestId('audience-picker-count')).toContainText('4')
      await page.locator('[data-crud-field-id="subject"] input').fill(ANNOUNCEMENT_SUBJECT)
      await page.locator('[data-crud-field-id="body"] textarea').fill(ANNOUNCEMENT_BODY)
      await page
        .getByRole('button', { name: /^(Send|Wyślij)$/ })
        .first()
        .click()
      await expect(page).toHaveURL(/\/backend\/communication\/threads\/[0-9a-f-]{36}$/)
      groupThreadId = page.url().split('/').pop() as string
      await expect(page.getByTestId('thread-subject')).toHaveText(ANNOUNCEMENT_SUBJECT)
      const posted = await getThread(request, admin, groupThreadId)
      expect(posted.body).toMatchObject({ scopeType: 'group', scopeId: family.zaki, subject: ANNOUNCEMENT_SUBJECT })
      expect(posted.body?.messages.at(0)).toMatchObject({ body: ANNOUNCEMENT_BODY, actingRole: 'coach' })
    })

    let annaToken = ''
    let replyId = ''
    await test.step('step 4: Anna writes to the coach in the group thread from her inbox; the reply reaches the staff only', async () => {
      annaToken = await signIn(page, request, club, anna)
      await page.goto('/club/messages')
      // Her inbox holds the session thread of step 1 and the announcement.
      await expect(page.getByTestId('club-thread')).toHaveCount(2)
      await page.getByTestId('club-thread').filter({ hasText: ANNOUNCEMENT_SUBJECT }).click()
      await expect(page.getByTestId('club-thread-subject')).toHaveText(ANNOUNCEMENT_SUBJECT)
      await expect(
        page.getByText(/Your reply reaches the club staff only\.|Twoja odpowiedź trafi tylko do kadry klubu\./),
      ).toBeVisible()
      await page.getByTestId('thread-reply-body').fill(PARENT_REPLY)
      await page.getByTestId('thread-reply-send').click()
      await expect(page.getByTestId('thread-message-body').filter({ hasText: PARENT_REPLY })).toBeVisible()

      // R01 and DD-M12: the reply is written as a guardian for the staff; its deliveries reach coach Marek alone.
      const asStaff = await getThread(request, admin, groupThreadId)
      const reply = asStaff.body?.messages.at(-1)
      expect(reply).toMatchObject({ body: PARENT_REPLY, actingRole: 'guardian', audience: 'staff' })
      replyId = String(reply?.id)
      const replyDeliveries = await settledDeliveries(request, admin, groupThreadId, `&messageId=${replyId}`)
      expect([...new Set(replyDeliveries.map((item) => item.personId))]).toEqual([marek.personId])
      const mail = (await awaitEmails(marek.email, REPLY_PL)).at(0)
      expect(mail?.text).toContain(PARENT_REPLY)
      for (const address of [piotr.email, kuba.email, tomasz.email, coordinator.email]) {
        expect([...emailsTo(address, REPLY_PL), ...emailsTo(address, REPLY_EN)], address).toEqual([])
      }
    })

    await test.step('exit gate: the member inbox /club/messages and the member thread at 375 px in light and dark mode, and the 320 px reflow', async () => {
      const violations: Record<string, unknown> = {}
      Object.assign(
        violations,
        await gateScan(page, testInfo, '/club/messages/[threadId]', async () => {
          await expect(page.getByTestId('thread-message-body').filter({ hasText: PARENT_REPLY })).toBeVisible()
        }),
      )
      await page.goto('/club/messages')
      await expect(page.getByTestId('club-thread')).toHaveCount(2)
      Object.assign(
        violations,
        await gateScan(page, testInfo, '/club/messages', async () => {
          await expect(page.getByTestId('club-thread').first()).toBeVisible()
        }),
      )
      expect(violations).toEqual({})
    })

    await test.step('step 4 (R15): another guardian, Piotr, sees the announcement but not Anna’s reply', async () => {
      const piotrToken = await signIn(page, request, club, piotr)
      await page.goto(`/club/messages/${groupThreadId}`)
      await expect(page.getByTestId('club-thread-subject')).toHaveText(ANNOUNCEMENT_SUBJECT)
      await expect(page.getByTestId('thread-message-body')).toHaveCount(1)
      await expect(page.getByTestId('thread-message-body')).toHaveText(ANNOUNCEMENT_BODY)
      await expect(page.locator('body')).not.toContainText(PARENT_REPLY)
      const asPiotr = await getThread(request, piotrToken, groupThreadId)
      expect(asPiotr.body?.messages.map((message) => message.body)).toEqual([ANNOUNCEMENT_BODY])
    })

    await test.step('step 4: the coordinator marks the thread as a case through its confirmation; an edit and a delete of the parent’s message then answer 409 case_immutable, and the thread shows the read-only banner with the full history', async () => {
      coordinatorToken = await signIn(page, request, club, coordinator)
      await page.goto(`/backend/communication/threads/${groupThreadId}`)
      const bodies = page.getByTestId('thread-message-body')
      await expect(bodies).toHaveText([ANNOUNCEMENT_BODY, PARENT_REPLY])
      await expect(page.getByTestId('thread-case-banner')).toHaveCount(0)
      await page.getByTestId('thread-mark-case').click()
      const dialog = page.getByRole('alertdialog')
      await expect(dialog).toBeVisible()
      const [marked] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/communication/threads/${groupThreadId}/case`) &&
            response.request().method() === 'POST',
        ),
        dialog.getByRole('button', { name: /^(Mark as case|Oznacz jako sprawę)$/ }).click(),
      ])
      expect(marked.status()).toBe(200)
      // R01: marked in the coordinator role.
      expect(await marked.json()).toMatchObject({ isCase: true, actingRole: 'coordinator' })
      await expect(page.getByTestId('thread-case-banner')).toBeVisible()
      await expect(page.getByTestId('thread-case-opened')).toContainText('Krystyna Koordynator')
      await expect(page.getByTestId('thread-mark-case')).toHaveCount(0)

      // The installed thread page has no edit or delete control (#35, #36), so the parent's edit and the coordinator's
      // deletion (J-M03) are made through the API, each with the thread's current version.
      const edit = await reviseMessage(
        request,
        annaToken,
        groupThreadId,
        replyId,
        'Jednak będziemy o 9:15.',
        await threadVersion(request, annaToken, groupThreadId),
      )
      expect(edit.status, JSON.stringify(edit.body)).toBe(409)
      expect(edit.body?.code).toBe('case_immutable')
      const removal = await deleteMessage(
        request,
        coordinatorToken,
        groupThreadId,
        replyId,
        await threadVersion(request, coordinatorToken, groupThreadId),
      )
      expect(removal.status, JSON.stringify(removal.body)).toBe(409)
      expect(removal.body?.code).toBe('case_immutable')

      // The full history, unchanged, under the read-only banner.
      await page.reload()
      await expect(page.getByTestId('thread-case-banner')).toBeVisible()
      await expect(bodies).toHaveText([ANNOUNCEMENT_BODY, PARENT_REPLY])
      const stored = await getThread(request, admin, groupThreadId)
      expect(stored.body?.isCase).toBe(true)
      expect(stored.body?.messages.map((message) => [message.body, message.editedAt, message.deleted])).toEqual([
        [ANNOUNCEMENT_BODY, null, false],
        [PARENT_REPLY, null, false],
      ])
    })

    await test.step('step 4 and exit gate: the case register lists the case; at 375 px in light and dark mode, and the 320 px reflow', async () => {
      await page.goto('/backend/communication/cases')
      await expect(page.getByTestId('case-link').filter({ hasText: ANNOUNCEMENT_SUBJECT }).first()).toBeVisible()
      const register = await listThreads(request, coordinatorToken, '&isCase=1')
      expect(register.map((thread) => thread.id)).toEqual([groupThreadId])
      const violations = await gateScan(page, testInfo, '/backend/communication/cases', async () => {
        await expect(page.getByTestId('case-link').first()).toBeVisible()
      })
      expect(violations).toEqual({})
    })

    await test.step('step 5: an e-mail is not delivered — the provider rejects Tomasz’s address; the delivery ends failed, foundation.dispatch.delivery_failed is emitted, and the thread shows "not delivered" next to him', async () => {
      // The running app's sender cannot be scripted, so the coordinator's next announcement is posted through the
      // messaging probe with a sender that rejects Tomasz's address (as TEST-M05 does); the probe's worker delivers it.
      const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
      const probe = runProbe(scope, [
        { op: 'senders', map: { [tomasz.email]: 'permanent' } },
        {
          op: 'command',
          id: 'communication.threads.create',
          authorUserId: coordinator.userId,
          input: {
            audience: { kind: 'group', ids: [family.zaki] },
            subject: FAILED_SUBJECT,
            body: 'Boisko jest nadal zamknięte, trenujemy na hali szkolnej.',
          },
        },
        { op: 'drain' },
      ])
      expect(probe.result.failure).toBeNull()
      const created = (
        probe.result.outputs[1] as { results: { result?: { threadId?: string }; error?: unknown }[] }
      ).results.at(0)
      expect(created?.error, JSON.stringify(created?.error)).toBeUndefined()
      const failedThreadId = String(created?.result?.threadId)

      const settled = await settledDeliveries(request, admin, failedThreadId)
      const failed = settled.filter((item) => item.status === 'failed')
      expect(failed).toEqual([
        expect.objectContaining({
          personId: tomasz.personId,
          channel: 'email',
          status: 'failed',
          failureCode: 'provider_rejected',
        }),
      ])
      // One ids-only event for the failed delivery.
      const events = probe.result.events.filter((entry) => entry.event === 'foundation.dispatch.delivery_failed')
      expect(events.map((entry) => String(entry.payload.id))).toEqual([failed[0]?.id])
      expect(Object.keys(events[0]?.payload ?? {}).sort()).toEqual(['dispatchId', 'id', 'organizationId', 'tenantId'])
      expect(events[0]?.payload).toMatchObject(scope)

      await page.goto(`/backend/communication/threads/${failedThreadId}`)
      const list = page.getByTestId('delivery-status-list')
      const failedRow = list.locator('[data-testid="delivery-row"][data-status="failed"]')
      await expect(failedRow).toHaveCount(1)
      await expect(failedRow).toContainText('Tomasz Wiśniewski')
      await expect(failedRow).toContainText(/Not delivered|Niedoręczone/)
      // Step 5's second error (a link request for an unknown e-mail) belongs to REQ-017 and is not walked.
    })

    await test.step('exit gate: the coordinator’s thread page with its delivery list at 375 px in light and dark mode, and the 320 px reflow', async () => {
      const violations = await gateScan(page, testInfo, '/backend/communication/threads/[id]', async () => {
        await expect(
          page.getByTestId('delivery-status-list').locator('[data-testid="delivery-row"][data-status="failed"]'),
        ).toBeVisible()
      })
      expect(violations).toEqual({})
    })
  } finally {
    await club.cleanup()
  }
})
