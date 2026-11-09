// The e-mail templates of `facilities` (foundation III P-31; facilities spec DD-44, the *Events, Jobs* rows of the
// request e-mails, J-007; #125): the confirmation link of an online request and the requester's decision e-mails —
// approved (amount, account, deadlines), rejected (reason), expired, superseded by a club booking. All go to the bare
// address the guest typed (no person record), in the form's language, with `optOut: 'never'` (answers to the guest's
// own request). The raw token reaches the verification template only through the delivery's secret
// (`ctx.secrets.token`, DD-44) and becomes the button's link; it is never a param. The params are encrypted at rest in
// the dispatch outbox. On the dispatch worker's import graph, so it imports no `.tsx` and nothing of `@vereino/ui`
// (lesson `worker-runtime-imports-and-notification-strategies`).
import * as React from 'react'
import { z } from 'zod'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { formatBankAccount } from '@vereino/core'
import { defineEmailTemplate, type EmailRenderContext } from '@/modules/foundation'
import { formatAmount, formatInstant, formatSlot } from '../lib/requests'

const h = React.createElement

/** The notification type every request e-mail declares; a bare address gets no in-app delivery. */
export const REQUEST_UPDATE_NOTIFICATION = 'facilities.rental_request_update'

const slotParams = {
  rentalId: z.uuid(),
  placeName: z.string().min(1).max(200),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1).max(64),
}

type SlotParams = { placeName: string; startsAt: string; endsAt: string; timeZone: string }

function slotOf(params: SlotParams, ctx: EmailRenderContext): string {
  return formatSlot(new Date(params.startsAt), new Date(params.endsAt), params.timeZone, ctx.locale)
}

/** The path of the confirmation page P-05 (the token in the path of the page, posted in the body of the API call). */
export function requestVerifyPath(clubSlug: string, token: string): string {
  return `/p/${encodeURIComponent(clubSlug)}/requests/verify/${encodeURIComponent(token)}`
}

/** The club's public facilities (P-03), the decision e-mails' button; none while the club has no public slug. */
function placesPath(params: { clubSlug: string | null }): string | null {
  return params.clubSlug ? `/p/${encodeURIComponent(params.clubSlug)}/places` : null
}

function paragraphs(lead: string, lines: ReadonlyArray<string | null>) {
  return h(
    'div',
    null,
    h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, lead),
    ...lines
      .filter((line): line is string => line !== null)
      .map((line, index) => h('p', { key: String(index), style: { margin: '0 0 8px' } }, line)),
  )
}

function plainText(lead: string, lines: ReadonlyArray<string | null>): string {
  return [lead, '', ...lines.filter((line): line is string => line !== null)].join('\n')
}

// --- The confirmation link (P-04 → P-05) ---

const verificationParams = z
  .object({
    ...slotParams,
    clubSlug: z.string().min(1).max(120),
    amount: z.number().int().nullable(),
    currency: z.string().length(3),
  })
  .strict()

export type RequestVerificationParams = z.output<typeof verificationParams>

function verificationCopy(t: TranslateWithFallbackFn, params: RequestVerificationParams, ctx: EmailRenderContext) {
  const values = { place: params.placeName, slot: slotOf(params, ctx) }
  return {
    subject: t('facilities.email.requestVerification.subject', 'Confirm your booking request: {place}', values),
    lead: t(
      'facilities.email.requestVerification.lead',
      'Confirm your request for {place}, {slot}, within 1 hour using the button below.',
      values,
    ),
    lines: [
      params.amount === null
        ? null
        : t('facilities.email.requestVerification.amount', 'Indicative amount: {amount}', {
            amount: formatAmount(params.amount, params.currency, ctx.locale),
          }),
      t(
        'facilities.email.requestVerification.approval',
        "The request is valid only after the administrator's approval. Without confirmation it is deleted after 1 hour.",
      ),
    ],
  }
}

/** `facilities.request_verification`: the 1-hour link to `/p/<club>/requests/verify/<token>` (DD-44). */
export const requestVerificationTemplate = defineEmailTemplate<RequestVerificationParams>({
  id: 'facilities.request_verification',
  notificationType: REQUEST_UPDATE_NOTIFICATION,
  optOut: 'never',
  params: verificationParams,
  subject: (t, params, ctx) => verificationCopy(t, params, ctx).subject,
  preheader: (t, params, ctx) => verificationCopy(t, params, ctx).lead,
  body: (t, params, ctx) => {
    const copy = verificationCopy(t, params, ctx)
    return paragraphs(copy.lead, copy.lines)
  },
  text: (t, params, ctx) => {
    const copy = verificationCopy(t, params, ctx)
    return plainText(copy.lead, copy.lines)
  },
  actionLabel: (t) => t('facilities.email.requestVerification.action', 'Confirm the request'),
  link: (params, ctx) =>
    typeof ctx.secrets.token === 'string' ? requestVerifyPath(params.clubSlug, ctx.secrets.token) : null,
})

