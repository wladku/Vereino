// `communication` test helpers (foundation III phase B, #35; TEST-M05…M08, TEST-M10; phase C, #36: TEST-M09): the
// thread routes, the case marking, the delivery status, the share text and the e-mails the running app captured
// (`OM_TEST_MODE`).
import { expect, type APIRequestContext } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call } from './club'
import { capturedTo, type CapturedMessage } from './messaging'

export type CodedBody = { error?: string; code?: string }

export type PostResult = CodedBody & {
  ok?: boolean
  threadId?: string
  messageId?: string
  dispatchId?: string | null
  actingRole?: string
  updatedAt?: string
}

export type ThreadItem = {
  id: string
  scopeType: string
  scopeId: string | null
  scopeLabel: string | null
  subject: string
  authorName: string | null
  isCase: boolean
  caseOpenedAt: string | null
  caseOpenedByName: string | null
  lastMessageAt: string
  messageCount: number
  unread: boolean
}

export type ThreadMessage = {
  id: string
  authorName: string | null
  own: boolean
  actingRole: string
  audience: 'all' | 'staff'
  body: string | null
  editedAt: string | null
  deleted: boolean
  system: boolean
  recipientCount: number
  hasDeliveries: boolean
}

export type ThreadDetail = Omit<ThreadItem, 'messageCount'> & {
  updatedAt: string
  staff: boolean
  canSeeDeliveries: boolean
  canMarkCase: boolean
  messages: ThreadMessage[]
}

export type DeliveryItem = {
  id: string
  personId: string | null
  name: string | null
  channel: 'in_app' | 'email'
  reasons: string[]
  status: 'queued' | 'sent' | 'failed' | 'skipped'
  skipReason: string | null
  failureCode: string | null
}

export async function postThread(
  request: APIRequestContext,
  token: string,
  data: { audience: { kind: string; ids?: string[] }; subject: string; body: string },
) {
  return call<PostResult>(request, 'POST', '/api/communication/threads', token, { data })
}

export async function postReply(request: APIRequestContext, token: string, threadId: string, body: string) {
  return call<PostResult>(request, 'POST', `/api/communication/threads/${threadId}/replies`, token, {
    data: { body },
  })
}

export async function getThread(request: APIRequestContext, token: string, threadId: string) {
  return call<ThreadDetail & CodedBody>(request, 'GET', `/api/communication/threads/${threadId}`, token)
}

export async function listThreads(request: APIRequestContext, token: string, query = '') {
  const result = await call<{ items?: ThreadItem[]; total?: number } & CodedBody>(
    request,
    'GET',
    `/api/communication/threads?pageSize=100${query}`,
    token,
  )
  expect(result.status, `GET threads ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

export async function unreadCount(request: APIRequestContext, token: string): Promise<number> {
  const result = await call<{ count?: number }>(request, 'GET', '/api/communication/threads/unread-count', token)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return Number(result.body?.count)
}

export async function markRead(request: APIRequestContext, token: string, threadId: string) {
  return call(request, 'POST', `/api/communication/threads/${threadId}/read`, token)
}

export async function reviseMessage(
  request: APIRequestContext,
  token: string,
  threadId: string,
  messageId: string,
  body: string,
  lockToken: string | null,
) {
  return call<PostResult>(request, 'PATCH', `/api/communication/threads/${threadId}/messages/${messageId}`, token, {
    data: { body },
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

export async function deleteMessage(
  request: APIRequestContext,
  token: string,
  threadId: string,
  messageId: string,
  lockToken: string | null,
) {
  return call<PostResult>(request, 'DELETE', `/api/communication/threads/${threadId}/messages/${messageId}`, token, {
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

export type MarkCaseResult = CodedBody & {
  ok?: boolean
  threadId?: string
  isCase?: boolean
  caseOpenedAt?: string
  actingRole?: string
  updatedAt?: string
}

/** `POST /api/communication/threads/{id}/case` with the thread version as the lock token (#36). */
export async function markCase(request: APIRequestContext, token: string, threadId: string, lockToken: string | null) {
  return call<MarkCaseResult>(request, 'POST', `/api/communication/threads/${threadId}/case`, token, {
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

/** The thread's current version (`updatedAt`) as `token` reads it. */
export async function threadVersion(request: APIRequestContext, token: string, threadId: string): Promise<string> {
  const result = await call<{ updatedAt?: string }>(request, 'GET', `/api/communication/threads/${threadId}`, token)
  expect(result.status, `GET thread ${JSON.stringify(result.body)}`).toBe(200)
  return String(result.body?.updatedAt)
}

export async function deliveries(request: APIRequestContext, token: string, threadId: string, query = '') {
  return call<{ items?: DeliveryItem[]; total?: number } & CodedBody>(
    request,
    'GET',
    `/api/communication/threads/${threadId}/deliveries?pageSize=100${query}`,
    token,
  )
}

/** The deliveries of a thread's first message once none is queued any more (the worker runs after the commit). */
export async function settledDeliveries(
  request: APIRequestContext,
  token: string,
  threadId: string,
  query = '',
): Promise<DeliveryItem[]> {
  let items: DeliveryItem[] = []
  await expect
    .poll(
      async () => {
        const result = await deliveries(request, token, threadId, query)
        items = result.body?.items ?? []
        return result.status === 200 && items.length > 0 && items.every((item) => item.status !== 'queued')
      },
      { timeout: 60_000, message: `the deliveries of ${threadId} settle` },
    )
    .toBe(true)
  return items
}

export async function previewAudience(request: APIRequestContext, token: string, audience: Record<string, unknown>) {
  return call<CodedBody & { recipients?: number; withoutEmail?: number; unreachable?: number }>(
    request,
    'POST',
    '/api/communication/audience/preview',
    token,
    { data: { audience } },
  )
}

export async function audienceTargets(request: APIRequestContext, token: string, kind?: string) {
  return call<CodedBody & { kinds?: string[]; items?: { id: string; label: string }[] }>(
    request,
    'GET',
    `/api/communication/audience/targets${kind ? `?kind=${kind}` : ''}`,
    token,
  )
}

export async function shareText(request: APIRequestContext, token: string, query: string) {
  return call<CodedBody & { text?: string; url?: string }>(
    request,
    'GET',
    `/api/communication/share-text?${query}`,
    token,
  )
}

/** The captured e-mails to `address` whose subject contains `subject`, once there are `count` of them. */
export async function awaitEmails(address: string, subject: string, count = 1): Promise<CapturedMessage[]> {
  let found: CapturedMessage[] = []
  await expect
    .poll(
      () => {
        found = capturedTo([address]).filter((message) => message.subject.includes(subject))
        return found.length
      },
      { timeout: 60_000, message: `${String(count)} e-mail(s) "${subject}" to ${address}` },
    )
    .toBeGreaterThanOrEqual(count)
  return found
}

/** The captured e-mails to `address` whose subject contains `subject` (no waiting). */
export function emailsTo(address: string, subject: string): CapturedMessage[] {
  return capturedTo([address]).filter((message) => message.subject.includes(subject))
}
