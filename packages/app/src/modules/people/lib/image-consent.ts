// The image consent of the event photos spec (`.ai/specs/2026-11-26-vereino-event-photos-and-image-consent.md`, phase 1,
// #871): whether a person's image may be published now (BR-I02 for a minor, BR-I03 for an adult, BR-I04 grant author),
// who may change the consent (BR-I05), the carry-over at the 18th birthday (BR-I03), the role a consent event records
// and the built-in wording a decision is given to (DD-I07). Pure: the callers read the stored consents and pass them in.
import type { ActingRole } from '@vereino/core'
import type { ConsentKind, StoredConsentEntry, StoredConsents } from './people-rules'

/** One guardianship of a ward as the image rule reads it: its guardian and its stored consents. */
export type ImageConsentGuardianship = {
  readonly guardianPersonId: string
  readonly consents: StoredConsents
}

/**
 * BR-I02: a minor's image may be published when, among the guardianships active today, at least one holds a grant made
 * by that guardianship's own guardian (BR-I04: a grant recorded by staff does not count) and none holds a withdrawal
 * (one guardian's withdrawal is a veto, DD-I05). No active guardianship → false.
 */
export function minorImagePublishable(active: readonly ImageConsentGuardianship[]): boolean {
  let granted = false
  for (const link of active) {
    const entry = link.consents.image
    if (!entry) continue
    if (!entry.granted) return false
    if (entry.by_person_id === link.guardianPersonId) granted = true
  }
  return granted
}

/**
 * BR-I03: an adult's image may be published when their own `image` consent is granted by themself, or carried over
 * from the guardians on the 18th birthday. A grant recorded by staff does not count (BR-I04).
 */
export function adultImagePublishable(personId: string, own: StoredConsents): boolean {
  const entry = own.image
  if (!entry?.granted) return false
  return entry.by_person_id === personId || entry.via === 'carry_over'
}

/** `imagePublishable` of one person: the adult rule when they hold their own consents, else the minor rule. */
export function imagePublishable(input: {
  readonly personId: string
  readonly adult: boolean
  readonly own: StoredConsents
  readonly guardianships: readonly ImageConsentGuardianship[]
}): boolean {
  return input.adult ? adultImagePublishable(input.personId, input.own) : minorImagePublishable(input.guardianships)
}

function latest(entries: readonly StoredConsentEntry[]): StoredConsentEntry | null {
  let found: StoredConsentEntry | null = null
  for (const entry of entries) if (!found || Date.parse(entry.at) > Date.parse(found.at)) found = entry
  return found
}

/**
 * BR-I03, the carry-over of `image` at the 18th birthday: a grant only when BR-I02 held on the last day of the
 * guardianships — the latest grant by a guardian of their own row, marked `via: 'carry_over'`. Otherwise the latest
 * withdrawal when there is one (the veto carries over), else the latest decision as it is (a grant recorded by staff,
 * which still does not count). Null when nobody decided.
 */
export function carriedOverImage(ending: readonly ImageConsentGuardianship[]): StoredConsentEntry | null {
  if (minorImagePublishable(ending)) {
    const grants = ending.flatMap((link) => {
      const entry = link.consents.image
      return entry?.granted && entry.by_person_id === link.guardianPersonId ? [entry] : []
    })
    const grant = latest(grants) as StoredConsentEntry
    return { granted: true, at: grant.at, by_person_id: grant.by_person_id, via: 'carry_over' }
  }
  const decisions = ending.flatMap((link) => (link.consents.image ? [link.consents.image] : []))
  const withdrawal = latest(decisions.filter((entry) => !entry.granted))
  const decision = withdrawal ?? latest(decisions)
  return decision ? { granted: decision.granted, at: decision.at, by_person_id: decision.by_person_id } : null
}

/** Why a change of the `image` consent is refused (BR-I05), or null when it is allowed. */
export type ImageChangeProblem = 'image_consent_subject_only' | 'scope_denied' | 'consent_note_required'

/**
 * BR-I05: who may change the `image` consent. `owner` is the person whose decision it is — the guardian of the
 * guardianship row, or the adult person for their own consent. The owner may grant and withdraw. Anyone else may only
 * withdraw, as the club administrator recording the owner's request, with a note; a guardian acting on the other
 * guardian's row is refused (403 `scope_denied`), a staff grant answers 422 `image_consent_subject_only`.
 */
export function imageChangeProblem(input: {
  readonly granted: boolean
  readonly actingRole: ActingRole
  readonly actorPersonId: string | null
  readonly owner: string
  readonly note: string | null | undefined
}): ImageChangeProblem | null {
  if (input.actorPersonId !== null && input.actorPersonId === input.owner) return null
  if (input.actingRole === 'guardian') return 'scope_denied'
  if (input.granted) return 'image_consent_subject_only'
  return input.note?.trim() ? null : 'consent_note_required'
}

/** Who made a consent decision, as `people_consent_events.by_role` records it (DD-I07). */
export type ConsentDecisionRole = 'guardian' | 'self' | 'club_admin' | 'system'

/**
 * The role of a decision on a guardianship (`guardianship: true`) or on the person's own consents: the owner acting
 * is `guardian` or `self`; anyone else is the club administrator recording it.
 */
export function consentDecisionRole(input: {
  readonly guardianship: boolean
  readonly actorPersonId: string | null
  readonly owner: string
}): ConsentDecisionRole {
  if (input.actorPersonId === null || input.actorPersonId !== input.owner) return 'club_admin'
  return input.guardianship ? 'guardian' : 'self'
}

/**
 * The catalog key of the built-in wording of a consent (DD-I07: the text a decision is given to when the club has no
 * text of its own). The image consent has its own full wording (draft until the lawyer's review, OA-I1); the other
 * kinds read as their label.
 */
export function builtInWordingKey(kind: ConsentKind): string {
  return kind === 'image' ? 'people.consents.image.wording' : `people.guardianships.consents.${kind}`
}

/** The bounds of a staff withdrawal's note (BR-I05). */
export const CONSENT_NOTE_MIN = 2
export const CONSENT_NOTE_MAX = 200
