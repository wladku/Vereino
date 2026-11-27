// Personal invitation links (personal invitation link spec REQ-IL02…REQ-IL05, IL-D03, IL-D04; #868): who may take a
// guardian's link (the share scope), which families a staff member's list shows, and when a link still works. Pure:
// the service reads the grants, the guardianships, the children's groups and the account, and decides here.
import type { AccountState, ActingRole, Scope } from '@vereino/core'

/** A link lives 7 days (Q-IL02, owner decision of 2026-11-26): a WhatsApp message is often read days later. */
export const INVITATION_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** The guardian's page of a link, on the club's address (`/club/i/[token]`). */
export function invitationLinkPath(rawToken: string): string {
  return `/club/i/${encodeURIComponent(rawToken)}`
}

/** Which persons a staff member may take links for: the whole club, or the families of these groups and sections. */
export type ShareReach =
  { kind: 'club' } | { kind: 'families'; groupIds: readonly string[]; sectionIds: readonly string[] } | { kind: 'none' }

function idsOf(scope: Scope, kind: 'coach' | 'coordinator'): string[] {
  return [...new Set(scope.filter((grant) => grant.kind === kind).flatMap((grant) => grant.ids ?? []))].sort()
}

/**
 * The reach of a staff member's grants (IL-D03): the club administrator reaches the whole club; a coach the families
 * of the groups they coach; a coordinator those of the sections they coordinate; anyone else nobody (fail closed).
 */
export function shareReach(scope: Scope): ShareReach {
  if (scope.some((grant) => grant.kind === 'club_admin')) return { kind: 'club' }
  const groupIds = idsOf(scope, 'coach')
  const sectionIds = idsOf(scope, 'coordinator')
  if (groupIds.length === 0 && sectionIds.length === 0) return { kind: 'none' }
  return { kind: 'families', groupIds, sectionIds }
}

/** A child's live group on the day, as the share scope sees it. */
export type WardGroup = { readonly groupId: string; readonly sectionId: string }

/**
 * The acting role under which the reach covers a guardian whose active wards are in `wardGroups`, or null (404, as an
 * unknown id: IL-D04, D-034). The administrator covers any person of the club; a coach a guardian with a child in a
 * coached group; a coordinator one with a child in a coordinated section. The coach's grant is named first when both
 * apply, as the narrower one.
 */
export function shareActingRole(reach: ShareReach, wardGroups: readonly WardGroup[]): ActingRole | null {
  if (reach.kind === 'club') return 'club_admin'
  if (reach.kind === 'none') return null
  if (wardGroups.some((ward) => reach.groupIds.includes(ward.groupId))) return 'coach'
  if (wardGroups.some((ward) => reach.sectionIds.includes(ward.sectionId))) return 'coordinator'
  return null
}

/**
 * The participant-group reads behind a caller's list (their rows are unioned, then kept by `groupInReach`): the club
 * administrator reads the requested group or section, or the whole club; a coach or coordinator reads the requested
 * group or section, or else their coached groups and their coordinated sections. Nothing for no reach.
 */
export function pendingListReads(
  reach: ShareReach,
  requested: { groupId?: string | null; sectionId?: string | null },
): { groupIds?: string[]; sectionIds?: string[] }[] {
  if (reach.kind === 'none') return []
  const narrowed = {
    ...(requested.groupId ? { groupIds: [requested.groupId] } : {}),
    ...(requested.sectionId ? { sectionIds: [requested.sectionId] } : {}),
  }
  if (reach.kind === 'club' || requested.groupId || requested.sectionId) return [narrowed]
  return [
    ...(reach.groupIds.length > 0 ? [{ groupIds: [...reach.groupIds] }] : []),
    ...(reach.sectionIds.length > 0 ? [{ sectionIds: [...reach.sectionIds] }] : []),
  ]
}

/** Whether a participant group row lies in the reach (the list's union of coached groups and coordinated sections). */
export function groupInReach(reach: ShareReach, group: WardGroup): boolean {
  if (reach.kind === 'club') return true
  if (reach.kind === 'none') return false
  return reach.groupIds.includes(group.groupId) || reach.sectionIds.includes(group.sectionId)
}

/** Why a link does not work; the page and the start route answer the same for each (REQ-IL04). */
export type InvitationLinkProblem = 'unknown' | 'expired' | 'revoked' | 'used' | 'person_gone'

/**
 * Whether a link still activates the account, or why not: unknown (no such token), revoked by a newer link or a
 * departure, expired, the account no longer invited (already activated, blocked or closed: `used`), or the person gone
 * (deleted, departed or anonymized).
 */
export function invitationLinkProblem(input: {
  found: boolean
  expired: boolean
  revoked: boolean
  personActive: boolean
  accountState: AccountState
}): InvitationLinkProblem | null {
  if (!input.found) return 'unknown'
  if (input.revoked) return 'revoked'
  if (input.expired) return 'expired'
  if (!input.personActive) return 'person_gone'
  if (input.accountState !== 'invited') return 'used'
  return null
}