// --- The decision e-mails (B-25, the expiry job, a club booking) ---

const decisionBase = { ...slotParams, clubSlug: z.string().min(1).max(120).nullable() }

const approvedParams = z
  .object({
    ...decisionBase,
    amount: z.number().int(),
    currency: z.string().length(3),
    payeeName: z.string().max(200).nullable(),
    bankAccount: z.string().max(64).nullable(),
    paymentDeadline: z.iso.datetime({ offset: true }).nullable(),
    cancellationDeadline: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()

export type RequestApprovedParams = z.output<typeof approvedParams>

function approvedCopy(t: TranslateWithFallbackFn, params: RequestApprovedParams, ctx: EmailRenderContext) {
  const values = { place: params.placeName, slot: slotOf(params, ctx) }
  const at = (iso: string) => formatInstant(new Date(iso), params.timeZone, ctx.locale)
  return {
    subject: t('facilities.email.requestApproved.subject', 'Booking approved: {place}, {slot}', values),
    lead: t('facilities.email.requestApproved.lead', 'Your booking of {place}, {slot}, has been approved.', values),
    lines: [
      t('facilities.email.requestApproved.amount', 'Amount to pay: {amount}', {
        amount: formatAmount(params.amount, params.currency, ctx.locale),
      }),
      params.bankAccount
        ? t('facilities.email.requestApproved.account', 'Transfer to: {payee}, account {account}', {
            payee: params.payeeName ?? ctx.clubName,
            account: formatBankAccount(params.bankAccount),
          })
        : t(
            'facilities.email.requestApproved.noAccount',
            'The club will send you the account number for the transfer.',
          ),
      params.paymentDeadline
        ? t('facilities.email.requestApproved.paymentDeadline', 'Pay by: {date}', { date: at(params.paymentDeadline) })
        : null,
      params.cancellationDeadline
        ? t('facilities.email.requestApproved.cancellationDeadline', 'Free cancellation until: {date}', {
            date: at(params.cancellationDeadline),
          })
        : null,
    ],
  }
}

/** `facilities.request_approved`: the amount, the owner's account and the deadlines (J-007 step 4). */
export const requestApprovedTemplate = defineEmailTemplate<RequestApprovedParams>({
  id: 'facilities.request_approved',
  notificationType: REQUEST_UPDATE_NOTIFICATION,
  optOut: 'never',
  params: approvedParams,
  subject: (t, params, ctx) => approvedCopy(t, params, ctx).subject,
  preheader: (t, params, ctx) => approvedCopy(t, params, ctx).lead,
  body: (t, params, ctx) => {
    const copy = approvedCopy(t, params, ctx)
    return paragraphs(copy.lead, copy.lines)
  },
  text: (t, params, ctx) => {
    const copy = approvedCopy(t, params, ctx)
    return plainText(copy.lead, copy.lines)
  },
  actionLabel: (t) => t('facilities.email.request.action', 'Open the calendar'),
  link: (params) => placesPath(params),
})

const rejectedParams = z.object({ ...decisionBase, reason: z.string().min(1).max(500) }).strict()

export type RequestRejectedParams = z.output<typeof rejectedParams>

function rejectedCopy(t: TranslateWithFallbackFn, params: RequestRejectedParams, ctx: EmailRenderContext) {
  const values = { place: params.placeName, slot: slotOf(params, ctx) }
  return {
    subject: t('facilities.email.requestRejected.subject', 'Booking request declined: {place}, {slot}', values),
    lead: t(
      'facilities.email.requestRejected.lead',
      'Your request for {place}, {slot}, has been declined. The slot is free again.',
      values,
    ),
    lines: [t('facilities.email.requestRejected.reason', 'Reason: {reason}', { reason: params.reason })],
  }
}

/** `facilities.request_rejected`: the administrator's reason. */
export const requestRejectedTemplate = defineEmailTemplate<RequestRejectedParams>({
  id: 'facilities.request_rejected',
  notificationType: REQUEST_UPDATE_NOTIFICATION,
  optOut: 'never',
  params: rejectedParams,
  subject: (t, params, ctx) => rejectedCopy(t, params, ctx).subject,
  preheader: (t, params, ctx) => rejectedCopy(t, params, ctx).lead,
  body: (t, params, ctx) => {
    const copy = rejectedCopy(t, params, ctx)
    return paragraphs(copy.lead, copy.lines)
  },
  text: (t, params, ctx) => {
    const copy = rejectedCopy(t, params, ctx)
    return plainText(copy.lead, copy.lines)
  },
  actionLabel: (t) => t('facilities.email.request.action', 'Open the calendar'),
  link: (params) => placesPath(params),
})

const closedParams = z.object(decisionBase).strict()

export type RequestClosedParams = z.output<typeof closedParams>

/** `facilities.request_expired`: no decision within 48 hours. */
export const requestExpiredTemplate = defineEmailTemplate<RequestClosedParams>({
  id: 'facilities.request_expired',
  notificationType: REQUEST_UPDATE_NOTIFICATION,
  optOut: 'never',
  params: closedParams,
  subject: (t, params, ctx) =>
    t('facilities.email.requestExpired.subject', 'Booking request expired: {place}, {slot}', {
      place: params.placeName,
      slot: slotOf(params, ctx),
    }),
  body: (t, params, ctx) => paragraphs(expiredLead(t, params, ctx), []),
  text: (t, params, ctx) => plainText(expiredLead(t, params, ctx), []),
  actionLabel: (t) => t('facilities.email.request.action', 'Open the calendar'),
  link: (params) => placesPath(params),
})

function expiredLead(t: TranslateWithFallbackFn, params: RequestClosedParams, ctx: EmailRenderContext): string {
  return t(
    'facilities.email.requestExpired.lead',
    'The club did not decide on your request for {place}, {slot}, within 48 hours, so it has expired. You can send a new request.',
    { place: params.placeName, slot: slotOf(params, ctx) },
  )
}

/** `facilities.request_superseded`: the club took the slot for its own booking. */
export const requestSupersededTemplate = defineEmailTemplate<RequestClosedParams>({
  id: 'facilities.request_superseded',
  notificationType: REQUEST_UPDATE_NOTIFICATION,
  optOut: 'never',
  params: closedParams,
  subject: (t, params, ctx) =>
    t('facilities.email.requestSuperseded.subject', 'Booking request cancelled: {place}, {slot}', {
      place: params.placeName,
      slot: slotOf(params, ctx),
    }),
  body: (t, params, ctx) => paragraphs(supersededLead(t, params, ctx), []),
  text: (t, params, ctx) => plainText(supersededLead(t, params, ctx), []),
  actionLabel: (t) => t('facilities.email.request.action', 'Open the calendar'),
  link: (params) => placesPath(params),
})

function supersededLead(t: TranslateWithFallbackFn, params: RequestClosedParams, ctx: EmailRenderContext): string {
  return t(
    'facilities.email.requestSuperseded.lead',
    'The club needs {place} for its own activity at {slot}, so your request cannot be accepted. Please choose another slot.',
    { place: params.placeName, slot: slotOf(params, ctx) },
  )
}

// --- The maintenance reminder (#128) ---

/** The in-app reminder of a maintenance task (REQ-022, DD-46): its id is the dispatch template of the daily job. */
export const MAINTENANCE_DUE_TEMPLATE = 'facilities.maintenance_due'

const maintenanceDueParams = z
  .object({
    taskId: z.uuid(),
    placeName: z.string().max(200),
    kind: z.string().min(1).max(40),
    dueDate: z.string().nullable(),
    stage: z.enum(['d14', 'd1', 'usage']),
    hours: z.number().int().nullable(),
  })
  .strict()

export type MaintenanceDueParams = z.output<typeof maintenanceDueParams>

function maintenanceLead(t: TranslateWithFallbackFn, params: MaintenanceDueParams): string {
  const values = {
    place: params.placeName,
    kind: t(`facilities.maintenance.kinds.${params.kind}`, params.kind),
    date: params.dueDate ?? '',
    hours: String(params.hours ?? 0),
  }
  if (params.stage === 'usage') {
    return t('facilities.email.maintenanceDue.usage', '{kind} at {place}: {hours} hours of use since it was last done.', values)
  }
  return t('facilities.email.maintenanceDue.date', '{kind} at {place} is due on {date}.', values)
}

/**
 * `facilities.maintenance_due`: delivered in-app only (the recipients carry no e-mail channel); the in-app notice uses
 * the generic keys of the `facilities.maintenance_due` notification type (DD-M07), this copy serves the e-mail render.
 */
export const maintenanceDueTemplate = defineEmailTemplate<MaintenanceDueParams>({
  id: MAINTENANCE_DUE_TEMPLATE,
  notificationType: 'facilities.maintenance_due',
  optOut: 'never',
  params: maintenanceDueParams,
  subject: (t, params) => maintenanceLead(t, params),
  body: (t, params) => paragraphs(maintenanceLead(t, params), []),
  text: (t, params) => plainText(maintenanceLead(t, params), []),
  actionLabel: (t) => t('facilities.email.maintenanceDue.action', 'Open maintenance'),
  link: () => '/backend/facilities/maintenance',
})

export const requestEmailTemplates = [
  requestVerificationTemplate,
  requestApprovedTemplate,
  requestRejectedTemplate,
  requestExpiredTemplate,
  requestSupersededTemplate,
] as const
