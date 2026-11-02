// Client pieces shared by the `communication` pages: the response shapes of `/api/communication/*`, their links, the
// scope and role labels, and the reading of coded API errors. Authorization stays on the routes and commands.
import type { useT } from '@open-mercato/shared/lib/i18n/context'

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

export const CLUB_MESSAGES_HREF = '/club/messages'
export const clubThreadHref = (id: string) => `${CLUB_MESSAGES_HREF}/${encodeURIComponent(id)}`

export type ThreadScopeType = 'club' | 'section' | 'group' | 'activity' | 'occurrence' | 'direct'

export type ThreadListItem = {
  id: string
  scopeType: ThreadScopeType
  scopeId: string | null
  scopeLabel: string | null
  subject: string
  authorName: string | null
  isCase: boolean
  lastMessageAt: string
  createdAt: string
  messageCount: number
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
}

export type ThreadDetail = Omit<ThreadListItem, 'messageCount'> & {
  updatedAt: string
  staff: boolean
  canSeeDeliveries: boolean
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

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
