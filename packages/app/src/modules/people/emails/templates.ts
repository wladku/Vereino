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

// --- The 18th birthday and the account age (people life-cycle spec REQ-L06, REQ-L07; phase L8, #310) ---
// Each notice has a family version (the guardians and the person) and an administrators' version that links to the
// person record. They name the person (first name) and the date of the change, never the birth date (*Security*).

const lifeCycleParams = z.object({ personId: z.uuid(), name: z.string().min(1).max(200), on: z.iso.date() }).strict()

export type LifeCycleNoticeParams = z.output<typeof lifeCycleParams>

const accountAgeParams = z
  .object({ personId: z.uuid(), name: z.string().min(1).max(200), threshold: z.number().int().min(0).max(18) })
  .strict()

export type AccountAgeNoticeParams = z.output<typeof accountAgeParams>

type NoticeCopy = { subject: string; lead: string }

/** One template per notice and audience: the copy, the action and the link differ; the mechanics do not. */
function noticeTemplate<P extends Record<string, unknown>>(input: {
  id: string
  params: z.ZodType<P>
  copy: (t: TranslateWithFallbackFn, params: P, locale: string) => NoticeCopy
  actionLabel: (t: TranslateWithFallbackFn) => string
  link: (params: P) => string
}) {
  return defineEmailTemplate<P>({
    id: input.id,
    notificationType: input.id,
    optOut: 'never',
    params: input.params,
    subject: (t, params, ctx) => input.copy(t, params, ctx.locale).subject,
    body: (t, params, ctx) => {
      const copy = input.copy(t, params, ctx.locale)
      return paragraphs(copy.subject, [copy.lead])
    },
    text: (t, params, ctx) => {
      const copy = input.copy(t, params, ctx.locale)
      return plainText(copy.subject, [copy.lead])
    },
    actionLabel: input.actionLabel,
    link: input.link,
  })
}

const personRecordLink = (params: { personId: string }) => `/backend/people/persons/${params.personId}`

export const TURNS_18_SOON_TEMPLATE = 'people.turns_18_soon'
export const TURNS_18_SOON_ADMIN_TEMPLATE = 'people.turns_18_soon_admin'
export const CAME_OF_AGE_TEMPLATE = 'people.came_of_age'
export const CAME_OF_AGE_ADMIN_TEMPLATE = 'people.came_of_age_admin'
export const ACCOUNT_AGE_REACHED_TEMPLATE = 'people.account_age_reached'
export const ACCOUNT_AGE_REACHED_ADMIN_TEMPLATE = 'people.account_age_reached_admin'

export const turns18SoonTemplate = noticeTemplate<LifeCycleNoticeParams>({
  id: TURNS_18_SOON_TEMPLATE,
  params: lifeCycleParams,
  copy: (t, params, locale) => {
    const values = { name: params.name, date: formatDay(params.on, locale) }
    return {
      subject: t('people.email.turns18Soon.subject', 'From {date} {name} decides alone', values),
      lead: t(
        'people.email.turns18Soon.lead',
        'From {date} {name} is an adult and decides alone: the guardianships end, the consents the guardians gave pass to {name}, who can change them, and new charges name {name} as payer. The guardians no longer see the calendar, the declarations or the charges of {name}. To keep receiving the club messages, {name} needs an own account or an e-mail address — ask the club.',
        values,
      ),
    }
  },
  actionLabel: (t) => t('people.email.lifeCycle.actionFamily', 'Open the club'),
  link: () => '/club/profile',
})

export const turns18SoonAdminTemplate = noticeTemplate<LifeCycleNoticeParams>({
  id: TURNS_18_SOON_ADMIN_TEMPLATE,
  params: lifeCycleParams,
  copy: (t, params, locale) => {
    const values = { name: params.name, date: formatDay(params.on, locale) }
    return {
      subject: t('people.email.turns18SoonAdmin.subject', '{name} decides alone from {date}', values),
      lead: t(
        'people.email.turns18SoonAdmin.lead',
        'From {date} {name} is an adult: the guardianships end on the day before and new charges name {name} as payer. Check that {name} has an account or an e-mail address.',
        values,
      ),
    }
  },
  actionLabel: (t) => t('people.email.lifeCycle.actionAdmin', 'Open the person'),
  link: personRecordLink,
})

export const cameOfAgeTemplate = noticeTemplate<LifeCycleNoticeParams>({
  id: CAME_OF_AGE_TEMPLATE,
  params: lifeCycleParams,
  copy: (t, params, locale) => {
    const values = { name: params.name, date: formatDay(params.on, locale) }
    return {
      subject: t('people.email.cameOfAge.subject', 'Since {date} {name} decides alone', values),
      lead: t(
        'people.email.cameOfAge.lead',
        'Since {date} {name} is an adult. The guardianships ended on the day before; the consents the guardians gave now belong to {name}, who can change them in the app, and new charges name {name} as payer.',
        values,
      ),
    }
  },
  actionLabel: (t) => t('people.email.lifeCycle.actionFamily', 'Open the club'),
  link: () => '/club/profile',
})

