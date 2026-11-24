// Setting up a club's `facilities` schedules (foundation II P-12, DD-G07): the 15-minute `facilities:rental-lifecycle`
// (#122) and `facilities:expire-requests` (#125) schedules and the daily `facilities:maintenance-reminders` at 06:00 in
// the club's time zone (#128), and the daily `facilities:purge-rental-links` (engineering standards S9.5, #525).
// The jobs are declared in `lib/club-jobs.ts`; `setUpClubJob` gives the club its job state and, until the operator moved
// a job type onto its sweep, its per-club schedule (many-clubs spec DD-M04, #629). Idempotent; used by `setup.ts` `seedDefaults` and by the
// operator command `facilities set-up-club`, the backfill for a club set up before a schedule existed (#221 L4).
import type { AwilixContainer } from 'awilix'
import { setUpClubJob } from '@/modules/foundation'
import type { FacilitiesScope } from './directory'

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
  const rentalLifecycle = await setUpClubJob(container, scope, 'facilities:rental-lifecycle')
  const expireRequests = await setUpClubJob(container, scope, 'facilities:expire-requests')
  const maintenanceReminders = await setUpClubJob(container, scope, 'facilities:maintenance-reminders')
  const purgeRentalLinks = await setUpClubJob(container, scope, 'facilities:purge-rental-links')
  return {
    schedules: {
      'rental-lifecycle': rentalLifecycle,
      'expire-requests': expireRequests,
      'maintenance-reminders': maintenanceReminders,
      'purge-rental-links': purgeRentalLinks,
    },
  }
}
