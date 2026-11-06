// Input schemas of the `communication` commands and routes (foundation III *API, Command, and Error Contracts*).
import { z } from 'zod'
import { AUDIENCE_KINDS } from '@vereino/core'
import { DIRECT_TARGETS } from '../lib/direct-rules'

/** Club text limits: a subject is one line, a message a few screens (it is e-mailed in full). */
export const SUBJECT_MAX = 200
export const BODY_MAX = 10_000

const subject = z.string().trim().min(1).max(SUBJECT_MAX)
const body = z.string().trim().min(1).max(BODY_MAX)

export const audienceSchema = z
  .object({
    kind: z.enum(AUDIENCE_KINDS),
    ids: z.array(z.uuid()).max(200).optional(),
  })
  .strict()
  .refine((value) => value.kind === 'club' || (value.ids?.length ?? 0) > 0, {
    message: 'Choose who receives the message',
    path: ['ids'],
  })
  .refine((value) => value.kind === 'persons' || (value.ids?.length ?? 0) <= 1, {
    message: 'An announcement addresses one target',
    path: ['ids'],
  })

export type AudienceInput = z.output<typeof audienceSchema>

export const threadCreateSchema = z.object({ audience: audienceSchema, subject, body }).strict()

/**
 * `communication.threads.start_direct` (DD-M18): a member writes about a household member (`personId`: themself or a
 * ward) to the coaches of a group that member takes part in today, or to the coordinators of its section.
 */
export const directThreadSchema = z
  .object({ personId: z.uuid(), groupId: z.uuid(), to: z.enum(DIRECT_TARGETS), subject, body })
  .strict()

export const audiencePreviewSchema = z.object({ audience: audienceSchema }).strict()

export const threadReplySchema = z.object({ threadId: z.uuid(), body }).strict()

export const messageReviseSchema = z.object({ threadId: z.uuid(), messageId: z.uuid(), body }).strict()

export const messageDeleteSchema = z.object({ threadId: z.uuid(), messageId: z.uuid() }).strict()

export const threadReadSchema = z.object({ threadId: z.uuid() }).strict()

/** `communication.threads.mark_case`: the thread; its version travels in the optimistic-lock header (S5.2). */
export const threadMarkCaseSchema = z.object({ threadId: z.uuid() }).strict()

/** The cancellation subscriber's command input: the session and the cancellation's event key (S4.6). */
export const cancellationSchema = z
  .object({
    occurrenceId: z.uuid(),
    eventKey: z.string().min(1).max(200),
    actorUserId: z.uuid().nullable().optional(),
  })
  .strict()

export const threadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  scopeType: z.enum(['club', 'section', 'group', 'activity', 'occurrence', 'direct']).optional(),
  scopeId: z.uuid().optional(),
  sectionId: z
    .uuid()
    .optional()
    .describe(
      'The threads of a section, its groups, activities and sessions; a section outside the caller’s grants lists nothing',
    ),
  wardId: z
    .uuid()
    .optional()
    .describe(
      'The threads about one of the caller’s wards (E06-S20): its groups’ and their sections’ threads and the direct threads it takes part in; another person lists nothing',
    ),
  unread: z.enum(['0', '1']).optional(),
  isCase: z.enum(['0', '1']).optional(),
  as: z.enum(['member', 'staff']).optional(),
})

export const deliveriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  problems: z.enum(['0', '1']).optional(),
  messageId: z.uuid().optional(),
})

export const targetsQuerySchema = z.object({
  kind: z.enum(['section', 'group', 'activity', 'occurrence']).optional(),
  q: z.string().trim().max(100).optional(),
})

export const shareTextQuerySchema = z
  .object({ occurrenceId: z.uuid().optional(), threadId: z.uuid().optional() })
  .refine((value) => Boolean(value.occurrenceId) !== Boolean(value.threadId), {
    message: 'Name either a session or a thread',
  })
