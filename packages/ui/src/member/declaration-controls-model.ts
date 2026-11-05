// The model of `DeclarationControls` (foundation P-19, phase C; club spec glossary *Declaration*; D-022, D-026; UX
// concept M-02, M-14): what a person can declare follows the session's kind — an `absence_only` session (a training)
// offers "Report absence" and, once reported, its undo back to `unknown` (silence means "expected"); a `confirm` session
// offers "Attending" / "Not attending" as a pressed pair. Pure.

export type DeclarationKind = 'absence_only' | 'confirm'

export type DeclaredValue = 'yes' | 'no' | 'unknown'

export type DeclarationControlsLabels = {
  attending: string
  notAttending: string
  reportAbsence: string
  undoAbsence: string
  /** The status line of an `absence_only` session without a reported absence ("Expected"). */
  expected: string
  /** The status line once an absence is reported ("Absence reported"). */
  absent: string
  /** The status line of a `confirm` session without an answer ("No answer yet"). */
  noAnswer: string
}

export type DeclarationAction = {
  value: DeclaredValue
  label: string
  /** `true` / `false` for the pressed pair of a `confirm` session; `null` for a one-off action. */
  pressed: boolean | null
}

/** The buttons of one person's declaration. */
export function declarationActions(
  kind: DeclarationKind,
  declared: DeclaredValue,
  labels: DeclarationControlsLabels,
): DeclarationAction[] {
  if (kind === 'absence_only') {
    return declared === 'no'
      ? [{ value: 'unknown', label: labels.undoAbsence, pressed: null }]
      : [{ value: 'no', label: labels.reportAbsence, pressed: null }]
  }
  return [
    { value: 'yes', label: labels.attending, pressed: declared === 'yes' },
    { value: 'no', label: labels.notAttending, pressed: declared === 'no' },
  ]
}

/** The status line announced after a change (`aria-live`). */
export function declarationStatusText(
  kind: DeclarationKind,
  declared: DeclaredValue,
  labels: DeclarationControlsLabels,
): string {
  if (kind === 'absence_only') return declared === 'no' ? labels.absent : labels.expected
  if (declared === 'yes') return labels.attending
  if (declared === 'no') return labels.notAttending
  return labels.noAnswer
}
