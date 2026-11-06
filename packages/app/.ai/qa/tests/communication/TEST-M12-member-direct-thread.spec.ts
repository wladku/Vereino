import { expect, test } from '@playwright/test'
import { readNotifications } from '../_fixtures/activities'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import {
  awaitEmails,
  directOptions,
  emailsTo,
  getThread,
  listThreads,
  markCase,
  postDirect,
  postReply,
  reviseMessage,
  settledDeliveries,
  threadVersion,
} from '../_fixtures/communication'
import { createGroup } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'

// TEST-M12 (foundation III REQ-M12, DD-M18, AC-M12; #138) on the TEST-008 family: Anna ("Kasia" of the spec) is the
// guardian of Hania (14, no account; Żaki and the pool group — "Jaś") and Kuba (16, with an account, Żaki — "Ola"); the
// coach of Żaki is Marek ("Wojtek"); Piotr is another family in Żaki; Krystyna coordinates the academy. Anna writes to
// the Żaki coaches about Hania: Marek gets the in-app notice and the e-mail, the thread is `direct` in Anna's inbox and
// the staff lists, Piotr sees nothing (403 on the thread). Kuba writes to his coach: Anna is among the recipients, and
// her reply reaches the coach. A group or a person outside the household → 403 `scope_denied`. A thread to the
// coordinator reaches Krystyna, not Marek. Krystyna marks Anna's thread as a case → Anna's edit answers 409
// `case_immutable`. The 21st direct thread of one member in 24 hours → 429 `direct_thread_limit`.
test.describe.configure({ timeout: 900_000 })

