// Self-contained tenant fixture for Vereino integration tests (engineering standards S13.3, S13.9):
// every test creates its own tenant, organization, role and user through the API and removes them
// in `finally`, so no test relies on seed or demo data.
import type { APIRequestContext } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createOrganizationFixture,
  createRoleFixture,
  createUserFixture,
  deleteOrganizationIfExists,
  deleteRoleIfExists,
  deleteUserIfExists,
} from '@open-mercato/core/helpers/integration/authFixtures'
import { expectId, readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'

export type IsolatedTenant = {
  tenantId: string
  organizationId: string
  roleId: string
  userId: string
  email: string
  password: string
  cleanup: () => Promise<void>
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function createTenant(request: APIRequestContext, token: string, name: string): Promise<string> {
  const response = await apiRequest(request, 'POST', '/api/directory/tenants', { token, data: { name } })
  const body = await readJsonSafe<{ id?: string }>(response)
  if (response.status() !== 201)
    throw new Error(`[internal] POST /api/directory/tenants returned ${String(response.status())}`)
  return expectId(body?.id, 'Tenant creation response should include id')
}

async function deleteTenantIfExists(request: APIRequestContext, token: string, tenantId: string | null): Promise<void> {
  if (!tenantId) return
  await apiRequest(request, 'DELETE', '/api/directory/tenants', { token, data: { id: tenantId } }).catch(
    () => undefined,
  )
}

// Creates a tenant with one organization and one user. Uses the superadmin account that the
// ephemeral integration runner seeds; the created user's own credentials are returned for the test.
export async function createIsolatedTenant(request: APIRequestContext, label: string): Promise<IsolatedTenant> {
  const superadminToken = await getAuthToken(request, 'superadmin')
  const suffix = uniqueSuffix()
  const password = `Vereino-${suffix}-Aa1!`
  const email = `${label}-${suffix}@example.org`
  let tenantId: string | null = null
  let organizationId: string | null = null
  let roleId: string | null = null
  let userId: string | null = null

  const cleanup = async (): Promise<void> => {
    await deleteUserIfExists(request, superadminToken, userId)
    await deleteRoleIfExists(request, superadminToken, roleId)
    await deleteOrganizationIfExists(request, superadminToken, organizationId)
    await deleteTenantIfExists(request, superadminToken, tenantId)
  }

  try {
    tenantId = await createTenant(request, superadminToken, `Vereino IT ${label} ${suffix}`)
    organizationId = await createOrganizationFixture(request, superadminToken, {
      name: `Vereino IT club ${suffix}`,
      tenantId,
    })
    roleId = await createRoleFixture(request, superadminToken, { name: `vereino-it-${suffix}`, tenantId })
    userId = await createUserFixture(request, superadminToken, {
      email,
      password,
      organizationId,
      roles: [roleId],
    })
  } catch (error) {
    await cleanup()
    throw error
  }

  return { tenantId, organizationId, roleId, userId, email, password, cleanup }
}
