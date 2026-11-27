// `enrolment.applications.accept` (sign-up form spec BR-J4, BR-J6, DD-J10, DD-J10a, DD-J11, REQ-J12…REQ-J14, Q-J08;
// phase 3, #800): one step puts a family in the club. Inside one database transaction, under the application's row
// lock:
// 1. the decider is authorized for the application's section (BR-J5) and the application is still open;
// 2. the start day is checked (today or later, within the reference date's season) and the target group is row-locked
//    and its places counted on the start day (`groups.applicationTargets` with `lockGroupId`, DD-J10a): a full group
//    needs `overLimit` (409 `group_full`);
// 3. the persons are created through `people.persons.create`, or a possible duplicate the club found is reused
//    (DD-J11); for a child the guardianship is created through `people.guardianships.create` (primary payer when the
//    child has none) unless the guardian already guards the child;
// 4. the participant membership from the start day is created through `groups.membershipImporter` (the nested
//    `groups.memberships.create`, its overlap rule: 409 `membership_overlap`);
// 5. the application is closed as accepted with the person and membership ids; the note is cleared (*Security* →
//    Minimisation) and the acceptance e-mail enqueued.
// The nested commands share the transaction (`transactionalEm`) and defer their events (`bulkImport`, the people
// import's pattern); after the commit the owners' events are emitted, then the account invitation
// (`people.persons.create_account`, on by default, Q-J08) runs — a failed invitation never undoes the acceptance.
// Creating persons is a club administrator's write in `people`; a coordinator gets 403 `accept_requires_admin`.
// Not undoable: a mistake is corrected with the roster's End/Remove and the person screens (DD-J10).
import type { EntityManager } from '@mikro-orm/postgresql'
import {
  registerCommand,
  type CommandBus,
  type CommandHandler,
  type CommandRuntimeContext,
} from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { assertTransition } from '@/modules/foundation'
import type { MembershipImporter } from '../../people/services/membership-importer'
import type { PersonDirectory } from '../../people/services/person-directory'
import { enrolmentErrors } from '../api/errors'
import { Application } from '../data/entities'
import { acceptSchema } from '../data/validators'
import { acceptPlan, needsOverLimit, startDayValid } from '../lib/accept'
import { ageFitOf } from '../lib/age'
import { applicationTransitions, isDecidableState } from '../lib/states'
import {
  applicationTargets,
  clubDay,
  enrolmentSettings,
  sectionNames,
  type EnrolmentScope,
} from '../services/directory'
import { cutStatusLinks } from '../services/links'
import { applicantLocale, enqueueApplicantMail, publishDispatches } from '../services/mail'
import { emitGuardianshipCreated, emitPersonCreated } from '../services/owner-events'
import {
  applicationSnapshot,
  authorizeDecision,
  emitAfterCommit,
  enrolmentLog,
  inWriteTransaction,
  throwFieldError,
  type ApplicationCommandResult,
} from './shared'

const logger = createLogger('enrolment').child({ component: 'accept' })

const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'
const GROUPS_MEMBERSHIP_IMPORTER = 'groups.membershipImporter'

type Ids = { id: string; tenantId: string; organizationId: string }

/** What the invitation after the commit needs: the invitee and the address the applicant gave. */
type PendingInvitation = { personId: string; email: string }

export type InvitationOutcome = 'sent' | 'skipped' | 'failed'

export type AcceptResult = ApplicationCommandResult & {
  membershipId: string
  participantPersonId: string
  guardianPersonId: string | null
  createdPersonIds: string[]
  invitation: InvitationOutcome
}

type Written = {
  persons: Ids[]
  guardianship: (Ids & { guardianPersonId: string; wardPersonId: string }) | null
  emitMembership: (() => Promise<void>) | null
  invitation: PendingInvitation | null
}

function errorCodeOf(error: unknown): string | null {
  const body = (error as { body?: { code?: unknown } } | null)?.body
  return typeof body?.code === 'string' ? body.code : null
}

