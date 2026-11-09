// The online booking requests (facilities spec glossary *External request*, the `submit_request`, `verify_request`,
// `approve` and `reject` rows of *API, Command, and Error Contracts*, the `facilities:expire-requests` job; REQ-024,
// R06, DD-35, DD-43, DD-44, DD-46; #125):
// - `facilities.rentals.submit_request` (no session): the club and the public place come from the one slug lookup
//   (`requestPlace`); under the organization's occupancy lock the slot is checked as a staff entry is (units, the rate
//   of the category, the opening hours and closures, the `reservable_paid` zone, the occupancy) and against the valid
//   holds of other requests (409 `slot_unavailable`); the request is created as its own P-10 link
//   (`pending_verification`, 1 h) and the confirmation e-mail is enqueued in the same transaction with the raw token
//   only as the delivery's secret (DD-44). A filled honeypot field is refused before anything is read;
// - `facilities.rentals.verify_request` (no session): the token is looked up once by its hash (DD-35), the occupancy
//   lock taken, the link spent and the slot re-checked; the request holds its slot for 48 h (`pending_approval`) and
//   carries the entry-ban name hint for the administrator. A 409 rolls the redemption back with it;
// - `facilities.rentals.approve` / `reject` (B-25, `facilities.rentals.approve`): approval names the renter (an
//   institution or a person of the club, or a new institution created in the same transaction), re-checks the slot
//   with that renter (an active entry ban answers 409), stores the amount (a changed amount needs a note) and the
//   deadlines and, with `payments`, the charge (DD-19); rejection stores the reason. A decided request answers 409
//   `invalid_transition`, a lapsed hold 409 `request_hold_expired`;
// - `facilities.rentals.expire_requests` (the 15-minute job): lapsed holds become `expired` (`advanceWhere`) and
//   unconfirmed requests past their link are deleted (a conditional DELETE: they hold no decision and no money).
// The e-mails about decisions are sent by persistent subscribers of the events emitted here. None of these commands
// is undoable (the status only moves forward, DD-46); the token is never an input of a logged payload except verify,
// whose log drops the payload (`replayable: false`).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { calendarDateInZone } from '@vereino/core'
import { advanceWhere, assertTransition, authorizeScoped, foundationErrors, lockOccupancy } from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { EntryBan, Rental } from '../data/entities'
import { publicRequestSchema, requestApproveSchema, requestRejectSchema, requestVerifySchema } from '../data/validators'
import { blockingHolds, entryBanNameMatch, approvalAmount, holdActive, holdExpiry } from '../lib/requests'
import { banActiveOn, rentalTransitions, startAllowed } from '../lib/rentals'
import { chargeService } from '../services/charges'
import { clubRequestSettings, institutionNames, personNames, type FacilitiesScope } from '../services/directory'
import { placeFamilyIds } from '../services/occupancy'
import { requestPlace } from '../services/public-schedule'
import { enqueueVerificationMail, publishDispatch, requestLinks, requestLocale } from '../services/requests'
import { assessRentalSlot, type RentalIssue } from '../services/rental-slot'
import { RENTAL_RESOURCE_KIND, rentalSnapshot, type RentalCommandResult } from './rentals'
import {
  emitAfterCommit,
  existingSpec,
  facilitiesLog,
  inWriteTransaction,
  lockForOccupancy,
  rowLoader,
  throwFieldError,
} from './shared'

const slugSchema = z.string().min(1).max(120)

const submitSchema = publicRequestSchema.extend({ clubSlug: slugSchema, placeSlug: slugSchema }).strict()

/** The trusted acting role of a guest's request: no person, no session — the slug or the token names the club. */
const GUEST_ROLE = 'system' as const

/** How a public request answers each slot issue: the slot is taken (409) or the form is wrong (422 at a field). */
async function throwRequestIssue(issues: readonly RentalIssue[]): Promise<void> {
  const first = issues.at(0)
  if (!first) return
  switch (first.code) {
    case 'rental_units_invalid':
      return throwFieldError('rental_units_invalid', 'units')
    case 'rental_rate_missing':
      return throwFieldError('rental_rate_missing', 'renterCategory')
    case 'zone_not_reservable':
      return throwFieldError('request_zone_invalid', 'startsAt')
    case 'place_closed':
    case 'rental_conflict':
    case 'entry_ban_active':
      // A closure, the opening hours, a session, a rental or a club booking: the slot is not free. (A guest names no
      // registered renter, so no ban applies here.)
      return facilitiesErrors.throw('slot_unavailable')
  }
}

