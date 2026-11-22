// The `communication` data export contributor (person data export spec `.ai/specs/2026-11-21-vereino-person-data-export.md`,
// DD-X01, *Contributor inventory* → `communication`; phase X2, #527): `people` declares the contract
// (`people/services/data-export.ts`) and reads it with `hasRegistration`; `communication` registers it in `di.ts` under
// `people.dataExport.communication`. Read only, in the caller's EntityManager: every query filters by the subject's
// tenant and organization (and `deleted_at` where the table has one). The thread subject and the message body are
// decrypted with `findWithDecryption`; other authors' message bodies are never read — only counted per thread. The
// mapping (no other person's id, the counts, the review fields) is `lib/data-export.ts`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { PersonDataExportContributor, PersonDataExportSubject } from '../../people/services/data-export'
import { Thread, ThreadMessage, ThreadParticipant, ThreadRead } from '../data/entities'
import { communicationExportPart, subjectThreadIds } from '../lib/data-export'

/** The token `people` reads (`dataExportContributorToken('communication')` in `people/services/data-export.ts`). */
export const COMMUNICATION_DATA_EXPORT_CONTRIBUTOR = 'people.dataExport.communication'

type Scope = { tenantId: string; organizationId: string }

/** Per thread of `threadIds`: the rows of `table` matching `extra`, in the subject's tenant and organization. */
async function countsPerThread(
  em: EntityManager,
  table: 'communication_thread_participants' | 'communication_thread_messages',
  scope: Scope,
  threadIds: readonly string[],
  extra: { sql: string; params: unknown[] } = { sql: '', params: [] },
): Promise<Map<string, number>> {
  if (threadIds.length === 0) return new Map()
  const rows = await em.getConnection().execute<Array<{ thread_id: string; count: string | number }>>(
    `select thread_id, count(*) as count from ${table}
      where tenant_id = ? and organization_id = ? and thread_id in (${threadIds.map(() => '?').join(', ')})${extra.sql}
      group by thread_id`,
    [scope.tenantId, scope.organizationId, ...threadIds, ...extra.params],
  )
  return new Map(rows.map((row) => [row.thread_id, Number(row.count)]))
}

async function exportCommunication(em: EntityManager, subject: PersonDataExportSubject) {
  const scope: Scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
  const live = { ...scope, deletedAt: null }
  const personId = subject.personId
  const [participations, reads, messages, authored] = await Promise.all([
    em.find(ThreadParticipant, { ...scope, personId }, { orderBy: { createdAt: 'asc', id: 'asc' } }),
    em.find(ThreadRead, { ...live, personId }, { orderBy: { createdAt: 'asc', id: 'asc' } }),
    findWithDecryption(
      em,
      ThreadMessage,
      { ...scope, authorPersonId: personId },
      { orderBy: { createdAt: 'asc', id: 'asc' } },
      scope,
    ),
    em.find(Thread, { ...live, authorPersonId: personId }, { fields: ['id'] }),
  ])
  const threadIds = subjectThreadIds(
    participations,
    authored.map((row) => row.id),
    messages.map((row) => row.threadId),
  )
  const threads =
    threadIds.length > 0
      ? await findWithDecryption(
          em,
          Thread,
          { ...live, id: { $in: threadIds } },
          { orderBy: { createdAt: 'asc', id: 'asc' } },
          scope,
        )
      : []
  const liveIds = threads.map((row) => row.id)
  const [participantCounts, otherAuthorMessages] = await Promise.all([
    countsPerThread(em, 'communication_thread_participants', scope, liveIds),
    countsPerThread(em, 'communication_thread_messages', scope, liveIds, {
      sql: ' and (author_person_id is null or author_person_id <> ?)',
      params: [personId],
    }),
  ])
  return communicationExportPart({
    personId,
    threads,
    participations,
    reads,
    messages,
    participantCounts,
    otherAuthorMessages,
  })
}

export const dataExportContribution: PersonDataExportContributor = {
  export: exportCommunication,
}
