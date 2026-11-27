// The applications of a section (sign-up form spec *API, Command, and Error Contracts*, BR-J1…BR-J5, DD-J06, DD-J07,
// DD-J09, DD-J13; REQ-J04…REQ-J12; #799):
// - `enrolment.applications.submit` (no session): the club and the section come from the one slug lookup of
//   `clubCorePublicSite` (D-024/D-026); a filled honeypot is refused before anything is read; the hard limits (BR-J2)
//   and the chosen group (public, active, accepting) are checked; the row is created `unconfirmed` with a new
//   single-use confirmation link and its e-mail, enqueued in the same transaction. A repeated application (BR-J3)
//   answers the same and creates no row: an unconfirmed one gets a new confirmation link, a confirmed one a new status
//   link;
// - `enrolment.applications.confirm` (no session): the link is redeemed within the slug's club only (DD-J06); the
//   application goes to `new`, or to `waiting` for a chosen group that is full today (DD-J09); a status link is issued
//   and e-mailed; after commit the deciders are told and the possible duplicates stored (DD-J11);
// - `enrolment.applications.withdraw` (no session, the status link): an open application is withdrawn;
// - `enrolment.applications.resend_confirmation` / `resend_link` (no session): new links for an address's unconfirmed
//   or open applications in that club; the routes answer 202 either way;
// - `enrolment.applications.reject` / `wait` (BR-J5): undoable decisions; each e-mails the applicant;
// - `enrolment.applications.expire_unconfirmed` / `daily` (club jobs, DD-J14): R22 and R23.
// `submit`, `confirm` and `withdraw` are not undoable; their logs drop the payload (`replayable: false`).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode } from '@mikro-orm/core'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { assertTransition, authorizeScoped, foundationErrors } from '@/modules/foundation'
import { enrolmentErrors } from '../api/errors'
import { Application, ApplicationLink, ConfirmationLink } from '../data/entities'
import { applicationSubmitSchema, emailBodySchema, rejectSchema, tokenBodySchema, waitSchema } from '../data/validators'
import { seasonEnded } from '../lib/accept'
import { ageFitOf, ageLimitIssue, ageReferenceDate } from '../lib/age'
import {
  STATUS_LINK_TTL_MS,
  anonymiseCutoff,
  cleanName,
  confirmedState,
  unconfirmedCutoff,
  waitingNumbers,
} from '../lib/applications'
import { OPEN_STATES, applicationTransitions, isDecidableState, type ApplicationState } from '../lib/states'
import {
  applicationTargets,
  clubDay,
  duplicateCandidates,
  enrolmentSettings,
  isOfferedGroup,
  publicSite,
  sectionNames,
  type EnrolmentScope,
} from '../services/directory'
import {
  applicantKey,
  applicationLinks,
  confirmationLinks,
  cutStatusLinks,
  emailKey,
  reissueConfirmationLink,
  reissueStatusLink,
} from '../services/links'
import { applicantLocale, enqueueApplicantMail, notifyDeciders, publishDispatches } from '../services/mail'
import { announceFreedPlaces } from '../services/places'
import { anonymiseApplications } from '../services/retention'
import {
  APPLICANT_ROLE,
  applicationSnapshot,
  authorizeApplicationReplay,
  authorizeDecision,
  emitAfterCommit,
  enrolmentLog,
  inWriteTransaction,
  throwFieldError,
  type ApplicationCommandResult,
} from './shared'

const slugSchema = z.string().min(1).max(120)

const submitSchema = z.object({ clubSlug: slugSchema, sectionSlug: slugSchema, application: z.unknown() }).strict()

const confirmSchema = tokenBodySchema.extend({ clubSlug: slugSchema }).strict()
const withdrawSchema = confirmSchema
const resendSchema = emailBodySchema.extend({ clubSlug: slugSchema }).strict()

const scopeOf = (row: { tenantId: string; organizationId: string }): EnrolmentScope => ({
  tenantId: row.tenantId,
  organizationId: row.organizationId,
})

/** The club behind a slug, or a 410 like an unknown token (a token route never tells whether a club exists). */
async function clubScopeForToken(ctx: CommandRuntimeContext, clubSlug: string): Promise<EnrolmentScope> {
  const found = await publicSite(ctx.container).clubFrame(clubSlug)
  if (found.status !== 'ok') return foundationErrors.throw('token_link_expired')
  return { tenantId: found.value.tenantId, organizationId: found.value.organizationId }
}

