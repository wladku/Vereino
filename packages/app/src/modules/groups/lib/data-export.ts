// The `groups` part of the person data export (person data export spec `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md`,
// *Contributor inventory* → `groups`; #527, phase X2): how one of the subject's `groups_memberships` rows is shown —
// its own id, the role, the group (id and name, a club record), the period and its status on the club's day. A
// membership names no other person, and `groups` has no actor columns, so the part has no actor counts.
import type { CalendarDate } from '@vereino/core'
import { periodStatus, type PeriodStatus } from './groups-rules'

export const GROUPS_EXPORT_MODULE = 'groups' as const
export const GROUPS_MEMBERSHIPS_TABLE = 'groups_memberships' as const
/** RoPA A3 — groups, sessions and attendance (`docs/compliance/ropa.md`). */
export const GROUPS_MEMBERSHIPS_ACTIVITY = 'A3' as const

export type MembershipExportSource = {
  id: string
  groupId: string
  role: string
  validFrom: CalendarDate
  validTo?: CalendarDate | null
  createdAt?: Date | null
  updatedAt?: Date | null
}

export type MembershipExportRow = {
  id: string
  role: string
  group: { id: string; name: string | null }
  validFrom: CalendarDate
  validTo: CalendarDate | null
  status: PeriodStatus
  createdAt: string | null
  updatedAt: string | null
}

/** One membership as the file shows it; `groupName` is null when the group is gone, `today` is the club's day. */
export function membershipExportRow(
  row: MembershipExportSource,
  groupName: string | null | undefined,
  today: CalendarDate,
): MembershipExportRow {
  const validTo = row.validTo ?? null
  return {
    id: row.id,
    role: row.role,
    group: { id: row.groupId, name: groupName ?? null },
    validFrom: row.validFrom,
    validTo,
    status: periodStatus({ validFrom: row.validFrom, validTo }, today),
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }
}
