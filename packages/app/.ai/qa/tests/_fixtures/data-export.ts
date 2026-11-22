// The person data export (person data export spec, #527) for the TEST-X tests: the download route, the export log
// rows and the role-ACL edits the security cases need.
import type { APIRequestContext } from '@playwright/test'
import { expect } from '@playwright/test'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { call, type Club } from './club'

export type ExportSection = {
  module: string
  table: string
  activity: string
  portable: boolean
  rows: Record<string, unknown>[]
  omittedOtherAuthors?: number
  reviewFields?: string[]
}

export type ExportDocument = {
  format: string
  version: number
  generatedAt: string
  subject: Record<string, unknown>
  sections: ExportSection[]
  actorCounts: { module: string; table: string; count: number }[]
  reviewRequired: { module: string; table: string; recordId: string; field: string }[]
  omitted: { module?: string; category?: string; reason: string }[]
}

export async function exportPerson(request: APIRequestContext, token: string, personId: string) {
  return call<ExportDocument & { code?: string }>(request, 'GET', `/api/people/persons/${personId}/data-export`, token)
}

/** The document of a 200 export (fails the test otherwise). */
export function documentOf(result: {
  status: number
  body: (ExportDocument & { code?: string }) | null
}): ExportDocument {
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  if (!result.body) throw new Error('[test] the export returned no document')
  return result.body
}

/** The section of one table (fails the test when it is missing). */
export function section(document: ExportDocument, table: string): ExportSection {
  const found = document.sections.find((entry) => entry.table === table)
  expect(found, `section ${table} in ${document.sections.map((entry) => entry.table).join(', ')}`).toBeTruthy()
  return found as ExportSection
}

/** Every key anywhere in the value (to assert no `*_hash` / `*Hash` key leaves). */
export function allKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const item of value) allKeys(item, into)
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      into.add(key)
      allKeys(item, into)
    }
  }
  return into
}

export type ExportLogRow = { actor_user_id: string; acting_role: string; resource_kind: string; purpose: string }

/** The `people_data_export_log` rows naming the person. */
export async function exportLogRows(personId: string): Promise<ExportLogRow[]> {
  return withClient(async (client) => {
    const result = await client.query<ExportLogRow>(
      `select actor_user_id, acting_role, resource_kind, purpose from people_data_export_log
        where $1 = any(resource_ids) order by created_at`,
      [personId],
    )
    return result.rows
  })
}

/** The id of a `vereino_*` role of the club's tenant. */
export async function roleIdOf(club: Club, name: string): Promise<string> {
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>(
      'select id from roles where tenant_id = $1 and name = $2 and deleted_at is null',
      [club.tenant.tenantId, name],
    )
    expect(result.rows[0]?.id, `role ${name}`).toBeTruthy()
    return result.rows[0].id
  })
}

/** Rewrites a role's features in the club's tenant from its current list (as superadmin). */
export async function editRoleFeatures(
  request: APIRequestContext,
  club: Club,
  name: string,
  edit: (features: string[]) => string[],
): Promise<void> {
  const roleId = await roleIdOf(club, name)
  const current = await call<{ features?: string[] }>(
    request,
    'GET',
    `/api/auth/roles/acl?roleId=${roleId}&tenantId=${club.tenant.tenantId}`,
    club.superToken,
  )
  expect(current.status, JSON.stringify(current.body)).toBe(200)
  await setRoleAclFeatures(request, club.superToken, { roleId, features: edit(current.body?.features ?? []) })
}