/** 409 `slot_unavailable` when another confirmed request holds an overlapping slot on the place family. */
async function assertNoHold(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FacilitiesScope,
  input: { placeId: string; start: Date; end: Date; ignoreId: string | null },
  now: Date,
): Promise<void> {
  const placeIds = await placeFamilyIds(ctx.container, scope, input.placeId, em)
  const rows = await em.find(
    Rental,
    {
      ...scope,
      deletedAt: null,
      placeId: { $in: placeIds },
      status: 'pending_approval',
      holdExpiresAt: { $gt: now },
      startsAt: { $lt: input.end },
      endsAt: { $gt: input.start },
    },
    { fields: ['id', 'status', 'holdExpiresAt', 'startsAt', 'endsAt'] },
  )
  const holds = blockingHolds(
    rows.map((row) => ({
      id: row.id,
      status: row.status,
      holdExpiresAt: row.holdExpiresAt ?? null,
      start: row.startsAt,
      end: row.endsAt,
    })),
    { start: input.start, end: input.end },
    now,
    input.ignoreId,
  )
  if (holds.length > 0) await facilitiesErrors.throw('slot_unavailable')
}

/** The names of the renters banned from the place family on the slot's date (the B-25 hint). */
async function bannedNames(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FacilitiesScope,
  placeId: string,
  date: string,
): Promise<string[]> {
  const placeIds = await placeFamilyIds(ctx.container, scope, placeId, em)
  const bans = await em.find(
    EntryBan,
    { ...scope, deletedAt: null, placeId: { $in: placeIds }, revokedAt: null },
    { fields: ['subjectType', 'subjectId', 'startsOn', 'endsOn', 'revokedAt'] },
  )
  const active = bans.filter((ban) =>
    banActiveOn({ startsOn: ban.startsOn, endsOn: ban.endsOn ?? null, revokedAt: ban.revokedAt ?? null }, date),
  )
  const ids = (type: 'institution' | 'person') =>
    active.filter((ban) => ban.subjectType === type).map((ban) => ban.subjectId)
  const [institutions, persons] = await Promise.all([
    institutionNames(ctx.container, scope, ids('institution'), em),
    personNames(ctx.container, scope, ids('person'), em),
  ])
  return [...institutions.values(), ...persons.values()]
}

/**
 * The requester's organisation and contact name, decrypted on a read-only fork: the transactional row stays as loaded,
 * so its encrypted columns are never rewritten. Compared for the entry-ban hint only, never stored elsewhere.
 */
async function requesterNames(em: EntityManager, scope: FacilitiesScope, id: string): Promise<string[]> {
  const row = await findOneWithDecryption(
    em.fork(),
    Rental,
    { id, ...scope, deletedAt: null },
    { fields: ['id', 'renterDisplayName', 'contactName'] },
    scope,
  )
  return row ? [row.renterDisplayName, row.contactName ?? ''] : []
}

// --- Submit (P-04) ---

