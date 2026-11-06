// Shared pieces of the `communication` routes: the request reader (`Viewer`), the command call, the query parsing and
// the OpenAPI schemas. Scope comes only from the session; every read goes through `services/threads.ts`, which
// applies the visibility rule (DD-M12) and the household rule (R15).
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { commandContextForRequest } from '@/modules/foundation'
import { viewerOf, type Viewer } from '../services/threads'

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

/** The command context and the reader of an authenticated request, or a 401 response. */
export async function requestReader(
  request: Request,
): Promise<{ ctx: CommandRuntimeContext; viewer: Viewer } | Response> {
  const ctx = await commandContextForRequest(request)
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const viewer = await viewerOf(ctx)
  if (!viewer) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return { ctx, viewer }
}

/** The 404 of an unknown record. */
export async function notFoundResponse(): Promise<Response> {
  const { translate } = await resolveTranslations()
  return Response.json({ error: translate('foundation.errors.not_found', 'Not found') }, { status: 404 })
}

export async function runCommand<TResult>(
  ctx: CommandRuntimeContext,
  commandId: string,
  input: Record<string, unknown>,
): Promise<TResult> {
  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  const { result } = await commandBus.execute<unknown, TResult>(commandId, { input, ctx })
  return result
}

/** The JSON body of a request as an object (anything else is an empty object, so validation answers 400). */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => ({}))
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}

export function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries())
}

export const scopeTypeSchema = z.enum(['club', 'section', 'group', 'activity', 'occurrence', 'direct'])

export const threadListItemSchema = z.object({
  id: z.uuid(),
  scopeType: scopeTypeSchema,
  scopeId: z.string().nullable(),
  scopeLabel: z.string().nullable().describe('The section, group, activity or session name; null for club and direct'),
  subject: z.string(),
  authorName: z.string().nullable().describe('Null for a session thread the system opened'),
  isCase: z.boolean(),
  caseOpenedAt: z.string().nullable().describe('When the thread was marked as a case; null when it is not one'),
  caseOpenedByName: z.string().nullable().describe('Who marked the thread as a case; null when it is not one'),
  lastMessageAt: z.string().describe('The newest message the reader sees'),
  createdAt: z.string(),
  messageCount: z.number().describe('Messages the reader sees'),
  lastMessage: z
    .object({
      authorName: z
        .string()
        .nullable()
        .describe('Null for a system message; the person who cancelled for a cancellation notice (#139)'),
      system: z.boolean(),
      createdAt: z.string(),
    })
    .nullable()
    .describe('The newest message the reader sees, their own included; never another family’s author (R15)'),
  unread: z.boolean(),
})

export const threadListSchema = z.object({
  items: z.array(threadListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
})

export const threadMessageSchema = z.object({
  id: z.uuid(),
  authorName: z
    .string()
    .nullable()
    .describe('Null for an anonymous system message; the person who cancelled for a cancellation notice (#139)'),
  own: z.boolean(),
  actingRole: z
    .string()
    .describe(
      'The role the message was written in (R01); `system` for a system message, the role of the canceller for a cancellation notice (#139)',
    ),
  audience: z.enum(['all', 'staff']).describe('`staff`: a member reply, shown to the staff and the household only'),
  body: z.string().nullable().describe('The latest revision; null when deleted'),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deleted: z.boolean(),
  system: z.boolean(),
  recipientCount: z.number(),
  hasDeliveries: z.boolean(),
  canDelete: z
    .boolean()
    .describe('The reader may delete it: its author, the section coordinator or the administrator, while not a case'),
  deliveryCounts: z
    .object({ queued: z.number(), sent: z.number(), failed: z.number(), skipped: z.number() })
    .nullable()
    .describe('Deliveries (one per recipient and channel) by status, for a reader who sees the delivery status'),
  emailCounts: z
    .object({ queued: z.number(), sent: z.number(), failed: z.number(), skipped: z.number() })
    .nullable()
    .describe('The e-mail deliveries of the reader’s own message by status; null for another author’s message'),
})

export const threadDetailSchema = threadListItemSchema.omit({ messageCount: true, lastMessage: true }).extend({
  updatedAt: z.string().describe('The lock token of edits and deletions'),
  staff: z.boolean(),
  canSeeDeliveries: z.boolean(),
  canMarkCase: z
    .boolean()
    .describe('The reader may mark the thread as a case: not a case yet, its section coordinator or the administrator'),
  messages: z.array(threadMessageSchema),
})

export const commandResponseSchema = z.object({
  ok: z.literal(true),
  threadId: z.uuid(),
  messageId: z.uuid(),
  dispatchId: z.string().nullable(),
  actingRole: z.string(),
  updatedAt: z.string(),
})
