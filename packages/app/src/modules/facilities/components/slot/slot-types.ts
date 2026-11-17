// The contract between the slot dialog and its kind bodies (facilities parity spec `SlotDialog`; #277): the dialog owns
// the place, the times and the outcome area (the start field's issues, the collision list, the form's problem); each
// body owns its own fields, its form and its write, and reports back through `report`.
import type { IssueMessage } from '../rental-issues'
import type { CollisionLine } from './slot-client'

export type SlotReport = {
  pending: (pending: boolean) => void
  /** The issues shown at the dialog's start field (`zone_not_reservable`, `place_closed`, …). */
  startIssues: (messages: IssueMessage[]) => void
  /** The colliding entries of a refused save ("from–to label"), or null to clear them. */
  collisions: (lines: CollisionLine[] | null) => void
  problem: (text: string | null) => void
}

export type SlotBodyProps = {
  formId: string
  placeId: string
  /** The chosen start and end as ISO instants; null while the times are incomplete. */
  startsAt: string | null
  endsAt: string | null
  timeZone: string
  disabled: boolean
  report: SlotReport
  /** Called after a save with the success message; the dialog closes and refreshes. */
  onDone: (message: string) => Promise<void>
}
