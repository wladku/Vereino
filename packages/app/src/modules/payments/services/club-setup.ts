// Setting up a club's `payments` schedules (payments parity spec DD-C08, *Events, Jobs*; REQ-C13; #301): the daily
// charge generation at 06:00 and the overdue reminders at 09:00 in the club's time zone, and the 15-minute checkout
// reconciliation (DD-42) and order-campaign closing. Idempotent (`registerModuleSchedule` upserts on the stable id of
// job and organization), so a second run registers nothing twice; used by `setup.ts` `seedDefaults` and by the
// operator command `payments set-up-club`, the backfill for a club created before the schedules existed.
import type { AwilixContainer } from 'awilix'
import { registerModuleSchedule } from '@/modules/foundation'
import { clubClock, type PaymentsScope } from './directory'

/** Daily at 06:00 in the club's time zone (DD-C08). */
export const GENERATE_CHARGES_CRON = '0 6 * * *'

/** Daily at 09:00 in the club's time zone (DD-C09). */
export const OVERDUE_REMINDERS_CRON = '0 9 * * *'

/** Every 15 minutes: the checkout sweep (DD-42) and the campaign closing. */
export const PAYMENTS_SWEEP_INTERVAL = '15m' as const

export type PaymentsSchedules = {
  'generate-charges': boolean
  'overdue-reminders': boolean
  'reconcile-checkouts': boolean
  'close-order-campaigns': boolean
}

/** Registers the four schedules of the club; each value says whether its registration succeeded. */
export async function setUpClubPayments(
  container: AwilixContainer,
  scope: PaymentsScope,
): Promise<{ schedules: PaymentsSchedules }> {
  const { timeZone } = await clubClock(container, scope)
  const register = (
    name: keyof PaymentsSchedules,
    schedule: Parameters<typeof registerModuleSchedule>[1]['schedule'],
    description: string,
  ) => registerModuleSchedule(container, { module: 'payments', name, schedule, scope, description })
  return {
    schedules: {
      'generate-charges': await register(
        'generate-charges',
        { cron: GENERATE_CHARGES_CRON, timezone: timeZone },
        "Generate the month's charges on the club's generation day.",
      ),
      'overdue-reminders': await register(
        'overdue-reminders',
        { cron: OVERDUE_REMINDERS_CRON, timezone: timeZone },
        'Remind the payers of overdue charges.',
      ),
      'reconcile-checkouts': await register(
        'reconcile-checkouts',
        { interval: PAYMENTS_SWEEP_INTERVAL },
        'Book late online captures and expire stale checkouts.',
      ),
      'close-order-campaigns': await register(
        'close-order-campaigns',
        { interval: PAYMENTS_SWEEP_INTERVAL },
        'Close the order campaigns past their orders deadline.',
      ),
    },
  }
}