/** The nested command context: the accept's transaction, no request, the owners' events deferred to after commit. */
function nestedContext(ctx: CommandRuntimeContext, em: EntityManager): CommandRuntimeContext {
  return { ...ctx, request: undefined, transactionalEm: em, bulkImport: { skipEvents: true, skipReindex: true } }
}

function directory(ctx: CommandRuntimeContext): PersonDirectory {
  return ctx.container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY)
}

function membershipImporter(ctx: CommandRuntimeContext): MembershipImporter {
  if (!ctx.container.hasRegistration(GROUPS_MEMBERSHIP_IMPORTER)) {
    throw new Error('[internal] enrolment requires the DI service ' + GROUPS_MEMBERSHIP_IMPORTER)
  }
  return ctx.container.resolve<MembershipImporter>(GROUPS_MEMBERSHIP_IMPORTER)
}

type CreatedPerson = { person: Ids & { userId?: string | null; birthDate?: string | null } }

/** `people.persons.create` nested; a refusal of the caller's grant becomes 403 `accept_requires_admin`. */
async function createPerson(
  bus: CommandBus,
  nested: CommandRuntimeContext,
  input: Record<string, string>,
): Promise<CreatedPerson['person']> {
  try {
    const { result } = await bus.execute<unknown, CreatedPerson>('people.persons.create', { input, ctx: nested })
    return result.person
  } catch (error: unknown) {
    if (errorCodeOf(error) === 'scope_denied') return enrolmentErrors.throw('accept_requires_admin')
    throw error
  }
}

function present(values: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  )
}

