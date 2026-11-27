import { expect, test } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  getPerson,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { getThread, markCase, postReply, postThread, reviseMessage, threadVersion } from '../_fixtures/communication'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'
import { guardianships } from '../_fixtures/people'
import { pdf, upload } from '../_fixtures/publication'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// TEST-L13 (people life-cycle spec REQ-L12, phase L2, #304): the forms send the fields the APIs already store. The
// administrator assigns a role with an end date, edits its dates, sees an inverted period refused (422) and ends it on
// a future date (B-10 Roles); adds a ward from a chosen start date and moves that date (B-10 Guardians); types an
// external id another person has (409 `external_id_duplicate` at the field) and then a free one (B-10 Details); and
// renames a section material without a new upload, a stale version answering 409 (B-05). The author edits their own
// message in the panel (B-19) and on the phone (M-07, 375 px, both locales, light and dark, axe): the text changes with
// the "edited" mark, others' messages offer no edit, and a case offers none and answers 409 `case_immutable`; an
// emptied text shows its error under the field with "Save" enabled (#490).
test.describe.configure({ timeout: 600_000 })

type Assignment = { id: string; validFrom: string; validTo: string | null; updatedAt: string }
type Material = { id: string; title: string; fileName: string; updatedAt: string }

test('TEST-L13 administrator: role dates, edit and end on a date, guardianship start, external id, material rename', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-l13-admin')
  try {
    const setupToken = club.adminToken
    const section = await createStructure(request, setupToken, 'sections', { name: 'Akademia piłkarska' })
    const jan = await createPerson(request, setupToken, {
      firstName: 'Jan',
      lastName: 'Trenerski',
      birthDate: birthDateTurning(35),
    })
    const kuba = await createPerson(request, setupToken, {
      firstName: 'Kuba',
      lastName: 'Nowicki',
      birthDate: birthDateTurning(10),
    })
    await createPerson(request, setupToken, {
      firstName: 'Ewa',
      lastName: 'Zewnętrzna',
      birthDate: birthDateTurning(40),
      externalId: 'CLUB-7',
    })
    const uploaded = await upload(
      request,
      setupToken,
      `/api/club_core/sections/${section}/materials`,
      pdf('zasady.pdf'),
      {
        title: 'Zasady',
        isPublic: 'false',
      },
    )
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201)

    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const token = await getAuthToken(request, club.tenant.email, password)
    const assignmentsOf = async (personId: string) =>
      (
        await call<{ items?: Assignment[] }>(
          request,
          'GET',
          `/api/people/role-assignments?personId=${personId}&pageSize=100`,
          token,
        )
      ).body?.items ?? []

    // B-10 Roles: a coach assignment from today until a day in three months.
    await page.goto(`/backend/people/persons/${jan}?tab=roles`)
    await page.locator('#people-role').click()
    await page.getByRole('option', { name: uiText('people.roles.role.coach', { exact: true }) }).click()
    await page.locator('#people-role-to').fill(calendarDate(90))
    await page.getByRole('button', { name: uiText('people.roles.actions.assign', { exact: true }) }).click()
    const row = page.getByTestId('people-role-row')
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('people-role-period')).toContainText(calendarDate(90))
    const [assigned] = await assignmentsOf(jan)
    expect(assigned).toMatchObject({ validFrom: calendarDate(0), validTo: calendarDate(90) })

    // "Edit": both dates change; an inverted period stays in the dialog with the server's refusal (422).
    await row.getByTestId('people-role-edit').click()
    const editDialog = page.getByTestId('people-role-edit-dialog')
    await editDialog.locator('#people-role-edit-from').fill(calendarDate(10))
    await editDialog.locator('#people-role-edit-to').fill(calendarDate(5))
    await editDialog.getByTestId('people-role-edit-submit').click()
    await expect(editDialog.getByTestId('people-role-dialog-problem')).toBeVisible()
    expect((await assignmentsOf(jan))[0]).toMatchObject({ validFrom: calendarDate(0), validTo: calendarDate(90) })
    await editDialog.locator('#people-role-edit-from').fill(calendarDate(-10))
    await editDialog.locator('#people-role-edit-to').fill(calendarDate(120))
    await editDialog.getByTestId('people-role-edit-submit').click()
    await expect(editDialog).toHaveCount(0)
    await expect(row.getByTestId('people-role-period')).toContainText(calendarDate(120))
    const edited = (await assignmentsOf(jan))[0]
    expect(edited).toMatchObject({ validFrom: calendarDate(-10), validTo: calendarDate(120) })
    const inverted = await call<{ code?: string }>(request, 'PUT', '/api/people/role-assignments', token, {
      data: { id: edited.id, validFrom: calendarDate(30), validTo: calendarDate(20) },
      headers: { [OPTIMISTIC_LOCK_HEADER]: edited.updatedAt },
    })
    expect(inverted.status, JSON.stringify(inverted.body)).toBe(422)

    // "End on…": the last day is a future date; the assignment stays active until then.
    await row.getByTestId('people-role-end').click()
    const endDialog = page.getByTestId('people-role-end-dialog')
    await endDialog.locator('#people-role-end-to').fill(calendarDate(30))
    await endDialog.getByTestId('people-role-end-submit').click()
    await expect(endDialog).toHaveCount(0)
    await expect(row.getByTestId('people-role-period')).toContainText(calendarDate(30))
    await expect(row).toContainText(uiText('people.common.active'))
    expect((await assignmentsOf(jan))[0]).toMatchObject({ validFrom: calendarDate(-10), validTo: calendarDate(30) })

    // B-10 Guardians: Kuba becomes Jan's ward from a chosen day; the start date is then moved in "Edit".
    await page.getByRole('tab', { name: uiText('people.persons.tabs.guardianship', { exact: true }) }).click()
    await page.getByRole('button', { name: uiText('people.guardianships.add.ward', { exact: true }) }).click()
    await page.getByPlaceholder(uiText('people.guardianships.fields.person.search')).fill('Nowicki')
    await page.getByRole('option', { name: /Kuba Nowicki/ }).click()
    await page.locator('#people-guardianship-from').fill(calendarDate(-20))
    await page.getByRole('button', { name: uiText('people.guardianships.actions.add', { exact: true }) }).click()
    const link = page.getByTestId('people-guardianship-row')
    await expect(link).toHaveCount(1)
    await expect(link.getByTestId('people-guardianship-period')).toContainText(calendarDate(-20))
    const added = await guardianships(request, token, `personId=${kuba}`)
    expect(added.items).toHaveLength(1)
    expect(added.items[0]?.validFrom).toBe(calendarDate(-20))
    const guardianshipId = added.items[0].id
    await link.getByRole('button', { name: uiText('people.guardianships.actions.edit', { exact: true }) }).click()
    await link.locator(`#valid-from-${guardianshipId}`).fill(calendarDate(-40))
    await link.getByRole('button', { name: uiText('people.common.save', { exact: true }) }).click()
    await expect(link.getByTestId('people-guardianship-period')).toContainText(calendarDate(-40))
    expect((await guardianships(request, token, `personId=${kuba}`)).items[0]?.validFrom).toBe(calendarDate(-40))

    // B-10 Details: another person's external id is refused at the field (409); a free one is stored.
    await page.getByRole('tab', { name: uiText('people.persons.tabs.details', { exact: true }) }).click()
    const externalId = page.locator('[data-crud-field-id="externalId"]')
    await externalId.locator('input').fill('CLUB-7')
    await page
      .getByRole('button', { name: uiText('people.common.save', { exact: true }) })
      .first()
      .click()
    await expect(externalId).toContainText(uiText('people.errors.external_id_duplicate'))
    expect((await getPerson(request, token, jan)).body?.externalId ?? null).toBeNull()
    const taken = await call<{ code?: string }>(request, 'PUT', '/api/people/persons', token, {
      data: { id: jan, externalId: 'CLUB-7' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String((await getPerson(request, token, jan)).body?.updatedAt) },
    })
    expect(taken.status, JSON.stringify(taken.body)).toBe(409)
    expect(taken.body?.code).toBe('external_id_duplicate')
    await externalId.locator('input').fill('CLUB-8')
    await page
      .getByRole('button', { name: uiText('people.common.save', { exact: true }) })
      .first()
      .click()
    await expect.poll(async () => (await getPerson(request, token, jan)).body?.externalId).toBe('CLUB-8')
    await page.reload()
    await expect(page.locator('[data-crud-field-id="externalId"] input')).toHaveValue('CLUB-8')

    // B-05 Materials: "Rename" in place; the file and its record stay (no new upload); a stale version answers 409.
    const materials = async () =>
      (await call<{ items?: Material[] }>(request, 'GET', `/api/club_core/sections/${section}/materials`, token)).body
        ?.items ?? []
    const [before] = await materials()
    await page.goto(`/backend/club/sections/${section}/edit?tab=public`)
    const material = page.getByTestId('section-material')
    await expect(material.getByTestId('section-material-title')).toHaveText('Zasady')
    await material.getByTestId('section-material-rename').click()
    // Escape cancels; the title stays.
    await material.getByTestId('section-material-rename-input').fill('Inny tytuł')
    await page.keyboard.press('Escape')
    await expect(material.getByTestId('section-material-title')).toHaveText('Zasady')
    await material.getByTestId('section-material-rename').click()
    await material.getByTestId('section-material-rename-input').fill('Zasady sekcji 2026')
    await page.keyboard.press('Enter')
    await expect(material.getByTestId('section-material-title')).toHaveText('Zasady sekcji 2026')
    const after = await materials()
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: before.id, title: 'Zasady sekcji 2026', fileName: before.fileName })
    const stale = await call<{ code?: string }>(
      request,
      'PUT',
      `/api/club_core/sections/${section}/materials/${before.id}`,
      token,
      { data: { title: 'Za późno' }, headers: { [OPTIMISTIC_LOCK_HEADER]: before.updatedAt } },
    )
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect((await materials())[0]?.title).toBe('Zasady sekcji 2026')
  } finally {
    await club.cleanup()
  }
})

