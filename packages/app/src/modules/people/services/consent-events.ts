// The consent events of the event photos spec (DD-I07, `people_consent_events`; #871): every consent decision is
// appended, in the transaction of the change, with the wording it was given to — the club's own text and its
// `changedAt` when the club changed it (club spec DD-39), else the built-in catalog text in the decision's locale — as a
// SHA-256 of the exact text. The history reads them back and tells whether each decision was given to the current
// wording. After the commit, `people.consent.image_withdrawn` announces an image withdrawal (ids only).
import { createHash, randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { loadDictionary, resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { Locale } from '@open-mercato/shared/lib/i18n/config'
import { ConsentEvent } from '../data/entities'
import { emitPeopleEvent } from '../events'
import { builtInWordingKey, type ConsentDecisionRole } from '../lib/image-consent'
import type { ConsentKind } from '../lib/people-rules'
import { clubConsentTexts, type ClubConsentTexts, type ClubScope } from './club-clock'

/** One decision to record: the kind and the state after it. */
export type ConsentDecision = { kind: ConsentKind; granted: boolean }

export type RecordConsentEventsInput = {
  scope: ClubScope
  subjectPersonId: string
  /** The guardianship the decision was made on; null for an adult's own consent. */
  guardianshipId: string | null
  decisions: readonly ConsentDecision[]
  byPersonId: string | null
  byRole: ConsentDecisionRole
  /** A staff withdrawal's note (BR-I05); stored only on withdrawals made by staff. */
  note?: string | null
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** The text a decision of `kind` is given to: the club's own text, else the built-in text from `dict`. */
export function wordingText(kind: ConsentKind, texts: ClubConsentTexts, dict: Record<string, string>): string {
  return texts[kind]?.text ?? dict[builtInWordingKey(kind)] ?? builtInWordingKey(kind)
}

/**
 * Appends one consent event per decision (DD-I07) to `em` — the command's write transaction, flushed with it. Returns
 * the rows; none for an empty list.
 */
export async function recordConsentEvents(
  em: EntityManager,
  container: AwilixContainer,
  input: RecordConsentEventsInput,
): Promise<ConsentEvent[]> {
  if (input.decisions.length === 0) return []
  const [texts, { locale, dict }] = await Promise.all([clubConsentTexts(container, input.scope), resolveTranslations()])
  const now = new Date()
  return input.decisions.map((decision) => {
    const own = texts[decision.kind]
    const staffWithdrawal = input.byRole === 'club_admin' && !decision.granted
    const row = em.create(ConsentEvent, {
      id: randomUUID(),
      ...input.scope,
      subjectPersonId: input.subjectPersonId,
      guardianshipId: input.guardianshipId,
      kind: decision.kind,
      granted: decision.granted,
      byPersonId: input.byPersonId,
      byRole: input.byRole,
      note: staffWithdrawal ? (input.note?.trim() ?? null) : null,
      wordingChangedAt: own?.changedAt ? new Date(own.changedAt) : null,
      wordingSha256: sha256(wordingText(decision.kind, texts, dict)),
      locale: String(locale).slice(0, 8),
      createdAt: now,
    })
    em.persist(row)
    return row
  })
}

/**
 * The hash of the current wording of `kind` in each locale among `locales` — for the history's "given to the current
 * wording" mark, compared with each event's `wording_sha256`.
 */
export async function currentWordingHashes(
  container: AwilixContainer,
  scope: ClubScope,
  kind: ConsentKind,
  locales: readonly string[],
): Promise<Map<string, string>> {
  const texts = await clubConsentTexts(container, scope)
  const result = new Map<string, string>()
  for (const locale of new Set(locales)) {
    const dict = await loadDictionary(locale as Locale)
    result.set(locale, sha256(wordingText(kind, texts, dict)))
  }
  return result
}

/**
 * After the commit: `people.consent.image_withdrawn` for every image withdrawal among `events` (REQ-I09), ids only.
 */
export async function emitImageWithdrawals(events: readonly ConsentEvent[]): Promise<void> {
  for (const event of events) {
    if (event.kind !== 'image' || event.granted) continue
    const scope = { tenantId: event.tenantId, organizationId: event.organizationId }
    await emitPeopleEvent(
      'people.consent.image_withdrawn',
      { ...scope, subjectPersonId: event.subjectPersonId, consentEventId: event.id },
      { persistent: true, ...scope },
    )
  }
}
