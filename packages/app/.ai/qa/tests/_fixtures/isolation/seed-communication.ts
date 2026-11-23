// communication records of the cross-club isolation guard (#628): the administrator's announcement to Żaki with the
// adult member's reply, the guardian's direct thread about the child to Żaki's coach, and a one-off tournament of
// Żaki (an activity with its one session) that the audience and share-text probes name.
import { safeDay, zoneInstant } from '../activities'
import type { PostResult } from '../communication'
import type { ModuleSeed } from './seed'

export const seedCommunication: ModuleSeed = async ({ seeded, api }) => {
  const { refs, tokens } = seeded
  const group = await api<PostResult>('POST', '/api/communication/threads', {
    data: { audience: { kind: 'group', ids: [refs.group] }, subject: 'Trening w sobotę', body: 'Zbiórka o 9:00.' },
  })
  refs.groupThread = String(group.body?.threadId)
  refs.groupMessage = String(group.body?.messageId)
  const reply = await api<PostResult>('POST', `/api/communication/threads/${refs.groupThread}/replies`, {
    token: tokens.member,
    data: { body: 'Będę.' },
  })
  refs.replyMessage = String(reply.body?.messageId)
  const direct = await api<PostResult>('POST', '/api/communication/direct', {
    token: tokens.guardian,
    data: {
      personId: refs.childPerson,
      groupId: refs.group,
      to: 'coaches',
      subject: 'Nieobecność Kuby',
      body: 'Kuba nie przyjdzie w sobotę.',
    },
  })
  refs.directThread = String(direct.body?.threadId)
  refs.directMessage = String(direct.body?.messageId)
  const day = safeDay(undefined, 10)
  const event = await api<{ id?: string; occurrenceId?: string }>('POST', '/api/activities/events', {
    data: {
      groupId: refs.group,
      type: 'tournament',
      name: 'Turniej Żaków',
      placeId: refs.place,
      startsAt: zoneInstant(day, '07:00'),
      endsAt: zoneInstant(day, '08:00'),
    },
  })
  refs.announcementActivity = String(event.body?.id)
  refs.announcementOccurrence = String(event.body?.occurrenceId)
}
