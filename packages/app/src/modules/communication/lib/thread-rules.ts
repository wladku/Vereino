// Pure rules of `communication` (foundation III REQ-M06…REQ-M08, REQ-M10; DD-M06, DD-M10, DD-M12, DD-M13; club spec
// *Thread* rule, R01, R15): which audience kinds an author may address, who is the staff of a thread, who a reply
// reaches, which messages a member sees, the latest revision of each message, unread state and the share text line.
// The services and commands apply them; nothing here touches the database.
import {
  cancellingRole,
  type AudienceContact,
  type AudienceKind,
  type AudienceReason,
  type CancellingRole,
  type GrantKind,
  type Recipient,
  type RecipientChannel,
  type Scope,
  type ScopeTarget,
} from '@vereino/core'

/** A thread's scope (club spec glossary *Thread*); `direct` is an audience of kind `persons`. */
export const THREAD_SCOPE_TYPES = ['club', 'section', 'group', 'activity', 'occurrence', 'direct'] as const
export type ThreadScopeType = (typeof THREAD_SCOPE_TYPES)[number]

/**
 * A thread message row (DD-M10): a message, a revision that supersedes one, or a tombstone that deletes one; or the
 * system message of a session cancellation (`cancellation`, #139), which names who cancelled (`author_person_id`)
 * and in which role (`acting_role`, R01) and, like every system message, is never edited or deleted.
 */
export const MESSAGE_KINDS = ['message', 'revision', 'tombstone', 'cancellation'] as const
export type MessageKind = (typeof MESSAGE_KINDS)[number]

/** The kinds that start a message of their own (a revision or a tombstone only changes one). */
export const ORIGINAL_MESSAGE_KINDS: readonly MessageKind[] = ['message', 'cancellation']

/** True for a row that is a message of its own: a message or a cancellation notice. */
export function isOriginalMessage(row: { kind: MessageKind }): boolean {
  return ORIGINAL_MESSAGE_KINDS.includes(row.kind)
}

/**
 * True for a message the club wrote, not a person (DD-M10): one without an author — the session cancellation of
 * before #139 — or a cancellation notice, whose author is the person who cancelled the session.
 */
export function isSystemMessage(row: { kind: MessageKind; authorPersonId: string | null }): boolean {
  return row.authorPersonId === null || row.kind === 'cancellation'
}

/** Who a message is for: everyone in the thread, or the staff only (a member's reply, DD-M12). */
export const MESSAGE_AUDIENCES = ['all', 'staff'] as const
export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number]

/**
 * Why a person takes part in a thread: an audience reason, the thread's `author`, or `staff` (a coordinator or the
 * club administrator who replied without being addressed).
 */
export type ParticipantReason = AudienceReason | 'author' | 'staff'

/** Participant reasons that make a person the thread's staff (the author, the scope's coaches, staff who replied). */
export const STAFF_PARTICIPANT_REASONS: readonly ParticipantReason[] = ['author', 'coach', 'staff']

/** The audience kinds a composer offers, in this order (`persons` is not offered in the composer). */
export const COMPOSER_KINDS: readonly AudienceKind[] = ['club', 'section', 'group', 'activity', 'occurrence']

/** Grant kinds that may address each audience kind, least-privileged first (foundation III *Users, Permissions*). */
const POSTING_KINDS: Readonly<Record<AudienceKind, readonly GrantKind[]>> = {
  club: ['club_admin'],
  section: ['coordinator', 'club_admin'],
  group: ['coach', 'coordinator', 'club_admin'],
  activity: ['coach', 'coordinator', 'club_admin'],
  occurrence: ['coach', 'coordinator', 'club_admin'],
  persons: ['coach', 'coordinator', 'club_admin'],
}

/** Grant kinds a staff reader of a thread holds besides being a participant: the section's coordinator, the admin. */
export const THREAD_READ_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']

/** The grant kinds that may post to an audience of `kind`, least-privileged first. */
export function postingKinds(kind: AudienceKind): readonly GrantKind[] {
  return POSTING_KINDS[kind]
}

/** The thread scope of an audience kind (`persons` → `direct`). */
export function threadScopeTypeOf(kind: AudienceKind): ThreadScopeType {
  return kind === 'persons' ? 'direct' : kind
}

/** The audience kind of a thread scope (`direct` → `persons`). */
export function audienceKindOf(scopeType: ThreadScopeType): AudienceKind {
  return scopeType === 'direct' ? 'persons' : scopeType
}

