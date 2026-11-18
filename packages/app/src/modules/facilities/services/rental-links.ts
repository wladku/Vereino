// The renter's e-mails and cancellation link (facilities parity spec REQ-R17, DD-R13, J-R06; foundation P-10, DD-35,
// DD-44, DD-46; #286):
// - `facilities.rentalLinks`: the P-10 single-use link in `facilities_rental_links`, one per rental and purpose,
//   valid until the rental starts. `peek` is the one sessionless system-scope lookup of its token hash (the AGENTS.md
//   exception, approved on #253), after which every query is narrowed to the found tenant and organization;
// - the summary of a staff-entered rental, the approval of an online request and the "moved" e-mail: each issues a
//   fresh link (a move's replaces the old one) and enqueues the e-mail in one transaction, with the raw token only as
//   the delivery's encrypted secret, never in an event, a job payload or a log. A redelivered event finds its dispatch
//   key taken and rolls the whole transaction back, so the link of the e-mail already sent keeps working;
// - the cancellation e-mail with its outcome (free, late, unpaid after the payment deadline), once per status;
// - the preview the cancellation page reads: place, slot, amount, free or late, the deadline and the payee — never
//   the renter's contact data.
// A rental without an e-mail address gets nothing (the rental page says so); a club without a public slug gets the
// e-mails without a link (the club's phone instead), because the page lives under `/p/<club slug>`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  bareAddressKey,
  createTokenLinkService,
  foundationErrors,
  type DispatchService,
  type TokenLinkEntity,
  type TokenLinkService,
} from '@/modules/foundation'
import { Rental, RentalLink } from '../data/entities'
import {
  RENTAL_LINK_TTL_MS,
  cancelledOutcome,
  cancelsFree,
  rentalCancellable,
  rentalCancelledKey,
  rentalLinkExpiry,
  rentalMovedKey,
  rentalSummaryKey,
} from '../lib/rental-links'
import { cancellationDeadline } from '../lib/rentals'
import { clubRequestSettings, findPlaces, placePayee, type FacilitiesScope } from './directory'
import { publicClub } from './request-queue'
import { requestLocale } from './requests'
import type { PublicClubFrame } from '../../club_core/services/public-site'

export const FACILITIES_RENTAL_LINKS = 'facilities.rentalLinks' as const
const DISPATCH = 'foundationDispatch'

export type RentalLinkRow = RentalLink & TokenLinkEntity<'single'>
export type RentalLinkService = TokenLinkService<RentalLinkRow>

/** Built once in `di.ts`. */
export function createRentalLinkService(): RentalLinkService {
  return createTokenLinkService<'single', RentalLinkRow>(RentalLink as never, {
    use: 'single',
    ttlMs: RENTAL_LINK_TTL_MS,
  })
}

export function rentalLinks(container: AwilixContainer): RentalLinkService {
  return container.resolve<RentalLinkService>(FACILITIES_RENTAL_LINKS)
}

function dispatchService(container: AwilixContainer): DispatchService {
  return container.resolve<DispatchService>(DISPATCH)
}

/**
 * Replaces the rental's cancellation link with a new one in `em`'s transaction and answers the raw token; null when
 * the rental has started or lies beyond the link's time to live (the e-mail then names the club's phone).
 */
async function reissueCancelLink(container: AwilixContainer, em: EntityManager, row: Rental): Promise<string | null> {
  const expiresAt = rentalLinkExpiry(row.startsAt, new Date())
  if (!expiresAt) return null
  const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  await em.nativeDelete(RentalLink, { ...scope, rentalId: row.id, purpose: 'cancel' })
  const issued = await rentalLinks(container).issue(em, { rentalId: row.id, purpose: 'cancel' }, scope, { expiresAt })
  return issued.rawToken
}

/** Thrown inside the e-mail transaction when the dispatch key is taken: rolls the new link back. */
class AlreadySent extends Error {}

type MailPlan = {
  template: string
  params: Record<string, unknown>
  idempotencyKey: string
  withLink: boolean
}

/** Enqueues one renter e-mail (with a fresh link when asked) and publishes it; false when it was sent before. */
async function sendRenterMail(
  container: AwilixContainer,
  scope: FacilitiesScope,
  row: Rental,
  locale: string,
  plan: MailPlan,
): Promise<boolean> {
  const email = row.contactEmail as string
  const em = container.resolve<EntityManager>('em').fork()
  let dispatchId: string
  try {
    dispatchId = await em.transactional(async (tx) => {
      const token = plan.withLink ? await reissueCancelLink(container, tx, row) : null
      const enqueued = await dispatchService(container).enqueue(
        tx,
        {
          template: plan.template,
          params: plan.params,
          addresses: [{ email, locale }],
          ...(token ? { secrets: new Map([[bareAddressKey(email), { token }]]) } : {}),
          source: { module: 'facilities', type: 'facilities:rental', id: row.id },
          idempotencyKey: plan.idempotencyKey,
          actor: { userId: null, actingRole: 'system' },
        },
        { ...scope, scope: [{ kind: 'system_job' }], em: tx },
      )
      if (!enqueued.created) throw new AlreadySent()
      return enqueued.dispatchId
    })
  } catch (error: unknown) {
    if (error instanceof AlreadySent) return false
    throw error
  }
  await dispatchService(container).publish(dispatchId, scope)
  return true
}

async function loadRental(container: AwilixContainer, scope: FacilitiesScope, rentalId: string) {
  const em = container.resolve<EntityManager>('em').fork()
  const row = await findOneWithDecryption(em, Rental, { id: rentalId, ...scope, deletedAt: null }, {}, scope)
  return { em, row }
}