/** The club behind a slug for a uniform-202 route; null for an unknown or unpublished club. */
async function clubScopeOrNull(ctx: CommandRuntimeContext, clubSlug: string): Promise<EnrolmentScope | null> {
  const found = await publicSite(ctx.container).clubFrame(clubSlug)
  return found.status === 'ok' ? { tenantId: found.value.tenantId, organizationId: found.value.organizationId } : null
}

/** The application's decrypted contact data, read on a fork so the transactional row keeps its stored columns. */
async function decryptedApplication(em: EntityManager, scope: EnrolmentScope, id: string): Promise<Application | null> {
  return findOneWithDecryption(em.fork(), Application, { id, ...scope, deletedAt: null }, {}, scope)
}

/** The waiting number of one application among its group's waiting list (DD-J09). */
export async function waitingNumberOf(
  em: EntityManager,
  scope: EnrolmentScope,
  row: Pick<Application, 'id' | 'groupId' | 'state'>,
): Promise<number | null> {
  if (row.state !== 'waiting' || !row.groupId) return null
  const rows = await em.find(
    Application,
    { ...scope, groupId: row.groupId, state: 'waiting', deletedAt: null },
    { fields: ['id', 'groupId', 'waitingSince'] },
  )
  return (
    waitingNumbers(
      rows.map((entry) => ({ id: entry.id, groupId: entry.groupId ?? null, waitingSince: entry.waitingSince ?? null })),
    ).get(row.id) ?? null
  )
}

async function sectionNameOf(
  ctx: CommandRuntimeContext,
  scope: EnrolmentScope,
  sectionId: string,
  em?: EntityManager,
): Promise<string> {
  return (await sectionNames(ctx.container, scope, [sectionId], em)).get(sectionId) ?? '—'
}

// --- Submit (P-J2) ---

export type SubmitResult = ApplicationCommandResult & { created: boolean }

