// The services of the online requests (facilities spec DD-44, the *Events, Jobs, Notifications* rows of the request
// e-mails and `facilities.rental.request_verified`; REQ-024; #125):
// - `facilities.requestLinks`: the foundation P-10 single-use token link on `facilities_rentals` itself (the request
//   row is the link: `verification_token_hash`, `verification_expires_at`, `email_verified_at`), 1 hour;
// - the confirmation e-mail, enqueued inside the submitting command's transaction with the raw token only as the
//   delivery's encrypted secret, keyed by the bare address (never in an event, a job payload or a log);
// - the decision e-mails (approved, rejected, expired, superseded), each enqueued once per request and status
//   (`facilities:rental:<id>:<status>`, DD-46) in a transaction of its own by the persistent subscribers;
// - the in-app notice to the club's administrators (who hold `facilities.rentals.approve`) when a request is
//   confirmed — resolved in the club's organization, never tenant-wide.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveSupportedLocale } from '@open-mercato/shared/lib/i18n/locale'
import {
  bareAddressKey,
  createTokenLinkService,
  type DispatchService,
  type TokenLinkEntity,
  type TokenLinkService,
} from '@/modules/foundation'
import { Rental } from '../data/entities'
import notificationTypes from '../notifications'
import { REQUEST_VERIFICATION_TTL_MS } from '../lib/requests'
import { calendarDateInZone } from '@vereino/core'
import { clubAdminUserIds, clubRequestSettings, findPlaces, placePayee, type FacilitiesScope } from './directory'

export const FACILITIES_REQUEST_LINKS = 'facilities.requestLinks' as const
const DISPATCH = 'foundationDispatch'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'

/** A request row as the token-link service sees it: the rental with its link columns set. */
export type RequestLinkRow = Rental & TokenLinkEntity<'single'>

export type RequestLinkService = TokenLinkService<RequestLinkRow>

/** Built once in `di.ts`: every request creates its rental through `issue`, so the rental row is the link. */
export function createRequestLinkService(): RequestLinkService {
  return createTokenLinkService<'single', RequestLinkRow>(Rental as never, {
    use: 'single',
    ttlMs: REQUEST_VERIFICATION_TTL_MS,
  })
}

export function requestLinks(container: AwilixContainer): RequestLinkService {
  return container.resolve<RequestLinkService>(FACILITIES_REQUEST_LINKS)
}

function dispatchService(container: AwilixContainer): DispatchService {
  return container.resolve<DispatchService>(DISPATCH)
}

/** The supported language of a requester's e-mails: the form's, else the club's default. */
export function requestLocale(requested: string | null | undefined, clubDefault: string): string {
  return resolveSupportedLocale(requested ?? undefined) ?? resolveSupportedLocale(clubDefault) ?? 'en'
}

/** The club's public slug (the link of the e-mails); null when the club has none. */
async function clubSlugOf(container: AwilixContainer, scope: FacilitiesScope): Promise<string | null> {
  if (!container.hasRegistration(CLUB_CORE_SETTINGS)) return null
  const settings = await container
    .resolve<{ get(scope: FacilitiesScope): Promise<{ publicSettings: { publicSlug: string | null } }> }>(
      CLUB_CORE_SETTINGS,
    )
    .get(scope)
  return settings.publicSettings.publicSlug
}

export type VerificationMail = {
  row: Rental
  rawToken: string
  clubSlug: string
  placeName: string
  timeZone: string
  currency: string
  locale: string
  email: string
}

/**
 * Enqueues the confirmation e-mail in the submitting command's transaction (DD-44): the raw token travels only as the
 * delivery's secret. Returns the dispatch id the command publishes after its commit.
 */
export async function enqueueVerificationMail(
  container: AwilixContainer,
  em: EntityManager,
  mail: VerificationMail,
): Promise<string> {
  const scope = { tenantId: mail.row.tenantId, organizationId: mail.row.organizationId }
  const enqueued = await dispatchService(container).enqueue(
    em,
    {
      template: 'facilities.request_verification',
      params: {
        rentalId: mail.row.id,
        placeName: mail.placeName,
        startsAt: mail.row.startsAt.toISOString(),
        endsAt: mail.row.endsAt.toISOString(),
        timeZone: mail.timeZone,
        clubSlug: mail.clubSlug,
        amount: mail.row.rateId ? mail.row.amount : null,
        currency: mail.currency,
      },
      addresses: [{ email: mail.email, locale: mail.locale }],
      secrets: new Map([[bareAddressKey(mail.email), { token: mail.rawToken }]]),
      source: { module: 'facilities', type: 'facilities:rental', id: mail.row.id },
      idempotencyKey: `facilities:request-link:${mail.row.id}`,
      actor: { userId: null, actingRole: 'system' },
    },
    { ...scope, scope: [{ kind: 'system_job' }], em },
  )
  return enqueued.dispatchId
}