/** The kinds of e-mail that state a booking's terms and carry the cancellation link. */
export type TermsMail = { kind: 'summary' } | { kind: 'approved' } | { kind: 'moved'; moveId: string }

const TERMS_TEMPLATES: Record<TermsMail['kind'], string> = {
  summary: 'facilities.rental_summary',
  approved: 'facilities.request_approved',
  moved: 'facilities.rental_moved',
}

/**
 * The summary of a staff entry, the approval of an online request or the "moved" e-mail, with a fresh cancellation
 * link. Nothing for a rental without an address, one that no longer holds its slot, an online request's summary (its
 * approval e-mail is the summary) or a staff entry's approval.
 */
export async function sendTermsMail(
  container: AwilixContainer,
  scope: FacilitiesScope,
  rentalId: string,
  mail: TermsMail,
): Promise<boolean> {
  const { em, row } = await loadRental(container, scope, rentalId)
  if (!row?.contactEmail || !rentalCancellable(row.status)) return false
  const online = row.requestedVia === 'online_form'
  if ((mail.kind === 'summary' && online) || (mail.kind === 'approved' && !online)) return false
  const settings = await clubRequestSettings(container, scope)
  const place = (await findPlaces(container, scope, [row.placeId], em)).get(row.placeId)
  const payee = await placePayee(container, scope, row.placeId, em)
  const params = {
    rentalId: row.id,
    placeName: place?.name ?? '—',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone: settings.timeZone,
    clubSlug: settings.publicSlug,
    amount: row.amount,
    currency: settings.currency,
    payeeName: payee?.bankAccount ? payee.name : null,
    bankAccount: payee?.bankAccount ?? settings.bankAccount,
    paymentDeadline: row.paymentDeadline?.toISOString() ?? null,
    cancellationDeadline: row.cancellationDeadline?.toISOString() ?? null,
    rulesUrl: settings.rulesUrl,
    clubPhone: settings.contactPhone,
  }
  const idempotencyKey =
    mail.kind === 'summary'
      ? rentalSummaryKey(row.id)
      : mail.kind === 'moved'
        ? rentalMovedKey(mail.moveId)
        : `facilities:rental:${row.id}:approved`
  return sendRenterMail(container, scope, row, requestLocale(row.contactLocale, settings.locale), {
    template: TERMS_TEMPLATES[mail.kind],
    params,
    idempotencyKey,
    withLink: settings.publicSlug !== null,
  })
}

/** The cancellation e-mail with its outcome, once per rental and cancelled status; nothing without an address. */
export async function sendCancelledMail(
  container: AwilixContainer,
  scope: FacilitiesScope,
  rentalId: string,
): Promise<boolean> {
  const { em, row } = await loadRental(container, scope, rentalId)
  if (!row?.contactEmail) return false
  const outcome = cancelledOutcome(row.status, row.decisionReason ?? null)
  if (!outcome) return false
  const settings = await clubRequestSettings(container, scope)
  const place = (await findPlaces(container, scope, [row.placeId], em)).get(row.placeId)
  return sendRenterMail(container, scope, row, requestLocale(row.contactLocale, settings.locale), {
    template: 'facilities.rental_cancelled',
    params: {
      rentalId: row.id,
      placeName: place?.name ?? '—',
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timeZone: settings.timeZone,
      clubSlug: settings.publicSlug,
      outcome,
      amount: row.amount,
      currency: settings.currency,
    },
    idempotencyKey: rentalCancelledKey(row.id, row.status),
    withLink: false,
  })
}

/** The rental a live cancellation link names, in the scope the link named; 410 for anything else. */
export async function rentalOfLink(
  container: AwilixContainer,
  em: EntityManager,
  token: unknown,
): Promise<{ row: Rental; scope: FacilitiesScope }> {
  // DD-35: the one system-scope lookup by the token's hash; everything after it uses the found club.
  const found = await rentalLinks(container).peek(em, token)
  if (!found || found.link.purpose !== 'cancel') return foundationErrors.throw('token_link_expired')
  const scope = { tenantId: found.tenantId, organizationId: found.organizationId }
  const row = await em.findOne(Rental, { id: found.link.rentalId, ...scope, deletedAt: null }, { refresh: true })
  if (!row || !rentalCancellable(row.status)) return foundationErrors.throw('token_link_expired')
  return { row, scope }
}

export type CancelPreview = {
  placeName: string
  startsAt: string
  endsAt: string
  timeZone: string
  amount: number
  currency: string
  /** True while cancelling is free; false when the payment is forfeited. */
  free: boolean
  cancellationDeadline: string
  payeeName: string | null
  club: PublicClubFrame['club'] | null
}

/** `POST …/cancel/preview`: what the page states before the button; spends nothing and holds no contact data. */
export async function cancelPreview(container: AwilixContainer, token: unknown): Promise<CancelPreview> {
  const em = container.resolve<EntityManager>('em').fork()
  const { row, scope } = await rentalOfLink(container, em, token)
  const settings = await clubRequestSettings(container, scope)
  const place = (await findPlaces(container, scope, [row.placeId], em)).get(row.placeId)
  const payee = await placePayee(container, scope, row.placeId, em)
  const deadline = row.cancellationDeadline ?? cancellationDeadline(row.startsAt)
  return {
    placeName: place?.name ?? '',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone: settings.timeZone,
    amount: row.amount,
    currency: settings.currency,
    free: cancelsFree(row.startsAt, row.cancellationDeadline ?? null, new Date()),
    cancellationDeadline: deadline.toISOString(),
    payeeName: payee?.name ?? null,
    club: await publicClub(container, scope),
  }
}
