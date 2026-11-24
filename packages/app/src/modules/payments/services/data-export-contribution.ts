// The `payments` data export contributor (person data export spec `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md`,
// DD-X01, *Contributor inventory* → `payments`; phase X2, #527): `people` declares the contract
// (`people/services/data-export.ts`) and reads it with `hasRegistration`; `payments` registers it in `di.ts` under
// `people.dataExport.payments`. Read only, in the caller's EntityManager: every query filters by the subject's tenant
// and organization and `deleted_at`, the lookups by the subject's user id too. Encrypted columns are read with
// `findWithDecryption`; the other persons' names come through `people.personDirectory` (`services/directory.ts`), never
// through `people` entities. The mapping (no other person's id, the payer view of a payment, the review fields) is
// `lib/data-export.ts`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { PersonDataExportContributor, PersonDataExportSubject } from '../../people/services/data-export'
import {
  BankImport,
  BankTransaction,
  CashHandover,
  Charge,
  Checkout,
  Order,
  OrderCampaign,
  OrderLine,
  OrderLink,
  OrderProduct,
  PayerRef,
  Payment,
} from '../data/entities'
import { otherPersonIds, paymentsExportPart } from '../lib/data-export'
import { findPersons } from './directory'

/** The token `people` reads (`dataExportContributorToken('payments')` in `people/services/data-export.ts`). */
export const PAYMENTS_DATA_EXPORT_CONTRIBUTOR = 'people.dataExport.payments'

type Scope = { tenantId: string; organizationId: string }

/** `{ person: id }` or `{ person: id } | { user: userId }`: an actor matched by person and, when known, by user. */
function actorFilter(personKey: string, userKey: string | null, subject: PersonDataExportSubject) {
  const byPerson = { [personKey]: subject.personId }
  return userKey && subject.userId ? { $or: [byPerson, { [userKey]: subject.userId }] } : byPerson
}

/** The live campaigns and products among `ids`, by id: their names. */
async function namesById(
  em: EntityManager,
  entity: 'campaign' | 'product',
  scope: Scope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const where = { ...scope, deletedAt: null, id: { $in: unique } }
  const rows =
    entity === 'campaign'
      ? await em.find(OrderCampaign, where, { fields: ['id', 'name'] })
      : await em.find(OrderProduct, where, { fields: ['id', 'name'] })
  return new Map(rows.map((row) => [row.id, row.name]))
}

async function actorCounts(em: EntityManager, scope: Scope, subject: PersonDataExportSubject) {
  const live = { ...scope, deletedAt: null }
  const [payments, cashHandovers, orderCampaigns, bankImports, bankTransactions, orders] = await Promise.all([
    em.count(Payment, {
      ...live,
      $or: [
        { recordedByPersonId: subject.personId },
        { collectedByPersonId: subject.personId },
        ...(subject.userId ? [{ recordedByUserId: subject.userId }] : []),
      ],
    }),
    em.count(CashHandover, {
      ...live,
      $or: [
        { collectorPersonId: subject.personId },
        { receivedByPersonId: subject.personId },
        ...(subject.userId ? [{ receivedByUserId: subject.userId }] : []),
      ],
    }),
    em.count(OrderCampaign, { ...live, createdByPersonId: subject.personId }),
    em.count(BankImport, { ...live, ...actorFilter('importedByPersonId', 'importedByUserId', subject) }),
    em.count(BankTransaction, { ...live, ...actorFilter('decidedByPersonId', 'decidedByUserId', subject) }),
    em.count(Order, { ...live, handedOverByPersonId: subject.personId }),
  ])
  return { payments, cashHandovers, orderCampaigns, bankImports, bankTransactions, orders }
}

async function exportPayments(container: AwilixContainer, em: EntityManager, subject: PersonDataExportSubject) {
  const scope: Scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
  const live = { ...scope, deletedAt: null }
  const personId = subject.personId
  const [charges, checkouts, payerRefs, orders, bankTransactions, orderLinks, counts] = await Promise.all([
    findWithDecryption(
      em,
      Charge,
      { ...live, $or: [{ personId }, { payerPersonId: personId }] },
      { orderBy: { dueDate: 'asc', createdAt: 'asc' } },
      scope,
    ),
    em.find(Checkout, { ...live, payerPersonId: personId }, { orderBy: { createdAt: 'asc' } }),
    em.find(PayerRef, { ...live, personId }, { orderBy: { createdAt: 'asc' } }),
    findWithDecryption(
      em,
      Order,
      { ...live, $or: [{ participantPersonId: personId }, { orderedByPersonId: personId }] },
      { orderBy: { createdAt: 'asc' } },
      scope,
    ),
    findWithDecryption(
      em,
      BankTransaction,
      { ...live, payerPersonId: personId },
      { orderBy: { bookedOn: 'asc', line: 'asc' } },
      scope,
    ),
    em.find(
      OrderLink,
      { ...live, guardianPersonId: personId },
      { fields: ['id', 'campaignId', 'expiresAt', 'lastUsedAt', 'createdAt'], orderBy: { createdAt: 'asc' } },
    ),
    actorCounts(em, scope, subject),
  ])
  const chargeIds = charges.map((row) => row.id)
  const orderIds = orders.map((row) => row.id)
  const [payments, orderLines] = await Promise.all([
    chargeIds.length > 0
      ? findWithDecryption(
          em,
          Payment,
          { ...live, chargeId: { $in: chargeIds } },
          { orderBy: { paidOn: 'asc', createdAt: 'asc' } },
          scope,
        )
      : Promise.resolve([] as Payment[]),
    orderIds.length > 0
      ? em.find(OrderLine, { ...live, orderId: { $in: orderIds } }, { orderBy: { orderId: 'asc', id: 'asc' } })
      : Promise.resolve([] as OrderLine[]),
  ])
  const [persons, campaignNames, productNames] = await Promise.all([
    findPersons(container, scope, otherPersonIds(personId, charges, orders), em),
    namesById(em, 'campaign', scope, [
      ...orders.map((row) => row.campaignId),
      ...orderLinks.map((row) => row.campaignId),
    ]),
    namesById(
      em,
      'product',
      scope,
      orderLines.map((row) => row.productId),
    ),
  ])
  const names = new Map(
    [...persons.values()].map((entry) => [entry.id, `${entry.firstName} ${entry.lastName}`.trim()] as const),
  )
  return paymentsExportPart({
    subjectId: personId,
    charges,
    payments,
    checkouts,
    payerRefs,
    orders,
    orderLines,
    bankTransactions,
    orderLinks,
    names,
    campaignNames,
    productNames,
    actorCounts: counts,
  })
}

/** The contributor, bound to the container whose `people.personDirectory` names the other persons. */
export function createDataExportContribution(container: AwilixContainer): PersonDataExportContributor {
  return { export: (em, subject) => exportPayments(container, em, subject) }
}
