// `activities.shareText` (foundation III DD-M14, REQ-M08; club spec DD-17, J-003 step 2): the one-line text with a
// link an author pastes into the group chat — in the club's language, with the activity, the date, the time, the
// gathering time when the session has one (DD-43) and, for a cancelled session, the status, and the public session page `/p/[clubSlug]/s/[occurrenceId]` (or the member
// calendar when the club publishes no public page). No names, no roster, no token. `communication` resolves it with
// `hasRegistration` after it has authorized the author's scope over the session.
import type { AwilixContainer } from 'awilix'
import { renderLocalized } from '@/modules/foundation'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import { sessionWhen, shareTextKey, shareTextPath } from '../lib/share-text'
import type { ActivitiesScope } from './directory'
import { ACTIVITIES_SCHEDULE_DIRECTORY, type ActivitiesScheduleDirectory } from './schedule-directory'

export const ACTIVITIES_SHARE_TEXT = 'activities.shareText' as const

export type ShareText = { text: string; url: string }

export type ActivitiesShareText = {
  /** The share text of a live session of the organization, or null when there is none. */
  forOccurrence(scope: ActivitiesScope, occurrenceId: string): Promise<ShareText | null>
}

/** The app's public URL (`APP_URL`) without a trailing slash. */
function appUrl(): string {
  return (process.env.APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')
}

export function createShareText(container: AwilixContainer): ActivitiesShareText {
  return {
    async forOccurrence(scope, occurrenceId) {
      const directory = container.resolve<ActivitiesScheduleDirectory>(ACTIVITIES_SCHEDULE_DIRECTORY)
      const occurrence = (await directory.findOccurrences(scope, [occurrenceId])).get(occurrenceId)
      if (!occurrence) return null
      const settings = await container.resolve<ClubCoreSettingsService>('clubCoreSettings').get(scope)
      const url = `${appUrl()}${shareTextPath(
        {
          publicSlug: settings.publicSettings.publicSlug,
          publicationEnabled: settings.publicSettings.publication.enabled,
        },
        occurrence.id,
      )}`
      const text = await renderLocalized(settings.values.defaultLocale, (t, locale) => {
        const when = sessionWhen(occurrence, locale, settings.values.timezone)
        return t(
          shareTextKey(occurrence.status, when.gatheringTime !== null),
          '{activity}, {date} {time} — details: {url}',
          {
            activity: occurrence.activityName ?? '',
            date: when.date,
            time: when.startTime,
            gathering: when.gatheringTime ?? '',
            url,
          },
        )
      })
      return { text, url }
    },
  }
}
