// `training library-init` (training outlines spec DD-O10, DD-O10a; E24-S05, #685): creates the instance's one library
// tenant — a `directory` tenant "Vereino library" with one organization and its own data-encryption key — and nothing
// else: no roles, no users, no club settings row, no club job state. Every club loop of Vereino iterates clubs by
// their settings row or job state, so it never meets this tenant. Idempotent: with `VEREINO_LIBRARY_TENANT_ID` and
// `VEREINO_LIBRARY_ORGANIZATION_ID` configured it creates the tenant and organization under exactly those ids (or
// reports that they exist); without them it creates new ids for the operator to put into the configuration.
import type { EntityManager } from '@mikro-orm/postgresql'
import { Organization, Tenant } from '@open-mercato/core/modules/directory/data/entities'
import { rebuildHierarchyForTenant } from '@open-mercato/core/modules/directory/lib/hierarchy'
import { createKmsService } from '@open-mercato/shared/lib/encryption/kms'
import { isTenantDataEncryptionEnabled } from '@open-mercato/shared/lib/encryption/toggles'
import type { AwilixContainer } from 'awilix'
import { configuredLibraryIds } from '../lib/library'

export const LIBRARY_TENANT_NAME = 'Vereino library'

export type LibraryInitResult = {
  status: 'created' | 'exists'
  tenantId: string
  organizationId: string
  /** Whether the ids came from the configuration; otherwise the operator puts them there. */
  configured: boolean
}

export async function initLibraryTenant(
  container: AwilixContainer,
  env: Record<string, string | undefined> = process.env,
): Promise<LibraryInitResult> {
  const em = container.resolve<EntityManager>('em').fork()
  const ids = configuredLibraryIds(env)
  const configured = Boolean(ids.tenantId && ids.organizationId)
  if (ids.tenantId) {
    const tenant = await em.findOne(Tenant, { id: ids.tenantId })
    const organization = ids.organizationId ? await em.findOne(Organization, { id: ids.organizationId }) : null
    if (tenant && organization) {
      if (organization.tenant.id !== tenant.id) {
        throw new Error('[internal] the configured library organization belongs to another tenant')
      }
      return { status: 'exists', tenantId: tenant.id, organizationId: organization.id, configured }
    }
    if (tenant || organization) {
      throw new Error(
        '[internal] only one of the configured library tenant and organization exists; fix the configuration',
      )
    }
  }
  const now = new Date()
  const created = await em.transactional(async (tx) => {
    const tenant = tx.create(Tenant, {
      ...(configured && ids.tenantId ? { id: ids.tenantId } : {}),
      name: LIBRARY_TENANT_NAME,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    tx.persist(tenant)
    await tx.flush()
    const organization = tx.create(Organization, {
      ...(configured && ids.organizationId ? { id: ids.organizationId } : {}),
      name: LIBRARY_TENANT_NAME,
      slug: null,
      tenant,
      isActive: true,
      depth: 0,
      ancestorIds: [],
      childIds: [],
      descendantIds: [],
      logoPreserveAspectRatio: false,
      createdAt: now,
      updatedAt: now,
    })
    tx.persist(organization)
    await tx.flush()
    return { tenantId: tenant.id, organizationId: organization.id }
  })
  // The library's own data-encryption key, as the platform gives every tenant (DD-O10a).
  if (isTenantDataEncryptionEnabled()) {
    const kms = createKmsService()
    if (kms.isHealthy()) await kms.createTenantDek(created.tenantId)
  }
  await rebuildHierarchyForTenant(em, created.tenantId)
  return { status: 'created', ...created, configured }
}
