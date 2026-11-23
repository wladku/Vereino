// Payments order-campaign records of the cross-club isolation guard (#628): an order campaign of the academy for Żaki
// that collects orders (one product without sizes), the guardian's order for the child with its `order` charge, and
// the guardian's personal order link (requested on the club's public page and read out of the captured e-mail). The
// club's public slug comes from the club_core seed (`refs.clubSlug`); a run without it publishes the club page here.
import { expect } from '@playwright/test'
import { uniqueSuffix } from '../club'
import { emailsTo } from '../communication'
import { publicCall } from '../declaration-links'
import { getSettings, publish } from '../publication'
import type { ModuleSeed } from './seed'

export const seedPaymentsOrders: ModuleSeed = async ({ request, seeded, api, admin }) => {
  const { refs } = seeded

  // The club's public page: the share link and the link request need its slug.
  if (!refs.clubSlug) {
    const settings = await getSettings(request, admin)
    if (settings.publication.enabled && settings.publicSlug) {
      refs.clubSlug = settings.publicSlug
    } else {
      refs.clubSlug = `it628-orders-${seeded.label.toLowerCase()}${uniqueSuffix()}`.toLowerCase()
      seeded.responses.push(await publish(request, admin, refs.clubSlug, []))
    }
    seeded.markers.push(refs.clubSlug)
  }

  // The campaign, open for orders until next week.
  const created = await api<{ id: string }>('POST', '/api/payments/order-campaigns', {
    data: {
      name: 'Stroje akademii',
      description: 'Zamawiamy getry.',
      sectionId: refs.section,
      groupIds: [refs.group],
      closesOn: refs.nextWeek,
      paymentDueOn: refs.nextWeek,
      open: true,
      products: [{ key: 'socks', name: 'Getry', priceChild: 1500 }],
    },
    status: 201,
  })
  refs.orderCampaign = String(created.body?.id)

  // The guardian orders the socks for the child (the guardian is the child's primary payer).
  const guardian = await api<{ email?: string | null }>('GET', `/api/people/persons/${refs.guardianPerson}`)
  refs.guardianEmail = String(guardian.body?.email)
  const form = await api<{ products: { id: string }[] }>('GET', `/api/payments/order-campaigns/${refs.orderCampaign}`)
  refs.orderProduct = String(form.body?.products?.[0]?.id)
  const order = await api<{ orderId: string; chargeId: string; updatedAt: string }>('POST', '/api/payments/orders', {
    token: seeded.tokens.guardian,
    data: {
      campaignId: refs.orderCampaign,
      participantPersonId: refs.childPerson,
      setSelected: false,
      choices: { [refs.orderProduct]: 'yes' },
      contactEmail: refs.guardianEmail,
      contactPhone: '600 100 200',
    },
    status: 201,
  })
  refs.order = String(order.body?.orderId)
  refs.orderCharge = String(order.body?.chargeId)

  // The campaign's lock token, read after the order.
  const detail = await api<{ updatedAt: string }>('GET', `/api/payments/order-campaigns/${refs.orderCampaign}`)
  refs.orderCampaignUpdatedAt = String(detail.body?.updatedAt)

  // The guardian's personal order link, out of the captured e-mail.
  const linkOf = () =>
    emailsTo(refs.guardianEmail, '')
      .flatMap((message) => message.links)
      .find((link) => link.includes('/club/o/'))
  const asked = await publicCall('POST', `/api/payments/public/order-campaigns/${refs.orderCampaign}/link-request`, {
    email: refs.guardianEmail,
    clubSlug: refs.clubSlug,
  })
  expect(asked.status, `club ${seeded.label}: link request ${asked.text}`).toBe(202)
  await expect
    .poll(() => linkOf() ?? null, { timeout: 60_000, message: `club ${seeded.label}: the order link e-mail` })
    .not.toBeNull()
  refs.orderLinkToken = decodeURIComponent(new URL(String(linkOf())).pathname.split('/').pop() ?? '')
}
