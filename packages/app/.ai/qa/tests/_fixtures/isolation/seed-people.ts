// People records of the cross-club isolation guard (#628): an import with its rows, the coach's role assignment, a
// departure request the administrator records for the person without an account, and the member's own request.
import { expect } from '@playwright/test'
import { csvFile, importRows, previewImport } from '../imports'
import type { ModuleSeed } from './seed'

export const seedPeople: ModuleSeed = async ({ request, seeded, api, admin }) => {
  const { refs } = seeded
  const preview = await previewImport(request, admin, csvFile())
  seeded.responses.push(preview)
  refs.import = preview.id
  const rows = await importRows(request, admin, preview.id)
  seeded.responses.push(rows)
  expect(rows.length, 'the import has rows').toBeGreaterThan(0)
  refs.importRow = rows[0].id
  refs.importRowUpdatedAt = rows[0].updatedAt
  const assignments = await api<{ items?: { id: string }[] }>(
    'GET',
    `/api/people/role-assignments?personId=${refs.coachPerson}`,
  )
  refs.coachAssignment = String(assignments.body?.items?.[0]?.id)
  const recorded = await api<{ id?: string; ids?: string[]; requestIds?: string[] }>(
    'POST',
    '/api/people/departure-requests',
    { data: { subjectPersonId: refs.plainPerson, requesterKind: 'club', lastDay: refs.nextWeek } },
  )
  refs.departureRequest = String(recorded.body?.id ?? recorded.body?.requestIds?.[0] ?? recorded.body?.ids?.[0])
  const own = await api<{ batchId?: string }>('POST', '/api/people/me/departure-requests', {
    token: seeded.tokens.member,
    data: { subjectPersonIds: [refs.memberPerson], lastDay: refs.nextWeek },
  })
  refs.departureBatch = String(own.body?.batchId)
}