/** The composer kinds the author's grants allow (AudiencePicker: a coach sees group, activity and session only). */
export function allowedAudienceKinds(scope: Scope): AudienceKind[] {
  const held = new Set(scope.map((grant) => grant.kind))
  return COMPOSER_KINDS.filter((kind) => POSTING_KINDS[kind].some((grantKind) => held.has(grantKind)))
}

/** The ids of the grants of `kind` in a scope (a coach's groups, a coordinator's sections, the self person). */
export function grantIds(scope: Scope, kind: GrantKind): string[] {
  return [...new Set(scope.filter((grant) => grant.kind === kind).flatMap((grant) => grant.ids ?? []))]
}

/** The person the signed-in user is (the `self` grant), or null for a user linked to no person. */
export function selfPersonId(scope: Scope): string | null {
  return grantIds(scope, 'self')[0] ?? null
}

/** The facts of an audience target that scope checks match (club spec *Record scope*). */
export type TargetFacts = { sectionId?: string | null; groupId?: string | null; occurrenceId?: string | null }

/**
 * The scope target of an audience target: its section (a coordinator's grant), its group and session (a coach's).
 * `id` names the record; the club itself is the organization.
 */
export function audienceTarget(
  id: string,
  organization: { tenantId: string; organizationId: string },
  facts: TargetFacts,
): ScopeTarget {
  return {
    id,
    tenantId: organization.tenantId,
    organizationId: organization.organizationId,
    sectionId: facts.sectionId ?? null,
    groupId: facts.groupId ?? null,
    occurrenceId: facts.occurrenceId ?? null,
  }
}

/**
 * The e-mail recipients of a session cancellation (REQ-M07): the in-app notice stays `activities`' phase 2 one, so
 * every recipient keeps the e-mail channel only. A recipient reachable in the app but without an address is left
 * out (the phase 2 notice reaches them); an unreachable one stays (its delivery is recorded as `unreachable`). The
 * user who cancelled is left out, as in the phase 2 notice.
 */
export function emailOnlyRecipients(recipients: readonly Recipient[], excludeUserId: string | null): Recipient[] {
  const result: Recipient[] = []
  for (const recipient of recipients) {
    if (excludeUserId && recipient.userId === excludeUserId) continue
    if (recipient.channels.length === 0) {
      result.push(recipient)
      continue
    }
    if (!recipient.channels.includes('email')) continue
    result.push({ ...recipient, channels: ['email'] })
  }
  return result
}

/**
 * The recipients of `base` followed by those of `extra` that `base` does not already reach (by person id): the session
 * audience plus the section's coordinators told of a coach's cancellation (#139). Order kept, no person twice.
 */
export function withExtraRecipients(base: readonly Recipient[], extra: readonly Recipient[]): Recipient[] {
  const reached = new Set(base.map((recipient) => recipient.personId))
  return [...base, ...extra.filter((recipient) => !reached.has(recipient.personId))]
}

/**
 * Who a cancellation notice names (R01, #139): the canceller's full name and a known acting role, or null when the
 * role is missing or unknown (the notice then stays the anonymous system message).
 */
export function cancelledByOf(
  person: { firstName: string; lastName: string },
  actingRole: string | null,
): { name: string; role: CancellingRole } | null {
  const role = cancellingRole(actingRole)
  return role ? { name: `${person.firstName} ${person.lastName}`.trim(), role } : null
}

/** The channels a contact can be reached on (an account → in-app, an address → e-mail). */
export function contactChannels(contact: Pick<AudienceContact, 'userId' | 'email'>): RecipientChannel[] {
  const channels: RecipientChannel[] = []
  if (contact.userId) channels.push('in_app')
  if (contact.email) channels.push('email')
  return channels
}

const AUDIENCE_REASONS: readonly AudienceReason[] = ['participant', 'coach', 'guardian', 'direct']

/**
 * The recipients of a reply among the thread's participants (DD-M12): the participants are already expanded (the
 * guardians were addressed by the first message), so they are not expanded again. Reasons keep the audience ones;
 * the author and staff who replied are reached as `direct`. Sorted by person id.
 */
export function replyRecipients(
  participants: ReadonlyArray<{ personId: string; reasons: readonly string[] }>,
  contacts: ReadonlyMap<string, AudienceContact>,
  excludePersonId: string | null,
): Recipient[] {
  const recipients: Recipient[] = []
  for (const participant of participants) {
    if (participant.personId === excludePersonId) continue
    const contact = contacts.get(participant.personId)
    if (!contact) continue
    const reasons = AUDIENCE_REASONS.filter((reason) => participant.reasons.includes(reason))
    recipients.push({
      personId: participant.personId,
      userId: contact.userId,
      email: contact.email,
      locale: contact.locale,
      reasons: reasons.length > 0 ? reasons : ['direct'],
      channels: contactChannels(contact),
    })
  }
  return recipients.sort((a, b) => a.personId.localeCompare(b.personId))
}