const submitCommand: CommandHandler<Record<string, unknown>, SubmitResult> = {
  id: 'enrolment.applications.submit',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const outer = submitSchema.parse(rawInput)
    const honeypot = (outer.application as { website?: unknown } | null)?.website
    // The honeypot: a human never sees the field, so a value means a bot. Refused before any read.
    if (typeof honeypot === 'string' && honeypot.trim().length > 0) await enrolmentErrors.throw('application_refused')
    const input = applicationSubmitSchema.parse(outer.application)
    const found = await publicSite(ctx.container).applicationSection(outer.clubSlug, outer.sectionSlug)
    if (found.status !== 'ok' || !found.value.section.acceptsApplications) {
      return enrolmentErrors.throw('applications_closed')
    }
    const { frame, section } = found.value
    const scope: EnrolmentScope = { tenantId: frame.tenantId, organizationId: frame.organizationId }
    const settings = await enrolmentSettings(ctx.container, scope)
    const now = new Date()
    const today = clubDay(settings, now)
    const referenceDate = ageReferenceDate(today, settings.referenceDay)
    const ageIssue = ageLimitIssue(input.kind, input.participantBirthDate, referenceDate, today)
    if (ageIssue) await throwFieldError(ageIssue, 'participantBirthDate')
    const targets = (
      await applicationTargets(ctx.container, scope, { sectionId: section.id, date: referenceDate })
    ).filter(isOfferedGroup)
    if (targets.length === 0) return enrolmentErrors.throw('applications_closed')
    const groupId = input.groupId ?? null
    const target = groupId ? targets.find((entry) => entry.groupId === groupId) : undefined
    if (groupId && !target) await throwFieldError('application_group_invalid', 'groupId')
    const ageFit = target ? ageFitOf(input.participantBirthDate, referenceDate, target.fitRule) : 'unknown'
    const key = applicantKey(scope, {
      email: input.email,
      firstName: input.participantFirstName,
      lastName: input.participantLastName,
      birthDate: input.participantBirthDate,
    })
    const locale = applicantLocale(input.locale, settings.locale)
    const dispatchIds: Array<string | null> = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.submit', async (em) => {
      const existing = await em.findOne(
        Application,
        { ...scope, sectionId: section.id, applicantKey: key, state: { $in: [...OPEN_STATES] }, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )
      const mailBase = { clubSlug: outer.clubSlug, sectionName: section.name }
      if (existing) {
        // BR-J3: the same answer as a new application, and a new link for the existing one.
        if (existing.state === 'unconfirmed') {
          const { rawToken, link } = await reissueConfirmationLink(ctx.container, em, scope, existing.id)
          dispatchIds.push(
            await enqueueApplicantMail(ctx.container, em, scope, {
              applicationId: existing.id,
              template: 'confirm_email',
              event: `confirm:${link.id}`,
              params: { applicationId: existing.id, ...mailBase },
              email: input.email,
              locale,
              token: rawToken,
            }),
          )
        } else {
          const { rawToken, link } = await reissueStatusLink(ctx.container, em, scope, existing.id)
          dispatchIds.push(
            await enqueueApplicantMail(ctx.container, em, scope, {
              applicationId: existing.id,
              template: 'new_link',
              event: `new_link:${link.id}`,
              params: { applicationId: existing.id, ...mailBase },
              email: input.email,
              locale,
              token: rawToken,
            }),
          )
        }
        return { entity: existing, actingRole: APPLICANT_ROLE, before: applicationSnapshot(existing), created: false }
      }
      const child = input.kind === 'child'
      const row = em.create(Application, {
        id: randomUUID(),
        ...scope,
        sectionId: section.id,
        groupId,
        kind: input.kind,
        state: 'unconfirmed',
        participantFirstName: cleanName(input.participantFirstName),
        participantLastName: cleanName(input.participantLastName),
        guardianFirstName: child && input.guardianFirstName ? cleanName(input.guardianFirstName) : null,
        guardianLastName: child && input.guardianLastName ? cleanName(input.guardianLastName) : null,
        guardianEmail: input.email.trim(),
        guardianPhone: input.phone,
        note: input.note ? input.note : null,
        participantBirthDate: input.participantBirthDate,
        applicantKey: key,
        emailKey: emailKey(scope, input.email),
        wantsTrial: input.wantsTrial,
        experience: input.experience ?? null,
        ageFit,
        referenceDate,
        locale,
        rulesAcceptedAt: now,
        privacyAcknowledgedAt: now,
        informationTextChangedAt: settings.informationChangedAt,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(row)
      await em.flush()
      const { rawToken, link } = await confirmationLinks(ctx.container).issue(em, { applicationId: row.id }, scope)
      dispatchIds.push(
        await enqueueApplicantMail(ctx.container, em, scope, {
          applicationId: row.id,
          template: 'confirm_email',
          event: `confirm:${link.id}`,
          params: { applicationId: row.id, ...mailBase },
          email: input.email,
          locale,
          token: rawToken,
        }),
      )
      return { entity: row, actingRole: APPLICANT_ROLE, before: null, created: true }
    })
    await publishDispatches(ctx.container, scope, dispatchIds)
    return result
  },
  buildLog: async ({ result }) => ({
    ...(await enrolmentLog({
      result,
      labelKey: 'enrolment.audit.submit',
      fallback: 'Submit an application',
      context: { actor: 'applicant', created: result.created },
    })),
    // The input holds the applicant's data; the snapshot keeps ids, states and times only.
    replayable: false,
  }),
}

// --- Confirm (P-J3) ---

export type ConfirmResult = ApplicationCommandResult & { waitingNumber: number | null; answerDays: number }

const confirmCommand: CommandHandler<Record<string, unknown>, ConfirmResult> = {
  id: 'enrolment.applications.confirm',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const input = confirmSchema.parse(rawInput)
    const scope = await clubScopeForToken(ctx, input.clubSlug)
    const settings = await enrolmentSettings(ctx.container, scope)
    const now = new Date()
    const today = clubDay(settings, now)
    const dispatchIds: Array<string | null> = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.confirm', async (em) => {
      // DD-J06: the lookup runs within the slug's club only; another club's token answers like an unknown one.
      const redeemed = await confirmationLinks(ctx.container).redeem(em, input.token, { scope })
      if (!redeemed) return foundationErrors.throw('token_link_expired')
      const row = await em.findOne(
        Application,
        { id: redeemed.link.applicationId, ...scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
      )
      if (!row) return foundationErrors.throw('token_link_expired')
      if (row.state !== 'unconfirmed') return foundationErrors.throw('token_link_used')
      const before = applicationSnapshot(row)
      const chosen = row.groupId
        ? (
            await applicationTargets(ctx.container, scope, {
              sectionId: row.sectionId,
              date: today,
              groupIds: [row.groupId],
              em,
            })
          ).at(0)
        : undefined
      const next = confirmedState(chosen ?? null)
      await assertTransition(applicationTransitions, row.state, next)
      row.state = next
      row.confirmedAt = now
      row.waitingSince = next === 'waiting' ? now : null
      row.updatedAt = now
      await em.flush()
      const waitingNumber = await waitingNumberOf(em, scope, row)
      const contact = await decryptedApplication(em, scope, row.id)
      const { rawToken } = await reissueStatusLink(ctx.container, em, scope, row.id)
      if (contact?.guardianEmail) {
        dispatchIds.push(
          await enqueueApplicantMail(ctx.container, em, scope, {
            applicationId: row.id,
            template: 'received',
            event: 'received',
            params: {
              applicationId: row.id,
              clubSlug: input.clubSlug,
              sectionName: await sectionNameOf(ctx, scope, row.sectionId, em),
              answerDays: settings.answerDays,
              groupName: next === 'waiting' ? (chosen?.name ?? null) : null,
              waitingNumber,
            },
            email: contact.guardianEmail,
            locale: applicantLocale(row.locale, settings.locale),
            token: rawToken,
          }),
        )
      }
      return { entity: row, actingRole: APPLICANT_ROLE, before, waitingNumber, answerDays: settings.answerDays }
    })
    await publishDispatches(ctx.container, scope, dispatchIds)
    await emitAfterCommit('enrolment.application.confirmed', scope, {
      id: result.entity.id,
      state: result.entity.state,
    })
    await afterConfirm(ctx, scope, result.entity, today)
    return result
  },
  buildLog: async ({ result }) => ({
    ...(await enrolmentLog({
      result,
      labelKey: 'enrolment.audit.confirm',
      fallback: 'Confirm an application',
      context: { actor: 'applicant' },
    })),
    replayable: false,
  }),
}

