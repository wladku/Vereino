// `POST /api/groups/memberships/move-many` — `groups.memberships.move_many` (people life-cycle spec REQ-L15, DD-L16,
// *API* row; #383): moves several participants of one roster to another group from `date`. With `dryRun` it previews
// per child the outcome (moved, already a member of the target group, not active on that day), the declarations the
// move drops, the fee note and the age fit, and returns the `previewToken` (15 minutes); the apply sends that token and
// moves every movable child, or none, in one transaction with one undo token; `{ undoToken }` undoes the caller's own
// move (the roster's success toast). The caller holds `groups.manage` and both groups lie in their scope.
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { groupsErrors } from '../../../api/errors'
import { previewMoveMany, type MoveManyResult } from '../../../commands/memberships'
import { membershipMoveManySchema } from '../../../data/validators'
import { MOVE_OUTCOMES } from '../../../lib/groups-rules'
import { errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
}

const previewItemSchema = z.object({
  membershipId: z.uuid(),
  personId: z.uuid(),
  person: z.object({ firstName: z.string(), lastName: z.string() }).nullable(),
  outcome: z.enum(MOVE_OUTCOMES),
  futureDeclarations: z
    .number()
    .int()
    .describe("The declarations for the old group's sessions from `date` on that the move drops."),
  feeNote: z
    .enum(['month_charged_once'])
    .nullable()
    .describe("A moved child's month is charged once, in the group of the period's reference day (DD-L15)."),
  fitsTarget: z
    .boolean()
    .nullable()
    .describe(
      'The child fits the target by `fitRule` (birth year or age on `date`); null without a rule or a birth date.',
    ),
})

const fitRuleSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('birth_years'),
      uFrom: z.number().int(),
      uTo: z.number().int().nullable(),
      referenceYear: z.number().int(),
      from: z.number().int().nullable(),
      to: z.number().int(),
    }),
    z.object({ kind: z.literal('age'), ageFrom: z.number().int().nullable(), ageTo: z.number().int().nullable() }),
  ])
  .nullable()
  .describe(
    'The rule of the Fits filter: a team whose age category has a U range fits by birth year (`from`…`to`) in the reference year of its season (or of the move date); any other group by age on `date` within its age range; null without either (AC-L16).',
  )

const previewSchema = z.object({
  fromGroupId: z.uuid(),
  toGroupId: z.uuid(),
  date: z.string(),
  items: z.array(previewItemSchema),
  moved: z.number().int(),
  skipped: z.number().int(),
  futureDeclarations: z.number().int(),
  fitRule: fitRuleSchema,
  previewToken: z.string(),
})

const applySchema = z.object({
  moved: z.number().int(),
  skipped: z.number().int(),
  undoToken: z.string().nullable(),
})

const undoSchema = z.object({ undoToken: z.string().min(1).max(200) }).strict()

type MoveManyLog = {
  commandId?: string | null
  actorUserId?: string | null
  tenantId?: string | null
  organizationId?: string | null
  executionState?: string | null
}

/**
 * Undoes a bulk move with its undo token (the dialog's success toast, REQ-L15): only the caller's own move of the
 * caller's club, still undoable; the command's replay check then confirms both groups are in the caller's scope. A
 * coordinator holds `groups.manage` but not the platform's `audit_logs.undo_self`, so the roster's Undo goes here.
 */
async function undoMoveMany(ctx: CommandRuntimeContext, undoToken: string): Promise<void> {
  const log = await ctx.container
    .resolve<{ findByUndoToken(token: string): Promise<MoveManyLog | null> }>('actionLogService')
    .findByUndoToken(undoToken)
  const scope = trustedScopeOf(ctx)
  const own =
    log !== null &&
    log.commandId === 'groups.memberships.move_many' &&
    log.executionState === 'done' &&
    Boolean(ctx.auth?.sub) &&
    log.actorUserId === ctx.auth?.sub &&
    scope !== null &&
    log.tenantId === scope.tenantId &&
    log.organizationId === scope.organizationId
  if (!own) await groupsErrors.throw('groups_reference_invalid', { field: 'undoToken' })
  await ctx.container.resolve<CommandBus>('commandBus').undo(undoToken, ctx)
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    if ('undoToken' in fields) {
      await undoMoveMany(ctx, undoSchema.parse(body).undoToken)
      return Response.json({ ok: true })
    }
    if (fields.dryRun === true) {
      const { preview, previewToken } = await previewMoveMany(ctx, body)
      return Response.json({ ...preview, previewToken }, { headers: { 'cache-control': 'private, no-store' } })
    }
    const executed = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, MoveManyResult>('groups.memberships.move_many', { input: body, ctx })
    const result = executed.result
    const logEntry: unknown = executed.logEntry
    const undoToken = (logEntry as { undoToken?: unknown } | null | undefined)?.undoToken
    return Response.json({
      moved: result.snapshot.moves.length,
      skipped: result.snapshot.skipped,
      undoToken: typeof undoToken === 'string' ? undoToken : null,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.memberships.move_many')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'Move several children to another group',
  methods: {
    POST: {
      summary: 'Move several participants of a roster to another group',
      description:
        "Moves 1–100 participant memberships of `fromGroupId` to `toGroupId` from `date` (today or later). With `dryRun: true` the response previews per child the outcome — `move`, `skip_already_member` (a participant of the target group on that date) or `skip_not_active` (not active in the source group on the day before `date`) — the declarations for the old group's later sessions that will be dropped, the fee note and the age fit, with a `previewToken` valid 15 minutes. The apply sends the same request with that token and moves every child the preview listed as movable, or none, in one transaction: each old membership ends the day before `date` and a participant membership starts in the target group on `date`. The response carries one `undoToken`; sending `{ undoToken }` alone undoes the caller's own move, restoring both groups and the dropped declarations together. Errors: 403 `scope_denied` (either group outside the caller's sections), 404 (the source group), 409 `move_preview_stale` (a membership or declaration changed after the preview, or the token expired), 422 `move_same_group`, `move_target_inactive`, `move_date_in_past`, `move_too_many` (more than 100), `groups_reference_invalid` (a membership that is not a participant of the source group, or an undo token that is not the caller's undoable move).",
      requestBody: { contentType: 'application/json', schema: z.union([membershipMoveManySchema, undoSchema]) },
      responses: [
        {
          status: 200,
          description: 'The preview (`dryRun`), the applied move, or `{ ok: true }` for an undo',
          schema: z.union([previewSchema, applySchema, z.object({ ok: z.literal(true) })]),
        },
      ],
      errors: [
        { status: 400, description: 'Invalid body', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'move_preview_stale', schema: errorSchema },
        {
          status: 422,
          description:
            'move_same_group, move_target_inactive, move_date_in_past, move_too_many or groups_reference_invalid',
          schema: errorSchema,
        },
      ],
    },
  },
}
