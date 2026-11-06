// Pure rules of the member inbox on the phone (E06-S20, #102; README M-06, M-07; club spec REQ-009, REQ-010): which
// threads are about a guardian's ward (its groups', their sections' and its direct threads; never a club-wide one), which audience kinds the member composer offers, and the e-mail delivery
// summary under an author's own message. Shared by the read service and the member pages; nothing here touches the
// database or the browser.
import type { AudienceKind } from '@vereino/core'

/** What makes a thread one about a ward: its groups, those groups' sections, and the ward taking part itself. */
export type WardThreads = { personId: string; groupIds: string[]; sectionIds: string[] }

/**
 * The threads about a ward from its group memberships (any period: a thread of a former group still concerns it) and
 * the sections of those groups; a group the directory no longer knows adds no section.
 */
export function wardThreadsOf(
  personId: string,
  memberships: ReadonlyArray<{ groupId: string }>,
  sectionOfGroup: ReadonlyMap<string, { sectionId: string }>,
): WardThreads {
  const groupIds = [...new Set(memberships.map((membership) => membership.groupId))].sort()
  const sectionIds = [
    ...new Set(
      groupIds.flatMap((groupId) => {
        const group = sectionOfGroup.get(groupId)
        return group ? [group.sectionId] : []
      }),
    ),
  ].sort()
  return { personId, groupIds, sectionIds }
}

/** The audience kinds of the member composer ("To": the author's own sections, groups and sessions), in this order. */
export const MEMBER_COMPOSER_KINDS: readonly AudienceKind[] = ['section', 'group', 'occurrence']

/** The kinds the member composer offers among those the author's grants allow, in `MEMBER_COMPOSER_KINDS` order. */
export function memberComposerKinds(allowed: readonly AudienceKind[]): AudienceKind[] {
  return MEMBER_COMPOSER_KINDS.filter((kind) => allowed.includes(kind))
}

/** One message's e-mail deliveries by status. */
export type EmailCounts = { queued: number; sent: number; failed: number; skipped: number }

/**
 * "E-mail: {delivered} delivered · {notDelivered} not delivered" (M-07): sent ones are delivered; failed and skipped
 * (no address, opted out) are not; queued ones are still on their way. Null without any e-mail delivery.
 */
export function emailDeliverySummary(
  counts: EmailCounts | null,
): { delivered: number; notDelivered: number; pending: number } | null {
  if (!counts) return null
  const total = counts.queued + counts.sent + counts.failed + counts.skipped
  if (total === 0) return null
  return { delivered: counts.sent, notDelivered: counts.failed + counts.skipped, pending: counts.queued }
}
