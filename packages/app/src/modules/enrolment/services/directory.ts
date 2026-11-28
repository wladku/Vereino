// What `enrolment` reads of other modules (sign-up form spec *Architecture* → Module boundaries, DD-J05, DD-J11, BR-J5;
// #799): only through their DI contracts — the club settings and the section page lookup of `club_core`, the groups of
// a section with their fit rule and places of `groups`, the coordinators, administrators and possible duplicates of
// `people`. Every call carries the trusted tenant and organization; `enrolment` never reads another module's table.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone, type CalendarDate } from '@vereino/core'
import type { ClubCoreDirectory } from '../../club_core/services/directory'
import type { ClubCorePublicSite } from '../../club_core/services/public-site'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import type { ApplicationTarget, ApplicationTargetsService } from '../../groups/services/application-targets'
import type { GroupDirectory, GroupDirectoryEntry } from '../../groups/services/group-directory'
import type { DuplicateCandidatesService, DuplicateQuery } from '../../people/services/duplicate-candidates'
import type { PersonDirectory } from '../../people/services/person-directory'
import type { PublicBlockProvider } from '../../club_core/services/public-blocks'
import type { OccurrenceFact, OccurrenceFactsContract } from '../../activities/services/occurrence-facts'
import type { PublicPricesBlock } from '../../payments/lib/public-prices'
import { DEFAULT_REFERENCE_DAY, parseReferenceDay } from '../lib/age'

export type EnrolmentScope = { tenantId: string; organizationId: string }

const CLUB_CORE_SETTINGS = 'clubCoreSettings'
const CLUB_CORE_DIRECTORY = 'clubCoreDirectory'
const CLUB_CORE_PUBLIC_SITE = 'clubCorePublicSite'
const GROUPS_APPLICATION_TARGETS = 'groups.applicationTargets'
const GROUPS_DIRECTORY = 'groups.directory'
const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'
const PEOPLE_DUPLICATE_CANDIDATES = 'people.duplicateCandidates'
const PAYMENTS_PUBLIC_PRICES = 'payments.publicPrices'
const ACTIVITIES_OCCURRENCE_FACTS = 'activities.occurrenceFacts'

function required(container: AwilixContainer, token: string): AwilixContainer {
  if (!container.hasRegistration(token)) throw new Error('[internal] enrolment requires the DI service ' + token)
  return container
}

export function publicSite(container: AwilixContainer): ClubCorePublicSite {
  return required(container, CLUB_CORE_PUBLIC_SITE).resolve<ClubCorePublicSite>(CLUB_CORE_PUBLIC_SITE)
}

/** The club settings an application needs (REQ-J02). */
export type EnrolmentSettings = {
  timeZone: string
  locale: string
  answerDays: number
  referenceDay: string
  /** The club's information text for applicants; null = the built-in default text. */
  informationText: string | null
  /** The version of the information text: the settings row's last change (null without a stored row). */
  informationChangedAt: Date | null
  rulesUrl: string | null
  privacyPolicyUrl: string | null
  publicSlug: string | null
  contactPhone: string | null
}

export async function enrolmentSettings(container: AwilixContainer, scope: EnrolmentScope): Promise<EnrolmentSettings> {
  const settings = await required(container, CLUB_CORE_SETTINGS)
    .resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS)
    .get(scope)
  const values = settings.values
  return {
    timeZone: values.timezone,
    locale: values.defaultLocale,
    answerDays: values.applicationAnswerDays,
    referenceDay: parseReferenceDay(values.applicationAgeReferenceDay) ?? DEFAULT_REFERENCE_DAY,
    informationText: values.applicationInformation,
    informationChangedAt: settings.updatedAt,
    rulesUrl: settings.publicSettings.rulesUrl,
    privacyPolicyUrl: settings.publicSettings.privacyPolicyUrl,
    publicSlug: settings.publicSettings.publicSlug,
    contactPhone: settings.publicSettings.contactPhone,
  }
}

/** Today in the club's zone. */
export function clubDay(settings: Pick<EnrolmentSettings, 'timeZone'>, now: Date = new Date()): CalendarDate {
  return calendarDateInZone(now, settings.timeZone)
}

/** The groups of a section with their fit rule and places on `date` (DD-J05). */
export function applicationTargets(
  container: AwilixContainer,
  scope: EnrolmentScope,
  query: {
    sectionId: string
    date: CalendarDate
    groupIds?: readonly string[]
    /** Row-lock this group first (DD-J10a; needs `em`, the caller's transaction). */
    lockGroupId?: string
    em?: EntityManager
  },
): Promise<ApplicationTarget[]> {
  return required(container, GROUPS_APPLICATION_TARGETS)
    .resolve<ApplicationTargetsService>(GROUPS_APPLICATION_TARGETS)
    .applicationTargets(scope, query)
}

export type { OccurrenceFact } from '../../activities/services/occurrence-facts'

/**
 * The sessions among `ids` by id (`activities.occurrenceFacts`, DD-J12; phase 4, #801): a removed session or one of
 * another club is missing; without `activities` every session is missing, so a trial counts as over.
 */
export async function sessionFacts(
  container: AwilixContainer,
  scope: EnrolmentScope,
  ids: readonly (string | null | undefined)[],
  em?: EntityManager,
): Promise<Map<string, OccurrenceFact>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0 || !container.hasRegistration(ACTIVITIES_OCCURRENCE_FACTS)) return new Map()
  return container.resolve<OccurrenceFactsContract>(ACTIVITIES_OCCURRENCE_FACTS).occurrences(scope, wanted, em)
}

