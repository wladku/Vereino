// Probe e-mail templates and the probe in-app notification type of the foundation III integration tests (TEST-M01…M04).
// They live here, under the QA fixtures, never in a shipped module (spec *Implementation Phases → Phase A*, step 4): the
// probe registers them in its own process only.
import * as React from 'react'
import { z } from 'zod'

/** The in-app type every probe template maps to; declared `channels: ['in_app']` like every Vereino type (DD-M07). */
export const PROBE_NOTIFICATION_TYPE = {
  type: 'qa_probe.message',
  module: 'qa_probe',
  channels: ['in_app'],
  nonOptOut: true,
  titleKey: 'qa_probe.notifications.message.title',
  bodyKey: 'qa_probe.notifications.message.body',
  icon: 'mail',
  severity: 'info',
  category: 'qa_probe',
  actions: [],
}

/** Subject prefixes by language: the probe's own words, so the tests can tell its e-mails from any other. */
export const PROBE_SUBJECT = { pl: 'Próba', en: 'Probe' }

const subjectPrefix = (locale) => PROBE_SUBJECT[locale] ?? PROBE_SUBJECT.en

/**
 * The probe templates; `clubText` is the foundation's escaped-paragraphs helper, passed in from the container.
 * - `qa_probe.message` (`never`): a subject and club text, a link to `/club`.
 * - `qa_probe.secret_link` (`never`): a personal link built from the recipient's secret (REQ-M03).
 * - `qa_probe.reminder` (`preferences`): must be refused until its opt-out exists (Q15 = B).
 */
export function probeTemplates(clubText) {
  const message = {
    id: 'qa_probe.message',
    notificationType: PROBE_NOTIFICATION_TYPE.type,
    optOut: 'never',
    params: z.object({ subject: z.string().min(1), body: z.string() }).strict(),
    subject: (_t, params, ctx) => `${subjectPrefix(ctx.locale)}: ${params.subject}`,
    body: (_t, params) => React.createElement('div', null, clubText(params.body)),
    text: (_t, params) => params.body,
    link: () => '/club',
  }
  const secretLink = {
    id: 'qa_probe.secret_link',
    notificationType: PROBE_NOTIFICATION_TYPE.type,
    optOut: 'never',
    params: z.object({}).strict(),
    subject: (_t, _params, ctx) => `${subjectPrefix(ctx.locale)}: link`,
    body: (_t, _params, ctx) =>
      React.createElement(
        'p',
        null,
        React.createElement('a', { href: `/p/link/${String(ctx.secrets.token)}` }, 'link'),
      ),
    text: () => 'link',
    link: (_params, ctx) => `/p/link/${String(ctx.secrets.token)}`,
  }
  const reminder = { ...message, id: 'qa_probe.reminder', optOut: 'preferences' }
  return [message, secretLink, reminder]
}
