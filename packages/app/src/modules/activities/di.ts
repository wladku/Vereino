import { asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { audienceProviderToken } from '@vereino/core'
import { activityAudienceProvider, occurrenceAudienceProvider } from './services/audience'

/**
 * `vereino.audience.activity` and `vereino.audience.occurrence` (foundation III P-29, DD-M05; #71): the audience
 * providers of the kinds `activities` owns — an activity's group roster and default coach, a session's group roster on
 * its date and its coach. The foundation resolves them with `hasRegistration`; stateless values, every call takes the
 * caller's context.
 */
export function register(container: AppContainer) {
  container.register({
    [audienceProviderToken('activity')]: asValue(activityAudienceProvider),
    [audienceProviderToken('occurrence')]: asValue(occurrenceAudienceProvider),
  })
}