/** Publishes a committed dispatch; a failure is left to the dispatch sweeper. */
export async function publishDispatch(
  container: AwilixContainer,
  dispatchId: string,
  scope: FacilitiesScope,
): Promise<void> {
  await dispatchService(container).publish(dispatchId, scope)
}

export type DecisionStatus = 'approved' | 'rejected' | 'expired' | 'superseded'

/** The rental status each decision e-mail belongs to: a later status change does not resend it. */
const DECISION_RENTAL_STATUS = {
  approved: 'requested',
  rejected: 'rejected',
  expired: 'expired',
  superseded: 'superseded',
} as const

/**
 * The requester's e-mail about a decision on their online request, once per request and status. Nothing for a staff
 * entry (no online request), a request without an address, or a rental no longer in the decision's status.
 */
export async function sendDecisionMail(
  container: AwilixContainer,
  scope: FacilitiesScope,
  rentalId: string,
  status: DecisionStatus,
): Promise<boolean> {
  const em = container.resolve<EntityManager>('em').fork()
  const row = await findOneWithDecryption(em, Rental, { id: rentalId, ...scope, deletedAt: null }, {}, scope)
  if (!row || row.requestedVia !== 'online_form' || !row.contactEmail) return false
  if (row.status !== DECISION_RENTAL_STATUS[status]) return false
  const settings = await clubRequestSettings(container, scope)
  const place = (await findPlaces(container, scope, [row.placeId], em)).get(row.placeId)
  const base = {
    rentalId: row.id,
    placeName: place?.name ?? '—',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone: settings.timeZone,
    clubSlug: await clubSlugOf(container, scope),
  }
  let params: Record<string, unknown> = base
  if (status === 'approved') {
    const payee = await placePayee(container, scope, row.placeId, em)
    params = {
      ...base,
      amount: row.amount,
      currency: settings.currency,
      payeeName: payee?.bankAccount ? payee.name : null,
      bankAccount: payee?.bankAccount ?? settings.bankAccount,
      paymentDeadline: row.paymentDeadline?.toISOString() ?? null,
      cancellationDeadline: row.cancellationDeadline?.toISOString() ?? null,
    }
  } else if (status === 'rejected') {
    params = { ...base, reason: row.decisionReason ?? '—' }
  }
  const dispatchId = await em.transactional(async (tx) => {
    const enqueued = await dispatchService(container).enqueue(
      tx,
      {
        template: `facilities.request_${status}`,
        params,
        addresses: [{ email: row.contactEmail as string, locale: requestLocale(row.contactLocale, settings.locale) }],
        source: { module: 'facilities', type: 'facilities:rental', id: row.id },
        idempotencyKey: `facilities:rental:${row.id}:${status}`,
        actor: { userId: null, actingRole: 'system' },
      },
      { ...scope, scope: [{ kind: 'system_job' }], em: tx },
    )
    return enqueued.created ? enqueued.dispatchId : null
  })
  if (!dispatchId) return false
  await publishDispatch(container, dispatchId, scope)
  return true
}

/**
 * The in-app notice to the club's administrators — the holders of `facilities.rentals.approve` — that a confirmed
 * request waits (the spec's "people with `facilities.rentals.approve`", resolved through the club's `club_admin` role
 * assignments, so a tenant with several clubs never notifies another club).
 */
export async function notifyApprovers(
  container: AwilixContainer,
  scope: FacilitiesScope,
  rentalId: string,
  now: Date = new Date(),
): Promise<number> {
  const type = notificationTypes.find((entry) => entry.type === 'facilities.rental_request_pending')
  if (!type) return 0
  const em = container.resolve<EntityManager>('em').fork()
  const row = await em.findOne(
    Rental,
    { id: rentalId, ...scope, deletedAt: null, status: 'pending_approval' },
    { fields: ['id', 'placeId'] },
  )
  if (!row) return 0
  const settings = await clubRequestSettings(container, scope)
  const userIds = await clubAdminUserIds(container, scope, calendarDateInZone(now, settings.timeZone), em)
  if (userIds.length === 0) return 0
  const place = (await findPlaces(container, scope, [row.placeId], em)).get(row.placeId)
  const notification = buildBatchNotificationFromType(type, {
    recipientUserIds: userIds,
    bodyVariables: { place: place?.name ?? '' },
    sourceEntityType: 'facilities:rental',
    sourceEntityId: row.id,
    groupKey: `facilities:request:${row.id}`,
  })
  await resolveNotificationService(container).createBatch(notification, scope)
  return userIds.length
}
