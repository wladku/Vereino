// The model behind `ErrorSummary` and `FieldErrorMessage` (R04.1–R04.3 of `docs/ux-concept/references.md`; #490): a
// member or public form keeps its submit button enabled, and a submit with missing or wrong input lists every problem
// at the top of the form, shows the same text under the field and moves the focus to the first field to fix.

/** One problem of a form: the `id` of the field to fix and the message, already translated. */
export type FieldProblem = { fieldId: string; message: string }

/** The element `id` of a field's error message, which the field names in `aria-describedby`. */
export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`
}

/** The message of a field's first problem, or `null` when the field has none. */
export function problemOf(problems: readonly FieldProblem[], fieldId: string): string | null {
  return problems.find((problem) => problem.fieldId === fieldId)?.message ?? null
}

/**
 * The accessibility attributes of a field: invalid and described by its error message when it has a problem, otherwise
 * described by `describedBy` (a hint) if given.
 */
export function fieldProblemProps(
  problems: readonly FieldProblem[],
  fieldId: string,
  describedBy?: string,
): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  if (problemOf(problems, fieldId) === null) return describedBy ? { 'aria-describedby': describedBy } : {}
  return {
    'aria-invalid': true,
    'aria-describedby': [describedBy, fieldErrorId(fieldId)].filter(Boolean).join(' '),
  }
}

type FocusRoot = { getElementById: (id: string) => { focus: () => void } | null }

/** Moves the focus to the field with the given `id`; false when the page has no such field (or no document). */
export function focusField(fieldId: string, root: FocusRoot | undefined = globalThis.document): boolean {
  const field = root?.getElementById(fieldId)
  if (!field) return false
  field.focus()
  return true
}

/** Moves the focus to the field of the first problem; false when there is none. */
export function focusFirstProblem(problems: readonly FieldProblem[], root?: FocusRoot): boolean {
  const first = problems[0]
  return first ? focusField(first.fieldId, root) : false
}

/** The click handler of a summary link: keeps the address as it is and moves the focus to the field instead. */
export function focusOnClick(fieldId: string, root?: FocusRoot): (event: { preventDefault: () => void }) => void {
  return (event) => {
    event.preventDefault()
    focusField(fieldId, root)
  }
}