/** The next planned sessions of a group from `from` (the trial-session picker, M-J3); none without `activities`. */
export async function upcomingGroupSessions(
  container: AwilixContainer,
  scope: EnrolmentScope,
  groupId: string,
  from: Date,
  limit: number,
): Promise<OccurrenceFact[]> {
  if (!container.hasRegistration(ACTIVITIES_OCCURRENCE_FACTS)) return []
  return container
    .resolve<OccurrenceFactsContract>(ACTIVITIES_OCCURRENCE_FACTS)
    .upcomingSessionsOfGroup(scope, groupId, from, limit)
}

/** A group an applicant may choose: public, active and accepting applications. */
export function isOfferedGroup(target: ApplicationTarget): boolean {
  return target.isPublic && target.isActive && target.acceptsApplications
}

/** The names of the live sections among `ids`, by id. */
export async function sectionNames(
  container: AwilixContainer,
  scope: EnrolmentScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const found = await required(container, CLUB_CORE_DIRECTORY)
    .resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
    .findSections(scope, ids, em)
  return new Map([...found.values()].map((section) => [section.id, section.name]))
}

/** A live group of the club with its section, or null (the group sign-up QR code, #869). */
export async function findGroup(
  container: AwilixContainer,
  scope: EnrolmentScope,
  groupId: string,
): Promise<GroupDirectoryEntry | null> {
  const found = await required(container, GROUPS_DIRECTORY)
    .resolve<GroupDirectory>(GROUPS_DIRECTORY)
    .findGroups(scope, [groupId])
  return found.get(groupId) ?? null
}

/** The public address part of a live section of the club, or null without one (#869). */
export async function sectionPublicSlug(
  container: AwilixContainer,
  scope: EnrolmentScope,
  sectionId: string,
): Promise<string | null> {
  const found = await required(container, CLUB_CORE_DIRECTORY)
    .resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
    .findSections(scope, [sectionId])
  return found.get(sectionId)?.publicSlug ?? null
}

/** The live active sections of the club, by name. */
export function clubSections(container: AwilixContainer, scope: EnrolmentScope, em?: EntityManager) {
  return required(container, CLUB_CORE_DIRECTORY)
    .resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
    .listSections(scope, null, em)
}

function people(container: AwilixContainer): PersonDirectory {
  return required(container, PEOPLE_PERSON_DIRECTORY).resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY)
}

/**
 * BR-J5, Q-J03: the `auth` users who decide a section's applications on `date` — its coordinators, or every club
 * administrator when the section has none with an account.
 */
export async function deciderUserIds(
  container: AwilixContainer,
  scope: EnrolmentScope,
  sectionId: string,
  date: CalendarDate,
  em?: EntityManager,
): Promise<string[]> {
  const directory = people(container)
  const coordinators = await directory.sectionCoordinatorIdsOn(scope, sectionId, date, em)
  const coordinatorUsers = await directory.findUserIds(scope, coordinators, em)
  if (coordinatorUsers.size > 0) return [...new Set(coordinatorUsers.values())]
  const admins = await directory.roleHolderIdsOn(scope, 'club_admin', date, em)
  const adminUsers = await directory.findUserIds(scope, admins, em)
  return [...new Set(adminUsers.values())]
}

/** DD-J11: the possible duplicates of a query; empty when `people` does not offer the contract. */
export async function duplicateCandidates(
  container: AwilixContainer,
  scope: EnrolmentScope,
  query: DuplicateQuery,
  today: CalendarDate,
) {
  if (!container.hasRegistration(PEOPLE_DUPLICATE_CANDIDATES)) return []
  return container.resolve<DuplicateCandidatesService>(PEOPLE_DUPLICATE_CANDIDATES).candidates(scope, query, { today })
}

/** The candidates' display data for the accept sheet (DD-J11): name, birth date and whether they have an account. */
export async function candidatePersons(
  container: AwilixContainer,
  scope: EnrolmentScope,
  ids: readonly string[],
): Promise<Map<string, { name: string; birthDate: string | null; hasAccount: boolean }>> {
  if (ids.length === 0) return new Map()
  const directory = people(container)
  const [persons, users] = await Promise.all([directory.findPersons(scope, ids), directory.findUserIds(scope, ids)])
  return new Map(
    [...persons.values()].map((person) => [
      person.id,
      {
        name: `${person.firstName} ${person.lastName}`.trim(),
        birthDate: person.birthDate,
        hasAccount: users.has(person.id),
      },
    ]),
  )
}

export type GroupFee = { amount: number; currency: 'PLN'; period: string; siblingDiscountPercent: number | null }

/**
 * Q-J06: the fees of the section's public groups valid today, by group (`payments.publicPrices`, the prices block of
 * the public section page). Empty without `payments` or for a group that is not public: the accept sheet then names
 * the rule without an amount.
 */
export async function groupFees(
  container: AwilixContainer,
  scope: EnrolmentScope,
  sectionId: string,
): Promise<Map<string, GroupFee[]>> {
  if (!container.hasRegistration(PAYMENTS_PUBLIC_PRICES)) return new Map()
  const provider = container.resolve<PublicBlockProvider>(PAYMENTS_PUBLIC_PRICES)
  const block = (await provider.sectionBlock?.({
    ...scope,
    clubSlug: '',
    sectionId,
    sectionSlug: '',
    publishedBlocks: [],
  })) as PublicPricesBlock | null | undefined
  return new Map((block?.groups ?? []).map((group) => [group.groupId, group.fees]))
}