/** The participants who are the thread's staff (the author, coaches, staff who replied). */
export function staffParticipants<T extends { personId: string; reasons: readonly string[] }>(
  participants: readonly T[],
): T[] {
  return participants.filter((participant) =>
    participant.reasons.some((reason) => (STAFF_PARTICIPANT_REASONS as readonly string[]).includes(reason)),
  )
}

/** The participant reasons of the persons a message addressed, plus `author` for its author. */
export function participantRows(
  recipients: ReadonlyArray<Pick<Recipient, 'personId' | 'reasons'>>,
  author: { personId: string; reason: 'author' | 'staff' } | null,
): Array<{ personId: string; reasons: ParticipantReason[] }> {
  const rows = new Map<string, Set<ParticipantReason>>()
  const add = (personId: string, reasons: readonly ParticipantReason[]) => {
    const set = rows.get(personId) ?? new Set<ParticipantReason>()
    for (const reason of reasons) set.add(reason)
    rows.set(personId, set)
  }
  if (author) add(author.personId, [author.reason])
  for (const recipient of recipients) add(recipient.personId, recipient.reasons)
  return [...rows].map(([personId, reasons]) => ({ personId, reasons: [...reasons].sort() }))
}

/**
 * Whether a viewer is the thread's staff (DD-M12): its author, a participant reached as staff, or a holder of a
 * coordinator grant on its section or the club administrator (`staffRole` from `findActingRole` on the thread).
 */
export function isThreadStaff(input: {
  viewerPersonId: string | null
  authorPersonId: string | null
  participantReasons: readonly string[] | null
  staffRole: string | null
}): boolean {
  if (input.staffRole) return true
  if (input.viewerPersonId && input.viewerPersonId === input.authorPersonId) return true
  return (input.participantReasons ?? []).some((reason) =>
    (STAFF_PARTICIPANT_REASONS as readonly string[]).includes(reason),
  )
}

/** One stored message row, as much as the read model needs. */
export type MessageRow = {
  id: string
  kind: MessageKind
  supersedesMessageId: string | null
  authorPersonId: string | null
  actingRole: string
  audience: MessageAudience
  body: string | null
  createdAt: Date
}

/** A message as a thread shows it: the latest revision's body, "edited", "deleted" (DD-M10). */
export type MessageView = {
  id: string
  authorPersonId: string | null
  actingRole: string
  audience: MessageAudience
  body: string | null
  createdAt: Date
  editedAt: Date | null
  deleted: boolean
  system: boolean
}

/**
 * Collapses the append-only rows into one view per original message (`ORIGINAL_MESSAGE_KINDS`), oldest first: a
 * revision replaces the body and marks it edited, a tombstone empties it and marks it deleted. Revisions and
 * tombstones supersede the original message id; a row that supersedes an unknown id is ignored.
 */
export function latestMessages(rows: readonly MessageRow[]): MessageView[] {
  const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const views = new Map<string, MessageView>()
  for (const row of ordered) {
    if (isOriginalMessage(row)) {
      views.set(row.id, {
        id: row.id,
        authorPersonId: row.authorPersonId,
        actingRole: row.actingRole,
        audience: row.audience,
        body: row.body,
        createdAt: row.createdAt,
        editedAt: null,
        deleted: false,
        system: isSystemMessage(row),
      })
      continue
    }
    const view = row.supersedesMessageId ? views.get(row.supersedesMessageId) : undefined
    if (!view || view.deleted) continue
    if (row.kind === 'revision') {
      view.body = row.body
      view.editedAt = row.createdAt
    } else {
      view.body = null
      view.deleted = true
      view.editedAt = row.createdAt
    }
  }
  return [...views.values()]
}

/**
 * Whether a member sees a message (R15, DD-M12): the staff see everything; a member sees the messages for everyone
 * and the staff-only replies of their own household (themself, their wards and their wards' guardians).
 */
export function isVisibleTo(
  message: Pick<MessageView, 'audience' | 'authorPersonId'>,
  viewer: { staff: boolean; household: ReadonlySet<string> },
): boolean {
  if (viewer.staff || message.audience === 'all') return true
  return message.authorPersonId !== null && viewer.household.has(message.authorPersonId)
}

/** A message row for the unread state: who wrote it, for whom, and when. */
export type MessageStamp = { authorPersonId: string | null; audience: MessageAudience; createdAt: Date }

/**
 * The newest message the viewer sees that someone else wrote (their own messages are never unread), or null.
 * Revisions and tombstones count too: an edit is news.
 */
