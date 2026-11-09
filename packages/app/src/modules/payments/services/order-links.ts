// Personal order links (payments spec REQ-032, DD-30, `payments_order_links`; foundation P-10, DD-35, D-024; issue
// #116, M-17 without a session, M-19). A guardian without an account (or not signed in) opens the campaign page from
// the share text (`/club/orders/{id}?club=<slug>`), sees its card and asks for a link by e-mail; the link goes only to
// an address of an active guardian of a child in the campaign's groups, through the foundation `dispatch`, with the raw
// token only in the delivery's encrypted secret. `/club/o/[token]` reads the form with `TokenLinkService.peek` — the
// single DD-35 lookup of `payments_order_links.token_hash`, narrowed at once to the link's tenant and organization —
// and orders through the `payments.orders.*` commands with the `{ token }` scope source.
//
// The request never tells whether an address is known: the route answers 202 for every well-formed request, and the
// club comes from `club_core`'s public slug lookup (D-024). Nothing here logs an address or a token.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { Recipient } from '@vereino/core'
import {
  contactResolver,
  resolveScopeForPerson,
  type DispatchService,
  type TokenLinkService,
} from '@/modules/foundation'
import type { ClubCorePublicSite } from '../../club_core/services/public-site'
import { paymentsErrors } from '../api/errors'
import { OrderCampaign, OrderLink } from '../data/entities'
import type { OrderLinkParams } from '../emails/templates'
import type { CampaignStatus } from '../lib/order-campaigns'
import { MAX_ORDER_LINKS_PER_HOUR, orderLinkExpiry, ordersOpen, personIdsWithEmail } from '../lib/orders'
import { activeGuardians, clubClock, type PaymentsScope } from './directory'
import { campaignParticipants } from './order-campaigns'
import { orderFormView, type OrderFormView } from './orders'

/** DI token of the `payments_order_links` link service (`di.ts`). */
export const PAYMENTS_ORDER_LINKS = 'payments.orderLinks'

const CLUB_CORE_PUBLIC_SITE = 'clubCorePublicSite'
const DISPATCH = 'foundationDispatch'

export type OrderLinkService = TokenLinkService<OrderLink>

export function orderLinkService(container: AwilixContainer): OrderLinkService {
  return container.resolve<OrderLinkService>(PAYMENTS_ORDER_LINKS)
}

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** The club of a public slug (D-024), or null when unknown or its public pages are off. */
async function clubOfSlug(
  container: AwilixContainer,
  clubSlug: string,
): Promise<{ scope: PaymentsScope; name: string } | null> {
  if (!container.hasRegistration(CLUB_CORE_PUBLIC_SITE)) return null
  const frame = await container.resolve<ClubCorePublicSite>(CLUB_CORE_PUBLIC_SITE).clubFrame(clubSlug)
  if (frame.status !== 'ok') return null
  return {
    scope: { tenantId: frame.value.tenantId, organizationId: frame.value.organizationId },
    name: frame.value.club.name,
  }
}

/** A campaign a guardian may see: live, past its draft. */
function visibleCampaign(em: EntityManager, scope: PaymentsScope, id: string): Promise<OrderCampaign | null> {
  return em.findOne(OrderCampaign, { id, ...scope, deletedAt: null, status: { $ne: 'draft' } })
}

export type PublicCampaignCard = {
  club: { name: string }
  campaign: {
    id: string
    name: string
    description: string | null
    closesOn: string
    status: CampaignStatus
    ordersOpen: boolean
  }
}

/** The campaign card of M-17 without a session; null for an unknown club or campaign, or a draft. */
export async function publicCampaignCard(
  container: AwilixContainer,
  clubSlug: string,
  campaignId: string,
): Promise<PublicCampaignCard | null> {
  const club = await clubOfSlug(container, clubSlug)
  if (!club) return null
  const campaign = await visibleCampaign(freshEm(container), club.scope, campaignId)
  if (!campaign) return null
  const { today } = await clubClock(container, club.scope)
  const closesOn = calendarDate(campaign.closesOn)
  return {
    club: { name: club.name },
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description ?? null,
      closesOn,
      status: campaign.status,
      ordersOpen: ordersOpen({ status: campaign.status, closesOn }, today),
    },
  }
}

/** Raised inside the issuing transaction when nothing may be sent: the new token is rolled back. */
class NotSent extends Error {}

/**
 * Sends a personal link to every active guardian of a child in the campaign's groups whose address is `email`, while
 * the campaign takes orders. An unknown club or campaign, a closed campaign and an unknown address send nothing; at
 * most three links per guardian and campaign an hour. Returns how many links were sent, for the route's log only —
 * never for the response.
 */
