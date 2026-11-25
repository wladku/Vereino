// The per-club jobs of `facilities` (many-clubs spec DD-M04: each module declares its jobs; #629), registered with the
// foundation's club job sweep from `di.ts` (facilities spec *Events, Jobs* rows; #122, #125, #128; S9.5, #525).
import type { ClubJobDeclaration } from '@/modules/foundation'

export const FACILITIES_CLUB_JOBS: readonly ClubJobDeclaration[] = [
  {
    key: 'facilities:rental-lifecycle',
    schedule: { everyMinutes: 15 },
    description: 'Close the confirmed rentals whose slot has ended.',
  },
  {
    key: 'facilities:expire-requests',
    schedule: { everyMinutes: 15 },
    description: 'Expire the booking requests left undecided for 48 hours and delete the unconfirmed ones.',
  },
  {
    key: 'facilities:maintenance-reminders',
    schedule: { dailyAt: '06:00' },
    description: 'Remind the maintainers of maintenance due by date or by hours of use.',
  },
  {
    key: 'facilities:purge-rental-links',
    schedule: { everyMinutes: 24 * 60 },
    description: 'Delete the rental links that expired or were used 30 days ago.',
  },
]
