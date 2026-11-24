// The per-club jobs of `payments` (many-clubs spec DD-M04: each module declares its jobs; #629), registered with the
// foundation's club job sweep from `di.ts` (payments parity spec DD-C08, DD-C09, DD-42; REQ-043; S9.5).
import type { ClubJobDeclaration } from '@/modules/foundation'

export const PAYMENTS_CLUB_JOBS: readonly ClubJobDeclaration[] = [
  {
    key: 'payments:generate-charges',
    schedule: { dailyAt: '06:00' },
    description: "Generate the month's charges on the club's generation day.",
  },
  {
    key: 'payments:overdue-reminders',
    schedule: { dailyAt: '09:00' },
    description: 'Remind the payers of overdue charges.',
  },
  {
    key: 'payments:reconcile-checkouts',
    schedule: { everyMinutes: 15 },
    description: 'Book late online captures and expire stale checkouts.',
  },
  {
    key: 'payments:close-order-campaigns',
    schedule: { everyMinutes: 15 },
    description: 'Close the order campaigns past their orders deadline.',
  },
  {
    key: 'payments:purge-order-links',
    schedule: { everyMinutes: 24 * 60 },
    description: 'Delete the order links that expired 30 days ago.',
  },
  {
    key: 'payments:verify-invariants',
    schedule: { dailyAt: '03:00' },
    description: 'Check that charges match their payments and receipt numbers run without gaps.',
  },
]
