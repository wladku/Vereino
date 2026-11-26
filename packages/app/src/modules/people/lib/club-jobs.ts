// The per-club jobs of `people` (many-clubs spec DD-M04: each module declares its jobs; #629), registered with the
// foundation's club job sweep from `di.ts` (club spec *Events, Jobs* rows; life-cycle spec DD-L09, #310). The
// life-cycle job runs before the role sync of the same night, and before the retention sweep (#471) at 03:00, which
// anonymises the former participants whose accounts it closed.
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
    key: 'people:retention-sweep',
    schedule: { dailyAt: '03:00' },
    description: "Anonymise former participants after the club's retention period (REQ-041).",
  },
  {
    key: 'people:purge-import-rows',
    schedule: { dailyAt: '04:00' },
    description:
      'Delete the staged rows and the file of people imports 30 days after their commit or cancellation, and the invitation links dead for 30 days.',
  },
  {
    // Training outlines and medical expiry spec DD-O04 (#682): 07:00 club time, so a reminder arrives in the morning.
    key: 'people:medical-reminders',
    schedule: { dailyAt: '07:00' },
    description:
      'Medical certificate reminders a month before and on the date; dates without consent, of former persons or 12 months past are cleared.',
  },
]