export const cameOfAgeAdminTemplate = noticeTemplate<LifeCycleNoticeParams>({
  id: CAME_OF_AGE_ADMIN_TEMPLATE,
  params: lifeCycleParams,
  copy: (t, params, locale) => {
    const values = { name: params.name, date: formatDay(params.on, locale) }
    return {
      subject: t('people.email.cameOfAgeAdmin.subject', '{name} is an adult since {date}', values),
      lead: t(
        'people.email.cameOfAgeAdmin.lead',
        'Since {date} {name} is an adult: the guardianships ended on the day before, the consents passed to {name} and new charges name {name} as payer.',
        values,
      ),
    }
  },
  actionLabel: (t) => t('people.email.lifeCycle.actionAdmin', 'Open the person'),
  link: personRecordLink,
})

export const accountAgeReachedTemplate = noticeTemplate<AccountAgeNoticeParams>({
  id: ACCOUNT_AGE_REACHED_TEMPLATE,
  params: accountAgeParams,
  copy: (t, params) => {
    const values = { name: params.name, age: params.threshold }
    return {
      subject: t('people.email.accountAgeReached.subject', '{name} may have an own account', values),
      lead: t(
        'people.email.accountAgeReached.lead',
        '{name} has reached the age from which the club allows an own account ({age}). With it {name} sees the calendar and declares attendance on the phone. Ask the club to create it.',
        values,
      ),
    }
  },
  actionLabel: (t) => t('people.email.lifeCycle.actionFamily', 'Open the club'),
  link: (params) => `/club/wards/${params.personId}`,
})

export const accountAgeReachedAdminTemplate = noticeTemplate<AccountAgeNoticeParams>({
  id: ACCOUNT_AGE_REACHED_ADMIN_TEMPLATE,
  params: accountAgeParams,
  copy: (t, params) => {
    const values = { name: params.name, age: params.threshold }
    return {
      subject: t('people.email.accountAgeReachedAdmin.subject', '{name} may get an account', values),
      lead: t(
        'people.email.accountAgeReachedAdmin.lead',
        '{name} has reached the club account age ({age}) and has no account. The family was told to ask the club; create the account on request.',
        values,
      ),
    }
  },
  actionLabel: (t) => t('people.email.lifeCycle.actionAdmin', 'Open the person'),
  link: (params) => `/backend/people/persons/${params.personId}?tab=account`,
})

/** The 18th-birthday templates and the account-age templates, registered in `di.ts`. */
export const lifeCycleNoticeTemplates = [
  turns18SoonTemplate,
  turns18SoonAdminTemplate,
  cameOfAgeTemplate,
  cameOfAgeAdminTemplate,
]
export const accountAgeNoticeTemplates = [accountAgeReachedTemplate, accountAgeReachedAdminTemplate]

// --- The medical certificate reminders (training outlines and medical expiry spec REQ-O03, DD-O04; #682) ---
// A month before the "valid until" date and on the date, to the guardians of a minor and to an adult participant. They
// name the person (first name) and the date, nothing else of the health data. `optOut: 'never'` until the foundation
// offers an opt-out mechanism (`isOptOutAvailable`); the spec allows one, it is not built yet.

const medicalReminderParams = z
  .object({
    personId: z.uuid(),
    name: z.string().min(1).max(200),
    validUntil: z.iso.date(),
    /** True when the recipients are the guardians of a minor (the link opens the ward), false for the adult. */
    ward: z.boolean(),
  })
  .strict()

export type MedicalReminderParams = z.output<typeof medicalReminderParams>

export const MEDICAL_EXPIRING_TEMPLATE = 'people.medical_expiring'
export const MEDICAL_EXPIRED_TEMPLATE = 'people.medical_expired'

const medicalLink = (params: MedicalReminderParams) =>
  params.ward ? `/club/wards/${params.personId}` : '/club/profile'

export const medicalExpiringTemplate = noticeTemplate<MedicalReminderParams>({
  id: MEDICAL_EXPIRING_TEMPLATE,
  params: medicalReminderParams,
  copy: (t, params, locale) => {
    const values = { name: params.name, date: formatDay(params.validUntil, locale) }
    return {
      subject: t('people.email.medicalExpiring.subject', "{name}'s medical certificate expires on {date}", values),
      lead: t(
        'people.email.medicalExpiring.lead',
        "The sports medical certificate of {name} is valid until {date}. Book the doctor's visit in time and enter the new date in the app, so the coach sees that {name} may play.",
        values,
      ),
    }
  },
  actionLabel: (t) => t('people.email.medical.action', 'Enter the new date'),
  link: medicalLink,
})

export const medicalExpiredTemplate = noticeTemplate<MedicalReminderParams>({
  id: MEDICAL_EXPIRED_TEMPLATE,
  params: medicalReminderParams,
  copy: (t, params, locale) => {
    const values = { name: params.name, date: formatDay(params.validUntil, locale) }
    return {
      subject: t('people.email.medicalExpired.subject', "{name}'s medical certificate expires today", values),
      lead: t(
        'people.email.medicalExpired.lead',
        'The sports medical certificate of {name} is valid until {date}. From tomorrow the coach sees it as expired. Enter the new date in the app once the doctor has issued it.',
        values,
      ),
    }
  },
  actionLabel: (t) => t('people.email.medical.action', 'Enter the new date'),
  link: medicalLink,
})

/** The medical certificate reminder templates, registered in `di.ts`. */
export const medicalReminderTemplates = [medicalExpiringTemplate, medicalExpiredTemplate]
