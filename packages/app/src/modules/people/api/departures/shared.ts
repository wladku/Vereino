// The response shape of a departure plan (`/api/people/departures/preview`; people life-cycle spec phase L4, #306).
import { z } from 'zod'
import type { DeparturePlan } from '../../services/departure-plan'

const itemSchema = z.object({
  module: z.string(),
  kind: z.string(),
  recordId: z.string(),
  personId: z.uuid(),
  action: z.enum(['end', 'remove']),
  until: z.string().nullable(),
  label: z.record(z.string(), z.string().nullable()),
})

const noticeSchema = z.object({
  module: z.string(),
  code: z.string(),
  personId: z.uuid(),
  wardPersonId: z.uuid().optional(),
  leftOn: z.string().optional(),
  recordId: z.string().optional(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
})

export const departurePlanSchema = z.object({
  lastDay: z.string(),
  blocked: z.boolean(),
  persons: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      leftOn: z.string().nullable(),
      ends: z.array(itemSchema),
      warnings: z.array(noticeSchema),
      blockers: z.array(noticeSchema),
      choicesNeeded: z.array(
        z.object({ wardPersonId: z.uuid(), personId: z.uuid(), candidateGuardianPersonIds: z.array(z.uuid()) }),
      ),
      handOvers: z
        .array(
          z.object({
            module: z.string(),
            personId: z.uuid(),
            groupId: z.uuid(),
            groupName: z.string().nullable(),
            sessions: z.number().int(),
            activities: z.number().int(),
          }),
        )
        .describe(
          'The groups of a leaving coach that need a hand-over choice: future sessions and default-coach activities',
        ),
    }),
  ),
  suggestedPersons: z.array(
    z.object({
      personId: z.uuid(),
      name: z.string(),
      reason: z.enum(['guardian_of_nobody_else', 'ward_of_leaving_guardian']),
    }),
  ),
  names: z.record(z.string(), z.string()).describe('Display names of the other persons the plan names'),
})

/** The plan without the rows the command writes. */
export function departurePlanView(plan: DeparturePlan) {
  return {
    lastDay: plan.lastDay,
    blocked: plan.blocked,
    persons: plan.persons,
    suggestedPersons: plan.suggestedPersons,
    names: plan.names,
  }
}
