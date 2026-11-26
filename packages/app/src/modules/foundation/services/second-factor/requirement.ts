// Whether a user holds the staff second-factor requirement (spec DD-2F02; #736): the ACL feature
// `foundation.second_factor.required`, checked wildcard-aware through RBAC (the super-admin's unrestricted ACL holds
// it, Q-2F02). Kept free of Next.js imports: the reset command and the operator CLI load it in plain Node.
import type { AwilixContainer } from 'awilix'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { SECOND_FACTOR_REQUIRED_FEATURE } from '@vereino/core'

/** True when the user holds the requirement in `scope`. */
export async function holdsSecondFactorRequirement(
  container: AwilixContainer,
  userId: string,
  scope: { tenantId: string | null; organizationId: string | null },
): Promise<boolean> {
  const rbac = container.resolve<RbacService>('rbacService')
  return rbac.userHasAllFeatures(userId, [SECOND_FACTOR_REQUIRED_FEATURE], scope)
}
