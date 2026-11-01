// Shared pieces of the bulk import routes (`/api/people/imports/**`, #28; club spec API table): every method requires
// `people.manage` and `people.pesel.view` (the file and the rows carry PESEL numbers), the session's trusted scope and
// the caller's `club_admin` grant (`assertInScope`); and the OpenAPI schemas of the import and its rows.
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import {
  assertInScope,
  commandContextForRequest,
  scopeContract,
  trustedScopeOf,
  type TrustedScope,
} from '@/modules/foundation'

export const IMPORT_FEATURES = ['people.manage', 'people.pesel.view']

export type ImportRouteContext = { ctx: CommandRuntimeContext; scope: TrustedScope }

/** The command context of the request with its trusted scope, or null without a session (the route answers 401). */
export async function importRouteContext(request: Request): Promise<ImportRouteContext | null> {
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  if (!ctx?.auth || !scope) return null
  return { ctx, scope }
}

/** 403 `scope_denied` unless the caller administers the club (the imports are club-wide). */
export async function assertImportReader({ ctx, scope }: ImportRouteContext): Promise<void> {
  await assertInScope(await scopeContract.resolve(ctx), ['club_admin'], { id: scope.organizationId, ...scope })
}

export const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })
export const notFoundResponse = (): Response => Response.json({ error: 'Not found' }, { status: 404 })

const personValuesSchema = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  birthDate: z.string().nullable(),
  pesel: z.string().nullable(),
  externalId: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
})

const personRefSchema = z.object({ personId: z.uuid(), name: z.string().nullable() })

const summarySchema = z
  .object({
    new: z.number().optional(),
    matched: z.number().optional(),
    review: z.number().optional(),
    error: z.number().optional(),
    created: z.number().optional(),
    updated: z.number().optional(),
    linked: z.number().optional(),
    skipped: z.number().optional(),
    membershipsPending: z.number().optional(),
    membershipsCreated: z.number().optional(),
    membershipsExisting: z.number().optional(),
  })
  .describe(
    'Counts per classification; after the commit also what it created, updated, linked and skipped, and the group memberships created, already existing and still waiting',
  )

export const importViewSchema = z.object({
  id: z.uuid(),
  status: z.enum(['previewed', 'committed', 'cancelled']),
  fileFormat: z.enum(['csv', 'xlsx']),
  rowCount: z.number(),
  summary: summarySchema,
  header: z.array(z.string()),
  mapping: z.record(z.string(), z.number().optional()),
  createdBy: personRefSchema,
  committedBy: personRefSchema.nullable(),
  createdAt: z.string(),
  committedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  purgedAt: z.string().nullable(),
  fileAvailable: z.boolean(),
  pendingDecisions: z.number(),
  canCreateMemberships: z
    .boolean()
    .describe('Committed, with rows waiting for a membership, and `groups` registers its hook: a commit re-run helps'),
  updatedAt: z.string(),
})

export const importRowViewSchema = z.object({
  id: z.uuid(),
  rowNo: z.number(),
  classification: z.enum(['new', 'matched', 'review', 'error']),
  decision: z.enum(['match', 'create', 'skip']).nullable(),
  decisionPerson: personRefSchema.nullable(),
  matchedPerson: personRefSchema.nullable(),
  errorCode: z.string().nullable().describe('Row problem, e.g. `import_date_invalid`, `import_row_duplicate`'),
  errorColumn: z.string().nullable().describe('The header of the column with the problem, never the cell value'),
  reviewReason: z.string().nullable(),
  needsDecision: z.boolean(),
  groupName: z.string().nullable(),
  membershipStatus: z
    .string()
    .nullable()
    .describe(
      'After the commit, for a row with a group (D-026): waiting with the reason `groups_not_enabled`, `group_not_found` or `group_ambiguous`; done as `membership_created`, `membership_existed` or `participant_missing`',
    ),
  membershipPreview: z
    .enum(['group_found', 'group_not_found', 'group_ambiguous', 'groups_not_enabled'])
    .nullable()
    .describe('Before the commit, for a row with a group: what the commit would do with it'),
  committedAt: z.string().nullable(),
  participantPersonId: z
    .uuid()
    .nullable()
    .describe('After the commit: the person the row participant became; null before the commit or without one'),
  values: z
    .object({
      persons: z.object({
        participant: personValuesSchema.optional(),
        guardian1: personValuesSchema.optional(),
        guardian2: personValuesSchema.optional(),
      }),
      group: z.string().nullable(),
    })
    .nullable(),
  updatedAt: z.string(),
})

export const pagedSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), total: z.number(), page: z.number(), pageSize: z.number(), totalPages: z.number() })
