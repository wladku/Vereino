// The contract a signed-PDF read names (people life-cycle spec REQ-L12; #312): a live contract of the trusted
// organization with its attachment pointer, for `GET /api/club_core/contracts/{id}/attachment`. The route checks the
// caller's scope on it and reads the file through `attachmentService.readScoped`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Contract } from '../data/entities'

export type ContractFileRef = { id: string; tenantId: string; organizationId: string; attachmentId: string | null }

export async function findContractFileRef(
  container: AwilixContainer,
  scope: { tenantId: string; organizationId: string },
  id: string,
): Promise<ContractFileRef | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const row = await em.findOne(
    Contract,
    { id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
    { fields: ['id', 'tenantId', 'organizationId', 'attachmentId'] },
  )
  return row
    ? { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId, attachmentId: row.attachmentId ?? null }
    : null
}
