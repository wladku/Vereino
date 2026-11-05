// Client pieces shared by the `communication` pages: the response shapes of `/api/communication/*`, their links, the
// scope and role labels, and the reading of coded API errors. Authorization stays on the routes and commands.
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import { CLUB_MESSAGES_HREF } from '@vereino/ui'

export type Translate = ReturnType<typeof useT>

/**
 * The request init for a read whose page renders its own 403 state: without it the platform `apiFetch` throws
 * `ForbiddenError` on every 403 before the caller's `status === 403` branch runs (lesson
 * `apifetch-403-throws-before-page-branch`).
 */
export const OWN_FORBIDDEN_STATE: RequestInit = { headers: { 'x-om-forbidden-redirect': '0' } }

export const THREADS_HREF = '/backend/communication/threads'
export const THREAD_CREATE_HREF = `${THREADS_HREF}/create`
export const threadHref = (id: string) => `${THREADS_HREF}/${encodeURIComponent(id)}`
export const CASES_HREF = '/backend/communication/cases'

/** The member inbox path, from the one navigation definition of `@vereino/ui` (E06-S19 #101). */
export { CLUB_MESSAGES_HREF }
export const clubThreadHref = (id: string) => `${CLUB_MESSAGES_HREF}/${encodeURIComponent(id)}`
/** The member page of a direct thread to the staff (REQ-M12, DD-M18). */
export const CLUB_MESSAGE_NEW_HREF = `${CLUB_MESSAGES_HREF}/new`
export const DIRECT_OPTIONS_QUERY_KEY = ['communication-direct-options'] as const

/** One option of `GET /api/communication/direct`: a household member, a group they take part in today, its staff. */
export type DirectOption = {
  personId: string
  personName: string
  groupId: string
  groupName: string
  sectionId: string
  sectionName: string
  coachNames: string[]
  coordinatorNames: string[]
}

export type ThreadScopeType = 'club' | 'section' | 'group' | 'activity' | 'occurrence' | 'direct'

/** The scope types of the thread list's filter, in the composer's order (B-18). */
export const THREAD_SCOPE_TYPES: readonly ThreadScopeType[] = [
  'club',
  'section',
  'group',
  'activity',
  'occurrence',
  'direct',
]

/** A scope type as the filter names it: the composer's kind, "Direct message" for `direct`. */
export function scopeTypeLabel(t: Translate, scopeType: ThreadScopeType): string {
  return scopeType === 'direct' ? t('communication.scope.direct') : t(`communication.audience.kinds.${scopeType}`)
}

/** The thread list's filters (`GET /api/communication/threads`); empty strings are "any". */
export type ThreadListFilters = { scopeType: ThreadScopeType | ''; sectionId: string; unreadOnly: boolean }

export const NO_THREAD_FILTERS: ThreadListFilters = { scopeType: '', sectionId: '', unreadOnly: false }

/** The list query of a page with the applied filters. */
export function threadListQuery(page: number, pageSize: number, filters: ThreadListFilters): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (filters.scopeType) params.set('scopeType', filters.scopeType)
  if (filters.sectionId) params.set('sectionId', filters.sectionId)
  if (filters.unreadOnly) params.set('unread', '1')
  return params.toString()
}

export function hasThreadFilters(filters: ThreadListFilters): boolean {
  return filters.scopeType !== '' || filters.sectionId !== '' || filters.unreadOnly
}

export type ThreadListItem = {
  id: string
  scopeType: ThreadScopeType
  scopeId: string | null
  scopeLabel: string | null
  subject: string
  authorName: string | null
  isCase: boolean
  caseOpenedAt: string | null
  caseOpenedByName: string | null
  lastMessageAt: string
  createdAt: string
  messageCount: number
  lastMessage: { authorName: string | null; system: boolean; createdAt: string } | null
  unread: boolean
}

export type ThreadList = {
  items: ThreadListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type ThreadMessageItem = {
  id: string
  authorName: string | null
  own: boolean
  actingRole: string
  audience: 'all' | 'staff'
  body: string | null
  createdAt: string
  editedAt: string | null
  deleted: boolean
  system: boolean
  recipientCount: number
  hasDeliveries: boolean
  canDelete: boolean
  deliveryCounts: DeliveryCounts | null
}

/** Deliveries of one message (one per recipient and channel) by status. */
export type DeliveryCounts = { queued: number; sent: number; failed: number; skipped: number }

export type ThreadDetail = Omit<ThreadListItem, 'messageCount' | 'lastMessage'> & {
  updatedAt: string
  staff: boolean
  canSeeDeliveries: boolean
  canMarkCase: boolean
  messages: ThreadMessageItem[]
}

/** "Group: Rocznik 2015", "Whole club", "Direct message". */
export function scopeLabel(t: Translate, thread: Pick<ThreadListItem, 'scopeType' | 'scopeLabel'>): string {
  if (thread.scopeType === 'club' || thread.scopeType === 'direct') return t(`communication.scope.${thread.scopeType}`)
  return t(`communication.scope.${thread.scopeType}`, { name: thread.scopeLabel ?? '' })
}

const ROLES = ['club_admin', 'coordinator', 'coach', 'guardian', 'self', 'system']

export function roleLabel(t: Translate, role: string): string {
  return ROLES.includes(role) ? t(`communication.roles.${role}`) : role
}

/** "{author}, {time}" of a list's last message ("Club" for a system message), or "" without one. */
export function lastMessageLabel(t: Translate, thread: Pick<ThreadListItem, 'lastMessage'>, locale: string): string {
  const last = thread.lastMessage
  if (!last) return ''
  const author = last.system ? t('communication.threads.lastMessageSystem') : (last.authorName ?? '')
  return t('communication.threads.lastMessage', { author, time: formatDateTime(last.createdAt, locale) })
}

export function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

type CodedError = { status?: unknown; code?: unknown }

export function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const status = (error as CodedError).status
  return typeof status === 'number' ? status : null
}

export function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as CodedError).code
  return typeof code === 'string' ? code : null
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
