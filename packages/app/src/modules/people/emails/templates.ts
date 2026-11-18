// The e-mail templates of `people` (foundation III P-31; people life-cycle spec *Events, Jobs, Notifications*; phase
// L4, #306): a member asked to leave (to the club administrators), the club declined a departure request, the club
// confirmed a departure with its last day. Ids and dates only: no names, notes or reasons. On the dispatch worker's
// import graph, so it imports no `.tsx` and nothing of `@vereino/ui` (lesson
// `worker-runtime-imports-and-notification-strategies`).
import * as React from 'react'
import { z } from 'zod'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { defineEmailTemplate } from '@/modules/foundation'

const h = React.createElement

function paragraphs(lead: string, lines: readonly string[]) {
  return h(
    'div',
    null,
    h('p', { style: { margin: '0 0 12px', fontWeight: 600 } }, lead),
    ...lines.map((line, index) => h('p', { key: String(index), style: { margin: '0 0 8px' } }, line)),
  )
}

function plainText(lead: string, lines: readonly string[]): string {
  return [lead, '', ...lines].join('\n')
}

/** `YYYY-MM-DD` as the reader's long date (UTC: a calendar date has no zone). */
function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  )
}

// --- A member asked to leave (to the club administrators) ---

export const DEPARTURE_REQUEST_RECEIVED_TEMPLATE = 'people.departure_request_received'

const requestReceivedParams = z
  .object({ batchId: z.uuid(), subjectPersonId: z.uuid(), subjectCount: z.number().int().min(1).max(50) })
  .strict()

export type DepartureRequestReceivedParams = z.output<typeof requestReceivedParams>

function requestReceivedCopy(t: TranslateWithFallbackFn, params: DepartureRequestReceivedParams) {
  return {
    subject: t('people.email.departureRequestReceived.subject', 'A request to leave the club'),
    lead: t(
      'people.email.departureRequestReceived.lead',
      'A member asked to leave the club ({count} persons). Open the request on the person record, tab Leaving.',
      { count: params.subjectCount },
    ),
  }
}

export const departureRequestReceivedTemplate = defineEmailTemplate<DepartureRequestReceivedParams>({
  id: DEPARTURE_REQUEST_RECEIVED_TEMPLATE,
  notificationType: 'people.departure_request_received',
  optOut: 'never',
  params: requestReceivedParams,
  subject: (t, params) => requestReceivedCopy(t, params).subject,
  body: (t, params) => {
    const copy = requestReceivedCopy(t, params)
    return paragraphs(copy.subject, [copy.lead])
  },
  text: (t, params) => {
    const copy = requestReceivedCopy(t, params)
    return plainText(copy.subject, [copy.lead])
  },
  actionLabel: (t) => t('people.email.departureRequestReceived.action', 'Open the request'),
  link: (params) => `/backend/people/persons/${params.subjectPersonId}?tab=leaving`,
})

// --- The club declined a request (to the member who filed it) ---

export const DEPARTURE_REQUEST_DECLINED_TEMPLATE = 'people.departure_request_declined'

const requestDeclinedParams = z.object({ batchId: z.uuid() }).strict()

export type DepartureRequestDeclinedParams = z.output<typeof requestDeclinedParams>

function requestDeclinedCopy(t: TranslateWithFallbackFn) {
  return {
    subject: t('people.email.departureRequestDeclined.subject', 'Your request to leave the club'),
    lead: t(
      'people.email.departureRequestDeclined.lead',
      'The club declined your request to leave. Open it in the app to read the reason.',
    ),
  }
}

export const departureRequestDeclinedTemplate = defineEmailTemplate<DepartureRequestDeclinedParams>({
  id: DEPARTURE_REQUEST_DECLINED_TEMPLATE,
  notificationType: 'people.departure_request_declined',
  optOut: 'never',
  params: requestDeclinedParams,
  subject: (t) => requestDeclinedCopy(t).subject,
  body: (t) => {
    const copy = requestDeclinedCopy(t)
    return paragraphs(copy.subject, [copy.lead])
  },
  text: (t) => {
    const copy = requestDeclinedCopy(t)
    return plainText(copy.subject, [copy.lead])
  },
  actionLabel: (t) => t('people.email.departureRequestDeclined.action', 'Open the request'),
  link: () => '/club/profile/leave',
})

// --- The club confirmed a departure (to the persons who leave) ---

export const DEPARTURE_CONFIRMED_TEMPLATE = 'people.departure_confirmed'

const departureConfirmedParams = z.object({ departureId: z.uuid(), lastDay: z.iso.date() }).strict()

export type DepartureConfirmedParams = z.output<typeof departureConfirmedParams>

function departureConfirmedCopy(t: TranslateWithFallbackFn, params: DepartureConfirmedParams, locale: string) {
  const values = { date: formatDay(params.lastDay, locale) }
  return {
    subject: t('people.email.departureConfirmed.subject', 'Leaving the club on {date}', values),
    lead: t(
      'people.email.departureConfirmed.lead',
      'The club recorded your departure. Your last day in the club is {date}; your groups, roles and guardianships end on that day and your account closes the day after.',
      values,
    ),
  }
}

export const departureConfirmedTemplate = defineEmailTemplate<DepartureConfirmedParams>({
  id: DEPARTURE_CONFIRMED_TEMPLATE,
  notificationType: 'people.departure_confirmed',
  optOut: 'never',
  params: departureConfirmedParams,
  subject: (t, params, ctx) => departureConfirmedCopy(t, params, ctx.locale).subject,
  body: (t, params, ctx) => {
    const copy = departureConfirmedCopy(t, params, ctx.locale)
    return paragraphs(copy.subject, [copy.lead])
  },
  text: (t, params, ctx) => {
    const copy = departureConfirmedCopy(t, params, ctx.locale)
    return plainText(copy.subject, [copy.lead])
  },
  actionLabel: (t) => t('people.email.departureConfirmed.action', 'Open the club'),
  link: () => '/club/profile',
})
