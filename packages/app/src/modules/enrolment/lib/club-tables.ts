// The tables this module holds for a club (many clubs spec phase 4, REQ-M06, DD-M09; sign-up form spec *Events, Jobs*
// → club offboarding; #799): `club_core export-club` exports and `club_core delete-club` deletes every row of the
// club's tenant in them, through the contributor the module registers in `di.ts`.
export const ENROLMENT_CLUB_TABLES: readonly string[] = [
  'enrolment_applications',
  'enrolment_confirmation_links',
  'enrolment_application_links',
  'enrolment_trial_read_logs',
]
