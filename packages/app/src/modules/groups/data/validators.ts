// Request schemas of `groups`, shared by routes (OpenAPI) and commands. Public schemas never accept tenant or
// organization ids (`.strict()` rejects them). The team-only fields are checked against the group's kind in the
// commands (the kind of an update comes from the stored row), so a class group with team fields answers 422.
import { z } from 'zod'
import { calendarDateSchema, refineValidity, validityShape } from '@/modules/foundation'
import { GROUP_AGE_MAX, GROUP_AGE_MIN, GROUP_KINDS, MEMBERSHIP_ROLES, ROSTER_VIEWS } from '../lib/groups-rules'
import { ROLLOVER_GROUP_ACTIONS, ROLLOVER_RECORD_ACTIONS } from '../lib/season-rollover'

const nameSchema = z.string().trim().min(1).max(200)
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
const booleanQuery = z.enum(['true', 'false']).optional()

const listQueryBase = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
  ids: z.string().optional(),
}

const searchQuery = z.string().trim().min(1).max(200).optional()

/** An age bound in years (#91); null clears it. The order of the two bounds is checked on the merged values. */
const ageSchema = z.number().int().min(GROUP_AGE_MIN).max(GROUP_AGE_MAX).nullable().optional()

/** The public fields of a group (club spec `groups_groups`, DD-29; #91). */
const publicShape = {
  isPublic: z.boolean().optional(),
  publicDescription: optionalText(4000),
  publicConditions: optionalText(4000),
  ageFrom: ageSchema,
  ageTo: ageSchema,
  levelLabel: optionalText(100),
}

// --- Groups ---

export const groupCreateSchema = z
  .object({
    sectionId: z.uuid(),
    name: nameSchema,
    kind: z.enum(GROUP_KINDS),
    ageCategoryEntryId: z.uuid().nullable().optional(),
    league: optionalText(200),
    seasonId: z.uuid().nullable().optional(),
    description: optionalText(4000),
    isActive: z.boolean().optional(),
    ...publicShape,
  })
  .strict()

export const groupUpdateSchema = z
  .object({
    id: z.uuid(),
    sectionId: z.uuid().optional(),
    name: nameSchema.optional(),
    kind: z.enum(GROUP_KINDS).optional(),
    ageCategoryEntryId: z.uuid().nullable().optional(),
    league: optionalText(200),
    seasonId: z.uuid().nullable().optional(),
    description: optionalText(4000),
    isActive: z.boolean().optional(),
    ...publicShape,
  })
  .strict()

export const groupDeleteSchema = z.object({ id: z.uuid() }).strict()

export const groupListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'kind', 'createdAt', 'updatedAt']).optional(),
  search: searchQuery,
  sectionId: z.uuid().optional(),
  kind: z.enum(GROUP_KINDS).optional(),
  seasonId: z.uuid().optional(),
  ageCategoryEntryId: z.uuid().optional(),
  isActive: booleanQuery,
  isPublic: booleanQuery,
})

// --- Memberships ---

export const membershipCreateSchema = z
  .object({
    groupId: z.uuid(),
    personId: z.uuid(),
    role: z.enum(MEMBERSHIP_ROLES),
    ...validityShape,
  })
  .strict()
  .superRefine(refineValidity)

export const membershipUpdateSchema = z
  .object({
    id: z.uuid(),
    role: z.enum(MEMBERSHIP_ROLES).optional(),
    validFrom: calendarDateSchema.optional(),
    validTo: calendarDateSchema.nullable().optional(),
  })
  .strict()

/** Ends a membership: `validTo` is its last active day (default: today in the club zone). */
export const membershipEndSchema = z
  .object({
    id: z.uuid(),
    validTo: calendarDateSchema.optional(),
  })
  .strict()

/**
 * Moves a membership to another group from `date` (people life-cycle spec REQ-L11, `groups.memberships.move`; #312):
 * `id` is the moved membership, the route's `membershipId`.
 */
export const membershipMoveSchema = z
  .object({
    id: z.uuid(),
    toGroupId: z.uuid(),
    date: calendarDateSchema,
  })
  .strict()

/**
 * Moves several participants of one roster to another group from `date` (people life-cycle spec REQ-L15, *API* row
 * `groups.memberships.move_many`; #383). The list is capped by the command (422 `move_too_many` above 100), so the
 * schema accepts a little more to answer with that code; `dryRun` previews, the apply sends the preview's token.
 */
