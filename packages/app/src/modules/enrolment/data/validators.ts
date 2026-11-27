// Input schemas of `enrolment` (sign-up form spec BR-J1, *API, Command, and Error Contracts*; #799). Client-safe: the
// public form validates each step with the same schema the server applies.
import { z } from 'zod'
import { isCalendarDate } from '@vereino/core'
import { APPLICATION_TABS, EMAIL_MAX, NAME_MAX, NOTE_MAX, REASON_MAX, normalizePhone } from '../lib/applications'
import { APPLICATION_KINDS, EXPERIENCE_LEVELS } from '../lib/states'

const name = z.string().trim().min(1).max(NAME_MAX)
const calendarDate = z.string().refine(isCalendarDate, { message: 'Expected a date as YYYY-MM-DD' })
const phone = z
  .string()
  .max(40)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value)
    if (normalized === null) {
      ctx.addIssue({ code: 'custom', message: 'Expected a phone number' })
      return z.NEVER
    }
    return normalized
  })

/** The form's three steps (P-J2) as one body; `website` is the honeypot (checked before the schema). */
export const applicationSubmitSchema = z
  .object({
    kind: z.enum(APPLICATION_KINDS),
    participantFirstName: name,
    participantLastName: name,
    participantBirthDate: calendarDate,
    guardianFirstName: name.nullable().optional(),
    guardianLastName: name.nullable().optional(),
    email: z.string().trim().max(EMAIL_MAX).pipe(z.email()),
    phone,
    guardianStatement: z.boolean().optional(),
    groupId: z.uuid().nullable().optional(),
    chooseForUs: z.boolean().optional(),
    wantsTrial: z.boolean().default(true),
    experience: z.enum(EXPERIENCE_LEVELS).nullable().optional(),
    note: z.string().trim().max(NOTE_MAX).nullable().optional(),
    rulesAccepted: z.literal(true),
    privacyAcknowledged: z.literal(true),
    website: z.string().max(200).optional(),
    locale: z.string().max(16).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'child') {
      if (!value.guardianFirstName) ctx.addIssue({ code: 'custom', path: ['guardianFirstName'], message: 'Required' })
      if (!value.guardianLastName) ctx.addIssue({ code: 'custom', path: ['guardianLastName'], message: 'Required' })
      if (value.guardianStatement !== true) {
        ctx.addIssue({ code: 'custom', path: ['guardianStatement'], message: 'Required' })
      }
    }
    if (!value.groupId && value.chooseForUs !== true) {
      ctx.addIssue({ code: 'custom', path: ['groupId'], message: 'Choose a group or "choose for us"' })
    }
  })

export type ApplicationSubmitInput = z.output<typeof applicationSubmitSchema>

/** A personal link's token in the body (P-J3, P-J4). */
export const tokenBodySchema = z.object({ token: z.string().min(1).max(128) }).strict()

/** "Send again" and "Send me a new link" (uniform 202). */
export const emailBodySchema = z.object({ email: z.string().trim().max(EMAIL_MAX).pipe(z.email()) }).strict()

export const rejectSchema = z
  .object({ id: z.uuid(), reason: z.string().trim().min(1).max(REASON_MAX), updatedAt: z.string().optional() })
  .strict()

export const waitSchema = z.object({ id: z.uuid(), groupId: z.uuid(), updatedAt: z.string().optional() }).strict()

/** `enrolment.applications.accept` (BR-J6, DD-J10, Q-J08; phase 3, #800). A person id reuses a possible duplicate. */
export const acceptSchema = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    startDay: calendarDate,
    child: z.object({ personId: z.uuid().nullable().optional() }).strict().optional(),
    guardian: z
      .object({
        personId: z.uuid().nullable().optional(),
        /** The guardian's birth date, which an account needs (the form does not ask it); for a new guardian only. */
        birthDate: calendarDate.nullable().optional(),
      })
      .strict()
      .optional(),
    overLimit: z.boolean().optional(),
    sendInvitation: z.boolean().default(true),
    updatedAt: z.string().optional(),
  })
  .strict()

export type AcceptInput = z.output<typeof acceptSchema>

export const applicationListQuerySchema = z
  .object({
    tab: z.enum(APPLICATION_TABS).default('new'),
    sectionId: z.uuid().optional(),
    groupId: z.uuid().optional(),
    overdue: z.enum(['1', 'true']).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .loose()

export type ApplicationListQuery = z.output<typeof applicationListQuerySchema>
