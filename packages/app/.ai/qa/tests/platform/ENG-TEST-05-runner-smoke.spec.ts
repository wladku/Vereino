import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenScope } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createIsolatedTenant } from '../_fixtures/tenant'

// ENG-TEST-05 (engineering standards spec, phase E1): the ephemeral runner works and a test can
// build its own tenant, organization and user through the API and sign in as that user.
test('ENG-TEST-05 a self-created tenant user can sign in', async ({ request }) => {
  const tenant = await createIsolatedTenant(request, 'eng-test-05')
  try {
    const token = await getAuthToken(request, tenant.email, tenant.password)
    const scope = getTokenScope(token)
    expect(scope.tenantId).toBe(tenant.tenantId)
    expect(scope.organizationId).toBe(tenant.organizationId)
  } finally {
    await tenant.cleanup()
  }
})