/**
 * After the confirmation commits (DD-J11, REQ-J10): the in-app notice to the deciders and the possible duplicates,
 * stored on the application as scalar ids. A failure here never undoes the confirmation.
 */
async function afterConfirm(
  ctx: CommandRuntimeContext,
  scope: EnrolmentScope,
  row: Application,
  today: string,
): Promise<void> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const sectionName = await sectionNameOf(ctx, scope, row.sectionId, em)
  try {
    await notifyDeciders(ctx.container, scope, { applicationId: row.id, sectionId: row.sectionId, sectionName, today })
  } catch {
    // The notice is a convenience; the coordinator's list shows the application anyway.
  }
  try {
    await storeDuplicateCandidates(ctx, scope, row.id, today)
  } catch {
    // Duplicates are a flag only; the accept sheet (phase 3) computes them again.
  }
}

/** Computes and stores the possible duplicates of an application (DD-J11): ids and reasons only. */
export async function storeDuplicateCandidates(
  ctx: CommandRuntimeContext,
  scope: EnrolmentScope,
  applicationId: string,
  today: string,
): Promise<void> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const app = await decryptedApplication(em, scope, applicationId)
  if (!app?.participantFirstName || !app.participantLastName) return
  const participant = await duplicateCandidates(
    ctx.container,
    scope,
    {
      firstName: app.participantFirstName,
      lastName: app.participantLastName,
      birthDate: app.participantBirthDate ?? null,
      ...(app.kind === 'adult' ? { email: app.guardianEmail ?? null, phone: app.guardianPhone ?? null } : {}),
    },
    today,
  )
  const guardian =
    app.kind === 'child' && app.guardianFirstName && app.guardianLastName
      ? await duplicateCandidates(
          ctx.container,
          scope,
          {
            firstName: app.guardianFirstName,
            lastName: app.guardianLastName,
            email: app.guardianEmail ?? null,
            phone: app.guardianPhone ?? null,
          },
          today,
        )
      : []
  const stored = [
    ...participant.map((entry) => ({ personId: entry.personId, role: 'participant' as const, reason: entry.reason })),
    ...guardian.map((entry) => ({ personId: entry.personId, role: 'guardian' as const, reason: entry.reason })),
  ]
  await em.nativeUpdate(Application, { id: applicationId, ...scope }, { duplicateCandidates: stored })
}

// --- Withdraw (P-J4) ---