export function lastVisibleMessageAt(
  stamps: readonly MessageStamp[],
  viewer: { personId: string | null; staff: boolean; household: ReadonlySet<string> },
): Date | null {
  let latest: Date | null = null
  for (const stamp of stamps) {
    if (viewer.personId && stamp.authorPersonId === viewer.personId) continue
    if (!isVisibleTo(stamp, viewer)) continue
    if (!latest || stamp.createdAt.getTime() > latest.getTime()) latest = stamp.createdAt
  }
  return latest
}

/**
 * The newest message the viewer sees, their own included (the thread list's "Last message", B-18), or null. Only an
 * original message counts — an edit or a deletion is not a new message —; of two at the same instant the later id.
 * Its author is someone the viewer may see (R15), so the list never names another family.
 */
export function lastVisibleMessage<T extends MessageStamp & { id: string; kind: MessageKind }>(
  stamps: readonly T[],
  viewer: { staff: boolean; household: ReadonlySet<string> },
): T | null {
  let latest: T | null = null
  for (const stamp of stamps) {
    if (!isOriginalMessage(stamp) || !isVisibleTo(stamp, viewer)) continue
    const newer =
      !latest ||
      stamp.createdAt.getTime() > latest.createdAt.getTime() ||
      (stamp.createdAt.getTime() === latest.createdAt.getTime() && stamp.id > latest.id)
    if (newer) latest = stamp
  }
  return latest
}

/**
 * Whether the reader may narrow the thread list to a section (B-18; DD-M12): the club administrator any section, a
 * coordinator their own sections. For any other section the list is empty — never another section's threads, also
 * not the ones the reader takes part in.
 */
export function maySeeSection(
  reader: { clubWide: boolean; sectionIds: readonly string[] },
  sectionId: string,
): boolean {
  return reader.clubWide || reader.sectionIds.includes(sectionId)
}

/** Unread (DD-M13): a visible message newer than the viewer's read marker. */
export function isUnread(lastVisibleAt: Date | null, lastReadAt: Date | null): boolean {
  if (!lastVisibleAt) return false
  return !lastReadAt || lastVisibleAt.getTime() > lastReadAt.getTime()
}

/** The household of a member: themself, their wards and the active guardians of both (R15). */
export function householdOf(
  selfIds: readonly string[],
  wardIds: readonly string[],
  guardiansByWard: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const household = new Set<string>([...selfIds, ...wardIds])
  for (const guardians of guardiansByWard.values()) for (const id of guardians) household.add(id)
  return household
}

/** A plain-text excerpt of club text for a list or an in-app line: whitespace collapsed, cut at `max` characters. */
export function excerpt(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/** The one-line share text: the prefix (subject or session line) and the link, separated by a dash (DD-M14). */
export function shareLine(prefix: string, url: string): string {
  const head = excerpt(prefix, 160)
  return head ? `${head} — ${url}` : url
}

/** The sign-in link of a thread for members (DD-M14). */
export function memberThreadPath(threadId: string): string {
  return `/club/messages/${encodeURIComponent(threadId)}`
}

/** An absolute URL from the app's public base URL and a path. */
export function absoluteUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** The page of a list (S6.4 envelope numbers): 1-based page, page size capped at `max`. */
export function pageWindow(
  page: number | undefined,
  pageSize: number | undefined,
  max = 100,
): { page: number; pageSize: number; offset: number } {
  const size = Math.min(Math.max(Math.trunc(pageSize ?? 20), 1), max)
  const number = Math.max(Math.trunc(page ?? 1), 1)
  return { page: number, pageSize: size, offset: (number - 1) * size }
}

/** The S6.4 list envelope for an already sliced page. */
export function pagedEnvelope<T>(items: T[], total: number, window: { page: number; pageSize: number }) {
  return {
    items,
    total,
    page: window.page,
    pageSize: window.pageSize,
    totalPages: Math.max(1, Math.ceil(total / window.pageSize)),
  }
}

/**
 * The role a reply is written in (R01): the grant that allowed it for a coordinator or the administrator; otherwise
 * how the person takes part — a coach, a guardian, the thread's author (in the role of their first message), or
 * themself.
 */
export function replyActingRole(authorizedRole: string, reasons: readonly string[], authorRole: string | null): string {
  if (authorizedRole === 'coordinator' || authorizedRole === 'club_admin') return authorizedRole
  if (reasons.includes('author') && authorRole) return authorRole
  if (reasons.includes('coach')) return 'coach'
  if (reasons.includes('guardian')) return 'guardian'
  return 'self'
}
