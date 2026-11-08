// Pure rules of the incidents (facilities spec *Data Models* → `facilities_incidents`, REQ-016, §6 of the facility
// regulations; M-12 "Report incident", B-27; #126): an incident has a kind, a description of 10–2000 characters, the
// actions taken and the people involved; it happened no later than now; it is never deleted (evidence). The kinds
// deliberately name no injury or illness: the description must not hold health data (M-12 hint), and a health
// category would invite it. Nothing here reads the database or the clock (S3.5).

export const INCIDENT_KINDS = [
  'rules_violation',
  'damage',
  'vandalism',
  'unauthorized_entry',
  'safety_hazard',
  'other',
] as const
export type IncidentKind = (typeof INCIDENT_KINDS)[number]

export const INCIDENT_ACTIONS = [
  'none',
  'warning_given',
  'removed_from_facility',
  'activity_stopped',
  'police_called',
  'emergency_services_called',
  'owner_notified',
  'entry_ban_requested',
] as const
export type IncidentAction = (typeof INCIDENT_ACTIONS)[number]

/** M-12 validation: the description holds 10–2000 characters (422 `incident_description_length`). */
export const INCIDENT_DESCRIPTION_MIN_LENGTH = 10
export const INCIDENT_DESCRIPTION_MAX_LENGTH = 2000

/** M-12: the people involved, as free text (names or descriptions; encrypted at rest). */
export const INCIDENT_INVOLVED_MAX_LENGTH = 1000

/** The clock skew a phone may have when it sends "now" as the time of the incident. */
export const INCIDENT_CLOCK_SKEW_MS = 5 * 60 * 1000

/** True when the trimmed description has 10–2000 characters. */
export function incidentDescriptionValid(description: string): boolean {
  const length = description.trim().length
  return length >= INCIDENT_DESCRIPTION_MIN_LENGTH && length <= INCIDENT_DESCRIPTION_MAX_LENGTH
}

/** True when the incident happened no later than now, allowing a phone's clock skew (422 `incident_time_future`). */
export function incidentTimeAllowed(occurredAt: Date, now: Date): boolean {
  return occurredAt.getTime() <= now.getTime() + INCIDENT_CLOCK_SKEW_MS
}

/** The actions in catalogue order without repeats; `none` only when nothing else was done. */
export function normalizedActions(actions: readonly IncidentAction[]): IncidentAction[] {
  const held = new Set(actions)
  if (held.size > 1) held.delete('none')
  return INCIDENT_ACTIONS.filter((action) => held.has(action))
}
