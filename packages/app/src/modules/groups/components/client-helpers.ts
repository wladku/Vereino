// Small client-side helpers shared by the `groups` backend pages: row types as the API returns them, links, names,
// periods and text normalization. Authorization stays on the routes and commands.
import type { DataTableProps } from '@open-mercato/ui/backend/DataTable'
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import { periodStatus, type PeriodStatus } from '../lib/groups-rules'

export type Translate = ReturnType<typeof useT>

/** The column definitions `DataTable` takes for rows of type `T`. */
export type TableColumns<T extends object> = DataTableProps<T>['columns']

export const GROUPS_HREF = '/backend/groups/groups'
export const SEASONS_HREF = '/backend/groups/seasons'
export const EXTERNAL_TEAMS_HREF = '/backend/groups/external-teams'

export type GroupRow = {
  id: string
  sectionId: string | null
  sectionName?: string | null
  name: string | null
  kind: string | null
  league: string | null
  seasonId: string | null
  seasonName?: string | null
  description: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** `GET /api/groups/groups/{id}`: the group with the role the caller reads it as. */
export type GroupDetail = GroupRow & { actingRole: string }

export type MembershipRow = {
  id: string
  groupId: string | null
  personId: string | null
  person?: { firstName: string; lastName: string } | null
  role: string | null
  validFrom: string | null
  validTo: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type SeasonRow = {
  id: string
  name: string | null
  startsOn: string | null
  endsOn: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type ExternalTeamRow = {
  id: string
  name: string | null
  clubName: string | null
  institutionId: string | null
  contact: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** A trimmed text field value, or null when blank (explicit clearing, S6.3). */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function personName(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ')
}

/** Today's local calendar date (`YYYY-MM-DD`), the default start day the forms propose. */
export function localToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The period status of a roster row on `today` (the server decides with the club zone). */
export function rowStatus(row: Pick<MembershipRow, 'validFrom' | 'validTo'>, today: string): PeriodStatus {
  if (!row.validFrom) return 'active'
  return periodStatus({ validFrom: row.validFrom, validTo: row.validTo }, today)
}

export function periodLabel(t: Translate, validFrom: string | null, validTo: string | null): string {
  if (!validFrom) return t('groups.common.empty')
  return validTo
    ? t('groups.common.period.closed', { from: validFrom, to: validTo })
    : t('groups.common.period.open', { from: validFrom })
}

/** The kind label: "team" or "class group". */
export function kindLabel(t: Translate, kind: string | null): string {
  return kind ? t(`groups.groups.kind.${kind}`) : t('groups.common.empty')
}

/** The role label follows the kind: a class group's coach is an "instructor" (club spec glossary *Coach*). */
export function roleLabel(t: Translate, role: string | null, kind: string | null): string {
  if (!role) return t('groups.common.empty')
  if (kind === 'class_group' && role !== 'participant') return t(`groups.memberships.role.class_group.${role}`)
  return t(`groups.memberships.role.${role}`)
}
