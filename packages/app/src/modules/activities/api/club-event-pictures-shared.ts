// What the picture routes of a club event share (event photos spec REQ-I03, REQ-I04; #872): the picture as its
// managers see it after a write, and its schema. Never an attachment id (DD-I12).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { PictureCommandResult } from '../commands/club-event-pictures'
import { CLUB_EVENT_PICTURE_KINDS } from '../lib/club-event-files'
import { clubEventPictureView } from '../services/club-event-pictures'

const markSchema = z.object({ id: z.uuid(), displayName: z.string() })

export const pictureViewSchema = z.object({
  id: z.uuid(),
  kind: z.enum(CLUB_EVENT_PICTURE_KINDS),
  description: z.string(),
  position: z.number().int(),
  state: z.enum(['draft', 'unconfirmed', 'waiting_for_consent', 'event_not_public', 'public']),
  marks: z.array(markSchema),
  missingConsent: z.array(markSchema),
  missingConsentCount: z.number().int(),
  peopleConfirmed: z.boolean(),
  peopleConfirmedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().describe('The picture’s lock token.'),
})

export const pictureResponseSchema = z.object({
  ok: z.literal(true),
  actingRole: z.string(),
  picture: pictureViewSchema.nullable(),
})

export const pictureParamsSchema = z.object({ id: z.uuid(), fileId: z.uuid() })

/** Runs a picture command with the route's ids and body and answers the picture after it. */
export async function runPictureCommand(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
  commandId: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  try {
    const { id, fileId } = pictureParamsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, PictureCommandResult>(commandId, { input: { ...body, clubEventId: id, id: fileId }, ctx })
    return Response.json({
      ok: true,
      actingRole: result.actingRole,
      picture: await clubEventPictureView(ctx.container, scope, id, fileId),
    })
  } catch (error: unknown) {
    return errorResponse(error, commandId)
  }
}

/** The JSON body of a request as an object (an empty or invalid body is `{}`; the command's schema decides). */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => ({}))
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
}
