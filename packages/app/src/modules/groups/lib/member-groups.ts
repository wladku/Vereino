// Pure rules behind `GET /api/groups/member-groups` (E06-S22 #104; README M-10): which persons a member may see the
// groups of — their own person (`self` grant) and their wards (`guardian` grant), never anyone else — and the rows of
// the groups those persons belong to on the club day, each with its section name. Time is a parameter (S3.5).
import { isActiveAt, type CalendarDate, type Scope } from '@vereino/core'
import type { GroupKind, MembershipRole } from './groups-rules'

/** The grant kinds whose persons a member may see the groups of. */
export const MEMBER_GROUP_KINDS = ['self', 'guardian'] as const

/** The person ids of the caller's `self` and `guardian` grants, each once; empty without either (fail closed). */
export function memberPersonIds(scope: Scope): string[] {
  const ids = new Set<string>()
  for (const grant of scope) {
    if (!(MEMBER_GROUP_KINDS as readonly string[]).includes(grant.kind)) continue
    for (const id of grant.ids ?? []) ids.add(id)
  }
  return [...ids]
}

export type MemberMembershipRecord = {
  readonly personId: string
  readonly groupId: string
  readonly role: MembershipRole
  readonly validFrom: CalendarDate
  readonly validTo: CalendarDate | null
}

export type MemberGroupRecord = {
  readonly id: string
  readonly name: string
  readonly kind: GroupKind
  readonly sectionId: string
  readonly isActive: boolean
}

export type MemberGroupRow = {
  personId: string
  groupId: string
  groupName: string
  groupKind: GroupKind
  sectionId: string
  sectionName: string | null
  role: MembershipRole
}

/** A section without a name sorts first. */
function sectionKey(row: MemberGroupRow): string {
  return row.sectionName ?? ''
}

/**
 * One row per membership active on `today` in a live, active group, sorted by person, section and group name; a
 * person in a group twice (two roles) gets two rows.
 */
export function memberGroupRows(
  memberships: readonly MemberMembershipRecord[],
  groups: ReadonlyMap<string, MemberGroupRecord>,
  sectionNames: ReadonlyMap<string, string>,
  today: CalendarDate,
): MemberGroupRow[] {
  return memberships
    .filter((membership) => isActiveAt({ validFrom: membership.validFrom, validTo: membership.validTo }, today))
    .flatMap((membership): MemberGroupRow[] => {
      const group = groups.get(membership.groupId)
      if (!group?.isActive) return []
      return [
        {
          personId: membership.personId,
          groupId: group.id,
          groupName: group.name,
          groupKind: group.kind,
          sectionId: group.sectionId,
          sectionName: sectionNames.get(group.sectionId) ?? null,
          role: membership.role,
        },
      ]
    })
    .sort(
      (a, b) =>
        a.personId.localeCompare(b.personId) ||
        sectionKey(a).localeCompare(sectionKey(b)) ||
        a.groupName.localeCompare(b.groupName) ||
        a.role.localeCompare(b.role),
    )
}
