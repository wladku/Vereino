// The response shape of a departure request (people life-cycle spec *API* rows; phase L4, #306).
import { z } from 'zod'

export const departureRequestSchema = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  subjectPersonId: z.uuid(),
  subjectName: z.string(),
  requestedByPersonId: z.uuid().nullable(),
  requestedByName: z.string().nullable(),
  requesterKind: z.enum(['self', 'guardian', 'club']),
  requestedLastDay: z.string().nullable(),
  erasureRequested: z.boolean(),
  note: z.string().nullable(),
  status: z.enum(['open', 'done', 'declined']),
  declineReason: z.string().nullable(),
  decidedAt: z.string().nullable(),
  otherGuardianCount: z
    .number()
    .int()
    .describe("A guardian's request: the number of the child's other active guardians, who did not ask"),
  createdAt: z.string(),
  updatedAt: z.string(),
})
