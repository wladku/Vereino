// `people.paymentsGate` — the R10 gate on a person's own payments (club spec glossary *Account payer*, REQ-002, #27):
// a minor never sees payments — no tile, no screen, no API. Payments arrive with phase 4; every route of the
// caller's own payments there (`GET /api/payments/my-charges`, the checkout) declares `requireFeatures:
// ['payments.view_own']` and then calls `assert` from DI, which re-checks the person's age on the club's today, so a
// manually granted feature does not open them to a minor (403 `payments_minor`). The `/club` landing reads `check`
// to decide whether the payments tile may be shown.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { foundationErrors } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person } from '../data/entities'
import { ownPaymentsAccess, type OwnPaymentsAccess } from '../lib/member-rules'
import { clubToday, type ClubScope } from './club-clock'

/** DI token of the gate (`di.ts`); the `payments` module resolves it in phase 4. */
export const PEOPLE_PAYMENTS_GATE = 'people.paymentsGate' as const

/** The feature of the `vereino_payer` role every own-payments route requires (club spec feature list). */
export const OWN_PAYMENTS_FEATURE = 'payments.view_own'

/** The caller whose own payments are asked for: the session's user in the trusted tenant and organization. */
export type PaymentsSubject = ClubScope & { userId: string }

export type PaymentsGateDecision = { access: OwnPaymentsAccess; personId: string | null }

export type PaymentsGate = {
  /** The decision without throwing (the landing's payments tile). */
  check(subject: PaymentsSubject): Promise<PaymentsGateDecision>
  /** 403 `payments_minor` for a minor (also with the feature), 403 `scope_denied` without a person or the feature. */
  assert(subject: PaymentsSubject): Promise<{ personId: string }>
}

export function createPaymentsGate(container: AwilixContainer): PaymentsGate {
  const check = async (subject: PaymentsSubject): Promise<PaymentsGateDecision> => {
    const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
    const em = container.resolve<EntityManager>('em').fork()
    const person = await em.findOne(
      Person,
      { userId: subject.userId, ...scope, deletedAt: null },
      { fields: ['id', 'birthDate'] },
    )
    const rbac = container.resolve<RbacService>('rbacService')
    const hasFeature = await rbac.userHasAllFeatures(subject.userId, [OWN_PAYMENTS_FEATURE], scope)
    const today = await clubToday(container, scope)
    const access = ownPaymentsAccess(
      { hasPerson: person !== null, hasFeature, birthDate: person?.birthDate ?? null },
      today,
    )
    return { access, personId: person?.id ?? null }
  }
  return {
    check,
    async assert(subject) {
      const decision = await check(subject)
      if (decision.access === 'minor') return peopleErrors.throw('payments_minor')
      if (decision.access !== 'allowed' || !decision.personId) return foundationErrors.throw('scope_denied')
      return { personId: decision.personId }
    },
  }
}
