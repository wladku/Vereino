// The response shapes of the season rollover routes (people life-cycle spec REQ-L08, *API* rows; phase L9, #311).
import { z } from 'zod'

const labelSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
const seasonSchema = z.object({ id: z.uuid(), name: z.string(), startsOn: z.string(), endsOn: z.string() })

export const rolloverPreviewResponseSchema = z.object({
  fromSeason: seasonSchema,
  toSeason: seasonSchema.extend({ id: z.uuid().nullable(), created: z.boolean() }),
  lastDay: z.string().describe("The old season's last day: what the plan ends, ends on it"),
  groups: z
    .array(
      z.object({
        groupId: z.uuid(),
        sectionId: z.uuid(),
        name: z.string(),
        ageCategoryEntryId: z.uuid().nullable(),
        participants: z.number().int(),
        updatedAt: z.string(),
      }),
    )
    .describe("The old season's active groups in the caller's scope"),
  candidates: z
    .array(
      z.object({
        module: z.string(),
        kind: z.string(),
        recordId: z.uuid(),
        groupId: z.uuid(),
        version: z.string(),
        label: labelSchema,
      }),
    )
    .describe('The recurring activities and fees of those groups that a plan may end, end and copy, or keep'),
  items: z.array(
    z.object({
      module: z.string(),
      kind: z.string(),
      recordId: z.string().nullable(),
      groupId: z.string(),
      action: z.enum(['create', 'update', 'end', 'remove']),
      label: labelSchema,
    }),
  ),
  conflicts: z.array(
    z.object({
      module: z.string(),
      kind: z.string(),
      recordId: z.uuid(),
      groupId: z.uuid(),
      label: labelSchema,
      conflicts: z.array(z.unknown()),
    }),
  ),
  notices: z.array(
    z.object({
      module: z.string(),
      code: z.string(),
      groupId: z.string().optional(),
      params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    }),
  ),
  previewToken: z.string(),
})

export const rolloverSummarySchema = z.object({
  seasonId: z.uuid(),
  seasonCreated: z.boolean(),
  groups: z.object({
    continued: z.number().int(),
    renamed: z.number().int(),
    closed: z.number().int(),
    copied: z.number().int(),
  }),
  membershipsEnded: z.number().int(),
  modules: z.record(z.string(), z.number().int()).describe('Records changed per contributing module'),
  announced: z.number().int(),
})