export async function requestOrderLink(
  container: AwilixContainer,
  request: { email: string; clubSlug: string; campaignId: string },
  now: Date = new Date(),
): Promise<number> {
  const club = await clubOfSlug(container, request.clubSlug)
  if (!club) return 0
  const { scope } = club
  const em = freshEm(container)
  const campaign = await visibleCampaign(em, scope, request.campaignId)
  if (!campaign) return 0
  const { today, timeZone } = await clubClock(container, scope, now)
  const closesOn = calendarDate(campaign.closesOn)
  if (!ordersOpen({ status: campaign.status, closesOn }, today)) return 0
  const expiresAt = orderLinkExpiry(now, closesOn, timeZone)
  if (!expiresAt) return 0
  const participants = await campaignParticipants(container, scope, campaign.groupIds, today, em)
  if (participants.size === 0) return 0
  const guardians = await activeGuardians(container, scope, [...participants.keys()], today, em)
  const guardianIds = [...new Set([...guardians.values()].flat())]
  if (guardianIds.length === 0) return 0
  const contacts = await contactResolver(container).contacts(guardianIds, { container, ...scope, scope: [], em })
  const matched = personIdsWithEmail(contacts, request.email)
  const dispatch = container.resolve<DispatchService>(DISPATCH)
  let sent = 0
  for (const personId of matched) {
    const contact = contacts.find((entry) => entry.personId === personId)
    if (!contact?.email) continue
    let dispatchId: string
    try {
      dispatchId = await em.fork().transactional(async (tx) => {
        const recent = await tx.count(OrderLink, {
          ...scope,
          guardianPersonId: personId,
          campaignId: campaign.id,
          createdAt: { $gt: new Date(now.getTime() - 60 * 60 * 1000) },
        })
        if (recent >= MAX_ORDER_LINKS_PER_HOUR) throw new NotSent()
        const { rawToken, link } = await orderLinkService(container).issue(
          tx,
          { campaignId: campaign.id, guardianPersonId: personId },
          scope,
          { expiresAt },
        )
        const recipient: Recipient = {
          personId,
          userId: null,
          email: contact.email,
          locale: contact.locale,
          reasons: ['guardian'],
          channels: ['email'],
        }
        const params: OrderLinkParams = { campaignName: campaign.name, closesOn }
        const enqueued = await dispatch.enqueue(
          tx,
          {
            template: 'payments.order_link',
            params,
            recipients: [recipient],
            source: { module: 'payments', type: 'payments:order_link', id: link.id },
            idempotencyKey: `payments:order-link:${randomUUID()}`,
            secrets: new Map([[personId, { token: rawToken }]]),
            actor: { userId: null, actingRole: 'system' },
          },
          { ...scope, scope: [], em: tx },
        )
        if (!enqueued.created) throw new NotSent()
        return enqueued.dispatchId
      })
    } catch (error: unknown) {
      if (error instanceof NotSent) continue
      throw error
    }
    await dispatch.publish(dispatchId, scope)
    sent += 1
  }
  return sent
}

/** The persons a link's guardian may order for today: their wards (and themself), by their current grants. */
export async function linkPersonIds(container: AwilixContainer, link: OrderLink): Promise<string[]> {
  const grants = await resolveScopeForPerson(
    { container },
    { personId: link.guardianPersonId, tenantId: link.tenantId, organizationId: link.organizationId },
  )
  return [
    ...new Set(
      grants.filter((grant) => grant.kind === 'self' || grant.kind === 'guardian').flatMap((grant) => grant.ids ?? []),
    ),
  ]
}

export type OrderLinkPage = OrderFormView & { club: { name: string }; expiresAt: string }

/**
 * M-19: the order form of a personal link; null for an unknown, malformed or deleted token or a campaign that no
 * longer exists (404). The foundation's 410 `token_link_expired` for an expired link and 410
 * `order_campaign_completed` for a completed campaign. Spends nothing (a mail scanner opening it is harmless).
 */
export async function readOrderLink(container: AwilixContainer, rawToken: string): Promise<OrderLinkPage | null> {
  const em = freshEm(container)
  const view = await orderLinkService(container).peek(em, rawToken)
  if (!view) return null
  const scope: PaymentsScope = { tenantId: view.tenantId, organizationId: view.organizationId }
  const campaign = await visibleCampaign(em, scope, view.link.campaignId)
  if (!campaign) return null
  if (campaign.status === 'completed') await paymentsErrors.throw('order_campaign_completed')
  const personIds = await linkPersonIds(container, view.link)
  const [form, club] = await Promise.all([
    orderFormView(container, scope, campaign, view.link.guardianPersonId, personIds),
    contactResolver(container).club({ container, ...scope, scope: [], em }),
  ])
  return { ...form, club: { name: club.name }, expiresAt: view.link.expiresAt.toISOString() }
}
