import { asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { GROUPS_MEMBERSHIP_CONTRIBUTION, membershipContribution } from './services/membership-contribution'

/**
 * `groups` contributes the coach scope and the participant payer rule to `people` (club spec *Record scope*,
 * *Account payer*; #30) under the optional token `people` reads with `hasRegistration`
 * (`people/services/membership-contribution.ts`). The contribution is stateless: every call takes the caller's
 * EntityManager, so it is a value, not a scoped service.
 */
export function register(container: AppContainer) {
  container.register({
    [GROUPS_MEMBERSHIP_CONTRIBUTION]: asValue(membershipContribution),
  })
}
