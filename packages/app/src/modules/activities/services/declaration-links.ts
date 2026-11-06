// Personal declaration links (club spec REQ-017, AC-017, TEST-017, DD-35; foundation P-10, P-30; UX concept M-13, M-14,
// F-06). A guardian without an account (or not signed in) asks for a link on `/club/link`, reached from the public
// session page; the link e-mail goes through the foundation `dispatch` with the raw token only in the delivery's
// encrypted secret. `/club/d/[token]` reads the session and the persons the link's holder may declare for with
// `TokenLinkService.peek` — the single DD-35 lookup of `activities_declaration_tokens.token_hash`, narrowed at once to
// the link's tenant and organization — and declares through `activities.attendance.declare_by_link`. The evening job
// sends the same link for tomorrow's sessions nobody has declared.
//
// The request never tells whether an address is known: the route answers 202 for every well-formed request, and the
// work runs to the same minimum duration whatever it found. Nothing here logs an address or a token.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { addCalendarDays, type CalendarDate, type Recipient, type Scope } from '@vereino/core'
import {
  contactResolver,
  resolveScopeForPerson,
  type DispatchService,
  type TokenLinkService,
} from '@/modules/foundation'
import type { ClubCorePublicSite } from '../../club_core/services/public-site'
import { Activity, Attendance, DeclarationToken, Occurrence } from '../data/entities'
import {
  MAX_LINKS_PER_HOUR,
  linkExpiry,
  linkRequestOwners,
  personIdsWithEmail,
  reminderKey,
  reminderOwners,
} from '../lib/declaration-links'
import { declarationWindow, type Declared, type DeclarationStatus } from '../lib/policy'
import type { OccurrenceStatus } from '../lib/activities-rules'
import {
  activeGuardians,
  attendanceSettings,
  clubClock,
  findPersons,
  rosterOn,
  type ActivitiesScope,
} from './directory'

const logger = createLogger('activities').child({ component: 'declaration-links' })

/** DI token of the `activities_declaration_tokens` link service (`di.ts`). */
export const ACTIVITIES_DECLARATION_LINKS = 'activities.declarationLinks'

const CLUB_CORE_PUBLIC_SITE = 'clubCorePublicSite'
const DISPATCH = 'foundationDispatch'
const TEMPLATE = 'activities.declaration_link'

export type DeclarationLinkService = TokenLinkService<DeclarationToken>

export function declarationLinkService(container: AwilixContainer): DeclarationLinkService {
  return container.resolve<DeclarationLinkService>(ACTIVITIES_DECLARATION_LINKS)
}

function dispatchService(container: AwilixContainer): DispatchService {
  return container.resolve<DispatchService>(DISPATCH)
}

/** The participants of a session on its date and the active guardians of each (by ward id). */
async function sessionFamilies(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrence: Occurrence,
  em: EntityManager,
): Promise<{ participantIds: string[]; guardiansByWard: Map<string, string[]> }> {
  const roster = await rosterOn(container, scope, occurrence.groupId, occurrence.occurrenceDate, em)
  const participantIds = roster.filter((member) => member.role === 'participant').map((member) => member.personId)
  const guardiansByWard =
    participantIds.length > 0
      ? await activeGuardians(container, scope, participantIds, occurrence.occurrenceDate, em)
      : new Map<string, string[]>()
  return { participantIds, guardiansByWard }
}

/** Raised inside the issuing transaction when the dispatch key was used before: the new token is rolled back. */
class AlreadySent extends Error {}

type LinkEmail = {
  scope: ActivitiesScope
  occurrence: Occurrence
  activityName: string
  timeZone: string
  owner: { personId: string; email: string; locale: string; reason: 'guardian' | 'participant' }
  reminder: boolean
  idempotencyKey: string
  /** The grants the dispatch is enqueued under: none for a sessionless request, `system_job` for the job. */
  grants: Scope
  now: Date
}

/**
 * Issues one link for one person and session and enqueues its e-mail, both in one transaction, then publishes the
 * dispatch. Returns false when nothing was sent: the session has ended, the person asked too often in the last hour,
 * or the idempotency key was used before (a rerun of the reminder job).
 */