export const membershipMoveManySchema = z
  .object({
    fromGroupId: z.uuid(),
    toGroupId: z.uuid(),
    date: calendarDateSchema,
    membershipIds: z
      .array(z.uuid())
      .min(1)
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'membershipIds must be unique' }),
    dryRun: z.boolean().optional(),
    previewToken: z.string().max(200).optional(),
  })
  .strict()

export type MembershipMoveManyInput = z.infer<typeof membershipMoveManySchema>

/** Removes a membership entered by mistake (`?id=`, parity spec REQ-A03). */
export const membershipDeleteSchema = z.object({ id: z.uuid() }).strict()

export const membershipListQuerySchema = z.object({
  ...listQueryBase,
  /** `roster`: coaches, then assistants, then participants; the latest start first within a role (REQ-A03). */
  sortField: z.enum(['validFrom', 'createdAt', 'updatedAt', 'roster']).optional(),
  groupId: z.uuid().optional(),
  personId: z.uuid().optional(),
  role: z.enum(MEMBERSHIP_ROLES).optional(),
  /** Only the memberships active on this calendar day. */
  activeOn: calendarDateSchema.optional(),
  /** A roster view on the club's today: `active`, `upcoming` (starts later) or `ended` (the history; REQ-A03). */
  status: z.enum(ROSTER_VIEWS).optional(),
})

// --- Seasons ---

export const seasonCreateSchema = z
  .object({
    name: nameSchema,
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema,
  })
  .strict()

export const seasonUpdateSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema.optional(),
    startsOn: calendarDateSchema.optional(),
    endsOn: calendarDateSchema.optional(),
  })
  .strict()

export const seasonDeleteSchema = z.object({ id: z.uuid() }).strict()

export const seasonListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'startsOn', 'createdAt', 'updatedAt']).optional(),
  search: searchQuery,
})

// --- Season rollover (people life-cycle spec REQ-L08, *Vocabulary* → "Season rollover plan"; #311) ---

/** The new season: an existing one, or one the plan creates. */
const rolloverSeasonSchema = z.union([
  z.object({ id: z.uuid() }).strict(),
  z.object({ name: nameSchema, startsOn: calendarDateSchema, endsOn: calendarDateSchema }).strict(),
])

const rolloverGroupSchema = z
  .object({
    groupId: z.uuid(),
    action: z.enum(ROLLOVER_GROUP_ACTIONS),
    /** `rename` and `copy`: the new name. */
    name: nameSchema.nullable().optional(),
    /** `rename` and `copy` of a team: the new age category (a `dictionaries` entry id); null clears it. */
    ageCategoryEntryId: z.uuid().nullable().optional(),
  })
  .strict()

/** The values an `end_and_copy` copy changes; each contributor checks the keys it understands (422 otherwise). */
const rolloverCopySchema = z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.null()]))

const rolloverRecordSchema = z
  .object({
    recordId: z.uuid(),
    action: z.enum(ROLLOVER_RECORD_ACTIONS),
    copy: rolloverCopySchema.optional(),
  })
  .strict()

const rolloverPlanShape = {
  fromSeasonId: z.uuid(),
  season: rolloverSeasonSchema,
  groups: z.array(rolloverGroupSchema).max(200).default([]),
  records: z.array(rolloverRecordSchema).max(1000).default([]),
}

/** `POST /api/groups/seasons/rollover/preview`. */
export const rolloverPreviewSchema = z.object(rolloverPlanShape).strict()

/** `POST /api/groups/seasons/rollover` — `groups.seasons.rollover`. */
export const rolloverApplySchema = z
  .object({
    ...rolloverPlanShape,
    previewToken: z.string().min(1).max(200),
    announce: z.boolean().default(false),
  })
  .strict()

export type RolloverPreviewInput = z.output<typeof rolloverPreviewSchema>

// --- External teams ---

export const externalTeamCreateSchema = z
  .object({
    name: nameSchema,
    clubName: optionalText(200),
    institutionId: z.uuid().nullable().optional(),
    contact: optionalText(1000),
    notes: optionalText(4000),
  })
  .strict()

export const externalTeamUpdateSchema = z
  .object({
    id: z.uuid(),
    name: nameSchema.optional(),
    clubName: optionalText(200),
    institutionId: z.uuid().nullable().optional(),
    contact: optionalText(1000),
    notes: optionalText(4000),
  })
  .strict()

export const externalTeamDeleteSchema = z.object({ id: z.uuid() }).strict()

export const externalTeamListQuerySchema = z.object({
  ...listQueryBase,
  sortField: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
  search: searchQuery,
})
