import { asFunction, asValue } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerNotificationTypes } from '@open-mercato/core/modules/notifications/lib/notification-type-registry'
import { audienceProviderToken } from '@vereino/core'
import { createTokenLinkService, registerEmailTemplate } from '@/modules/foundation'
import { DeclarationToken } from './data/entities'
import { declarationLinkTemplate } from './emails/templates'
import { DECLARATION_LINK_TTL_MS } from './lib/declaration-links'
import notificationTypes from './notifications'
import { activityAudienceProvider, occurrenceAudienceProvider } from './services/audience'
import { ACTIVITIES_DECLARATION_LINKS } from './services/declaration-links'
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
 *
 * `activities.declarationLinks` (REQ-017, foundation P-10): the token-link service of `activities_declaration_tokens`
 * (`until_expiry`, at most 31 days, a link ends with its session) — the single DD-35 lookup of that table. The e-mail
 * template `activities.declaration_link` (P-31) is registered for every request and job container, so the dispatch
 * worker finds it, and the in-app types are added to the platform's registry for the worker process too (see
 * `communication/di.ts`).
 */
const declarationLinks = createTokenLinkService(DeclarationToken, {
  use: 'until_expiry',
  ttlMs: DECLARATION_LINK_TTL_MS,
})

export function register(container: AppContainer) {
  registerNotificationTypes(notificationTypes)
  registerEmailTemplate(container, declarationLinkTemplate)
  container.register({
    [ACTIVITIES_DECLARATION_LINKS]: asValue(declarationLinks),
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
