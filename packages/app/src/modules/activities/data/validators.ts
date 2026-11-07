// Request schemas of `activities`, shared by routes (OpenAPI) and commands. Public schemas never accept tenant or
// organization ids (`.strict()` rejects them). The recurrence rule is the stored text of the foundation II subset
// (`FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630`, optionally with an `EXDATE:` line); the foundation's parse service answers
// 422 `recurrence_unsupported` / `recurrence_invalid`. Wall times are club-zone `HH:mm` or `HH:mm:ss`.
import { z } from 'zod'
import { isLocalTime } from '@vereino/core'
import { calendarDateSchema } from '@/modules/foundation'
import { ACTIVITY_TYPES, OCCURRENCE_STATUSES } from '../lib/activities-rules'
import { MAX_GATHERING_MINUTES } from '../lib/gathering'
import { SUBSTITUTION_REASON_MAX } from '../lib/substitutions'
import {
  ACTUAL_ATTENDANCE,
  DECLARED_VALUES,
  MAX_CONFIRM_TIMEOUT_HOURS,
  MINOR_DECLARATION_MODES,
  POLICY_SCOPES,
  TIMEOUT_DEFAULTS,
} from '../lib/policy'

const nameSchema = z.string().trim().min(1).max(200)
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const localTimeSchema = z.string().refine(isLocalTime, { message: 'Expected a HH:mm wall time' })
const instantSchema = z.iso.datetime({ offset: true })
const externalTeamIds = z.array(z.uuid()).max(50)
const booleanQuery = z.enum(['true', 'false']).optional()
/** A list flag as the README writes it (`unassigned=1`) or as a boolean query (`true`). */
const flagQuery = z.enum(['1', 'true', '0', 'false']).optional()
/** The default gathering time of a series or event in minutes before the start (DD-43); null clears it. */
const gatheringMinutesSchema = z.number().int().min(1).max(MAX_GATHERING_MINUTES).nullable().optional()

const listQueryBase = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
}

/** The fields a recurring series or a one-off activity is planned with. */
const activityShape = {
  groupId: z.uuid(),
  name: nameSchema,
  type: z.enum(ACTIVITY_TYPES),
  placeId: z.uuid(),
  coachPersonId: z.uuid().nullable().optional(),
  opponentExternalTeamId: z.uuid().nullable().optional(),
  invitedExternalTeamIds: externalTeamIds.optional(),
  /** The rule text; null or absent for a one-off activity on `startsOn`. */
  recurrenceRule: z.string().trim().max(2000).nullable().optional(),
  /** Exception dates added to the rule's `EXDATE` line. */
  exdates: z.array(calendarDateSchema).max(366).optional(),
  startsOn: calendarDateSchema,
  endsOn: calendarDateSchema.nullable().optional(),
  startTime: localTimeSchema,
  endTime: localTimeSchema,
  gatheringMinutesBefore: gatheringMinutesSchema,
  description: optionalText(4000),
  isActive: z.boolean().optional(),
}

export const activityCreateSchema = z.object(activityShape).strict()

/** The group of an activity is fixed; everything else may change and re-plans the future sessions. */
export const activityUpdateSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema.optional(),
    type: z.enum(ACTIVITY_TYPES).optional(),
    placeId: z.uuid().optional(),
    coachPersonId: z.uuid().nullable().optional(),
    opponentExternalTeamId: z.uuid().nullable().optional(),
    invitedExternalTeamIds: externalTeamIds.optional(),
    recurrenceRule: z.string().trim().max(2000).nullable().optional(),
    exdates: z.array(calendarDateSchema).max(366).optional(),
    startsOn: calendarDateSchema.optional(),
    endsOn: calendarDateSchema.nullable().optional(),
    startTime: localTimeSchema.optional(),
    endTime: localTimeSchema.optional(),
    gatheringMinutesBefore: gatheringMinutesSchema,
    description: optionalText(4000),
    isActive: z.boolean().optional(),
  })
  .strict()

export const activityDeleteSchema = z.object({ id: z.uuid() }).strict()

/** The preview of a new series, or of an edit of `activityId` (its own movable sessions do not block it). */
export const activityPreviewSchema = z.object({ ...activityShape, activityId: z.uuid().optional() }).strict()

