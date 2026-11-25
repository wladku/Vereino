// The tables this module holds for a club (many clubs spec phase 4, REQ-M06, DD-M09; #632): `club_core export-club`
// exports and `club_core delete-club` deletes every row of the club's tenant in them, through the contributor the
// module registers in `di.ts`. A new table with a `tenant_id` column is added here, or both commands refuse to run.
export const FACILITIES_CLUB_TABLES: readonly string[] = [
  'facilities_zone_rules',
  'facilities_closures',
  'facilities_rental_rates',
  'facilities_rentals',
  'facilities_entry_bans',
  'facilities_internal_bookings',
  'facilities_logs',
  'facilities_incidents',
  'facilities_incident_photos',
  'facilities_maintenance_tasks',
  'facilities_place_maintainers',
  'facilities_rental_links',
]