const withdrawCommand: CommandHandler<Record<string, unknown>, ApplicationCommandResult> = {
  id: 'enrolment.applications.withdraw',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const input = withdrawSchema.parse(rawInput)
    const scope = await clubScopeForToken(ctx, input.clubSlug)
    const settings = await enrolmentSettings(ctx.container, scope)
    const now = new Date()
    const dispatchIds: Array<string | null> = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.withdraw', async (em) => {
      const found = await applicationLinks(ctx.container).redeem(em, input.token, { scope })
      if (!found) return foundationErrors.throw('token_link_expired')
      const row = await em.findOne(
        Application,
        { id: found.link.applicationId, ...scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
      )
      if (!row) return foundationErrors.throw('token_link_expired')
      if (!isDecidableState(row.state)) return enrolmentErrors.throw('application_state_conflict')
      const before = applicationSnapshot(row)
      await assertTransition(applicationTransitions, row.state, 'withdrawn')
      row.state = 'withdrawn'
      row.closedAt = now
      row.updatedAt = now
      await em.flush()
      await cutStatusLinks(em, scope, row.id, now)
      const contact = await decryptedApplication(em, scope, row.id)
      if (contact?.guardianEmail) {
        dispatchIds.push(
          await enqueueApplicantMail(ctx.container, em, scope, {
            applicationId: row.id,
            template: 'withdrawn',
            event: 'withdrawn',
            params: {
              applicationId: row.id,
              clubSlug: input.clubSlug,
              sectionName: await sectionNameOf(ctx, scope, row.sectionId, em),
            },
            email: contact.guardianEmail,
            locale: applicantLocale(row.locale, settings.locale),
          }),
        )
      }
      return { entity: row, actingRole: APPLICANT_ROLE, before }
    })
    await publishDispatches(ctx.container, scope, dispatchIds)
    await emitAfterCommit('enrolment.application.withdrawn', scope, { id: result.entity.id })
    return result
  },
  buildLog: async ({ result }) => ({
    ...(await enrolmentLog({
      result,
      labelKey: 'enrolment.audit.withdraw',
      fallback: 'Withdraw an application',
      context: { actor: 'applicant' },
    })),
    replayable: false,
  }),
}

// --- New links by e-mail (P-J2 "Send again", P-J4 "Send me a new link") ---

export type ResendResult = { sent: number }

function resendCommand(kind: 'confirmation' | 'link'): CommandHandler<Record<string, unknown>, ResendResult> {
  return {
    id: kind === 'confirmation' ? 'enrolment.applications.resend_confirmation' : 'enrolment.applications.resend_link',
    isUndoable: false,
    async execute(rawInput, ctx) {
      const input = resendSchema.parse(rawInput)
      const scope = await clubScopeOrNull(ctx, input.clubSlug)
      if (!scope) return { sent: 0 }
      const settings = await enrolmentSettings(ctx.container, scope)
      const states: ApplicationState[] = kind === 'confirmation' ? ['unconfirmed'] : ['new', 'trial', 'waiting']
      const dispatchIds: Array<string | null> = []
      const sent = await inWriteTransaction(ctx, `enrolment.applications.resend_${kind}`, async (em) => {
        const rows = await em.find(
          Application,
          { ...scope, emailKey: emailKey(scope, input.email), state: { $in: states }, deletedAt: null },
          { orderBy: { createdAt: 'asc' }, limit: 10 },
        )
        const names = await sectionNames(ctx.container, scope, [...new Set(rows.map((row) => row.sectionId))], em)
        for (const row of rows) {
          const reissued =
            kind === 'confirmation'
              ? await reissueConfirmationLink(ctx.container, em, scope, row.id)
              : await reissueStatusLink(ctx.container, em, scope, row.id)
          dispatchIds.push(
            await enqueueApplicantMail(ctx.container, em, scope, {
              applicationId: row.id,
              template: kind === 'confirmation' ? 'confirm_email' : 'new_link',
              event: `${kind === 'confirmation' ? 'confirm' : 'new_link'}:${reissued.link.id}`,
              params: {
                applicationId: row.id,
                clubSlug: input.clubSlug,
                sectionName: names.get(row.sectionId) ?? '—',
              },
              email: input.email.trim(),
              locale: applicantLocale(row.locale, settings.locale),
              token: reissued.rawToken,
            }),
          )
        }
        return rows.length
      })
      await publishDispatches(ctx.container, scope, dispatchIds)
      return { sent }
    },
  }
}

// --- Decisions (M-J3, B-J1) ---