async function sendLinkEmail(container: AwilixContainer, mail: LinkEmail): Promise<boolean> {
  const expiresAt = linkExpiry(mail.now, mail.occurrence.endAt)
  if (!expiresAt) return false
  const em = container.resolve<EntityManager>('em').fork()
  let dispatchId: string
  try {
    dispatchId = await em.transactional(async (tx) => {
      const recent = await tx.count(DeclarationToken, {
        ...mail.scope,
        guardianPersonId: mail.owner.personId,
        occurrenceId: mail.occurrence.id,
        createdAt: { $gt: new Date(mail.now.getTime() - 60 * 60 * 1000) },
      })
      if (recent >= MAX_LINKS_PER_HOUR) throw new AlreadySent()
      const { rawToken, link } = await declarationLinkService(container).issue(
        tx,
        { guardianPersonId: mail.owner.personId, occurrenceId: mail.occurrence.id },
        mail.scope,
        { expiresAt },
      )
      const recipient: Recipient = {
        personId: mail.owner.personId,
        userId: null,
        email: mail.owner.email,
        locale: mail.owner.locale,
        reasons: [mail.owner.reason],
        channels: ['email'],
      }
      const enqueued = await dispatchService(container).enqueue(
        tx,
        {
          template: TEMPLATE,
          params: {
            occurrenceId: mail.occurrence.id,
            activityName: mail.activityName,
            startAt: mail.occurrence.startAt.toISOString(),
            endAt: mail.occurrence.endAt.toISOString(),
            timeZone: mail.timeZone,
            reminder: mail.reminder,
          },
          recipients: [recipient],
          source: { module: 'activities', type: 'activities:declaration_token', id: link.id },
          idempotencyKey: mail.idempotencyKey,
          secrets: new Map([[mail.owner.personId, { token: rawToken }]]),
          actor: { userId: null, actingRole: 'system' },
        },
        { ...mail.scope, scope: mail.grants, em: tx },
      )
      if (!enqueued.created) throw new AlreadySent()
      return enqueued.dispatchId
    })
  } catch (error: unknown) {
    if (error instanceof AlreadySent) return false
    throw error
  }
  await dispatchService(container).publish(dispatchId, mail.scope)
  return true
}

type SessionFacts = { activityName: string; activityType: string; timeZone: string }

async function sessionFacts(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrence: Occurrence,
  em: EntityManager,
): Promise<SessionFacts> {
  const activity = await em.findOne(
    Activity,
    { id: occurrence.activityId, ...scope },
    { fields: ['id', 'name', 'type'] },
  )
  const settings = await attendanceSettings(container, scope)
  return { activityName: activity?.name ?? '', activityType: activity?.type ?? '', timeZone: settings.timeZone }
}

// --- The link request (M-13) ---

export type DeclarationLinkRequest = { email: string; clubSlug: string; occurrencePublicRef: string }

/**
 * Sends a personal link to every person of the session whose address is `email` and who may declare for somebody in
 * it (a participant, or an active guardian of one). The club comes from `club_core`'s slug lookup (DD-35) and the
 * session is read by id inside it; an unknown club, a foreign or closed session and an unknown address send nothing.
 * Returns how many links were sent, for the route's log only — never for the response.
 */
