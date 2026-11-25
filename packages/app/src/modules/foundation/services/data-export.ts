// The foundation's part of the person data export (person data export spec *Contributor inventory* → `foundation`,
// DD-X01; #527): `people` calls this public helper, so `foundation` never imports `people`. The person's deliveries
// (channel, template, reasons, status and dates — never the address, its hash or the secret params) and the number of
// dispatches the person's account sent as staff, in the person's organization only.
import type { EntityManager } from '@mikro-orm/postgresql'
import { Delivery, Dispatch } from '../data/entities'

export type PersonDeliveryExportRow = {
  id: string
  channel: string
  templateId: string | null
  reasons: string[]
  status: string
  skipReason: string | null
  failureCode: string | null
  sentAt: string | null
  failedAt: string | null
  createdAt: string | null
}

export type PersonDeliveriesExport = { deliveries: PersonDeliveryExportRow[]; dispatchesSent: number }

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

export async function personDeliveriesForExport(
  em: EntityManager,
  subject: { tenantId: string; organizationId: string; personId: string; userId: string | null },
): Promise<PersonDeliveriesExport> {
  const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
  const deliveries = await em.find(
    Delivery,
    { ...scope, deletedAt: null, personId: subject.personId },
    {
      fields: [
        'id',
        'dispatchId',
        'channel',
        'reasons',
        'status',
        'skipReason',
        'failureCode',
        'sentAt',
        'failedAt',
        'createdAt',
      ],
      orderBy: { createdAt: 'asc' },
    },
  )
  const dispatchIds = [...new Set(deliveries.map((row) => row.dispatchId))]
  const dispatches =
    dispatchIds.length > 0
      ? await em.find(Dispatch, { ...scope, id: { $in: dispatchIds } }, { fields: ['id', 'templateId'] })
      : []
  const templates = new Map(dispatches.map((row) => [row.id, row.templateId]))
  const dispatchesSent = subject.userId
    ? await em.count(Dispatch, { ...scope, deletedAt: null, actorUserId: subject.userId })
    : 0
  return {
    deliveries: deliveries.map((row) => ({
      id: row.id,
      channel: row.channel,
      templateId: templates.get(row.dispatchId) ?? null,
      reasons: [...(row.reasons ?? [])],
      status: row.status,
      skipReason: row.skipReason ?? null,
      failureCode: row.failureCode ?? null,
      sentAt: iso(row.sentAt),
      failedAt: iso(row.failedAt),
      createdAt: iso(row.createdAt),
    })),
    dispatchesSent,
  }
}