/** Closes an application by a decision: the reason the applicant sees, the decider, the status link cut (DD-J07). */
const rejectCommand: CommandHandler<Record<string, unknown>, ApplicationCommandResult> = {
  id: 'enrolment.applications.reject',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const now = new Date()
    let scope: EnrolmentScope | null = null
    const dispatchIds: Array<string | null> = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.reject', async (em) => {
      const authorized = await authorizeDecision(rejectSchema, rawInput, ctx, em)
      const row = authorized.entity as Application
      scope = scopeOf(row)
      if (!isDecidableState(row.state)) return enrolmentErrors.throw('application_state_conflict')
      const before = applicationSnapshot(row)
      await assertTransition(applicationTransitions, row.state, 'rejected')
      row.state = 'rejected'
      row.decisionReason = authorized.parsed.reason
      row.decidedAt = now
      row.decidedByUserId = ctx.auth?.sub ?? null
      row.closedAt = now
      row.updatedAt = now
      await em.flush()
      await cutStatusLinks(em, scope, row.id, now)
      const contact = await decryptedApplication(em, scope, row.id)
      const settings = await enrolmentSettings(ctx.container, scope)
      if (contact?.guardianEmail && settings.publicSlug) {
        dispatchIds.push(
          await enqueueApplicantMail(ctx.container, em, scope, {
            applicationId: row.id,
            template: 'rejected',
            event: 'rejected',
            params: {
              applicationId: row.id,
              clubSlug: settings.publicSlug,
              sectionName: await sectionNameOf(ctx, scope, row.sectionId, em),
              reason: authorized.parsed.reason,
            },
            email: contact.guardianEmail,
            locale: applicantLocale(row.locale, settings.locale),
          }),
        )
      }
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    const trusted = scopeOf(result.entity)
    await publishDispatches(ctx.container, trusted, dispatchIds)
    await emitAfterCommit('enrolment.application.decided', trusted, { id: result.entity.id, decision: 'rejected' })
    return result
  },
  buildLog: ({ result }) =>
    enrolmentLog({ result, labelKey: 'enrolment.audit.reject', fallback: 'Reject an application' }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeApplicationReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as { state?: string; id?: string } | null | undefined
    const row = await authorizeApplicationReplay(ctx, logEntry.resourceId)
    if (row.state !== 'rejected' || !before?.state) return
    await restoreDecided(ctx.transactionalEm as EntityManager, row, before as Parameters<typeof restoreDecided>[2])
  },
}

/** Undo of a decision: the previous state and decision columns come back; e-mails already sent stay sent. */
async function restoreDecided(
  em: EntityManager,
  row: Application,
  before: {
    state: string
    groupId?: string | null
    waitingSince?: string | null
    decidedAt?: string | null
    decidedByUserId?: string | null
    closedAt?: string | null
    ageFit?: string
  },
): Promise<void> {
  const now = new Date()
  const date = (value: string | null | undefined) => (value ? new Date(value) : null)
  row.state = before.state as ApplicationState
  row.groupId = before.groupId ?? null
  row.waitingSince = date(before.waitingSince)
  row.decidedAt = date(before.decidedAt)
  row.decidedByUserId = before.decidedByUserId ?? null
  row.closedAt = date(before.closedAt)
  if (before.ageFit) row.ageFit = before.ageFit as Application['ageFit']
  row.decisionReason = null
  row.updatedAt = now
  await em.flush()
  if (!row.closedAt) {
    const scope = scopeOf(row)
    await em.nativeUpdate(
      ApplicationLink,
      { ...scope, applicationId: row.id },
      { expiresAt: new Date(now.getTime() + STATUS_LINK_TTL_MS), updatedAt: now },
    )
  }
}

/** Puts an application on a group's waiting list (`new|trial → waiting`, or another group from `waiting`). */
const waitCommand: CommandHandler<
  Record<string, unknown>,
  ApplicationCommandResult & { waitingNumber: number | null }
