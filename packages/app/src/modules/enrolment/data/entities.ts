import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import {
  ScopedEntityBase,
  decorateScopedEntityBase,
  tokenLinkColumns,
  type ScopedEntityOptionalProps,
} from '@vereino/db'
import type { AgeFit, ApplicationKind, ApplicationState, Experience } from '../lib/states'

decorateScopedEntityBase({ PrimaryKey, Property })

/** A possible duplicate stored on an application (DD-J11): scalar person ids only. */
export type StoredDuplicateCandidate = {
  personId: string
  role: 'participant' | 'guardian'
  reason: 'name_birth_date' | 'email' | 'phone'
}

/**
 * One application to join one section (sign-up form spec *Data Models* → `enrolment_applications`, DD-J02, BR-J1,
 * BR-J3, DD-J09; #799): the participant (a child, or the applying adult) and the contact, encrypted at rest
 * (`encryption.ts`); no person id until it is accepted (phase 3). `group_id` null means "choose a group for us".
 * `applicant_key` (BR-J3) and `email_key` (the operator's data subject lookup) are keyed lookup hashes
 * (`hashForLookup`, the mechanism of `people_persons.pesel_hash`), never a plain digest of an address. The waiting number
 * is computed from `waiting_since`, never stored. Anonymised 30 days after closing (R23): the encrypted columns, the
 * keys, the locale, the duplicates and the person links are cleared, the birth date keeps its year.
 */
