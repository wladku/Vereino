'use client'
// The issues of a rental slot (facilities spec B-24; #122) as the rental forms show them — the slot dialog's rental
// kind (#277) and the move dialog: each coded issue of a quote or a refused save next to the field it belongs to,
// with its conflicts listed.
import { codedMessage, type Translate } from './facilities-client'
import { conflictLabel, type QuoteIssue } from './rentals-client'

/** The field a coded issue belongs to (shown next to it); unknown codes go to the dialog. */
export const FIELD_OF_ISSUE: Partial<Record<string, RentalField>> = {
  facilities_reference_invalid: 'place',
  rental_units_invalid: 'units',
  rental_rate_missing: 'category',
  rental_renter_invalid: 'renter',
  entry_ban_active: 'renter',
  zone_not_reservable: 'start',
  rental_conflict: 'start',
  place_closed: 'start',
  maintenance_scheduled: 'start',
}

export type RentalField = 'place' | 'start' | 'units' | 'renter' | 'category'

/** Issue messages grouped by field, with their conflicts listed. */
export function issuesByField(
  t: Translate,
  issues: readonly QuoteIssue[],
  timeZone: string,
): Map<RentalField | 'form', IssueMessage[]> {
  const byField = new Map<RentalField | 'form', IssueMessage[]>()
  for (const issue of issues) {
    const field = FIELD_OF_ISSUE[issue.code] ?? 'form'
    const list = byField.get(field) ?? []
    list.push({
      code: issue.code,
      text: codedMessage({ code: issue.code }, t) ?? t('facilities.rentals.errors.save'),
      conflicts: (issue.conflicts ?? []).map((conflict) => conflictLabel(t, conflict, timeZone)),
    })
    byField.set(field, list)
  }
  return byField
}

export type IssueMessage = { code: string; text: string; conflicts: string[] }

export function FieldIssues({ id, messages }: { id: string; messages: readonly IssueMessage[] | undefined }) {
  if (!messages || messages.length === 0) return null
  return (
    <div id={id} className="flex flex-col gap-1" role="alert">
      {messages.map((message) => (
        <div
          key={message.code}
          className="text-destructive text-xs"
          data-testid={`facilities-rental-issue-${message.code}`}
        >
          <p>{message.text}</p>
          {message.conflicts.length > 0 ? (
            <ul className="list-disc ps-4">
              {message.conflicts.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  )
}