export const activityListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'type', 'startsOn', 'createdAt', 'updatedAt']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sectionId: z.uuid().optional(),
  groupId: z.uuid().optional(),
  type: z.enum(ACTIVITY_TYPES).optional(),
  isActive: booleanQuery,
})

/** A one-off event for one group (REQ-027): its instants may span several days (a weekend tournament). */
export const eventCreateSchema = z
  .object({
    groupId: z.uuid(),
    type: z.enum(ACTIVITY_TYPES),
    name: nameSchema,
    placeId: z.uuid(),
    startsAt: instantSchema,
    endsAt: instantSchema,
    coachPersonId: z.uuid().nullable().optional(),
    invitedExternalTeamIds: externalTeamIds.optional(),
    gatheringMinutesBefore: gatheringMinutesSchema,
    description: optionalText(4000),
  })
  .strict()

/** Moving or re-staffing one session detaches it from its series. */
export const occurrenceUpdateSchema = z
  .object({
    id: z.uuid(),
    startAt: instantSchema.optional(),
    endAt: instantSchema.optional(),
    placeId: z.uuid().optional(),
    coachPersonId: z.uuid().nullable().optional(),
    /** The session's own gathering instant (DD-43; 422 at or after the start); null removes it. */
    gatheringAt: instantSchema.nullable().optional(),
  })
  .strict()

export const occurrenceCancelSchema = z
  .object({
    id: z.uuid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

/** `POST /api/activities/occurrences/{id}/absence` (E06-S13 #95): the assigned coach's optional reason. */
export const occurrenceAbsenceSchema = z
  .object({
    id: z.uuid(),
    reason: z.string().max(SUBSTITUTION_REASON_MAX).nullable().optional(),
  })
  .strict()

/** `POST /api/activities/occurrences/{id}/coach` (E06-S13 #95): the substitute (or the own coach back) and a reason. */
export const occurrenceAssignCoachSchema = z
  .object({
    id: z.uuid(),
    coachPersonId: z.uuid(),
    reason: z.string().max(SUBSTITUTION_REASON_MAX).nullable().optional(),
  })
  .strict()

export const occurrenceListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['startAt', 'occurrenceDate', 'createdAt', 'updatedAt']).optional(),
  status: z.enum(OCCURRENCE_STATUSES).optional(),
  /** Sessions on or after this club-zone date (by slot date). */
  from: calendarDateSchema.optional(),
  /** Sessions on or before this club-zone date (by slot date). */
  to: calendarDateSchema.optional(),
  sectionId: z.uuid().optional(),
  groupId: z.uuid().optional(),
  activityId: z.uuid().optional(),
  needsReschedule: booleanQuery,
  /** E06-S13 #95: planned sessions without a coach ("Needing a coach"). */
  unassigned: flagQuery,
  /** E06-S13 #95: planned sessions that ended 24 hours ago or more ("Unsettled"). */
  unsettled: flagQuery,
})

/** The daily generator's input: `today` only for an operator run (the job uses the club's today). */
export const generateOccurrencesSchema = z.object({ today: calendarDateSchema.optional() }).strict()

// --- Declarations, policies and calendars (#32) ---

/** `POST /api/activities/attendance/declare`: one person's declaration for one session. */
export const attendanceDeclareSchema = z
  .object({
    occurrenceId: z.uuid(),
    personId: z.uuid(),
    declared: z.enum(DECLARED_VALUES),
  })
  .strict()

/** `POST /api/activities/declaration-links` (REQ-017): the address and the session of the public page it came from. */
export const declarationLinkRequestSchema = z
  .object({
    email: z.email().max(254),
    clubSlug: z.string().min(1).max(100),
    occurrencePublicRef: z.uuid(),
  })
  .strict()

/** `POST /api/activities/declaration-links/{token}` (REQ-017): whom and what; the session comes from the link. */
export const declarationLinkDeclareSchema = z
  .object({
    personId: z.uuid(),
    declared: z.enum(DECLARED_VALUES),
  })
  .strict()

/** `activities.attendance.declare_by_link`: the route's body plus the raw token from the path. */
export const declareByLinkSchema = declarationLinkDeclareSchema.extend({ token: z.string().min(1).max(200) }).strict()