const submitRequestCommand: CommandHandler<Record<string, unknown>, RentalCommandResult> = {
  id: 'facilities.rentals.submit_request',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const input = submitSchema.parse(rawInput)
    // The honeypot: a human never sees the field, so a value means a bot. Refused before any read.
    if (input.website && input.website.trim().length > 0) await facilitiesErrors.throw('request_refused')
    const found = await requestPlace(ctx.container, input.clubSlug, input.placeSlug)
    if (found.status !== 'ok') {
      await facilitiesErrors.throw(found.status === 'disabled' ? 'public_places_disabled' : 'public_place_not_found')
    }
    const place = (found as Extract<typeof found, { status: 'ok' }>).value
    const scope = place.scope
    if (!place.acceptsOnlineRequests) await facilitiesErrors.throw('requests_not_accepted')
    if (!input.regulationsAccepted) await throwFieldError('request_regulations_required', 'regulationsAccepted')
    const now = new Date()
    const startsAt = new Date(input.startsAt)
    if (!startAllowed(startsAt, now)) await throwFieldError('rental_start_past', 'startsAt')
    const settings = await clubRequestSettings(ctx.container, scope)
    let dispatchId = ''
    const result = await inWriteTransaction(ctx, 'facilities.rentals.submit_request', async (em) => {
      await lockOccupancy(em, scope.organizationId)
      const assessment = await assessRentalSlot(
        ctx.container,
        em,
        scope,
        { placeId: place.placeId, startsAt, units: input.units, renterCategory: input.renterCategory },
        now,
      )
      await throwRequestIssue(assessment.issues)
      await assertNoHold(
        ctx,
        em,
        scope,
        { placeId: place.placeId, start: startsAt, end: assessment.endsAt, ignoreId: null },
        now,
      )
      const { rawToken, link } = await requestLinks(ctx.container).issue(
        em,
        {
          id: randomUUID(),
          placeId: place.placeId,
          renterType: 'unregistered',
          renterId: null,
          renterDisplayName: input.renterDisplayName,
          renterCategory: input.renterCategory,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          contactLocale: requestLocale(input.locale, settings.locale),
          purpose: input.purpose ?? null,
          requestedVia: 'online_form',
          startsAt,
          endsAt: assessment.endsAt,
          units: input.units,
          rateId: assessment.rateId,
          amount: assessment.amount ?? 0,
          status: 'pending_verification',
          regulationsAcceptedAt: now,
          regulationsAcceptedVia: 'online_form',
        } as never,
        scope,
      )
      dispatchId = await enqueueVerificationMail(ctx.container, em, {
        row: link,
        rawToken,
        clubSlug: input.clubSlug,
        placeName: place.placeName,
        timeZone: settings.timeZone,
        currency: settings.currency,
        locale: link.contactLocale ?? settings.locale,
        email: input.contactEmail,
      })
      return { entity: link, actingRole: GUEST_ROLE, before: null }
    })
    await publishDispatch(ctx.container, dispatchId, scope)
    await emitAfterCommit('facilities.rental.request_submitted', scope, { id: result.entity.id })
    return result
  },
  buildLog: async ({ result }) => ({
    ...(await facilitiesLog({
      result,
      resourceKind: RENTAL_RESOURCE_KIND,
      labelKey: 'facilities.audit.requests.submit',
      fallback: 'Submit a booking request',
      after: rentalSnapshot(result.entity),
      context: { actor: 'guest' },
    })),
    // The input holds the guest's contact data; the snapshot keeps ids, times and money only.
    replayable: false,
  }),
}

// --- Verify (P-05) ---

export type VerifyRequestResult = RentalCommandResult & { timeZone: string; placeId: string }

const verifyRequestCommand: CommandHandler<Record<string, unknown>, VerifyRequestResult> = {
  id: 'facilities.rentals.verify_request',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const input = requestVerifySchema.parse(rawInput)
    const links = requestLinks(ctx.container)
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'facilities.rentals.verify_request', async (em) => {
      // DD-35: the one system-scope lookup by the token's hash; everything after it uses the found club.
      const found = await links.peek(em, input.token)
      if (!found) return foundationErrors.throw('token_link_expired')
      const scope = { tenantId: found.tenantId, organizationId: found.organizationId }
      await lockOccupancy(em, scope.organizationId)
      const redeemed = await links.redeem(em, input.token, { scope })
      if (!redeemed) return foundationErrors.throw('token_link_expired')
      const row = await em.findOneOrFail(Rental, { id: redeemed.link.id, ...scope, deletedAt: null }, { refresh: true })
      const before = rentalSnapshot(row)
      await assertTransition(rentalTransitions, row.status, 'pending_approval')
      const assessment = await assessRentalSlot(
        ctx.container,
        em,
        scope,
        {
          placeId: row.placeId,
          startsAt: row.startsAt,
          units: row.units,
          renterCategory: row.renterCategory,
          ignoreIds: [row.id],
        },
        now,
      )
      const taken = assessment.issues.some((issue) => issue.code !== 'rental_rate_missing')
      if (taken) await facilitiesErrors.throw('slot_unavailable')
      await assertNoHold(
        ctx,
        em,
        scope,
        { placeId: row.placeId, start: row.startsAt, end: row.endsAt, ignoreId: row.id },
        now,
      )
      const settings = await clubRequestSettings(ctx.container, scope)
      const banned = await bannedNames(ctx, em, scope, row.placeId, calendarDateInZone(row.startsAt, settings.timeZone))
      row.status = 'pending_approval'
      row.holdExpiresAt = holdExpiry(now)
      row.entryBanMatch = entryBanNameMatch(await requesterNames(em, scope, row.id), banned)
      row.updatedAt = now
      return { entity: row, actingRole: GUEST_ROLE, before, timeZone: settings.timeZone, placeId: row.placeId }
    })
    await emitAfterCommit(
      'facilities.rental.request_verified',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { id: result.entity.id, placeId: result.entity.placeId },
    )
    return result
  },
  buildLog: async ({ result }) => ({
    ...(await facilitiesLog({
      result,
      resourceKind: RENTAL_RESOURCE_KIND,
      labelKey: 'facilities.audit.requests.verify',
      fallback: 'Confirm a booking request by e-mail',
      after: rentalSnapshot(result.entity),
      context: { actor: 'guest' },
    })),
    // The input is the raw token: keep it out of `action_logs` (DD-44).
    replayable: false,
  }),
}

