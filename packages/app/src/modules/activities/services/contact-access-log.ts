// The operator reads of `activities_contact_access_log` (REQ-037, DD-39; foundation II P-28; #34): the newest reads of
// guardian contacts for a club's data-protection request, and the deployment self-check of the `append_only` guard on
// the newest row — a change and a delete inside a transaction that is always rolled back. Used by `cli.ts`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { ContactAccessLog } from '../data/entities'
import type { ActivitiesScope } from './directory'

export type ContactAccessLogEntry = Pick<
  ContactAccessLog,
  'id' | 'createdAt' | 'actorUserId' | 'actingRole' | 'occurrenceId' | 'resourceKind' | 'resourceIds' | 'purpose'
>

/** The newest 100 rows of the organization (of one session when `occurrenceId` is given), newest first. */
export async function listContactAccessLog(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrenceId?: string,
): Promise<ContactAccessLogEntry[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await em.find(
    ContactAccessLog,
    { ...scope, ...(occurrenceId ? { occurrenceId } : {}) },
    { orderBy: { createdAt: 'desc', id: 'desc' }, limit: 100 },
  )
  return rows.map(
    ({ id, createdAt, actorUserId, actingRole, occurrenceId: occurrence, resourceKind, resourceIds, purpose }) => ({
      id,
      createdAt,
      actorUserId,
      actingRole,
      occurrenceId: occurrence,
      resourceKind,
      resourceIds,
      purpose,
    }),
  )
}

export type AppendOnlyCheck = { rowId: string | null; update: string | null; delete: string | null }

/** The coded error of a refused write, or null when it went through. */
async function refusalCode(write: () => Promise<void>): Promise<string | null> {
  try {
    await write()
    return null
  } catch (error: unknown) {
    const body = (error as { body?: { code?: unknown } }).body
    return typeof body?.code === 'string' ? body.code : 'uncoded'
  }
}

class RollbackProbe extends Error {}

/** Tries to change and to delete the newest row in a rolled-back transaction; `append_only` twice when guarded. */
export async function checkAppendOnly(container: AwilixContainer, scope: ActivitiesScope): Promise<AppendOnlyCheck> {
  const em = container.resolve<EntityManager>('em').fork()
  const newest = await em.findOne(ContactAccessLog, scope, { orderBy: { createdAt: 'desc', id: 'desc' } })
  const result: AppendOnlyCheck = { rowId: newest?.id ?? null, update: null, delete: null }
  if (!newest) return result
  try {
    await em.transactional(async (tx) => {
      const row = await tx.findOneOrFail(ContactAccessLog, { id: newest.id, ...scope })
      result.update = await refusalCode(async () => {
        row.purpose = `${row.purpose}-probe`
        await tx.flush()
      })
      tx.clear()
      const again = await tx.findOneOrFail(ContactAccessLog, { id: newest.id, ...scope })
      result.delete = await refusalCode(async () => {
        tx.remove(again)
        await tx.flush()
      })
      throw new RollbackProbe()
    })
  } catch (error: unknown) {
    if (!(error instanceof RollbackProbe)) throw error
  }
  return result
}
