import { asFunction, asValue } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { audienceProviderToken } from '@vereino/core'
import { activityAudienceProvider, occurrenceAudienceProvider } from './services/audience'
import { ACTIVITIES_SCHEDULE_DIRECTORY, createScheduleDirectory } from './services/schedule-directory'
import { ACTIVITIES_SHARE_TEXT, createShareText } from './services/share-text'

/**
 * `vereino.audience.activity` and `vereino.audience.occurrence` (foundation III P-29, DD-M05; #71): the audience
 * providers of the kinds `activities` owns — an activity's group roster and default coach, a session's group roster on
 * its date and its coach. The foundation resolves them with `hasRegistration`; stateless values, every call takes the
 * caller's context.
 *
 * `activities.scheduleDirectory` (#35): activities and sessions by id and the ones an author's grants cover, for
 * `communication` (announcement targets, the cancellation thread). `activities.shareText` (#35, foundation III DD-M14):
 * the share text of a session with the link to the public session page. `communication` reads both with
 * `hasRegistration`.
 */
export function register(container: AppContainer) {
  container.register({
    [audienceProviderToken('activity')]: asValue(activityAudienceProvider),
    [audienceProviderToken('occurrence')]: asValue(occurrenceAudienceProvider),
    // `.proxy()` resolves `em` by property name, which survives bundler renaming under CLASSIC injection.
    [ACTIVITIES_SCHEDULE_DIRECTORY]: asFunction((cradle: { em: EntityManager }) =>
      createScheduleDirectory(() => cradle.em),
    )
      .scoped()
      .proxy(),
    [ACTIVITIES_SHARE_TEXT]: asFunction(() => createShareText(container)).scoped(),
  })
}