// --- Approve / reject (B-25) ---

type ApproveParsed = z.output<typeof requestApproveSchema>

/** The renter an approval names: a new institution (created in this transaction), or a club institution or person. */
async function approvalRenter(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FacilitiesScope,
  parsed: ApproveParsed,
): Promise<{ renterType: 'institution' | 'person'; renterId: string; name: string }> {
  if (parsed.createInstitution) {
    const commandBus = ctx.container.resolve<{
      execute(id: string, options: { input: unknown; ctx: CommandRuntimeContext }): Promise<{ result: unknown }>
    }>('commandBus')
    const { result } = await commandBus.execute('club_core.institutions.create', {
      input: { name: parsed.createInstitution.name, type: parsed.createInstitution.type },
      // The approval's transaction: the institution exists only if the approval commits. Its events wait for none.
      ctx: { ...ctx, request: undefined, transactionalEm: em, bulkImport: { skipEvents: true, skipReindex: true } },
    })
    const entity = (result as { entity: { id: string; name: string } }).entity
    return { renterType: 'institution', renterId: entity.id, name: entity.name }
  }
  if (!parsed.renterType || !parsed.renterId) return throwFieldError('request_renter_required', 'renterId')
  const names =
    parsed.renterType === 'institution'
      ? await institutionNames(ctx.container, scope, [parsed.renterId], em)
      : await personNames(ctx.container, scope, [parsed.renterId], em)
  const name = names.get(parsed.renterId)
  if (!name) return throwFieldError('rental_renter_invalid', 'renterId')
  return { renterType: parsed.renterType, renterId: parsed.renterId, name }
}

/** 409 `request_hold_expired` for a request whose 48 hours ran out before the expiry job closed it. */
async function assertHoldActive(row: Rental, now: Date): Promise<void> {
  if (
    row.status === 'pending_approval' &&
    !holdActive({ status: row.status, holdExpiresAt: row.holdExpiresAt ?? null }, now)
  ) {
    await facilitiesErrors.throw('request_hold_expired')
  }
}

const APPROVAL_ISSUE_FIELDS: Record<RentalIssue['code'], string> = {
  rental_units_invalid: 'units',
  rental_rate_missing: 'renterCategory',
  place_closed: 'startsAt',
  zone_not_reservable: 'startsAt',
  rental_conflict: 'startsAt',
  entry_ban_active: 'renterId',
}

