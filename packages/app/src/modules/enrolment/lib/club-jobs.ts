// The per-club jobs of `enrolment` (many-clubs spec DD-M04; sign-up form spec DD-J14, R22, R23; #799), registered with
// the foundation's club job sweep from `di.ts`.
import type { ClubJobDeclaration } from '@/modules/foundation'

export const ENROLMENT_CLUB_JOBS: readonly ClubJobDeclaration[] = [
  {
    key: 'enrolment:expire-unconfirmed',
    schedule: { everyMinutes: 60 },
    description: 'Delete the applications whose e-mail was not confirmed within 24 hours.',
  },
  {
    key: 'enrolment:daily',
    schedule: { dailyAt: '06:30' },
    description: 'Anonymise applications closed 30 days ago and delete their dead links.',
  },
]
