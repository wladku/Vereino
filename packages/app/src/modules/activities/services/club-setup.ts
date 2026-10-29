// Setting up a club's `activities` defaults (foundation II P-12, DD-G07): the daily `activities:generate-occurrences`
// schedule at 03:00 in the club's time zone (club spec *Events, Jobs* row). Idempotent (an upsert on the stable id);
// used by `setup.ts` `seedDefaults` and re-run when the club's time zone changes.
import type { AwilixContainer } from 'awilix'
import { registerModuleSchedule } from '@/modules/foundation'
import { clubTimeZone, type ActivitiesScope } from './directory'

/** Daily at 03:00 in the club's time zone. */
export const GENERATE_OCCURRENCES_CRON = '0 3 * * *'

export async function registerGenerateSchedule(container: AwilixContainer, scope: ActivitiesScope): Promise<boolean> {
  return registerModuleSchedule(container, {
    module: 'activities',
    name: 'generate-occurrences',
    schedule: { cron: GENERATE_OCCURRENCES_CRON, timezone: await clubTimeZone(container, scope) },
    scope,
    description: 'Extend every active series to the 16-week horizon.',
  })
}
