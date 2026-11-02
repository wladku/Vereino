// P-29 audience (foundation III REQ-M01, DD-M05, DD-M06): an audience is data — a kind and ids — resolved at send time
// by the provider the owning module registers for the kind, then expanded here by the club spec's *Thread* rule:
// members with an account, the active guardians of minor members (a minor without an account is reached only through
// them), coaches. Account holders get in-app and e-mail, people with only an address e-mail, people with neither are
// unreachable. Pure: the foundation's `resolveAudience` feeds it the provider's members and the contact resolver's data.
import { isAdultOn } from '#src/account-policy'
import type { CalendarDate } from '#src/calendar-date'

/** The scope kinds an audience can name; `persons` is an explicit list (the thread scope `direct`). */
export const AUDIENCE_KINDS = ['club', 'section', 'group', 'activity', 'occurrence', 'persons'] as const

export type AudienceKind = (typeof AUDIENCE_KINDS)[number]

/** An audience as data: the kind and, except for `club`, the ids of its targets (sections, groups, … or persons). */
export type AudienceSpec = { readonly kind: AudienceKind; readonly ids?: readonly string[] }

/** Why a person receives a message: a provider's `participant`, `coach` or `direct`; the expansion's `guardian`. */
export type AudienceReason = 'participant' | 'coach' | 'guardian' | 'direct'

/** A person a provider returns for an audience, with the reason it belongs (guardians are added by the expansion). */
export type AudienceMember = { readonly personId: string; readonly reason: Exclude<AudienceReason, 'guardian'> }

/** What the contact resolver knows about a person: account, address, language and birth date. */
export type AudienceContact = {
  readonly personId: string
  readonly name: string
  readonly userId: string | null
  readonly email: string | null
  /** The person's language, already resolved person → club default. */
  readonly locale: string
  readonly birthDate: CalendarDate | null
}

export type RecipientChannel = 'in_app' | 'email'

/** One deduplicated recipient: every reason it was reached for and the channels it can be reached on (none = unreachable). */
export type Recipient = {
  readonly personId: string
  readonly userId: string | null
  readonly email: string | null
  readonly locale: string
  readonly reasons: readonly AudienceReason[]
  readonly channels: readonly RecipientChannel[]
}

/** The counts a composer shows: reachable recipients, how many of them have no address, how many are unreachable. */
export type AudienceCounts = {
  readonly recipients: number
  readonly withoutEmail: number
  readonly unreachable: number
}

export type AudienceExpansionInput = {
  readonly members: readonly AudienceMember[]
  /** Contacts of every member and every guardian, by person id. A person without a contact is skipped. */
  readonly contacts: ReadonlyMap<string, AudienceContact>
  /** The active guardians of each minor among the members, by ward id. */
  readonly guardiansByWard: ReadonlyMap<string, readonly string[]>
}

export type AudienceExpansion = { readonly recipients: readonly Recipient[]; readonly unreachable: readonly string[] }

/** An audience larger than this is refused (422 `audience_too_large`): a club has ~200 people; it protects the fan-out. */
export const AUDIENCE_MAX_RECIPIENTS = 2000

/** DI token prefix of the audience providers; a module registers `vereino.audience.<kind>` for the kinds it owns. */
export const AUDIENCE_PROVIDER_TOKEN_PREFIX = 'vereino.audience.'

/** DI token of the contact resolver (registered by `people`). */
export const CONTACT_RESOLVER_TOKEN = 'vereino.contactResolver'

const REASON_ORDER: readonly AudienceReason[] = ['participant', 'coach', 'guardian', 'direct']

export function isAudienceKind(value: unknown): value is AudienceKind {
  return typeof value === 'string' && (AUDIENCE_KINDS as readonly string[]).includes(value)
}

/** The DI token of the provider for `kind`, e.g. `vereino.audience.group`. */
export function audienceProviderToken(kind: AudienceKind): string {
  return `${AUDIENCE_PROVIDER_TOKEN_PREFIX}${kind}`
}