> = {
  id: 'enrolment.applications.wait',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const now = new Date()
    const dispatchIds: Array<string | null> = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.wait', async (em) => {
      const authorized = await authorizeDecision(waitSchema, rawInput, ctx, em)
      const row = authorized.entity as Application
      const scope = scopeOf(row)
      const { groupId } = authorized.parsed
      if (!isDecidableState(row.state)) return enrolmentErrors.throw('application_state_conflict')
      if (row.state === 'waiting' && row.groupId === groupId) {
        return enrolmentErrors.throw('application_state_conflict')
      }
      const target = (
        await applicationTargets(ctx.container, scope, {
          sectionId: row.sectionId,
          date: row.referenceDate,
          groupIds: [groupId],
          em,
        })
      ).at(0)
      if (!target?.isActive) return throwFieldError('application_group_invalid', 'groupId')
      const before = applicationSnapshot(row)
      await assertTransition(applicationTransitions, row.state, 'waiting')
      row.state = 'waiting'
      row.groupId = groupId
      row.waitingSince = now
      if (row.participantBirthDate) row.ageFit = ageFitOf(row.participantBirthDate, row.referenceDate, target.fitRule)
      row.decidedAt = now
      row.decidedByUserId = ctx.auth?.sub ?? null
      row.updatedAt = now
      await em.flush()
      const waitingNumber = await waitingNumberOf(em, scope, row)
      const contact = await decryptedApplication(em, scope, row.id)
      const settings = await enrolmentSettings(ctx.container, scope)
      if (contact?.guardianEmail && settings.publicSlug && waitingNumber !== null) {
        dispatchIds.push(
          await enqueueApplicantMail(ctx.container, em, scope, {
            applicationId: row.id,
            template: 'waiting',
            event: `waiting:${String(now.getTime())}`,
            params: {
              applicationId: row.id,
              clubSlug: settings.publicSlug,
              sectionName: await sectionNameOf(ctx, scope, row.sectionId, em),
              groupName: target.name,
              waitingNumber,
            },
            email: contact.guardianEmail,
            locale: applicantLocale(row.locale, settings.locale),
          }),
        )
      }
      return { entity: row, actingRole: authorized.actingRole, before, waitingNumber }
    })
    const trusted = scopeOf(result.entity)
    await publishDispatches(ctx.container, trusted, dispatchIds)
    await emitAfterCommit('enrolment.application.decided', trusted, { id: result.entity.id, decision: 'waiting' })
    return result
  },
  buildLog: ({ result }) =>
    enrolmentLog({ result, labelKey: 'enrolment.audit.wait', fallback: 'Put an application on the waiting list' }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeApplicationReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as { state?: string } | null | undefined
    const row = await authorizeApplicationReplay(ctx, logEntry.resourceId)
    if (row.state !== 'waiting' || !before?.state) return
    await restoreDecided(ctx.transactionalEm as EntityManager, row, before as Parameters<typeof restoreDecided>[2])
  },
}

// --- Retention jobs (DD-J14, R22, R23) ---

const jobSchema = z.object({ now: z.iso.datetime({ offset: true }).optional() }).strict()

export type RetentionJobResult = {
  now: string
  counts: { deleted: number; anonymised: number; linksPurged: number; expired?: number; placesFreed?: number }
}

async function authorizeJob(rawInput: unknown, ctx: CommandRuntimeContext, em: EntityManager) {
  const authorized = await authorizeScoped(
    {
      input: jobSchema,
      resourceKind: 'enrolment.organization',
      allowedKinds: ['system_job'],
      resolveTarget: (_parsed, _entity, trusted) => ({ id: trusted.organizationId, ...trusted }),
      lock: 'none',
      scopeSource: { job: true },
    },
    rawInput,
    ctx,
    em,
  )
  return {
    scope: { tenantId: authorized.tenantId, organizationId: authorized.organizationId },
    at: authorized.parsed.now ? new Date(authorized.parsed.now) : new Date(),
  }
}

/** R22: unconfirmed applications sent at or before 24 hours ago are deleted with their links. */
async function deleteUnconfirmed(em: EntityManager, scope: EnrolmentScope, at: Date): Promise<number> {
  const rows = await em.find(
    Application,
    { ...scope, state: 'unconfirmed', createdAt: { $lte: unconfirmedCutoff(at) } },
    { fields: ['id'] },
  )
  if (rows.length === 0) return 0
  const ids = rows.map((row) => row.id)
  await em.nativeDelete(ConfirmationLink, { ...scope, applicationId: { $in: ids } })
  await em.nativeDelete(ApplicationLink, { ...scope, applicationId: { $in: ids } })
  return em.nativeDelete(Application, { ...scope, id: { $in: ids }, state: 'unconfirmed' })
}

/** R23: closed applications closed at or before 30 days ago are anonymised; their links are deleted. */
async function anonymiseClosed(em: EntityManager, scope: EnrolmentScope, at: Date): Promise<number> {
  const rows = await em.find(
    Application,
    {
      ...scope,
      state: { $in: ['accepted', 'rejected', 'withdrawn', 'expired'] },
      closedAt: { $lte: anonymiseCutoff(at) },
      anonymizedAt: null,
    },
    { fields: ['id'], limit: 500 },
  )
  return anonymiseApplications(
    em,
    scope,
    rows.map((row) => row.id),
    at,
  )
}

const expireUnconfirmedCommand: CommandHandler<Record<string, unknown>, RetentionJobResult> = {
  id: 'enrolment.applications.expire_unconfirmed',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'enrolment.applications.expire_unconfirmed', async (em) => {
      const { scope, at } = await authorizeJob(rawInput, ctx, em)
      const deleted = await deleteUnconfirmed(em, scope, at)
      return { now: at.toISOString(), counts: { deleted, anonymised: 0, linksPurged: 0 } }
    })
  },
}