export async function requestDeclarationLink(
  container: AwilixContainer,
  request: DeclarationLinkRequest,
  now: Date = new Date(),
): Promise<number> {
  if (!container.hasRegistration(CLUB_CORE_PUBLIC_SITE)) return 0
  const frame = await container.resolve<ClubCorePublicSite>(CLUB_CORE_PUBLIC_SITE).clubFrame(request.clubSlug)
  if (frame.status !== 'ok') return 0
  const scope: ActivitiesScope = { tenantId: frame.value.tenantId, organizationId: frame.value.organizationId }
  const em = container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(Occurrence, { id: request.occurrencePublicRef, ...scope, deletedAt: null })
  if (!occurrence || declarationWindow(occurrence, now) !== 'open') return 0
  const { participantIds, guardiansByWard } = await sessionFamilies(container, scope, occurrence, em)
  const candidates = [...new Set([...participantIds, ...[...guardiansByWard.values()].flat()])]
  if (candidates.length === 0) return 0
  const contacts = await contactResolver(container).contacts(candidates, { container, ...scope, scope: [], em })
  const owners = linkRequestOwners(personIdsWithEmail(contacts, request.email), participantIds, guardiansByWard)
  if (owners.length === 0) return 0
  const facts = await sessionFacts(container, scope, occurrence, em)
  const byId = new Map(contacts.map((contact) => [contact.personId, contact]))
  let sent = 0
  for (const ownerId of owners) {
    const contact = byId.get(ownerId)
    if (!contact?.email) continue
    const ok = await sendLinkEmail(container, {
      scope,
      occurrence,
      activityName: facts.activityName,
      timeZone: facts.timeZone,
      owner: {
        personId: ownerId,
        email: contact.email,
        locale: contact.locale,
        reason: participantIds.includes(ownerId) ? 'participant' : 'guardian',
      },
      reminder: false,
      idempotencyKey: `activities:declaration-link:${randomUUID()}`,
      grants: [],
      now,
    })
    if (ok) sent += 1
  }
  return sent
}

// --- The token page (M-14) ---

export type DeclarationLinkPerson = {
  id: string
  firstName: string
  declared: Declared
  declarationStatus: DeclarationStatus | null
  /** The declaration's lock token (null before a first answer): the page sends it back, so a change made meanwhile
   * (another guardian, the ward) answers 409 instead of being overwritten. */
  updatedAt: string | null
}

export type DeclarationLinkPage = {
  club: { name: string }
  session: {
    activityName: string
    occurrenceDate: CalendarDate
    startAt: string
    endAt: string
    timeZone: string
    status: OccurrenceStatus
    /** What may be declared (the club's `declaration_kinds` for the activity type, D-026). */
    kind: 'absence_only' | 'confirm'
    /** `open` until the session starts; `closed` after; `not_planned` when cancelled or done. */
    window: 'open' | 'closed' | 'not_planned'
  }
  persons: DeclarationLinkPerson[]
  expiresAt: string
}

/** The persons a link's holder may declare for: participants of the session within their `self` and `guardian` grants. */
export async function linkPersons(
  container: AwilixContainer,
  link: DeclarationToken,
  occurrence: Occurrence,
  em: EntityManager,
): Promise<string[]> {
  const scope: ActivitiesScope = { tenantId: link.tenantId, organizationId: link.organizationId }
  const grants = await resolveScopeForPerson({ container }, { personId: link.guardianPersonId, ...scope })
  const allowed = new Set(
    grants.filter((grant) => grant.kind === 'self' || grant.kind === 'guardian').flatMap((grant) => grant.ids ?? []),
  )
  const { participantIds } = await sessionFamilies(container, scope, occurrence, em)
  return [...new Set(participantIds)].filter((personId) => allowed.has(personId))
}

/**
 * The page of a link: null for an unknown, malformed or deleted token or a session that no longer exists (404); the
 * foundation's 410 `token_link_expired` for an expired one. Spends nothing (a mail scanner opening it is harmless).
 */