test('TEST-M12 member direct thread: the coaches or the coordinator of a household group, never another family, case, 403 outside the household, 429 after 20 a day', async ({
  request,
}) => {
  const club = await createClub(request, 'test-m12')
  try {
    const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const family = await familyFor(request, club)
    const anna = family.guardian
    const hania = family.younger
    const kuba = family.elder
    const piotr = family.other.guardian
    const coach = family.coach
    const coordinator = family.academyCoordinator

    // The options: Anna's wards' groups today with the staff names only; Anna herself takes part in no group.
    const annaOptions = await directOptions(request, anna.token)
    const option = (personId: string, groupId: string) =>
      annaOptions.find((entry) => entry.personId === personId && entry.groupId === groupId)
    expect(option(hania.personId, family.zaki)).toMatchObject({
      personName: 'Hania Kowalska',
      groupName: 'Żaki',
      sectionId: family.academy,
      coachNames: ['Marek Trener'],
      coordinatorNames: ['Krystyna Koordynator'],
    })
    expect(option(hania.personId, family.poolGroup)).toMatchObject({
      coachNames: ['Irena Instruktor'],
      coordinatorNames: ['Bogdan Basenowy'],
    })
    expect(option(kuba.personId, family.zaki)).toBeDefined()
    expect(annaOptions.some((entry) => entry.personId === anna.personId)).toBe(false)
    expect(JSON.stringify(annaOptions)).not.toContain('Nowak')
    // Piotr's options name his own child only; the staff see no option of their own.
    const piotrOptions = await directOptions(request, piotr.token)
    expect(piotrOptions.map((entry) => entry.personId)).toEqual([family.other.child.personId])
    expect(await directOptions(request, coordinator.token)).toEqual([])

    // Anna writes to the Żaki coaches about Hania.
    const subject = `Nieobecność Hani ${String(Date.now())}`
    const body = 'Hania nie przyjdzie w środę na trening — ma wizytę u lekarza.'
    const posted = await postDirect(request, anna.token, {
      personId: hania.personId,
      groupId: family.zaki,
      to: 'coaches',
      subject,
      body,
    })
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    expect(posted.body).toMatchObject({ ok: true, actingRole: 'guardian' })
    const threadId = String(posted.body?.threadId)
    const messageId = String(posted.body?.messageId)

    // Marek: an in-app notice and an e-mail; nobody else (Hania has no account, Anna is the author). The delivery list
    // needs `communication.post`, so the administrator reads it.
    const items = await settledDeliveries(request, club.adminToken, threadId)
    expect(
      items
        .map(
          (item) =>
            `${item.personId === coach.personId ? 'coach' : String(item.personId)}:${item.channel}:${item.status}`,
        )
        .sort(),
    ).toEqual(['coach:email:sent', 'coach:in_app:sent'])
    await awaitEmails(coach.email, subject)
    const notices = await readNotifications(
      request,
      coach.token,
      `&type=communication.announcement&sourceEntityId=${messageId}`,
    )
    expect(notices).toHaveLength(1)

    // `direct` in Anna's inbox, in the coach's and the academy coordinator's lists; not the pool coordinator's.
    const annaInbox = await listThreads(request, anna.token, '&as=member')
    expect(annaInbox.find((thread) => thread.id === threadId)).toMatchObject({ scopeType: 'direct', subject })
    expect((await listThreads(request, coach.token)).find((thread) => thread.id === threadId)?.scopeType).toBe('direct')
    expect((await listThreads(request, coordinator.token)).map((thread) => thread.id)).toContain(threadId)
    expect(
      (await listThreads(request, coordinator.token, `&sectionId=${family.academy}&scopeType=direct`)).map(
        (thread) => thread.id,
      ),
    ).toContain(threadId)
    expect((await getThread(request, family.poolCoordinator.token, threadId)).status).toBe(403)

    // The other family sees nothing: not in Piotr's inbox, 403 on the thread; no e-mail to him.
    expect((await listThreads(request, piotr.token, '&as=member')).map((thread) => thread.id)).not.toContain(threadId)
    expect((await getThread(request, piotr.token, threadId)).status).toBe(403)
    expect(emailsTo(piotr.email, subject)).toEqual([])

    // The coach answers: Anna gets it.
    const coachReply = await postReply(request, coach.token, threadId, 'Dziękuję, przyjąłem.')
    expect(coachReply.status, JSON.stringify(coachReply.body)).toBe(201)
    await awaitEmails(anna.email, 'Nowa odpowiedź')

    // Kuba (16, an account) writes to his coach about himself: Anna, his guardian, is among the recipients.
    const kubaSubject = `Pytanie Kuby ${String(Date.now())}`
    const kubaPost = await postDirect(request, kuba.token, {
      personId: kuba.personId,
      groupId: family.zaki,
      to: 'coaches',
      subject: kubaSubject,
      body: 'Czy mogę dołączyć do treningu bramkarzy?',
    })
    expect(kubaPost.status, JSON.stringify(kubaPost.body)).toBe(201)
    expect(kubaPost.body?.actingRole).toBe('self')
    const kubaThreadId = String(kubaPost.body?.threadId)
    const kubaItems = await settledDeliveries(request, club.adminToken, kubaThreadId)
    expect(kubaItems.find((item) => item.personId === anna.personId)?.reasons).toEqual(['guardian'])
    expect(kubaItems.find((item) => item.personId === coach.personId)?.reasons).toEqual(['coach'])
    expect(kubaItems.some((item) => item.personId === kuba.personId)).toBe(false)
    await awaitEmails(anna.email, kubaSubject)
    // Anna's reply in Kuba's thread is a household member's reply: it reaches the staff (the coach).
    const annaReply = await postReply(request, anna.token, kubaThreadId, 'Potwierdzam zgodę.')
    expect(annaReply.status, JSON.stringify(annaReply.body)).toBe(201)
    await expect
      .poll(() => emailsTo(coach.email, 'Nowa odpowiedź').some((mail) => mail.text.includes('Potwierdzam zgodę.')), {
        timeout: 60_000,
      })
      .toBe(true)

    // Outside the household: a group Hania does not take part in, a group of nobody in the household, another
    // family's child → 403 `scope_denied`.
    const orliki = await createGroup(request, club.adminToken, {
      sectionId: family.academy,
      name: 'Orliki',
      kind: 'team',
    })
    for (const [what, input] of [
      ['Kuba is not in the pool group', { personId: kuba.personId, groupId: family.poolGroup }],
      ['nobody of the household is in Orliki', { personId: hania.personId, groupId: orliki }],
      ['another family’s child', { personId: family.other.child.personId, groupId: family.zaki }],
    ] as const) {
      const refused = await postDirect(request, anna.token, { ...input, to: 'coaches', subject: 'x', body: 'y' })
      expect(refused.status, `${what}: ${JSON.stringify(refused.body)}`).toBe(403)
      expect(refused.body?.code, what).toBe('scope_denied')
    }

    // To the coordinator: Krystyna gets it, Marek does not.
    const toCoordinatorSubject = `Do koordynatora ${String(Date.now())}`
    const toCoordinator = await postDirect(request, anna.token, {
      personId: hania.personId,
      groupId: family.zaki,
      to: 'coordinator',
      subject: toCoordinatorSubject,
      body: 'Proszę o kontakt w sprawie składek.',
    })
    expect(toCoordinator.status, JSON.stringify(toCoordinator.body)).toBe(201)
    const coordinatorThreadId = String(toCoordinator.body?.threadId)
    const coordinatorItems = await settledDeliveries(request, club.adminToken, coordinatorThreadId)
    expect([...new Set(coordinatorItems.map((item) => item.personId))]).toEqual([coordinator.personId])
    await awaitEmails(coordinator.email, toCoordinatorSubject)
    expect(emailsTo(coach.email, toCoordinatorSubject)).toEqual([])
    expect((await getThread(request, coach.token, coordinatorThreadId)).status).toBe(403)

    // The coordinator marks Anna's first thread as a case; Anna's edit of her message answers 409 `case_immutable`.
    const marked = await markCase(
      request,
      coordinator.token,
      threadId,
      await threadVersion(request, coordinator.token, threadId),
    )
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    const edit = await reviseMessage(
      request,
      anna.token,
      threadId,
      messageId,
      'Zmieniona treść',
      await threadVersion(request, anna.token, threadId),
    )
    expect(edit.status, JSON.stringify(edit.body)).toBe(409)
    expect(edit.body?.code).toBe('case_immutable')

    // The daily limit: Anna has started 2 direct threads; the 3rd…20th pass, the 21st answers 429.
    for (let index = 3; index <= 20; index += 1) {
      const next = await postDirect(request, anna.token, {
        personId: hania.personId,
        groupId: family.poolGroup,
        to: 'coaches',
        subject: `Wiadomość ${String(index)}`,
        body: 'Treść',
      })
      expect(next.status, `thread ${String(index)}: ${JSON.stringify(next.body)}`).toBe(201)
    }
    const limited = await postDirect(request, anna.token, {
      personId: hania.personId,
      groupId: family.poolGroup,
      to: 'coaches',
      subject: 'Wiadomość 21',
      body: 'Treść',
    })
    expect(limited.status, JSON.stringify(limited.body)).toBe(429)
    expect(limited.body?.code).toBe('direct_thread_limit')
    // Kuba's own limit is separate.
    const kubaAgain = await postDirect(request, kuba.token, {
      personId: kuba.personId,
      groupId: family.zaki,
      to: 'coordinator',
      subject: 'Kuba do koordynatora',
      body: 'Treść',
    })
    expect(kubaAgain.status, JSON.stringify(kubaAgain.body)).toBe(201)
  } finally {
    await club.cleanup()
  }
})
