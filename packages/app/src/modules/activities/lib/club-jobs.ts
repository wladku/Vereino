// The per-club jobs of `activities` (many-clubs spec DD-M04: each module declares its jobs; #629), registered with the
// foundation's club job sweep from `di.ts`. Times are local to the club (club spec *Events, Jobs* rows; REQ-017;
// parity spec REQ-A14; engineering standards S9.5).
import type { ClubJobDeclaration } from '@/modules/foundation'

export const ACTIVITIES_CLUB_JOBS: readonly ClubJobDeclaration[] = [
  {
    key: 'activities:generate-occurrences',
    schedule: { dailyAt: '03:00' },
    description: 'Extend every active series to the 16-week horizon.',
  },
  {
    key: 'activities:expire-guardian-confirmations',
    schedule: { everyMinutes: 15 },
    description: 'Apply the policy default to guardian confirmations past their time limit.',
  },
  {
    key: 'activities:send-declaration-reminders',
    schedule: { dailyAt: '18:00' },
    description: 'E-mail a personal declaration link for the undeclared sessions of the next day.',
  },
  {
    key: 'activities:warn-unassigned-sessions',
    schedule: { everyMinutes: 15 },
    description: 'Warn the coordinators and the group leaders two hours before a session without a coach.',
  },
  {
    key: 'activities:purge-declaration-links',
    schedule: { everyMinutes: 24 * 60 },
    description: 'Delete the declaration links that expired 30 days ago.',
  },
]
