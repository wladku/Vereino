// The per-club jobs of `people` (many-clubs spec DD-M04: each module declares its jobs; #629), registered with the
// foundation's club job sweep from `di.ts` (club spec *Events, Jobs* rows; life-cycle spec DD-L09, #310). The
// life-cycle job runs before the role sync of the same night.
import type { ClubJobDeclaration } from '@/modules/foundation'

export const PEOPLE_CLUB_JOBS: readonly ClubJobDeclaration[] = [
  {
    key: 'people:life-cycle',
    schedule: { dailyAt: '01:30' },
    description:
      '18th birthdays and account ages: notices, guardianships ending, consents; accounts of dated departures.',
  },
  {
    key: 'people:sync-role-expiry',
    schedule: { dailyAt: '02:00' },
    description: 'Recompute staff auth roles: assignments that start or end, 18th birthdays.',
  },
  {
    key: 'people:purge-import-rows',
    schedule: { dailyAt: '04:00' },
    description: 'Delete the staged rows and the file of people imports 30 days after their commit or cancellation.',
  },
]