export async function readDeclarationLink(
  container: AwilixContainer,
  rawToken: string,
  now: Date = new Date(),
): Promise<DeclarationLinkPage | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const view = await declarationLinkService(container).peek(em, rawToken)
  if (!view) return null
  const scope: ActivitiesScope = { tenantId: view.tenantId, organizationId: view.organizationId }
  const occurrence = await em.findOne(Occurrence, { id: view.link.occurrenceId, ...scope, deletedAt: null })
  if (!occurrence) return null
  const facts = await sessionFacts(container, scope, occurrence, em)
  const settings = await attendanceSettings(container, scope)
  const personIds = await linkPersons(container, view.link, occurrence, em)
  const [persons, rows, club] = await Promise.all([
    findPersons(container, scope, personIds, em),
    personIds.length > 0
      ? em.find(Attendance, { ...scope, occurrenceId: occurrence.id, personId: { $in: personIds }, deletedAt: null })
      : Promise.resolve([] as Attendance[]),
    contactResolver(container).club({ container, ...scope, scope: [], em }),
  ])
  const declarations = new Map(rows.map((row) => [row.personId, row]))
  return {
    club: { name: club.name },
    session: {
      activityName: facts.activityName,
      occurrenceDate: occurrence.occurrenceDate,
      startAt: occurrence.startAt.toISOString(),
      endAt: occurrence.endAt.toISOString(),
      timeZone: facts.timeZone,
      status: occurrence.status,
      kind: settings.declarationKinds[facts.activityType] ?? 'confirm',
      window: declarationWindow(occurrence, now),
    },
    persons: personIds.map((id) => ({
      id,
      firstName: persons.get(id)?.firstName ?? '',
      declared: declarations.get(id)?.declared ?? 'unknown',
      declarationStatus: declarations.get(id)?.declarationStatus ?? null,
      updatedAt: declarations.get(id)?.updatedAt.toISOString() ?? null,
    })),
    expiresAt: view.link.expiresAt.toISOString(),
  }
}

// --- The evening reminders (`activities:send-declaration-reminders`) ---

export type ReminderCounts = { processed: number; skipped: number; failed: number }

/**
 * Sends the reminder link for tomorrow's planned sessions of a `confirm` kind (a training is `absence_only`: silence
 * means "expected", D-022) to the guardians of every participant without a declaration, or to the participant without
 * a guardian. One link per person and session: the dispatch key makes a rerun send nothing twice. A failure of one
 * session is counted and left to the next run.
 */
export async function sendDeclarationReminders(
  container: AwilixContainer,
  scope: ActivitiesScope,
  now: Date,
): Promise<ReminderCounts> {
  const counts: ReminderCounts = { processed: 0, skipped: 0, failed: 0 }
  const { today } = await clubClock(container, scope, now)
  const tomorrow = addCalendarDays(today, 1)
  const em = container.resolve<EntityManager>('em').fork()
  const sessions = await em.find(Occurrence, {
    ...scope,
    deletedAt: null,
    status: 'planned',
    occurrenceDate: tomorrow,
    startAt: { $gt: now },
  })
  const settings = await attendanceSettings(container, scope)
  for (const occurrence of sessions) {
    try {
      const facts = await sessionFacts(container, scope, occurrence, em)
      if ((settings.declarationKinds[facts.activityType] ?? 'confirm') !== 'confirm') continue
      const { participantIds, guardiansByWard } = await sessionFamilies(container, scope, occurrence, em)
      const declared = await em.find(
        Attendance,
        { ...scope, occurrenceId: occurrence.id, deletedAt: null, declared: { $ne: 'unknown' } },
        { fields: ['id', 'personId'] },
      )
      const owners = reminderOwners(participantIds, new Set(declared.map((row) => row.personId)), guardiansByWard)
      if (owners.length === 0) continue
      const contacts = await contactResolver(container).contacts(owners, {
        container,
        ...scope,
        scope: [{ kind: 'system_job' }],
        em,
      })
      for (const contact of contacts) {
        if (!contact.email) {
          counts.skipped += 1
          continue
        }
        const sent = await sendLinkEmail(container, {
          scope,
          occurrence,
          activityName: facts.activityName,
          timeZone: facts.timeZone,
          owner: {
            personId: contact.personId,
            email: contact.email,
            locale: contact.locale,
            reason: participantIds.includes(contact.personId) ? 'participant' : 'guardian',
          },
          reminder: true,
          idempotencyKey: reminderKey(occurrence.id, contact.personId),
          grants: [{ kind: 'system_job' }],
          now,
        })
        if (sent) counts.processed += 1
        else counts.skipped += 1
      }
    } catch (error: unknown) {
      counts.failed += 1
      logger.warn('Declaration reminders failed for one session; the next run retries it', {
        ...scope,
        occurrenceId: occurrence.id,
        err: error,
      })
    }
  }
  return counts
}