const acceptCommand: CommandHandler<Record<string, unknown>, AcceptResult> = {
  id: 'enrolment.applications.accept',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    const dispatchIds: Array<string | null> = []
    const written: Written = { persons: [], guardianship: null, emitMembership: null, invitation: null }
    const result = await inWriteTransaction(ctx, 'enrolment.applications.accept', async (em) => {
      const authorized = await authorizeDecision(acceptSchema, rawInput, ctx, em)
      const row = authorized.entity as Application
      const input = authorized.parsed
      const scope: EnrolmentScope = { tenantId: row.tenantId, organizationId: row.organizationId }
      if (!isDecidableState(row.state)) return enrolmentErrors.throw('application_state_conflict')
      if (authorized.actingRole !== 'club_admin') return enrolmentErrors.throw('accept_requires_admin')
      const before = applicationSnapshot(row)
      const settings = await enrolmentSettings(ctx.container, scope)
      const today = clubDay(settings, now)

      // The target group: a live, active group of the section; the season of the reference date bounds the start day.
      const reference = (
        await applicationTargets(ctx.container, scope, {
          sectionId: row.sectionId,
          date: row.referenceDate,
          groupIds: [input.groupId],
          em,
        })
      ).at(0)
      if (!reference?.isActive) return throwFieldError('application_group_invalid', 'groupId')
      if (!startDayValid(input.startDay, today, reference.seasonEndsOn)) {
        return throwFieldError('start_day_invalid', 'startDay')
      }
      // DD-J10a: the group's row lock first, then its places on the start day, inside this transaction.
      const locked = (
        await applicationTargets(ctx.container, scope, {
          sectionId: row.sectionId,
          date: input.startDay,
          groupIds: [input.groupId],
          lockGroupId: input.groupId,
          em,
        })
      ).at(0)
      if (!locked) return throwFieldError('application_group_invalid', 'groupId')
      if (needsOverLimit(locked) && input.overLimit !== true) {
        return enrolmentErrors.throw('group_full', { occupied: locked.occupied, limit: locked.placesLimit })
      }

      const planned = acceptPlan(
        row.kind,
        { child: input.child, guardian: input.guardian },
        row.duplicateCandidates ?? [],
      )
      if ('issue' in planned) return throwFieldError('accept_person_invalid', planned.field)
      const { plan } = planned
      const app = await findOneWithDecryption(em.fork(), Application, { id: row.id, ...scope }, {}, scope)
      if (!app?.participantFirstName || !app.participantLastName || !app.guardianEmail) {
        return enrolmentErrors.throw('application_state_conflict')
      }
      const reused = [plan.participant.reuse, plan.guardian?.reuse].filter((id): id is string => Boolean(id))
      const existing = await directory(ctx).findPersons(scope, reused, em)
      if (plan.participant.reuse && !existing.has(plan.participant.reuse)) {
        return throwFieldError('accept_person_invalid', 'child')
      }
      if (plan.guardian?.reuse && !existing.has(plan.guardian.reuse)) {
        return throwFieldError('accept_person_invalid', 'guardian')
      }
      const accounts = await directory(ctx).findUserIds(scope, reused, em)

      // The invitee needs a birth date for an account (`people.persons.create_account`); the form asks none of a
      // guardian, so the decider gives it on the sheet for a new guardian.
      const inviteeReuse = plan.invitee === 'guardian' ? (plan.guardian?.reuse ?? null) : plan.participant.reuse
      const inviteeBirthDate =
        plan.invitee === 'participant'
          ? ((inviteeReuse ? existing.get(inviteeReuse)?.birthDate : app.participantBirthDate) ?? null)
          : inviteeReuse
            ? (existing.get(inviteeReuse)?.birthDate ?? null)
            : (input.guardian?.birthDate ?? null)
      const inviteeHasAccount = inviteeReuse ? accounts.has(inviteeReuse) : false
      const invite = input.sendInvitation && !inviteeHasAccount
      if (invite && !inviteeBirthDate) return throwFieldError('invitation_birth_date_required', 'guardianBirthDate')

      const bus = ctx.container.resolve<CommandBus>('commandBus')
      const nested = nestedContext(ctx, em)
      const adult = row.kind === 'adult'
      let participantId = plan.participant.reuse
      if (!participantId) {
        const person = await createPerson(
          bus,
          nested,
          present({
            firstName: app.participantFirstName,
            lastName: app.participantLastName,
            birthDate: app.participantBirthDate ?? null,
            email: adult ? app.guardianEmail : null,
            phone: adult ? (app.guardianPhone ?? null) : null,
            preferredLocale: adult ? (app.locale ?? null) : null,
          }),
        )
        participantId = person.id
        written.persons.push(person)
      }
      let guardianId: string | null = null
      if (plan.guardian) {
        guardianId = plan.guardian.reuse
        if (!guardianId) {
          const person = await createPerson(
            bus,
            nested,
            present({
              firstName: app.guardianFirstName ?? '',
              lastName: app.guardianLastName ?? '',
              birthDate: input.guardian?.birthDate ?? null,
              email: app.guardianEmail,
              phone: app.guardianPhone ?? null,
              preferredLocale: app.locale ?? null,
            }),
          )
          guardianId = person.id
          written.persons.push(person)
        }
        const guardians = (await directory(ctx).activeGuardians(scope, [participantId], today, em)).get(participantId)
        if (!guardians?.includes(guardianId)) {
          const payers = await directory(ctx).primaryPayers(scope, [participantId], today, em)
          try {
            const { result: link } = await bus.execute<
              unknown,
              { guardianship: Ids & { guardianPersonId: string; wardPersonId: string } }
            >('people.guardianships.create', {
              input: {
                guardianPersonId: guardianId,
                wardPersonId: participantId,
                relation: 'parent',
                isPrimaryPayer: !payers.has(participantId),
                validFrom: today,
              },
              ctx: nested,
            })
            written.guardianship = link.guardianship
          } catch (error: unknown) {
            if (errorCodeOf(error) === 'scope_denied') return enrolmentErrors.throw('accept_requires_admin')
            throw error
          }
        }
      }

      // The membership through `groups` (its row lock, overlap rule, audit entry; events after commit).
      const run = await membershipImporter(ctx).ensureParticipantMemberships(nested, scope, [
        { key: row.id, personId: participantId, groupId: input.groupId, validFrom: input.startDay },
      ])
      const outcome = run.outcomes.get(row.id)
      if (outcome?.status === 'existed') return enrolmentErrors.throw('membership_overlap')
      if (outcome?.status !== 'created') return throwFieldError('application_group_invalid', 'groupId')
      written.emitMembership = () => run.emitSideEffects()

      await assertTransition(applicationTransitions, row.state, 'accepted')
      row.state = 'accepted'
      row.groupId = input.groupId
      if (row.participantBirthDate)
        row.ageFit = ageFitOf(row.participantBirthDate, row.referenceDate, reference.fitRule)
      row.waitingSince = null
      row.note = null
      row.decidedAt = now
      row.decidedByUserId = ctx.auth?.sub ?? null
      row.closedAt = now
      row.acceptedChildPersonId = participantId
      row.acceptedGuardianPersonId = guardianId
      row.acceptedMembershipId = outcome.membershipId
      row.updatedAt = now
      await em.flush()
      await cutStatusLinks(em, scope, row.id, now)
      const inviteeId = plan.invitee === 'guardian' ? guardianId : participantId
      if (invite && inviteeId) written.invitation = { personId: inviteeId, email: app.guardianEmail }
      if (settings.publicSlug) {
        dispatchIds.push(
          await enqueueApplicantMail(ctx.container, em, scope, {
            applicationId: row.id,
            template: 'accepted',
            event: 'accepted',
            params: {
              applicationId: row.id,
              clubSlug: settings.publicSlug,
              sectionName: (await sectionNames(ctx.container, scope, [row.sectionId], em)).get(row.sectionId) ?? '—',
              groupName: locked.name,
              startDay: input.startDay,
              invitation: invite,
            },
            email: app.guardianEmail,
            locale: applicantLocale(app.locale, settings.locale),
          }),
        )
      }
      const invitation: InvitationOutcome = invite ? 'sent' : 'skipped'
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before,
        membershipId: outcome.membershipId,
        participantPersonId: participantId,
        guardianPersonId: guardianId,
        createdPersonIds: written.persons.map((person) => person.id),
        invitation,
      }
    })
    const scope = { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId }
    await publishDispatches(ctx.container, scope, dispatchIds)
    // The owners' events the nested commands deferred, then the module's own.
    for (const person of written.persons) await emitPersonCreated(ctx.container, person)
    if (written.guardianship) await emitGuardianshipCreated(ctx.container, written.guardianship)
    if (written.emitMembership) await written.emitMembership()
    await emitAfterCommit('enrolment.application.decided', scope, { id: result.entity.id, decision: 'accepted' })
    if (!written.invitation) return result
    try {
      await ctx.container.resolve<CommandBus>('commandBus').execute('people.persons.create_account', {
        input: { id: written.invitation.personId, email: written.invitation.email },
        ctx,
      })
      return result
    } catch (error: unknown) {
      // The acceptance stands; the decider sends the invitation from the person's page (`account_exists`, a taken
      // address, …). Nothing of the applicant goes to the log.
      logger.warn('Account invitation after an acceptance failed', { code: errorCodeOf(error) })
      return { ...result, invitation: 'failed' }
    }
  },
  buildLog: async ({ result }) => ({
    ...(await enrolmentLog({
      result,
      labelKey: 'enrolment.audit.accept',
      fallback: 'Accept an application',
      context: {
        membershipId: result.membershipId,
        participantPersonId: result.participantPersonId,
        guardianPersonId: result.guardianPersonId,
        createdPersonIds: result.createdPersonIds,
      },
    })),
    replayable: false,
  }),
}

registerCommand(acceptCommand)
