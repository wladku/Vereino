// Setting up a club's `facilities` schedules (foundation II P-12, DD-G07): the 15-minute `facilities:rental-lifecycle`
// (#122) and `facilities:expire-requests` (#125) schedules and the daily `facilities:maintenance-reminders` at 06:00 in
// the club's time zone (#128), and the daily `facilities:purge-rental-links` (engineering standards S9.5, #525).
// Idempotent (an upsert on the stable id); used by `setup.ts` `seedDefaults` and by the
// operator command `facilities set-up-club`, the backfill for a club set up before a schedule existed (#221 L4).
import type { AwilixContainer } from 'awilix'
import { registerModuleSchedule } from '@/modules/foundation'
import { clubTimeZone, type FacilitiesScope } from './directory'

/** Every 15 minutes (facilities spec *Events, Jobs* row `facilities:rental-lifecycle`; foundation II P-12). */
export const RENTAL_LIFECYCLE_INTERVAL = '15m' as const

/** Every 15 minutes (facilities spec *Events, Jobs* row `facilities:expire-requests`; #125). */
export const EXPIRE_REQUESTS_INTERVAL = '15m' as const

/** Daily at 06:00 in the club's time zone (facilities spec *Events, Jobs* row `facilities:maintenance-reminders`; #128). */
export const MAINTENANCE_REMINDERS_CRON = '0 6 * * *'

/** Once a day: the rental links dead for 30 days are deleted (engineering standards S9.5; #525). */
export const PURGE_RENTAL_LINKS_INTERVAL = '1d' as const

/** Whether each schedule was registered; `false` means the scheduler refused it (logged by the foundation). */
export type ClubFacilitiesSetUp = {
  schedules: {
    'rental-lifecycle': boolean
    'expire-requests': boolean
    'maintenance-reminders': boolean
    'purge-rental-links': boolean
  }
}

export async function setUpClubFacilities(
  container: AwilixContainer,
  scope: FacilitiesScope,
): Promise<ClubFacilitiesSetUp> {
  const rentalLifecycle = await registerModuleSchedule(container, {
    module: 'facilities',
    name: 'rental-lifecycle',
    schedule: { interval: RENTAL_LIFECYCLE_INTERVAL },
    scope,
    description: 'Close the confirmed rentals whose slot has ended.',
  })
  const expireRequests = await registerModuleSchedule(container, {
    module: 'facilities',
    name: 'expire-requests',
    schedule: { interval: EXPIRE_REQUESTS_INTERVAL },
    scope,
    description: 'Expire the booking requests left undecided for 48 hours and delete the unconfirmed ones.',
  })
  const maintenanceReminders = await registerModuleSchedule(container, {
    module: 'facilities',
    name: 'maintenance-reminders',
    schedule: { cron: MAINTENANCE_REMINDERS_CRON, timezone: await clubTimeZone(container, scope) },
    scope,
    description: 'Remind the maintainers of maintenance due by date or by hours of use.',
  })
  const purgeRentalLinks = await registerModuleSchedule(container, {
    module: 'facilities',
    name: 'purge-rental-links',
    schedule: { interval: PURGE_RENTAL_LINKS_INTERVAL },
    scope,
    description: 'Delete the rental links that expired or were used 30 days ago.',
  })
  return {
    schedules: {
      'rental-lifecycle': rentalLifecycle,
      'expire-requests': expireRequests,
      'maintenance-reminders': maintenanceReminders,
      'purge-rental-links': purgeRentalLinks,
    },
  }
}
