import { asFunction, asValue } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerNotificationTypes } from '@open-mercato/core/modules/notifications/lib/notification-type-registry'
import { audienceProviderToken } from '@vereino/core'
import {
  createTokenLinkService,
  declareClubJobs,
  registerEmailTemplate,
  registerClubDataContributor,
} from '@/modules/foundation'
import { DeclarationToken } from './data/entities'
import { declarationLinkTemplate } from './emails/templates'
import { DECLARATION_LINK_TTL_MS } from './lib/declaration-links'
import notificationTypes from './notifications'
import { activityAudienceProvider, occurrenceAudienceProvider } from './services/audience'
import { ACTIVITIES_DECLARATION_LINKS } from './services/declaration-links'
import { ACTIVITIES_DATA_EXPORT_CONTRIBUTOR, createDataExportContribution } from './services/data-export-contribution'
import { ACTIVITIES_DEPARTURE_CONTRIBUTOR, createDepartureContribution } from './services/departure-contribution'
import { ACTIVITIES_GROUP_USAGE, groupUsage } from './services/group-usage'
import { ACTIVITIES_PLACE_SESSIONS, createPlaceSessions } from './services/place-sessions'
import { ACTIVITIES_PLACE_USAGE, placeUsage } from './services/place-usage'
import { ACTIVITIES_PUBLIC_EVENTS, createPublicEvents } from './services/public-events'
import { ACTIVITIES_PUBLIC_SCHEDULE, createPublicSchedule } from './services/public-schedule'
import { ACTIVITIES_SCHEDULE_DIRECTORY, createScheduleDirectory } from './services/schedule-directory'
import { ACTIVITIES_SEASON_CONTRIBUTOR, seasonContribution } from './services/season-rollover'
import { ACTIVITIES_SHARE_TEXT, createShareText } from './services/share-text'
import { ACTIVITIES_CLUB_JOBS } from './lib/club-jobs'
import { ACTIVITIES_CLUB_TABLES } from './lib/club-tables'

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
 *
 * `activities.publicSchedule` (club spec DD-28, DD-29; #91): the public groups' schedule on a section's public page;
 * `activities.publicEvents` (navigation spec REQ-N13, #263): the one-off events of public groups on the public Events
 * page P-06. `club_core` reads both with `hasRegistration`.
 *
 * `activities.placeSessions` (facilities spec DD-20, #121): the planned sessions on places in a window and the
 * reschedule flag a closure sets on them, for `facilities`.
 *
 * `activities.groupUsage` (groups and activities parity spec REQ-A02, REQ-A03; #266, #267): the number of a group's
 * matches, which `groups` reads with `hasRegistration` before a team becomes a class group, and whether a membership
 * was used, which it reads before a started membership is removed (`groups/services/group-usage.ts`).
 * Stateless: it reads with the caller's EntityManager inside the command's transaction.
 *
 * `activities.placeUsage` (club events spec REQ-T06, #377): whether a live activity or session points at a place,
 * which `club_core` reads with `hasRegistration` before the undo of an added external place removes it
 * (`club_core/services/place-usage.ts`). Stateless: it reads with the caller's EntityManager inside the undo.
 *
 * `groups.season.activities` (people life-cycle spec REQ-L08, DD-L10; #311): the season contributor `groups` reads
 * with `hasRegistration` (`groups/services/season-rollover.ts`) — the recurring activities of the rolled-over groups end
 * on the old season's last day and may be copied into the new season. Stateless: it works in the caller's
 * EntityManager, inside the rollover's transaction.
 */
const declarationLinks = createTokenLinkService(DeclarationToken, {
  use: 'until_expiry',
  ttlMs: DECLARATION_LINK_TTL_MS,
  dedicatedTable: true,
})

export function register(container: AppContainer) {
  // The module's per-club jobs, run by the foundation's club job sweep (many-clubs spec DD-M04, #629).
  declareClubJobs(ACTIVITIES_CLUB_JOBS)
  registerClubDataContributor(container, 'activities', ACTIVITIES_CLUB_TABLES)
  registerNotificationTypes(notificationTypes)
  registerEmailTemplate(container, declarationLinkTemplate)
  container.register({
    [ACTIVITIES_DECLARATION_LINKS]: asValue(declarationLinks),
    [ACTIVITIES_GROUP_USAGE]: asValue(groupUsage),
    [ACTIVITIES_PLACE_USAGE]: asValue(placeUsage),
    [ACTIVITIES_SEASON_CONTRIBUTOR]: asValue(seasonContribution),
    [audienceProviderToken('activity')]: asValue(activityAudienceProvider),
    [audienceProviderToken('occurrence')]: asValue(occurrenceAudienceProvider),
    // `.proxy()` resolves `em` by property name, which survives bundler renaming under CLASSIC injection.
    [ACTIVITIES_SCHEDULE_DIRECTORY]: asFunction((cradle: { em: EntityManager }) =>
      createScheduleDirectory(() => cradle.em),
    )
      .scoped()
      .proxy(),
    [ACTIVITIES_PLACE_SESSIONS]: asFunction((cradle: { em: EntityManager }) =>
      createPlaceSessions(() => cradle.em, container),
    )
      .scoped()
      .proxy(),
    [ACTIVITIES_SHARE_TEXT]: asFunction(() => createShareText(container)).scoped(),
    [ACTIVITIES_PUBLIC_SCHEDULE]: asFunction(() => createPublicSchedule(container)).scoped(),
    [ACTIVITIES_PUBLIC_EVENTS]: asFunction(() => createPublicEvents(container)).scoped(),
    // `people.departure.activities` (people life-cycle spec REQ-L04, #307): the departure contributor `people` reads
    // with `hasRegistration` — a leaving coach's future sessions and default-coach activities are handed over or freed
    // from the day after the last day, with substitution entries, the undo and the coach events after the commit.
    [ACTIVITIES_DEPARTURE_CONTRIBUTOR]: asFunction(() => createDepartureContribution(container)).scoped(),
    // `people.dataExport.activities` (person data export spec DD-X01, #527): the export contributor `people` reads with
    // `hasRegistration` — the subject's attendance, declaration links, the contact reads that returned their contacts and
    // the substitutions where they are a coach, with staff actions counted. Read only, in the caller's EntityManager.
    [ACTIVITIES_DATA_EXPORT_CONTRIBUTOR]: asFunction(() => createDataExportContribution(container)).scoped(),
  })
}
