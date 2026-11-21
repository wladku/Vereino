// `ErrorSummary` and `FieldErrorMessage` (R04.1–R04.3 of `docs/ux-concept/references.md`; #490): a member or public
// form does not disable its submit button while input is missing. A submit with problems shows this summary at the top
// of the form — a heading and one link per problem, the same text as under the field — and the form moves the focus
// to the first field to fix (`focusFirstProblem`), whose `aria-describedby` reads its error. The summary is a labelled
// section, not a live region: its list follows the typing after a failed send, and an alert would be read out again on
// every key. A link moves the focus to its field. Texts come in already translated, from the module's catalog.
import * as React from 'react'
import { fieldErrorId, focusOnClick, type FieldProblem } from '#src/member/error-summary-model'

export type ErrorSummaryProps = {
  /** The heading, e.g. "Check the form". */
  title: string
  /** The problems in the order of the fields; nothing is shown without one. */
  problems: readonly FieldProblem[]
  className?: string
  'data-testid'?: string
}

export function ErrorSummary({ title, problems, className, 'data-testid': testId }: ErrorSummaryProps) {
  const id = React.useId()
  if (problems.length === 0) return null
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={['border-destructive bg-background rounded-lg border-2 p-4', className].filter(Boolean).join(' ')}
      data-testid={testId}
      data-error-summary=""
    >
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {title}
      </h2>
      <ul className="mt-1 flex flex-col">
        {problems.map((problem) => (
          <li key={problem.fieldId}>
            <a
              href={`#${problem.fieldId}`}
              className="text-destructive inline-flex min-h-11 items-center text-sm font-medium underline"
              onClick={focusOnClick(problem.fieldId)}
            >
              {problem.message}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export type FieldErrorMessageProps = {
  /** The `id` of the field; the message gets `fieldErrorId(fieldId)` for the field's `aria-describedby`. */
  fieldId: string
  /** The message, or `null` when the field has no problem (nothing is shown). */
  message: string | null
  'data-testid'?: string
}

/** The error text under a field (R04.1), the same wording as its line in the summary. */
export function FieldErrorMessage({ fieldId, message, 'data-testid': testId }: FieldErrorMessageProps) {
  if (!message) return null
  return (
    <p id={fieldErrorId(fieldId)} className="text-destructive text-sm" data-testid={testId}>
      {message}
    </p>
  )
}
