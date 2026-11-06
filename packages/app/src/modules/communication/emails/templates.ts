// The e-mail templates of `communication` (foundation III P-31, DD-M08, Q15 = B): every one is `optOut: 'never'`
// (announcements, replies and session changes must arrive), maps to an in-app type declared `channels: ['in_app']`,
// renders club text through `clubText` (escaped, line breaks kept; R09) and links to the member thread
// `/club/messages/[threadId]` (sign-in). Rendered by the foundation's dispatch worker in each recipient's language;
// this file is on the worker's import graph, so it imports no `.tsx` and nothing of `@vereino/ui` (lesson
// `worker-runtime-imports-and-notification-strategies`).
import * as React from 'react'
import { z } from 'zod'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { CANCELLING_ROLES } from '@vereino/core'
import { clubText, defineEmailTemplate } from '@/modules/foundation'
import { clockLabel, preheaderOf, sessionWhenLabel } from '../lib/email-format'
import { memberThreadPath } from '../lib/thread-rules'

const h = React.createElement

const messageParams = z
  .object({ threadId: z.uuid(), subject: z.string().min(1).max(200), body: z.string().min(1).max(10_000) })
  .strict()

type MessageParams = z.output<typeof messageParams>

/** `communication.announcement`: a new thread from the club (REQ-M06). */
export const announcementTemplate = defineEmailTemplate<MessageParams>({
  id: 'communication.announcement',
  notificationType: 'communication.announcement',
  optOut: 'never',
  params: messageParams,
  subject: (t, params, ctx) =>
    t('communication.email.announcement.subject', '{club}: {subject}', { club: ctx.clubName, subject: params.subject }),
  preheader: (_t, params) => preheaderOf(params.body),
  body: (t, params) =>
    h(
      'div',
      null,
      h('p', { style: { margin: '0 0 8px', fontWeight: 600 } }, params.subject),
      clubText(params.body),
      h('p', { style: { margin: '16px 0 0' } }, t('communication.email.replyHint', 'Reply in the app.')),
    ),
  text: (t, params) =>
    `${params.subject}\n\n${params.body}\n\n${t('communication.email.replyHint', 'Reply in the app.')}`,
  link: (params) => memberThreadPath(params.threadId),
  actionLabel: (t) => t('communication.email.openThread', 'Open the conversation'),
})

/** `communication.reply`: a reply in a thread (REQ-M06; a member's reply reaches the staff only, DD-M12). */
export const replyTemplate = defineEmailTemplate<MessageParams>({
  id: 'communication.reply',
  notificationType: 'communication.reply',
  optOut: 'never',
  params: messageParams,
  subject: (t, params) => t('communication.email.reply.subject', 'New reply: {subject}', { subject: params.subject }),
  preheader: (_t, params) => preheaderOf(params.body),
  body: (t, params) =>
    h(
      'div',
      null,
      h(
        'p',
        { style: { margin: '0 0 8px', fontWeight: 600 } },
        t('communication.email.reply.lead', 'New reply in “{subject}”:', { subject: params.subject }),
      ),
      clubText(params.body),
    ),
  text: (t, params) =>
    `${t('communication.email.reply.lead', 'New reply in “{subject}”:', { subject: params.subject })}\n\n${params.body}`,
  link: (params) => memberThreadPath(params.threadId),
  actionLabel: (t) => t('communication.email.openThread', 'Open the conversation'),
})

const cancellationParams = z
  .object({
    threadId: z.uuid(),
    activityName: z.string().max(200),
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    /** The session's gathering time (club spec DD-43); absent or null when it has none. */
    gatheringAt: z.iso.datetime().nullable().optional(),
    timeZone: z.string().min(1).max(64),
    reason: z.string().max(500),
    /** Who cancelled and in which role (R01, #139); absent for a cancellation that names nobody. */
    cancelledByName: z.string().min(1).max(250).optional(),
    cancelledByRole: z.enum(CANCELLING_ROLES).optional(),
  })
  .strict()

type CancellationParams = z.output<typeof cancellationParams>

function cancellationLines(t: TranslateWithFallbackFn, params: CancellationParams, locale: string) {
  const when = sessionWhenLabel(new Date(params.startAt), new Date(params.endAt), locale, params.timeZone)
  const gathering = params.gatheringAt ? clockLabel(new Date(params.gatheringAt), locale, params.timeZone) : null
  const values = { activity: params.activityName, date: when.date, time: when.time, gathering: gathering ?? '' }
  return {
    subject: t('communication.email.sessionCancelled.subject', 'Cancelled: {activity}, {date}', values),
    lead: gathering
      ? t(
          'communication.email.sessionCancelled.leadWithGathering',
          '{activity} on {date}, {time} (gathering {gathering}) is cancelled.',
          values,
        )
      : t('communication.email.sessionCancelled.lead', '{activity} on {date}, {time} is cancelled.', values),
    reasonLabel: t('communication.email.sessionCancelled.reason', 'Reason:'),
    cancelledBy:
      params.cancelledByName && params.cancelledByRole
        ? t('communication.email.sessionCancelled.by', 'Cancelled by {name} ({role}).', {
            name: params.cancelledByName,
            role: t(`communication.roles.${params.cancelledByRole}`, params.cancelledByRole),
          })
        : null,
  }
}

/** `communication.session_cancelled`: the e-mail of a session cancellation (REQ-M07); the in-app notice is `activities`'. */
export const sessionCancelledTemplate = defineEmailTemplate<CancellationParams>({
  id: 'communication.session_cancelled',
  notificationType: 'communication.announcement',
  optOut: 'never',
  params: cancellationParams,
  subject: (t, params, ctx) => cancellationLines(t, params, ctx.locale).subject,
  preheader: (t, params, ctx) => cancellationLines(t, params, ctx.locale).lead,
  body: (t, params, ctx) => {
    const lines = cancellationLines(t, params, ctx.locale)
    return h(
      'div',
      null,
      h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, lines.lead),
      lines.cancelledBy ? h('p', { style: { margin: '0 0 12px' } }, lines.cancelledBy) : null,
      params.reason ? h('p', { style: { margin: '0 0 4px' } }, lines.reasonLabel) : null,
      params.reason ? clubText(params.reason) : null,
    )
  },
  text: (t, params, ctx) => {
    const lines = cancellationLines(t, params, ctx.locale)
    return params.reason ? `${lines.lead}\n\n${lines.reasonLabel}\n${params.reason}` : lines.lead
  },
  link: (params) => memberThreadPath(params.threadId),
  actionLabel: (t) => t('communication.email.openThread', 'Open the conversation'),
})

export const communicationEmailTemplates = [announcementTemplate, replyTemplate, sessionCancelledTemplate]
