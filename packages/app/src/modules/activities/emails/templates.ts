// The e-mail template of `activities` (foundation III P-31; club spec REQ-017, *Events, Jobs* row
// `activities:send-declaration-reminders`): the personal declaration link, sent on request from `/club/link` and as the
// evening reminder for tomorrow's sessions. `optOut: 'never'` (a requested link and a reminder of a session the person
// takes part in). The raw token reaches the template only through the delivery's secret (`ctx.secrets.token`, DD-M04)
// and becomes the button's link; it is never a param. On the dispatch worker's import graph, so it imports no `.tsx`
// and nothing of `@vereino/ui` (lesson `worker-runtime-imports-and-notification-strategies`).
import * as React from 'react'
import { z } from 'zod'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { defineEmailTemplate } from '@/modules/foundation'
import { declarationLinkPath, sessionWhenLabel } from '../lib/declaration-links'

const h = React.createElement

const declarationLinkParams = z
  .object({
    occurrenceId: z.uuid(),
    activityName: z.string().max(200),
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    timeZone: z.string().min(1).max(64),
    reminder: z.boolean(),
  })
  .strict()

export type DeclarationLinkParams = z.output<typeof declarationLinkParams>

function lines(t: TranslateWithFallbackFn, params: DeclarationLinkParams, locale: string) {
  const when = sessionWhenLabel(new Date(params.startAt), new Date(params.endAt), locale, params.timeZone)
  const values = { activity: params.activityName, date: when.date, time: when.time }
  return {
    subject: params.reminder
      ? t(
          'activities.email.declarationLink.reminderSubject',
          'Tomorrow: {activity}, {time} — will you be there?',
          values,
        )
      : t('activities.email.declarationLink.subject', 'Your link: {activity}, {date}', values),
    lead: params.reminder
      ? t(
          'activities.email.declarationLink.reminderLead',
          'Tomorrow, {date}, {time}: {activity}. Nobody has declared attendance yet.',
          values,
        )
      : t('activities.email.declarationLink.lead', '{activity} on {date}, {time}.', values),
    hint: t(
      'activities.email.declarationLink.hint',
      'Open the link to declare attendance without signing in. The link is personal — do not forward it; it works until the session ends.',
    ),
  }
}

/** `activities.declaration_link`: a personal link to `/club/d/<token>` (REQ-017). */
export const declarationLinkTemplate = defineEmailTemplate<DeclarationLinkParams>({
  id: 'activities.declaration_link',
  notificationType: 'activities.declaration_link',
  optOut: 'never',
  params: declarationLinkParams,
  subject: (t, params, ctx) => lines(t, params, ctx.locale).subject,
  preheader: (t, params, ctx) => lines(t, params, ctx.locale).lead,
  body: (t, params, ctx) => {
    const text = lines(t, params, ctx.locale)
    return h(
      'div',
      null,
      h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, text.lead),
      h('p', { style: { margin: '0' } }, text.hint),
    )
  },
  text: (t, params, ctx) => {
    const text = lines(t, params, ctx.locale)
    return `${text.lead}\n\n${text.hint}`
  },
  link: (_params, ctx) => (typeof ctx.secrets.token === 'string' ? declarationLinkPath(ctx.secrets.token) : null),
  actionLabel: (t) => t('activities.email.declarationLink.action', 'Declare attendance'),
})

export const activitiesEmailTemplates = [declarationLinkTemplate]
