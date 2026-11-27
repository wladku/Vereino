// The e-mail templates of `enrolment` (foundation III P-31; sign-up form spec *Events, Jobs, Notifications*, DD-J06,
// DD-J07, DD-J13; #799): the confirmation link, "received" with the status link, the waiting-list number, the
// rejection with its reason, the withdrawal and a new status link. All go to the bare address the applicant typed (no
// person record), in the form's language, with `optOut: 'never'` (transactional answers to the applicant's own
// request). A raw token reaches a template only through the delivery's secret (`ctx.secrets.token`) and becomes the
// button's link; it is never a param. The params carry no applicant name. On the dispatch worker's import graph, so it
// imports no `.tsx` and nothing of `@vereino/ui`.
import * as React from 'react'
import { z } from 'zod'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { defineEmailTemplate, type EmailRenderContext } from '@/modules/foundation'
import { applicationConfirmPath, applicationStatusPath, clubPagePath } from '../lib/paths'

const h = React.createElement

/** The notification type every applicant e-mail declares; a bare address gets no in-app delivery. */
export const APPLICANT_UPDATE_NOTIFICATION = 'enrolment.applicant_update'

const base = {
  applicationId: z.uuid(),
  clubSlug: z.string().min(1).max(120),
  sectionName: z.string().min(1).max(200),
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

type Copy = { subject: string; lead: string; lines: Array<string | null> }

type TemplateSpec<TParams> = {
  id: string
  params: z.ZodType<TParams>
  copy: (t: TranslateWithFallbackFn, params: TParams, ctx: EmailRenderContext) => Copy
  action?: { key: string; fallback: string; path: (params: TParams, token: string) => string }
}

function template<TParams>(spec: TemplateSpec<TParams>) {
  const { action } = spec
  return defineEmailTemplate<TParams>({
    id: spec.id,
    notificationType: APPLICANT_UPDATE_NOTIFICATION,
    optOut: 'never',
    params: spec.params,
    subject: (t, params, ctx) => spec.copy(t, params, ctx).subject,
    preheader: (t, params, ctx) => spec.copy(t, params, ctx).lead,
    body: (t, params, ctx) => {
      const copy = spec.copy(t, params, ctx)
      return paragraphs(copy.lead, copy.lines)
    },
    text: (t, params, ctx) => {
      const copy = spec.copy(t, params, ctx)
      return plainText(copy.lead, copy.lines)
    },
    ...(action
      ? {
          actionLabel: (t: TranslateWithFallbackFn) => t(action.key, action.fallback),
          link: (params: TParams, ctx: EmailRenderContext) =>
            typeof ctx.secrets.token === 'string' ? action.path(params, ctx.secrets.token) : null,
        }
      : {}),
  })
}

// --- The confirmation link (P-J2 → P-J3) ---

const confirmParams = z.object(base).strict()
export type ConfirmEmailParams = z.output<typeof confirmParams>

/** `enrolment.confirm_email`: the 1-hour link to `/p/<club>/applications/confirm/<token>` (DD-J06). */
export const confirmEmailTemplate = template<ConfirmEmailParams>({
  id: 'enrolment.confirm_email',
  params: confirmParams,
  copy: (t, params) => ({
    subject: t('enrolment.email.confirm.subject', 'Confirm your application: {section}', {
      section: params.sectionName,
    }),
    lead: t(
      'enrolment.email.confirm.lead',
      'Confirm your application to {section} within 1 hour using the button below.',
      { section: params.sectionName },
    ),
    lines: [
      t(
        'enrolment.email.confirm.unconfirmed',
        'The club sees the application only after you confirm it. Without confirmation it is deleted after 24 hours.',
      ),
    ],
  }),
  action: {
    key: 'enrolment.email.confirm.action',
    fallback: 'Confirm the application',
    path: (params, token) => applicationConfirmPath(params.clubSlug, token),
  },
})

// --- Received, with the status link (P-J3 → P-J4) ---

const receivedParams = z
  .object({
    ...base,
    answerDays: z.number().int().min(1).max(60),
    groupName: z.string().max(200).nullable(),
    waitingNumber: z.number().int().min(1).nullable(),
  })
  .strict()
export type ReceivedParams = z.output<typeof receivedParams>

/** `enrolment.received`: the application reached the club; the status link (DD-J07); the waiting number (DD-J09). */
export const receivedTemplate = template<ReceivedParams>({
  id: 'enrolment.received',
  params: receivedParams,
  copy: (t, params) => ({
    subject: t('enrolment.email.received.subject', 'Application received: {section}', { section: params.sectionName }),
    lead: t(
      'enrolment.email.received.lead',
      'Your application to {section} has reached the club. We will answer within {days} days.',
      { section: params.sectionName, days: String(params.answerDays) },
    ),
    lines: [
      params.waitingNumber === null
        ? null
        : t(
            'enrolment.email.received.waiting',
            'The group {group} is full: you are number {number} on its waiting list.',
            { group: params.groupName ?? '—', number: String(params.waitingNumber) },
          ),
      t(
        'enrolment.email.received.status',
        'Keep this e-mail: the button shows the state of your application and lets you withdraw it.',
      ),
    ],
  }),
  action: {
    key: 'enrolment.email.received.action',
    fallback: 'See your application',
    path: (params, token) => applicationStatusPath(params.clubSlug, token),
  },
})

// --- Waiting list (M-J3) ---

const waitingParams = z
  .object({ ...base, groupName: z.string().min(1).max(200), waitingNumber: z.number().int().min(1) })
  .strict()
export type WaitingParams = z.output<typeof waitingParams>

/** `enrolment.waiting`: the coordinator put the application on a group's waiting list. */
export const waitingTemplate = template<WaitingParams>({
  id: 'enrolment.waiting',
  params: waitingParams,
  copy: (t, params) => {
    const values = { section: params.sectionName, group: params.groupName, number: String(params.waitingNumber) }
    return {
      subject: t('enrolment.email.waiting.subject', 'Waiting list: {group}', values),
      lead: t(
        'enrolment.email.waiting.lead',
        'Your application to {section} is on the waiting list of {group}: you are number {number}.',
        values,
      ),
      lines: [
        t(
          'enrolment.email.waiting.next',
          'We will contact you when a place frees up. The link from our first e-mail shows the current state.',
        ),
      ],
    }
  },
})

// --- Rejected (M-J3) ---

const rejectedParams = z.object({ ...base, reason: z.string().min(1).max(500) }).strict()
export type RejectedParams = z.output<typeof rejectedParams>

/** `enrolment.rejected`: the coordinator's reason, as the applicant sees it on the status page. */
export const rejectedTemplate = template<RejectedParams>({
  id: 'enrolment.rejected',
  params: rejectedParams,
  copy: (t, params) => ({
    subject: t('enrolment.email.rejected.subject', 'Your application: {section}', { section: params.sectionName }),
    lead: t('enrolment.email.rejected.lead', 'Unfortunately the club cannot accept your application to {section}.', {
      section: params.sectionName,
    }),
    lines: [t('enrolment.email.rejected.reason', 'Reason: {reason}', { reason: params.reason })],
  }),
})

// --- Withdrawn (P-J4) ---

const withdrawnParams = z.object(base).strict()
export type WithdrawnParams = z.output<typeof withdrawnParams>

/** `enrolment.withdrawn`: the applicant withdrew the application. */
export const withdrawnTemplate = template<WithdrawnParams>({
  id: 'enrolment.withdrawn',
  params: withdrawnParams,
  copy: (t, params) => ({
    subject: t('enrolment.email.withdrawn.subject', 'Application withdrawn: {section}', {
      section: params.sectionName,
    }),
    lead: t('enrolment.email.withdrawn.lead', 'You have withdrawn your application to {section}.', {
      section: params.sectionName,
    }),
    lines: [t('enrolment.email.withdrawn.again', 'You can apply again at any time on the club’s page.')],
  }),
})

// --- A new status link (P-J4 "Send me a new link") ---

const newLinkParams = z.object(base).strict()
export type NewLinkParams = z.output<typeof newLinkParams>

/** `enrolment.new_link`: a new status link; the previous one stops working (DD-J07). */
export const newLinkTemplate = template<NewLinkParams>({
  id: 'enrolment.new_link',
  params: newLinkParams,
  copy: (t, params) => ({
    subject: t('enrolment.email.newLink.subject', 'Your application link: {section}', { section: params.sectionName }),
    lead: t('enrolment.email.newLink.lead', 'Here is a new link to your application to {section}.', {
      section: params.sectionName,
    }),
    lines: [t('enrolment.email.newLink.old', 'The previous link no longer works.')],
  }),
  action: {
    key: 'enrolment.email.newLink.action',
    fallback: 'See your application',
    path: (params, token) => applicationStatusPath(params.clubSlug, token),
  },
})

// --- Accepted (M-J3, phase 3) ---

const acceptedParams = z
  .object({
    ...base,
    groupName: z.string().min(1).max(200),
    startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    invitation: z.boolean(),
  })
  .strict()
export type AcceptedParams = z.output<typeof acceptedParams>

/** `enrolment.accepted`: the group and the start day; the account invitation comes in its own e-mail (Q-J08). */
export const acceptedTemplate = template<AcceptedParams>({
  id: 'enrolment.accepted',
  params: acceptedParams,
  copy: (t, params) => {
    const values = { section: params.sectionName, group: params.groupName, date: params.startDay }
    return {
      subject: t('enrolment.email.accepted.subject', 'Welcome to {section}', values),
      lead: t(
        'enrolment.email.accepted.lead',
        'Your application to {section} is accepted: the group is {group}, from {date}.',
        values,
      ),
      lines: [
        params.invitation
          ? t(
              'enrolment.email.accepted.invitation',
              'You will receive a separate e-mail with an invitation to your account in the club’s app.',
            )
          : null,
        t('enrolment.email.accepted.next', 'The coordinator will tell you about the first training and the fees.'),
      ],
    }
  },
})

// --- The season ended (DD-J14, R24, phase 3) ---

const seasonClosedParams = z.object(base).strict()
export type SeasonClosedParams = z.output<typeof seasonClosedParams>

/** `enrolment.season_closed`: an open application whose season ended is closed; the applicant may apply again. */
export const seasonClosedTemplate = template<SeasonClosedParams>({
  id: 'enrolment.season_closed',
  params: seasonClosedParams,
  copy: (t, params) => ({
    subject: t('enrolment.email.seasonClosed.subject', 'Your application: {section}', { section: params.sectionName }),
    lead: t(
      'enrolment.email.seasonClosed.lead',
      'The season your application to {section} was for has ended, so the application is closed.',
      { section: params.sectionName },
    ),
    lines: [
      t('enrolment.email.seasonClosed.again', 'You are welcome to apply again for the new season on the club’s page.'),
    ],
  }),
  action: {
    key: 'enrolment.email.seasonClosed.action',
    fallback: 'Go to the club’s page',
    path: (params) => clubPagePath(params.clubSlug),
  },
})

export const ENROLMENT_EMAIL_TEMPLATES = [
  confirmEmailTemplate,
  receivedTemplate,
  waitingTemplate,
  rejectedTemplate,
  withdrawnTemplate,
  newLinkTemplate,
  acceptedTemplate,
  seasonClosedTemplate,
] as const
