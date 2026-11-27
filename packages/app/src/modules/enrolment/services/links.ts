// The personal links and the keyed hashes of an application (sign-up form spec DD-J06, DD-J07, BR-J3, *Data Models*;
// foundation P-10; #799):
// - `enrolment.confirmationLinks`: the single-use 1-hour confirmation link on `enrolment_confirmation_links`;
// - `enrolment.applicationLinks`: the applicant's status link on `enrolment_application_links` (until expiry; cut to
//   closing + 30 days when the application closes).
// Every lookup passes the club's scope from the slug (`LookupOptions.scope`), so a token of another club answers like an
// unknown one and no lookup runs outside a club (the slug-free exception of DD-J07 is not approved). The raw token
// exists only in the e-mail and the dispatch delivery's encrypted secret.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { hashForLookup } from '@open-mercato/shared/lib/encryption/aes'
import { createTokenLinkService, type TokenLinkService } from '@/modules/foundation'
import { ApplicationLink, ConfirmationLink } from '../data/entities'
import {
  CONFIRMATION_TTL_MS,
  STATUS_LINK_TTL_MS,
  applicantKeySource,
  closedLinkExpiry,
  normalizeEmail,
} from '../lib/applications'
import type { EnrolmentScope } from './directory'

export const ENROLMENT_CONFIRMATION_LINKS = 'enrolment.confirmationLinks' as const
export const ENROLMENT_APPLICATION_LINKS = 'enrolment.applicationLinks' as const

export type ConfirmationLinkService = TokenLinkService<ConfirmationLink>
export type ApplicationLinkService = TokenLinkService<ApplicationLink>

export function createConfirmationLinks(): ConfirmationLinkService {
  return createTokenLinkService<'single', ConfirmationLink>(ConfirmationLink, {
    use: 'single',
    ttlMs: CONFIRMATION_TTL_MS,
    dedicatedTable: true,
  })
}

export function createApplicationLinks(): ApplicationLinkService {
  return createTokenLinkService<'until_expiry', ApplicationLink>(ApplicationLink, {
    use: 'until_expiry',
    ttlMs: STATUS_LINK_TTL_MS,
    dedicatedTable: true,
  })
}

export function confirmationLinks(container: AwilixContainer): ConfirmationLinkService {
  return container.resolve<ConfirmationLinkService>(ENROLMENT_CONFIRMATION_LINKS)
}

export function applicationLinks(container: AwilixContainer): ApplicationLinkService {
  return container.resolve<ApplicationLinkService>(ENROLMENT_APPLICATION_LINKS)
}

/** Deletes the application's confirmation links and issues a new one (DD-J06: "send again", BR-J3). */
export async function reissueConfirmationLink(
  container: AwilixContainer,
  em: EntityManager,
  scope: EnrolmentScope,
  applicationId: string,
) {
  await em.nativeDelete(ConfirmationLink, { ...scope, applicationId })
  return confirmationLinks(container).issue(em, { applicationId }, scope)
}

/** Deletes the application's status links and issues a new one (DD-J07: confirmation, "send me a new link"). */
export async function reissueStatusLink(
  container: AwilixContainer,
  em: EntityManager,
  scope: EnrolmentScope,
  applicationId: string,
) {
  await em.nativeDelete(ApplicationLink, { ...scope, applicationId })
  return applicationLinks(container).issue(em, { applicationId }, scope)
}

/** DD-J07: a closed application's status link works until closing + 30 days. */
export async function cutStatusLinks(
  em: EntityManager,
  scope: EnrolmentScope,
  applicationId: string,
  closedAt: Date,
): Promise<void> {
  const expiresAt = closedLinkExpiry(closedAt)
  await em.nativeUpdate(
    ApplicationLink,
    { ...scope, applicationId, expiresAt: { $gt: expiresAt } },
    { expiresAt, updatedAt: closedAt },
  )
  await em.nativeDelete(ConfirmationLink, { ...scope, applicationId })
}

/** BR-J3: the keyed identity hash of an application (the club's tenant in the context, never a plain digest). */
export function applicantKey(
  scope: EnrolmentScope,
  input: { email: string; firstName: string; lastName: string; birthDate: string },
): string {
  return hashForLookup(applicantKeySource(input), `enrolment:applicant_key:${scope.tenantId}`)
}

/** The keyed hash of the applicant's address (the operator's data subject lookup, the resend routes). */
export function emailKey(scope: EnrolmentScope, email: string): string {
  return hashForLookup(normalizeEmail(email), `enrolment:email_key:${scope.tenantId}`)
}
