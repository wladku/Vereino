// `activities.shareText` (foundation III DD-M14, REQ-M08; club spec DD-17, J-003 step 2): the one-line text with a
// link an author pastes into the group chat — in the club's language, with the activity, the date, the time, the
// gathering time when the session has one (DD-43) and, for a cancelled session, the status — for a moved one (REQ-A09,
// #271) the new place too —, and the public session page `/p/[clubSlug]/s/[occurrenceId]` (or the member
// calendar when the club publishes no public page). No names, no roster, no token. `communication` resolves it with
// `hasRegistration` after it has authorized the author's scope over the session.
import type { AwilixContainer } from 'awilix'
import { clubOrigin } from '@vereino/core'
import { renderLocalized } from '@/modules/foundation'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import { sessionWhen, shareTextKey, shareTextPath } from '../lib/share-text'
import { findPlaces, type ActivitiesScope } from './directory'
import { ACTIVITIES_SCHEDULE_DIRECTORY, type ActivitiesScheduleDirectory } from './schedule-directory'

export const ACTIVITIES_SHARE_TEXT = 'activities.shareText' as const

export type ShareText = { text: string; url: string }

export type ActivitiesShareText = {
  /**
   * The share text of a live session of the organization, or null when there is none. `moved`: the session's thread
   * last announced a move, so a planned session's text says it moved and names its place (REQ-A09).
   */
  forOccurrence(scope: ActivitiesScope, occurrenceId: string, options?: { moved?: boolean }): Promise<ShareText | null>
}

/** The app's public URL (`APP_URL`) without a trailing slash. */
function appUrl(): string {
  return (process.env.APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '')
}

export function createShareText(container: AwilixContainer): ActivitiesShareText {
  return {
    async forOccurrence(scope, occurrenceId, options) {
      const directory = container.resolve<ActivitiesScheduleDirectory>(ACTIVITIES_SCHEDULE_DIRECTORY)
      const occurrence = (await directory.findOccurrences(scope, [occurrenceId])).get(occurrenceId)
      if (!occurrence) return null
      const settings = await container.resolve<ClubCoreSettingsService>('clubCoreSettings').get(scope)
      // The club's address with `VEREINO_CLUB_DOMAIN` set (many clubs spec phase 3, #631), else `APP_URL`.
      const base = clubOrigin(settings.publicSettings.publicSlug, process.env) ?? appUrl()
      const url = `${base}${shareTextPath(
        {
          publicSlug: settings.publicSettings.publicSlug,
          publicationEnabled: settings.publicSettings.publication.enabled,
        },
        occurrence.id,
      )}`
      const moved = options?.moved === true && occurrence.status === 'planned'
      const placeId = occurrence.placeId ?? null
      const place = !moved
        ? ''
        : placeId
          ? ((await findPlaces(container, scope, [placeId])).get(placeId)?.name ?? '')
          : (occurrence.venueName ?? '')
      const text = await renderLocalized(settings.values.defaultLocale, (t, locale) => {
        const when = sessionWhen(occurrence, locale, settings.values.timezone)
        return t(
          shareTextKey(occurrence.status, when.gatheringTime !== null, moved),
          '{activity}, {date} {time} — details: {url}',
          {
            activity: occurrence.activityName ?? '',
            date: when.date,
            time: when.startTime,
            gathering: when.gatheringTime ?? '',
            place,
            url,
          },
        )
      })
      return { text, url }
    },
  }
}
