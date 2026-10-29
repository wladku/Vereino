// Request schemas of `activities`, shared by routes (OpenAPI) and commands. Public schemas never accept tenant or
// organization ids (`.strict()` rejects them). The recurrence rule is the stored text of the foundation II subset
// (`FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630`, optionally with an `EXDATE:` line); the foundation's parse service answers
// 422 `recurrence_unsupported` / `recurrence_invalid`. Wall times are club-zone `HH:mm` or `HH:mm:ss`.
import { z } from 'zod'
import { isLocalTime } from '@vereino/core'
import { calendarDateSchema } from '@/modules/foundation'
import { ACTIVITY_TYPES, OCCURRENCE_STATUSES } from '../lib/activities-rules'

const nameSchema = z.string().trim().min(1).max(200)
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const localTimeSchema = z.string().refine(isLocalTime, { message: 'Expected a HH:mm wall time' })
const instantSchema = z.iso.datetime({ offset: true })
const externalTeamIds = z.array(z.uuid()).max(50)
const booleanQuery = z.enum(['true', 'false']).optional()

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
  })
  .strict()

export const occurrenceCancelSchema = z
  .object({
    id: z.uuid(),
    reason: z.string().trim().min(1).max(500),
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
})

/** The daily generator's input: `today` only for an operator run (the job uses the club's today). */
export const generateOccurrencesSchema = z.object({ today: calendarDateSchema.optional() }).strict()
