// Setting up a club's `payments` schedules (payments parity spec DD-C08, *Events, Jobs*; REQ-C13; #301): the daily
// charge generation at 06:00 and the overdue reminders at 09:00 in the club's time zone, and the 15-minute checkout
// reconciliation (DD-42) and order-campaign closing, the daily purge of dead order links (engineering standards
// S9.5; #525) and the nightly invariant check at 03:00 in the club's time zone (club spec REQ-043; #531). The jobs are declared in `lib/club-jobs.ts`; `setUpClubJob`
// gives the club its job state and, until the operator moved a job type onto its sweep, its per-club schedule
// (many-clubs spec DD-M04, #629). Idempotent (an upsert on the stable id of job and organization), so a second run
// registers nothing twice; used by `setup.ts` `seedDefaults` and by the
// operator command `payments set-up-club`, the backfill for a club created before the schedules existed.
import type { AwilixContainer } from 'awilix'
import { setUpClubJob } from '@/modules/foundation'
import type { PaymentsScope } from './directory'

export type PaymentsSchedules = {
  'generate-charges': boolean
  'overdue-reminders': boolean
  'reconcile-checkouts': boolean
  'close-order-campaigns': boolean
  'purge-order-links': boolean
  'verify-invariants': boolean
}

/** Registers the six schedules of the club; each value says whether its registration succeeded. */
export async function setUpClubPayments(
  container: AwilixContainer,
  scope: PaymentsScope,
): Promise<{ schedules: PaymentsSchedules }> {
  const register = (name: keyof PaymentsSchedules) => setUpClubJob(container, scope, `payments:${name}`)
  return {
    schedules: {
      'generate-charges': await register('generate-charges'),
      'overdue-reminders': await register('overdue-reminders'),
      'reconcile-checkouts': await register('reconcile-checkouts'),
      'close-order-campaigns': await register('close-order-campaigns'),
      'purge-order-links': await register('purge-order-links'),
      'verify-invariants': await register('verify-invariants'),
    },
  }
}