/** True for a member the minor rule applies to: a participant or a directly addressed person, never a coach. */
function followsMinorRule(reason: AudienceMember['reason']): boolean {
  return reason !== 'coach'
}

/** A person under 18 on `today`; an unknown birth date counts as an adult (the club records it for every minor). */
function isMinor(contact: AudienceContact | undefined, today: CalendarDate): boolean {
  return Boolean(contact?.birthDate) && !isAdultOn(contact?.birthDate as CalendarDate, today)
}

/** The members whose guardians the expansion needs: minors reached as participants or directly. */
export function minorMemberIds(
  members: readonly AudienceMember[],
  contacts: ReadonlyMap<string, AudienceContact>,
  today: CalendarDate,
): string[] {
  const ids = new Set<string>()
  for (const member of members) {
    if (followsMinorRule(member.reason) && isMinor(contacts.get(member.personId), today)) ids.add(member.personId)
  }
  return [...ids].sort()
}

function channelsOf(contact: AudienceContact): RecipientChannel[] {
  const channels: RecipientChannel[] = []
  if (contact.userId) channels.push('in_app')
  if (contact.email) channels.push('email')
  return channels
}

/**
 * Expands the provider's members into recipients (DD-M06): a minor participant adds their active guardians and stays a
 * recipient only with an account; a minor without an account and without an active guardian is unreachable; adults
 * and coaches stay. One person appears once with every reason; `exclude` (the author) is dropped after the expansion.
 * Recipients are sorted by person id; an unreachable person is a recipient without channels.
 */
export function expandAudience(
  input: AudienceExpansionInput,
  today: CalendarDate,
  options: { readonly exclude?: readonly string[] } = {},
): AudienceExpansion {
  const reasons = new Map<string, Set<AudienceReason>>()
  const unreachableMinors = new Map<string, AudienceMember['reason']>()
  const add = (personId: string, reason: AudienceReason) => {
    const set = reasons.get(personId) ?? new Set<AudienceReason>()
    set.add(reason)
    reasons.set(personId, set)
  }
  for (const member of input.members) {
    const contact = input.contacts.get(member.personId)
    if (!contact) continue
    if (followsMinorRule(member.reason) && isMinor(contact, today)) {
      const guardians = (input.guardiansByWard.get(member.personId) ?? []).filter((id) => input.contacts.has(id))
      for (const guardianId of guardians) add(guardianId, 'guardian')
      if (contact.userId) add(member.personId, member.reason)
      else if (guardians.length === 0) unreachableMinors.set(member.personId, member.reason)
      continue
    }
    add(member.personId, member.reason)
  }
  const excluded = new Set(options.exclude ?? [])
  const recipients: Recipient[] = []
  for (const [personId, set] of reasons) {
    if (excluded.has(personId)) continue
    const contact = input.contacts.get(personId) as AudienceContact
    recipients.push({
      personId,
      userId: contact.userId,
      email: contact.email,
      locale: contact.locale,
      reasons: REASON_ORDER.filter((reason) => set.has(reason)),
      channels: channelsOf(contact),
    })
  }
  for (const [personId, reason] of unreachableMinors) {
    if (excluded.has(personId) || reasons.has(personId)) continue
    const contact = input.contacts.get(personId) as AudienceContact
    recipients.push({ personId, userId: null, email: null, locale: contact.locale, reasons: [reason], channels: [] })
  }
  // Person ids are unique here (one entry per person), so the order is strict.
  recipients.sort((a, b) => (a.personId < b.personId ? -1 : 1))
  return {
    recipients,
    unreachable: recipients.filter((recipient) => recipient.channels.length === 0).map(({ personId }) => personId),
  }
}

/** The composer's counts (`AudiencePicker`): reachable recipients, reachable without an address, unreachable. */
export function audienceCounts(recipients: readonly Recipient[]): AudienceCounts {
  let reachable = 0
  let withoutEmail = 0
  for (const recipient of recipients) {
    if (recipient.channels.length === 0) continue
    reachable += 1
    if (!recipient.channels.includes('email')) withoutEmail += 1
  }
  return { recipients: reachable, withoutEmail, unreachable: recipients.length - reachable }
}
