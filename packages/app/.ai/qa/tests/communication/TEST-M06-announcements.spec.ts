import { expect, test } from '@playwright/test'
import { readNotifications } from '../_fixtures/activities'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import {
  awaitEmails,
  emailsTo,
  getThread,
  listThreads,
  postReply,
  postThread,
  settledDeliveries,
} from '../_fixtures/communication'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'
import { actionLogEntries } from '../_fixtures/people'

// TEST-M06 (foundation III REQ-M06, AC-M06; club spec TEST-015, REQ-009, R01, R15) on the club spec's TEST-015 family:
// the group Żaki with a 14-year-old without an account and a 16-year-old with one (both wards of Anna, who has an
// account), a 12-year-old of another family (Piotr, English), and the coach Marek. The coach posts to the group: the
// recipients follow the *Thread* rule — Anna as the guardian, Kuba as a participant with an account, Piotr as the other
// guardian — in the app and by e-mail, each e-mail in the recipient's language; the coach is not a recipient. Anna's
// reply reaches the staff only and Piotr never sees it; the coach's reply reaches everyone; a coach posting to the
// section gets 403; the acting roles are recorded; the post offers no undo.
test.describe.configure({ timeout: 600_000 })

test('TEST-M06 announcements: Thread rule recipients on both channels in their language, member reply to staff only, coach reply to all, 403 outside the groups, acting role, no undo', async ({
  request,
}) => {
  const club = await createClub(request, 'test-m06')
  try {
    const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const family = await familyFor(request, club)
    const anna = family.guardian
    const kuba = family.elder
    const piotr = family.other.guardian
    const coach = family.coach
    // Piotr reads in English; the others take the club's Polish.
    const me = await getMe(request, piotr.token)
    const english = await putMe(request, piotr.token, { preferredLocale: 'en' }, me.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)

    // A coach may not post to a section, even their group's, nor to the club (403 `scope_denied`).
    const toSection = await postThread(request, coach.token, {
      audience: { kind: 'section', ids: [family.academy] },
      subject: 'Do sekcji',
      body: 'Treść',
    })
    expect(toSection.status, JSON.stringify(toSection.body)).toBe(403)
    expect(toSection.body?.code).toBe('scope_denied')
    const toClub = await postThread(request, coach.token, { audience: { kind: 'club' }, subject: 'x', body: 'y' })
    expect(toClub.status).toBe(403)
    // A member has no `communication.post`.
    const asMember = await postThread(request, anna.token, {
      audience: { kind: 'group', ids: [family.zaki] },
      subject: 'x',
      body: 'y',
    })
    expect(asMember.status).toBe(403)

    // The coach posts to Żaki.
    const subject = `Sobota: zmiana godziny ${String(Date.now())}`
    const body = 'Mecz w sobotę zaczyna się o 11:00, zbiórka 10:15.\n<b>Proszę o punktualność.</b>'
    const posted = await postThread(request, coach.token, {
      audience: { kind: 'group', ids: [family.zaki] },
      subject,
      body,
    })
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    expect(posted.body).toMatchObject({ ok: true, actingRole: 'coach' })
    const threadId = String(posted.body?.threadId)
    const messageId = String(posted.body?.messageId)

    // Recipients and channels (the coach, the author, sees the delivery status).
    const items = await settledDeliveries(request, coach.token, threadId)
    const byPerson = (personId: string) =>
      items
        .filter((item) => item.personId === personId)
        .map((item) => `${item.channel}:${item.status}`)
        .sort()
    expect(byPerson(anna.personId)).toEqual(['email:sent', 'in_app:sent'])
    expect(byPerson(kuba.personId)).toEqual(['email:sent', 'in_app:sent'])
    expect(byPerson(piotr.personId)).toEqual(['email:sent', 'in_app:sent'])
    expect(byPerson(family.younger.personId)).toEqual([])
    expect(byPerson(family.other.child.personId)).toEqual([])
    expect(byPerson(coach.personId)).toEqual([])
    expect(items.find((item) => item.personId === anna.personId)?.reasons).toEqual(['guardian'])
    expect(items.find((item) => item.personId === kuba.personId)?.reasons).toEqual(['participant'])
    expect(items.every((item) => item.name !== null)).toBe(true)

    // E-mails in each recipient's language, the club text verbatim and escaped.
    const annaMail = (await awaitEmails(anna.email, subject)).at(0)
    expect(annaMail?.text).toContain('Odpowiedz w aplikacji.')
    expect(annaMail?.text).toContain('<b>Proszę o punktualność.</b>')
    expect(annaMail?.links.some((link) => link.includes(`/club/messages/${threadId}`))).toBe(true)
    const piotrMail = (await awaitEmails(piotr.email, subject)).at(0)
    expect(piotrMail?.text).toContain('Reply in the app.')
    await awaitEmails(kuba.email, subject)
    expect(emailsTo(coach.email, subject)).toEqual([])

    // In-app notifications for the account holders, ids and keys only (no subject, no text).
    for (const [who, token] of [
      ['anna', anna.token],
      ['kuba', kuba.token],
      ['piotr', piotr.token],
    ] as const) {
      const notices = await readNotifications(
        request,
        token,
        `&type=communication.announcement&sourceEntityId=${messageId}`,
      )
      expect(notices, who).toHaveLength(1)
      expect(JSON.stringify(notices[0])).not.toContain('punktualność')
    }

    // Anna replies: the reply reaches the staff (the coach) only.
    const question = 'Czy jest transport na mecz?'
    const annaReply = await postReply(request, anna.token, threadId, question)
    expect(annaReply.status, JSON.stringify(annaReply.body)).toBe(201)
    expect(annaReply.body?.actingRole).toBe('guardian')
    await awaitEmails(coach.email, 'Nowa odpowiedź')
    // Piotr never sees it; Kuba (Anna's ward) and Anna do.
    const asPiotr = await getThread(request, piotr.token, threadId)
    expect(asPiotr.status).toBe(200)
    expect(asPiotr.body?.messages.map((message) => message.body)).toEqual([body])
    const asKuba = await getThread(request, kuba.token, threadId)
    expect(asKuba.body?.messages.map((message) => message.body)).toEqual([body, question])
    const asAnna = await getThread(request, anna.token, threadId)
    expect(asAnna.body?.messages.at(1)).toMatchObject({ body: question, audience: 'staff', own: true })
    const asCoach = await getThread(request, coach.token, threadId)
    expect(asCoach.body?.staff).toBe(true)
    expect(asCoach.body?.messages.map((message) => [message.actingRole, message.body])).toEqual([
      ['coach', body],
      ['guardian', question],
    ])

    // The coach replies: everyone gets it.
    const answer = 'Tak, autokar o 9:30 spod szkoły.'
    const coachReply = await postReply(request, coach.token, threadId, answer)
    expect(coachReply.status, JSON.stringify(coachReply.body)).toBe(201)
    expect(coachReply.body?.actingRole).toBe('coach')
    await awaitEmails(anna.email, 'Nowa odpowiedź')
    await awaitEmails(kuba.email, 'Nowa odpowiedź')
    await awaitEmails(piotr.email, 'New reply')
    // Piotr got no e-mail of Anna's reply: exactly the coach's.
    expect(emailsTo(piotr.email, 'New reply')).toHaveLength(1)
    expect(emailsTo(piotr.email, 'New reply').at(0)?.text).toContain(answer)
    const piotrView = await getThread(request, piotr.token, threadId)
    expect(piotrView.body?.messages.map((message) => message.body)).toEqual([body, answer])

    // Visibility: the academy coordinator sees the thread, the pool coordinator does not; Piotr's inbox lists it.
    expect((await getThread(request, family.academyCoordinator.token, threadId)).status).toBe(200)
    expect((await getThread(request, family.poolCoordinator.token, threadId)).status).toBe(403)
    expect((await listThreads(request, piotr.token, '&as=member')).map((thread) => thread.id)).toContain(threadId)
    expect((await listThreads(request, family.poolCoordinator.token)).map((thread) => thread.id)).not.toContain(
      threadId,
    )

    // No undo: the administrator's own post is logged without an undo token.
    const adminPost = await postThread(request, club.adminToken, {
      audience: { kind: 'group', ids: [family.zaki] },
      subject: 'Ogłoszenie zarządu',
      body: 'Treść',
    })
    expect(adminPost.status, JSON.stringify(adminPost.body)).toBe(201)
    expect(adminPost.body?.actingRole).toBe('club_admin')
    const logs = (await actionLogEntries(request, club.adminToken, String(adminPost.body?.threadId))).filter(
      (entry) => entry.commandId === 'communication.threads.create',
    )
    expect(logs).toHaveLength(1)
    expect(logs[0]?.undoToken ?? null).toBeNull()
    expect(logs[0]?.context?.actingRole).toBe('club_admin')
  } finally {
    await club.cleanup()
  }
})