test('TEST-L13 author edits their own message in the panel and on the phone, both locales and schemes, never on others or a case', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-l13-messages')
  try {
    const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const family = await familyFor(request, club)
    const krystyna = family.academyCoordinator
    const anna = family.guardian
    const posted = await postThread(request, krystyna.token, {
      audience: { kind: 'group', ids: [family.zaki] },
      subject: 'Turniej w sobotę',
      body: 'Zbiórka o 9:00.',
    })
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    const threadId = String(posted.body?.threadId)
    const announcementId = String(posted.body?.messageId)
    const reply = await postReply(request, anna.token, threadId, 'Kuba będzie.')
    expect(reply.status, JSON.stringify(reply.body)).toBe(201)
    const replyId = String(reply.body?.messageId)
    const messageIn = (id: string) => page.locator(`[data-testid="thread-message"][data-message-id="${id}"]`)

    // B-19: Krystyna edits her announcement; Anna's reply offers her no edit (she may only delete it).
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 1280, height: 900 })
    const krystynaPassword = await signInBrowser(page, request, club, krystyna.userId, krystyna.email)
    const krystynaToken = await getAuthToken(request, krystyna.email, krystynaPassword)
    await page.goto(`/backend/communication/threads/${threadId}`)
    await expect(page.getByTestId('thread-message')).toHaveCount(2)
    await expect(page.getByTestId('thread-message-edit')).toHaveCount(1)
    await expect(messageIn(replyId).getByTestId('thread-message-edit')).toHaveCount(0)
    const announcement = messageIn(announcementId)
    await expect(announcement.getByTestId('thread-message-edited')).toHaveCount(0)
    await announcement.getByTestId('thread-message-edit').click()
    await announcement.getByTestId('thread-message-edit-body').fill('Zbiórka o 9:30.')
    await announcement.getByTestId('thread-message-edit-save').click()
    await expect(announcement.getByTestId('thread-message-body')).toHaveText('Zbiórka o 9:30.')
    await expect(announcement.getByTestId('thread-message-edited')).toBeVisible()
    const stored = (await getThread(request, krystynaToken, threadId)).body?.messages ?? []
    expect(stored.find((message) => message.id === announcementId)).toMatchObject({ body: 'Zbiórka o 9:30.' })
    expect(stored.find((message) => message.id === announcementId)?.editedAt).not.toBeNull()

    // M-07 on the phone: Anna edits her reply; the announcement offers her no edit. Polish (the club's language).
    const annaPassword = await switchBrowserUser(page, request, club, anna.userId, anna.email)
    const annaToken = await getAuthToken(request, anna.email, annaPassword)
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
    await page.goto(`/club/messages/${threadId}`)
    const own = messageIn(replyId)
    await expect(own.getByTestId('thread-message-edit')).toHaveText(
      uiTextIn('pl', 'communication.message.actions.edit'),
    )
    await expect(page.getByTestId('thread-message-edit')).toHaveCount(1)
    await expect(messageIn(announcementId).getByTestId('thread-message-edited')).toBeVisible()
    await own.getByTestId('thread-message-edit').click()
    // An emptied text (#490): "Save" stays enabled, the error stands under the field and the focus goes back to it.
    await own.getByTestId('thread-message-edit-body').fill('')
    await expect(own.getByTestId('thread-message-edit-save')).toBeEnabled()
    await own.getByTestId('thread-message-edit-save').click()
    await expect(own.getByTestId('thread-message-edit-error')).toHaveText(
      uiTextIn('pl', 'communication.message.edit.errors.bodyRequired'),
    )
    await expect(own.getByTestId('thread-message-edit-body')).toBeFocused()
    await own.getByTestId('thread-message-edit-body').fill('Kuba będzie z bratem.')
    await expect(own.getByTestId('thread-message-edit-error')).toHaveCount(0)
    await own.getByTestId('thread-message-edit-save').click()
    await expect(own.getByTestId('thread-message-body')).toHaveText('Kuba będzie z bratem.')
    await expect(own.getByTestId('thread-message-edited')).toContainText(uiTextIn('pl', 'communication.message.edited'))
    await scan('/club/messages/[threadId] (pl, editor open)', async () => {
      await own.getByTestId('thread-message-edit').click()
      await expect(own.getByTestId('thread-message-edit-body')).toBeFocused()
    })

    // English, Anna's preference; Escape closes the editor without a change.
    const me = await getMe(request, annaToken)
    const english = await putMe(request, annaToken, { preferredLocale: 'en' }, me.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    await page.reload()
    await expect(own.getByTestId('thread-message-edit')).toHaveText(
      uiTextIn('en', 'communication.message.actions.edit'),
    )
    await expect(own.getByTestId('thread-message-edited')).toContainText(uiTextIn('en', 'communication.message.edited'))
    await own.getByTestId('thread-message-edit').click()
    await own.getByTestId('thread-message-edit-body').fill('Nie zapisuj.')
    await page.keyboard.press('Escape')
    await expect(own.getByTestId('thread-message-body')).toHaveText('Kuba będzie z bratem.')
    await scan('/club/messages/[threadId] (en)', async () => {
      await expect(own.getByTestId('thread-message-edit')).toBeVisible()
    })

    // A case: no edit anywhere, and a forged edit answers 409 `case_immutable`.
    const marked = await markCase(
      request,
      krystynaToken,
      threadId,
      await threadVersion(request, krystynaToken, threadId),
    )
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    await page.reload()
    await expect(page.getByTestId('club-thread-case')).toBeVisible()
    await expect(page.getByTestId('thread-message-edit')).toHaveCount(0)
    const refused = await reviseMessage(
      request,
      annaToken,
      threadId,
      replyId,
      'Po oznaczeniu sprawy.',
      await threadVersion(request, annaToken, threadId),
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('case_immutable')

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
