// Shared pieces of the `enrolment` routes (#799): the error and response schemas, the sessionless command context, the
// no-store answers and the field errors of the public form.
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { Scope } from '@vereino/core'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const NO_STORE = { 'Cache-Control': 'no-store' } as const

export function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

/** The route parameters the API dispatcher passes. */
export type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> }

export async function routeParam(context: RouteContext, name: string): Promise<string> {
  const value = (await context.params)[name]
  return typeof value === 'string' ? value : ''
}

/** The context of a sessionless command: no session; the slug or the token names the club inside the command. */
export async function sessionlessContext(request: Request): Promise<CommandRuntimeContext> {
  const container = await createRequestContainer()
  return {
    container,
    auth: null,
    organizationScope: null,
    selectedOrganizationId: null,
    organizationIds: null,
    request,
  }
}

/** Runs a public route body; every answer carries `no-store`. */
export async function publicRoute(label: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return noStore(await run())
  } catch (error: unknown) {
    return noStore(errorResponse(error, label))
  }
}

/** 422 with the issues as field errors (`{ field: message }`), the way the form shows them at their step. */
export function fieldErrorResponse(issues: readonly z.core.$ZodIssue[]): Response {
  const fieldErrors: Record<string, string> = {}
  for (const issue of issues) {
    const field = issue.path.map(String).join('.') || 'form'
    if (!(field in fieldErrors)) fieldErrors[field] = issue.message
  }
  return Response.json(
    { error: 'Validation failed', code: 'application_field_invalid', fieldErrors },
    { status: 422, headers: NO_STORE },
  )
}

export const acceptedSchema = z.object({ status: z.literal('pending_confirmation') })

/** The trusted scope and grants of a signed-in caller, or a 401 answer. */
export type MemberContext =
  | {
      ok: true
      ctx: CommandRuntimeContext & { auth: { sub: string } }
      scope: { tenantId: string; organizationId: string }
      grants: Scope
    }
  | { ok: false; error: Response }

export async function memberContext(request: Request): Promise<MemberContext> {
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  const sub = ctx?.auth?.sub
  if (!ctx || !sub || !scope) return { ok: false, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const grants = await scopeContract.resolve(ctx)
  return { ok: true, ctx: ctx as CommandRuntimeContext & { auth: { sub: string } }, scope, grants }
}

export const flagSchema = z.enum(['outside_age', 'group_full', 'wants_trial', 'possible_duplicate', 'overdue'])

export const listItemSchema = z.object({
  id: z.uuid(),
  sectionId: z.uuid(),
  sectionName: z.string(),
  groupId: z.uuid().nullable(),
  groupName: z.string().nullable(),
  chooseForUs: z.boolean(),
  kind: z.enum(['child', 'adult']),
  state: z.string(),
  tab: z.enum(['new', 'trial', 'waiting', 'closed']).nullable(),
  participantName: z.string(),
  age: z.number().int().nullable().describe('Full years on the reference date'),
  referenceDate: z.string(),
  confirmedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  waitingNumber: z.number().int().nullable(),
  flags: z.array(flagSchema),
  updatedAt: z.string(),
})

export const decidedResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  state: z.string(),
  updatedAt: z.string(),
  waitingNumber: z.number().int().nullable().optional(),
})