@Entity({ tableName: 'enrolment_applications' })
@Index({ name: 'enrolment_applications_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'enrolment_applications_org_state_section_idx',
  properties: ['organizationId', 'state', 'sectionId', 'confirmedAt'],
})
@Index({
  name: 'enrolment_applications_org_group_waiting_idx',
  properties: ['organizationId', 'groupId', 'state', 'waitingSince'],
})
@Index({
  name: 'enrolment_applications_org_section_applicant_open_unique',
  expression:
    'create unique index "enrolment_applications_org_section_applicant_open_unique" on "enrolment_applications" ("organization_id", "section_id", "applicant_key") where deleted_at is null and applicant_key is not null and state in (\'unconfirmed\', \'new\', \'trial\', \'waiting\')',
})
@Index({
  name: 'enrolment_applications_org_email_key_idx',
  expression:
    'create index "enrolment_applications_org_email_key_idx" on "enrolment_applications" ("organization_id", "email_key") where email_key is not null',
})
export class Application extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'groupId'
    | 'participantFirstName'
    | 'participantLastName'
    | 'guardianFirstName'
    | 'guardianLastName'
    | 'guardianEmail'
    | 'guardianPhone'
    | 'note'
    | 'decisionReason'
    | 'participantBirthDate'
    | 'applicantKey'
    | 'emailKey'
    | 'waitingSince'
    | 'wantsTrial'
    | 'experience'
    | 'locale'
    | 'informationTextChangedAt'
    | 'confirmedAt'
    | 'trialOccurrenceId'
    | 'trialOutcome'
    | 'decidedAt'
    | 'decidedByUserId'
    | 'closedAt'
    | 'duplicateCandidates'
    | 'acceptedChildPersonId'
    | 'acceptedGuardianPersonId'
    | 'acceptedMembershipId'
    | 'anonymizedAt'

  @Property({ name: 'section_id', type: 'uuid' })
  sectionId!: string

  /** The chosen group; null = "choose a group for us". */
  @Property({ name: 'group_id', type: 'uuid', nullable: true })
  groupId?: string | null

  @Property({ name: 'kind', type: 'text' })
  kind!: ApplicationKind

  @Property({ name: 'state', type: 'text' })
  state!: ApplicationState

  @Property({ name: 'participant_first_name', type: 'text', nullable: true })
  participantFirstName?: string | null

  @Property({ name: 'participant_last_name', type: 'text', nullable: true })
  participantLastName?: string | null

  /** The guardian's names (`kind = child`); empty for an adult applying for themself. */
  @Property({ name: 'guardian_first_name', type: 'text', nullable: true })
  guardianFirstName?: string | null

  @Property({ name: 'guardian_last_name', type: 'text', nullable: true })
  guardianLastName?: string | null

  /** The applicant's e-mail (the guardian's, or the adult's own). */
  @Property({ name: 'guardian_email', type: 'text', nullable: true })
  guardianEmail?: string | null

  /** The applicant's phone in E.164. */
  @Property({ name: 'guardian_phone', type: 'text', nullable: true })
  guardianPhone?: string | null

  @Property({ name: 'note', type: 'text', nullable: true })
  note?: string | null

  /** The reject reason the applicant sees. */
  @Property({ name: 'decision_reason', type: 'text', nullable: true })
  decisionReason?: string | null

  /** `YYYY-MM-DD`; after anonymisation only its year (1 January). */
  @Property({ name: 'participant_birth_date', type: 'date', nullable: true })
  participantBirthDate?: string | null

  @Property({ name: 'applicant_key', type: 'text', nullable: true })
  applicantKey?: string | null

  @Property({ name: 'email_key', type: 'text', nullable: true })
  emailKey?: string | null

  /** When the application entered its group's waiting list (DD-J09); the number is computed from it. */
  @Property({ name: 'waiting_since', type: Date, nullable: true })
  waitingSince?: Date | null

  @Property({ name: 'wants_trial', type: 'boolean', default: true })
  wantsTrial: boolean = true

  @Property({ name: 'experience', type: 'text', nullable: true })
  experience?: Experience | null

  @Property({ name: 'age_fit', type: 'text' })
  ageFit!: AgeFit

  /** The reference date the age counts on (DD-J03). */
  @Property({ name: 'reference_date', type: 'date' })
  referenceDate!: string

  /** The applicant's language for the e-mails. */
  @Property({ name: 'locale', type: 'text', nullable: true })
  locale?: string | null

  @Property({ name: 'rules_accepted_at', type: Date })
  rulesAcceptedAt!: Date

  @Property({ name: 'privacy_acknowledged_at', type: Date })
  privacyAcknowledgedAt!: Date

  /** The version of the information text the applicant was shown (the settings row's last change). */
  @Property({ name: 'information_text_changed_at', type: Date, nullable: true })
  informationTextChangedAt?: Date | null

  @Property({ name: 'confirmed_at', type: Date, nullable: true })
  confirmedAt?: Date | null

  @Property({ name: 'trial_occurrence_id', type: 'uuid', nullable: true })
  trialOccurrenceId?: string | null

  @Property({ name: 'trial_outcome', type: 'text', nullable: true })
  trialOutcome?: 'present' | 'absent' | null

  @Property({ name: 'decided_at', type: Date, nullable: true })
  decidedAt?: Date | null

  @Property({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId?: string | null

  @Property({ name: 'closed_at', type: Date, nullable: true })
  closedAt?: Date | null

  @Property({ name: 'duplicate_candidates', type: 'json', nullable: true })
  duplicateCandidates?: StoredDuplicateCandidate[] | null

  @Property({ name: 'accepted_child_person_id', type: 'uuid', nullable: true })
  acceptedChildPersonId?: string | null

  @Property({ name: 'accepted_guardian_person_id', type: 'uuid', nullable: true })
  acceptedGuardianPersonId?: string | null

  @Property({ name: 'accepted_membership_id', type: 'uuid', nullable: true })
  acceptedMembershipId?: string | null

  @Property({ name: 'anonymized_at', type: Date, nullable: true })
  anonymizedAt?: Date | null
}

const confirmationLinkColumns = tokenLinkColumns({ use: 'single' })

/**
 * The e-mail confirmation link of an application (DD-J06; foundation P-10): single use, one hour. "Send again" and a
 * repeated submission delete the old link and issue a new one. `application_id` is a scalar id.
 */
@Entity({ tableName: 'enrolment_confirmation_links' })
@Index({ name: 'enrolment_confirmation_links_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({ name: 'enrolment_confirmation_links_org_application_idx', properties: ['organizationId', 'applicationId'] })
export class ConfirmationLink extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'usedAt'

  @Property(confirmationLinkColumns.tokenHash)
  tokenHash!: string

  @Property(confirmationLinkColumns.expiresAt)
  expiresAt!: Date

  @Property(confirmationLinkColumns.usedAt)
  usedAt?: Date | null

  @Property({ name: 'application_id', type: 'uuid' })
  applicationId!: string
}

const applicationLinkColumns = tokenLinkColumns({ use: 'until_expiry' })

/**
 * The applicant's status link (DD-J07; foundation P-10): until expiry; its expiry moves to closing + 30 days when the
 * application closes. Reissued (the old one deleted) when the applicant asks for a new link.
 */
@Entity({ tableName: 'enrolment_application_links' })
@Index({ name: 'enrolment_application_links_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({ name: 'enrolment_application_links_org_application_idx', properties: ['organizationId', 'applicationId'] })
export class ApplicationLink extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'usedCount' | 'lastUsedAt'

  @Property(applicationLinkColumns.tokenHash)
  tokenHash!: string

  @Property(applicationLinkColumns.expiresAt)
  expiresAt!: Date

  @Property(applicationLinkColumns.usedCount)
  usedCount: number = 0

  @Property(applicationLinkColumns.lastUsedAt)
  lastUsedAt?: Date | null

  @Property({ name: 'application_id', type: 'uuid' })
  applicationId!: string
}