/** `activities.declaration_links.send_reminders` (job): `now` replays another evening (operators, tests). */
export const sendRemindersSchema = z.object({ now: instantSchema.optional() }).strict()

/** `POST /api/activities/attendance/{id}/guardian-decision`. */
export const guardianDecisionSchema = z.object({ id: z.uuid(), approve: z.boolean() }).strict()

/** The most rows one check-off saves: a group's roster with room for guests (club spec *Group*). */
export const MAX_CHECK_OFF_ENTRIES = 300

/**
 * `PUT /api/activities/occurrences/{id}/attendance` (#33): the actual attendance of listed persons (`null` clears a
 * mark) and optionally closing the session; one entry per person, and something to do.
 */
export const attendanceMarkBodySchema = z
  .object({
    entries: z
      .array(z.object({ personId: z.uuid(), actual: z.enum(ACTUAL_ATTENDANCE).nullable() }).strict())
      .max(MAX_CHECK_OFF_ENTRIES),
    complete: z.boolean().optional(),
  })
  .strict()

export const attendanceMarkSchema = attendanceMarkBodySchema.extend({ id: z.uuid() }).superRefine((value, ctx) => {
  const seen = new Set<string>()
  value.entries.forEach((entry, index) => {
    if (seen.has(entry.personId)) {
      ctx.addIssue({ code: 'custom', path: ['entries', index, 'personId'], message: 'duplicate_person' })
    }
    seen.add(entry.personId)
  })
  if (value.entries.length === 0 && value.complete !== true) {
    ctx.addIssue({ code: 'custom', path: ['entries'], message: 'nothing_to_save' })
  }
})

/** The expiry job's input: `now` only for an operator or test run (the job uses the clock). */
export const expireConfirmationsSchema = z.object({ now: instantSchema.optional() }).strict()

const policyShape = {
  scope: z.enum(POLICY_SCOPES),
  groupId: z.uuid().nullable().optional(),
  activityType: z.enum(ACTIVITY_TYPES).nullable().optional(),
  minorDeclarationMode: z.enum(MINOR_DECLARATION_MODES),
  confirmTimeoutHours: z.number().int().min(1).max(MAX_CONFIRM_TIMEOUT_HOURS).optional(),
  defaultAfterTimeout: z.enum(TIMEOUT_DEFAULTS).optional(),
}

export const attendancePolicyCreateSchema = z.object(policyShape).strict()

/** The scope of a policy is fixed; the mode, the limit and the default may change. */
export const attendancePolicyUpdateSchema = z
  .object({
    id: z.uuid(),
    minorDeclarationMode: z.enum(MINOR_DECLARATION_MODES).optional(),
    confirmTimeoutHours: z.number().int().min(1).max(MAX_CONFIRM_TIMEOUT_HOURS).optional(),
    defaultAfterTimeout: z.enum(TIMEOUT_DEFAULTS).optional(),
  })
  .strict()

export const attendancePolicyDeleteSchema = z.object({ id: z.uuid() }).strict()

export const attendancePolicyListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['scope', 'createdAt', 'updatedAt']).optional(),
  scope: z.enum(POLICY_SCOPES).optional(),
  groupId: z.uuid().optional(),
})

/** `GET /api/activities/calendar`: the role the caller reads as, the club-zone range and an optional ward. */
export const CALENDAR_PERSPECTIVES = ['self', 'guardian', 'coach', 'coordinator'] as const
export type CalendarPerspective = (typeof CALENDAR_PERSPECTIVES)[number]

export const calendarQuerySchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  as: z.enum(CALENDAR_PERSPECTIVES),
  personId: z.uuid().optional(),
  sectionId: z.uuid().optional(),
})

/** `GET /api/activities/calendar/{id}`: a participant, a guardian (optionally one ward) or the coach (E06-S15 #97). */
export const CALENDAR_ITEM_PERSPECTIVES = ['self', 'guardian', 'coach'] as const
export type CalendarItemPerspective = (typeof CALENDAR_ITEM_PERSPECTIVES)[number]

export const calendarItemQuerySchema = z.object({
  as: z.enum(CALENDAR_ITEM_PERSPECTIVES),
  personId: z.uuid().optional(),
})