const approveRequestCommand: CommandHandler<Record<string, unknown>, RentalCommandResult> = {
  id: 'facilities.rentals.approve',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    const afterCommit: Array<() => Promise<void>> = []
    const result = await inWriteTransaction(ctx, 'facilities.rentals.approve', async (em) => {
      await lockForOccupancy(ctx, em)
      const authorized = await authorizeScoped(
        existingSpec(requestApproveSchema, RENTAL_RESOURCE_KIND, rowLoader(ctx, Rental)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Rental
      const parsed = authorized.parsed
      const before = rentalSnapshot(row)
      await assertTransition(rentalTransitions, row.status, 'requested')
      await assertHoldActive(row, now)
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      const renter = await approvalRenter(ctx, em, scope, parsed)
      const category = parsed.renterCategory ?? row.renterCategory
      const assessment = await assessRentalSlot(
        ctx.container,
        em,
        scope,
        {
          placeId: row.placeId,
          startsAt: row.startsAt,
          units: row.units,
          renterCategory: category,
          renterType: renter.renterType,
          renterId: renter.renterId,
          ignoreIds: [row.id],
        },
        now,
      )
      const override = parsed.amountOverride ?? null
      const issue = assessment.issues.find((item) => !(item.code === 'rental_rate_missing' && override !== null))
      if (issue) {
        await throwFieldError(
          issue.code,
          APPROVAL_ISSUE_FIELDS[issue.code],
          issue.conflicts ? { conflicts: issue.conflicts } : {},
        )
      }
      const note = parsed.note ?? null
      const amount = approvalAmount(assessment.amount, override, note)
      if (amount.noteMissing) await throwFieldError('rental_amount_note_required', 'note')
      row.renterType = renter.renterType
      row.renterId = renter.renterId
      // The registered renter's name, as a staff entry stores it; the requester's typed name stays in the audit trail.
      row.renterDisplayName = renter.name
      row.renterCategory = category
      row.rateId = assessment.rateId
      row.amount = amount.amount ?? 0
      row.cancellationDeadline = assessment.cancellationDeadline
      row.paymentDeadline = assessment.paymentDeadline
      row.status = 'requested'
      row.decidedByPersonId = authorized.scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
      row.decidedAt = now
      if (note) row.decisionReason = note
      row.updatedAt = now
      const charges = chargeService(ctx.container)
      if (charges && row.chargeId == null) {
        await em.flush()
        const settings = await clubRequestSettings(ctx.container, scope)
        const charge = await charges.createForSource(
          em,
          {
            sourceType: 'rental',
            sourceId: row.id,
            payee: 'owner_institution',
            payeeInstitutionId: null,
            payerInstitutionId: renter.renterType === 'institution' ? renter.renterId : null,
            payerPersonId: renter.renterType === 'person' ? renter.renterId : null,
            amount: row.amount,
            dueDate: calendarDateInZone(row.paymentDeadline ?? row.startsAt, settings.timeZone),
            description: renter.name,
          },
          ctx,
        )
        row.chargeId = charge.chargeId
        afterCommit.push(charge.afterCommit)
      }
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    for (const effect of afterCommit) await effect()
    await emitAfterCommit(
      'facilities.rental.approved',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { id: result.entity.id, placeId: result.entity.placeId },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: RENTAL_RESOURCE_KIND,
      labelKey: 'facilities.audit.requests.approve',
      fallback: 'Approve a booking request',
      after: rentalSnapshot(result.entity),
    }),
}

const rejectRequestCommand: CommandHandler<Record<string, unknown>, RentalCommandResult> = {
  id: 'facilities.rentals.reject',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'facilities.rentals.reject', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(requestRejectSchema, RENTAL_RESOURCE_KIND, rowLoader(ctx, Rental)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Rental
      const before = rentalSnapshot(row)
      await assertTransition(rentalTransitions, row.status, 'rejected')
      await assertHoldActive(row, now)
      row.status = 'rejected'
      row.decisionReason = authorized.parsed.reason
      row.decidedByPersonId = authorized.scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
      row.decidedAt = now
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitAfterCommit(
      'facilities.rental.rejected',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { id: result.entity.id, placeId: result.entity.placeId },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: RENTAL_RESOURCE_KIND,
      labelKey: 'facilities.audit.requests.reject',
      fallback: 'Reject a booking request',
      after: rentalSnapshot(result.entity),
    }),
}

// --- The expiry job ---

const expireSchema = z.object({ now: z.iso.datetime({ offset: true }).optional() }).strict()

export type ExpireRequestsJobResult = {
  now: string
  counts: { expired: number; purged: number }
  expiredIds: string[]
}

/**
 * `facilities.rentals.expire_requests` (DD-46; the `facilities:expire-requests` row of *Events, Jobs*): the confirmed
 * requests whose 48-hour hold ended become `expired`; the requests never confirmed within their hour are deleted.
 * `now` comes from the operator CLI (`--now`); a worker never sets it.
 */
const expireRequestsCommand: CommandHandler<Record<string, unknown>, ExpireRequestsJobResult> = {
  id: 'facilities.rentals.expire_requests',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const outcome = await inWriteTransaction(ctx, 'facilities.rentals.expire_requests', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: expireSchema,
          resourceKind: 'facilities.organization',
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, trusted) => ({ id: trusted.organizationId, ...trusted }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      )
      const at = authorized.parsed.now ? new Date(authorized.parsed.now) : new Date()
      const trusted = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const expired = await advanceWhere(em, Rental, {
        transitions: rentalTransitions,
        where: { ...trusted, deletedAt: null, holdExpiresAt: { $lte: at } },
        from: 'pending_approval',
        to: 'expired',
        set: { updatedAt: at },
      })
      const purged = await em.nativeDelete(Rental, {
        ...trusted,
        status: 'pending_verification',
        requestedVia: 'online_form',
        expiresAt: { $lt: at },
      })
      return { scope: trusted, expired, purged, at }
    })
    for (const id of outcome.expired) {
      await emitAfterCommit('facilities.rental.expired', outcome.scope, { id })
    }
    return {
      now: outcome.at.toISOString(),
      counts: { expired: outcome.expired.length, purged: outcome.purged },
      expiredIds: outcome.expired,
    }
  },
}

registerCommand(submitRequestCommand)
registerCommand(verifyRequestCommand)
registerCommand(approveRequestCommand)
registerCommand(rejectRequestCommand)
registerCommand(expireRequestsCommand)