/**
 * DD-J14, R24 (phase 3, #800): an open application whose reference date's season (`seasonEndsOn` of
 * `groups.applicationTargets`) ended before the club's day becomes `expired`; its status link is cut and the applicant
 * gets `enrolment.season_closed`. Without a season row an application never expires by season.
 */
async function expireEndedSeasons(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: EnrolmentScope,
  at: Date,
  dispatchIds: Array<string | null>,
): Promise<string[]> {
  const settings = await enrolmentSettings(ctx.container, scope)
  const today = clubDay(settings, at)
  const rows = await em.find(
    Application,
    { ...scope, deletedAt: null, state: { $in: ['new', 'trial', 'waiting'] } },
    { orderBy: { confirmedAt: 'asc', id: 'asc' }, limit: 500, lockMode: LockMode.PESSIMISTIC_WRITE },
  )
  const seasonEnds = new Map<string, string | null>()
  const expired: string[] = []
  for (const row of rows) {
    const key = `${row.sectionId}|${row.referenceDate}`
    if (!seasonEnds.has(key)) {
      const targets = await applicationTargets(ctx.container, scope, {
        sectionId: row.sectionId,
        date: row.referenceDate,
        em,
      })
      seasonEnds.set(key, targets[0]?.seasonEndsOn ?? null)
    }
    if (!seasonEnded(seasonEnds.get(key) ?? null, today)) continue
    await assertTransition(applicationTransitions, row.state, 'expired')
    row.state = 'expired'
    row.waitingSince = null
    row.closedAt = at
    row.updatedAt = at
    expired.push(row.id)
  }
  if (expired.length === 0) return expired
  await em.flush()
  const names = await sectionNames(ctx.container, scope, [...new Set(rows.map((row) => row.sectionId))], em)
  for (const row of rows.filter((entry) => expired.includes(entry.id))) {
    await cutStatusLinks(em, scope, row.id, at)
    const contact = await decryptedApplication(em, scope, row.id)
    if (!contact?.guardianEmail || !settings.publicSlug) continue
    dispatchIds.push(
      await enqueueApplicantMail(ctx.container, em, scope, {
        applicationId: row.id,
        template: 'season_closed',
        event: 'season_closed',
        params: {
          applicationId: row.id,
          clubSlug: settings.publicSlug,
          sectionName: names.get(row.sectionId) ?? '—',
        },
        email: contact.guardianEmail,
        locale: applicantLocale(row.locale, settings.locale),
      }),
    )
  }
  return expired
}

const dailyCommand: CommandHandler<Record<string, unknown>, RetentionJobResult> = {
  id: 'enrolment.applications.daily',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const dispatchIds: Array<string | null> = []
    let expiredIds: string[] = []
    const result = await inWriteTransaction(ctx, 'enrolment.applications.daily', async (em) => {
      const { scope, at } = await authorizeJob(rawInput, ctx, em)
      const deleted = await deleteUnconfirmed(em, scope, at)
      expiredIds = await expireEndedSeasons(ctx, em, scope, at, dispatchIds)
      const anonymised = await anonymiseClosed(em, scope, at)
      const linksPurged =
        (await confirmationLinks(ctx.container).purgeDead(em, scope, at)) +
        (await applicationLinks(ctx.container).purgeDead(em, scope, at))
      return {
        scope,
        at,
        value: {
          now: at.toISOString(),
          counts: { deleted, anonymised, linksPurged, expired: expiredIds.length, placesFreed: 0 },
        },
      }
    })
    const { scope, at, value } = result
    await publishDispatches(ctx.container, scope, dispatchIds)
    for (const id of expiredIds) await emitAfterCommit('enrolment.application.expired', scope, { id })
    // DD-J15: every group with a waiting list is counted again on the club's day (end dates that passed, rollovers).
    try {
      const today = clubDay(await enrolmentSettings(ctx.container, scope), at)
      value.counts.placesFreed = (await announceFreedPlaces(ctx.container, scope, today)).length
    } catch {
      // A failed notice is retried by the next day's run; the waiting list shows the places anyway.
    }
    return value
  },
}

registerCommand(submitCommand)
registerCommand(confirmCommand)
registerCommand(withdrawCommand)
registerCommand(resendCommand('confirmation'))
registerCommand(resendCommand('link'))
registerCommand(rejectCommand)
registerCommand(waitCommand)
registerCommand(expireUnconfirmedCommand)
registerCommand(dailyCommand)
