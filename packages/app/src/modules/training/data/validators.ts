// Input schemas of the `training` routes and commands (training outlines spec *API, Command, and Error Contracts*,
// *Data Models* → `training_outlines`; #683). The parts' shape and limits live in `lib/outline.ts`.
import { z } from 'zod'
import { OUTLINE_LANGUAGES, OUTLINE_LIMITS, OUTLINE_PARTS, outlinePartsSchema } from '../lib/outline'

const text = (max: number) => z.string().trim().max(max)

const contentShape = {
  language: z.enum(OUTLINE_LANGUAGES),
  topic: text(OUTLINE_LIMITS.topic.max).min(OUTLINE_LIMITS.topic.min),
  goal: text(OUTLINE_LIMITS.goal).default(''),
  specificGoals: text(OUTLINE_LIMITS.specificGoals).default(''),
  ageCategory: text(OUTLINE_LIMITS.ageCategory).min(1),
  durationMinutes: z.number().int().min(OUTLINE_LIMITS.duration.min).max(OUTLINE_LIMITS.duration.max),
  playersCount: z
    .number()
    .int()
    .min(OUTLINE_LIMITS.players.min)
    .max(OUTLINE_LIMITS.players.max)
    .nullable()
    .default(null),
  equipment: text(OUTLINE_LIMITS.equipment).default(''),
  parts: outlinePartsSchema,
}

/**
 * A new outline: an own outline, or written straight for one session (`occurrenceId`) or as the series outline of a
 * recurring activity (`activityId`); `groupId` files an own outline under a group the caller coaches.
 */
export const outlineCreateSchema = z
  .object({
    ...contentShape,
    occurrenceId: z.uuid().optional(),
    activityId: z.uuid().optional(),
    groupId: z.uuid().optional(),
  })
  .strict()
  .refine((value) => [value.occurrenceId, value.activityId].filter(Boolean).length <= 1, {
    message: 'Give a session or an activity, not both',
    path: ['activityId'],
  })

/** A change of the content; the lock token travels in the platform header. */
export const outlineUpdateSchema = z
  .object({
    id: z.uuid(),
    language: contentShape.language.optional(),
    topic: contentShape.topic.optional(),
    goal: text(OUTLINE_LIMITS.goal).optional(),
    specificGoals: text(OUTLINE_LIMITS.specificGoals).optional(),
    ageCategory: contentShape.ageCategory.optional(),
    durationMinutes: contentShape.durationMinutes.optional(),
    playersCount: z
      .number()
      .int()
      .min(OUTLINE_LIMITS.players.min)
      .max(OUTLINE_LIMITS.players.max)
      .nullable()
      .optional(),
    equipment: text(OUTLINE_LIMITS.equipment).optional(),
    parts: outlinePartsSchema.optional(),
  })
  .strict()

export const outlineDeleteSchema = z.object({ id: z.uuid() }).strict()

/** Copies an outline into a session, or makes it the series outline of a recurring activity (DD-O07). */
export const outlineAttachSchema = z
  .object({ id: z.uuid(), occurrenceId: z.uuid().optional(), activityId: z.uuid().optional() })
  .strict()
  .refine((value) => [value.occurrenceId, value.activityId].filter(Boolean).length === 1, {
    message: 'Give exactly one of occurrenceId and activityId',
    path: ['occurrenceId'],
  })

/** The session's own copy of its activity's series outline, made on first need (DD-O07); idempotent. */
export const ensureCopySchema = z.object({ occurrenceId: z.uuid() }).strict()

/** An image on one exercise (`multipart/form-data` fields next to `file`). */
export const imageTargetSchema = z
  .object({
    id: z.uuid(),
    part: z.enum(OUTLINE_PARTS),
    index: z.coerce
      .number()
      .int()
      .min(0)
      .max(OUTLINE_LIMITS.exercisesPerPart - 1),
  })
  .strict()

export const imageRemoveSchema = z.object({ id: z.uuid(), attachmentId: z.uuid() }).strict()

/** The copies a session life-cycle change asks for (the `activities.occurrence.generated` subscriber). */
export const sessionChangesSchema = z
  .object({
    createdIds: z.array(z.uuid()).max(5000).default([]),
    removedIds: z.array(z.uuid()).max(5000).default([]),
  })
  .strict()

/**
 * `GET /api/training/outlines`: `view` `mine` (the caller's own outlines not attached anywhere — the ones to pick
 * from), `sessions` or the default `all` the caller's grants admit; filters by age category, topic text, session and
 * activity.
 */
export const outlineListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortField: z.enum(['topic', 'createdAt', 'updatedAt']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
  view: z.enum(['all', 'mine', 'sessions', 'series']).optional(),
  search: z.string().trim().max(200).optional(),
  ageCategory: z.string().trim().max(OUTLINE_LIMITS.ageCategory).optional(),
  occurrenceId: z.uuid().optional(),
  activityId: z.uuid().optional(),
})
