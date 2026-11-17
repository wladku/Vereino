// The in-place create of the empty-picker pattern (people life-cycle spec REQ-L14, DD-L13): a dialog with the minimum
// fields of a record (at most four), which creates it through the consumer's route and hands the new option back to
// the picker. All state and every handler live here, so `node --test` drives them; `inline-create-dialog.tsx` renders.
import type { PickerOption } from '#src/admin/picker-empty-hint-model'

/** A record with more fields is created on its own page (a link), not in place. */
export const INLINE_CREATE_MAX_FIELDS = 4

export type InlineCreateField = {
  readonly id: string
  readonly label: string
  readonly type: 'text' | 'email' | 'date' | 'select'
  readonly required?: boolean
  readonly maxLength?: number
  /** The choices of a `select` field. */
  readonly options?: readonly PickerOption[]
}

export type InlineCreateValues = Readonly<Record<string, string>>
export type InlineCreateErrors = Readonly<Record<string, string>>

/** What the consumer makes of a failed create: the message and, when the server names one, the field. */
export type InlineCreateProblem = { readonly message: string; readonly field?: string }

export type InlineCreateState = {
  readonly values: InlineCreateValues
  readonly errors: InlineCreateErrors
  readonly problem: string | null
  readonly pending: boolean
}

export type InlineCreateAction =
  | { readonly type: 'change'; readonly id: string; readonly value: string }
  | { readonly type: 'submitting' }
  | { readonly type: 'invalid'; readonly errors: InlineCreateErrors }
  | { readonly type: 'failed'; readonly problem: InlineCreateProblem }

/** Throws for a field list the pattern does not allow: none, or more than four. */
export function assertInlineCreateFields(fields: readonly InlineCreateField[]): void {
  if (fields.length === 0 || fields.length > INLINE_CREATE_MAX_FIELDS) {
    throw new Error(
      `An in-place create takes 1 to ${String(INLINE_CREATE_MAX_FIELDS)} fields, got ${String(fields.length)}`,
    )
  }
}

/** The first state of the dialog: every field empty unless the consumer prefills it (e.g. from the search term). */
export function inlineCreateInitialState(
  fields: readonly InlineCreateField[],
  initialValues: InlineCreateValues = {},
): InlineCreateState {
  assertInlineCreateFields(fields)
  return {
    values: Object.fromEntries(fields.map((field) => [field.id, initialValues[field.id] ?? ''])),
    errors: {},
    problem: null,
    pending: false,
  }
}

export function inlineCreateReducer(state: InlineCreateState, action: InlineCreateAction): InlineCreateState {
  switch (action.type) {
    case 'change': {
      const errors = Object.fromEntries(Object.entries(state.errors).filter(([id]) => id !== action.id))
      return { ...state, values: { ...state.values, [action.id]: action.value }, errors }
    }
    case 'submitting':
      return { ...state, pending: true, problem: null }
    case 'invalid':
      return { ...state, pending: false, errors: action.errors }
    case 'failed':
      return {
        ...state,
        pending: false,
        problem: action.problem.message,
        errors: action.problem.field ? { [action.problem.field]: action.problem.message } : {},
      }
  }
}

/** The required fields left empty, each with the consumer's "required" message. */
export function inlineCreateErrors(
  fields: readonly InlineCreateField[],
  values: InlineCreateValues,
  requiredMessage: string,
): InlineCreateErrors {
  return Object.fromEntries(
    fields
      .filter((field) => field.required === true && !(values[field.id] ?? '').trim())
      .map((field) => [field.id, requiredMessage]),
  )
}

/** The values the create route receives: trimmed, without the empty optional fields. */
export function inlineCreatePayload(fields: readonly InlineCreateField[], values: InlineCreateValues) {
  const entries = fields.map((field) => [field.id, (values[field.id] ?? '').trim()] as const)
  return Object.fromEntries(entries.filter(([, value]) => value !== '')) as Record<string, string>
}

export type InlineCreateHandlersInput = {
  readonly fields: readonly InlineCreateField[]
  readonly state: InlineCreateState
  readonly dispatch: (action: InlineCreateAction) => void
  readonly requiredMessage: string
  /** Creates the record and returns it as a picker option. */
  readonly onCreate: (values: Record<string, string>) => Promise<PickerOption>
  /** Selects the created option in the picker. */
  readonly onCreated: (option: PickerOption) => void
  readonly onOpenChange: (open: boolean) => void
  readonly describeError: (error: unknown) => InlineCreateProblem
}

type ChangeEvent = { readonly target: { readonly name: string; readonly value: string } }
type SubmitEvent = { preventDefault: () => void; stopPropagation: () => void }

export type InlineCreateHandlers = {
  onFieldChange: (event: ChangeEvent) => void
  /**
   * The form's submit: stops the page submit and starts `submit`. The dialog renders in a portal, but React bubbles
   * its events through the component tree, so without `stopPropagation` the submit would also reach the `CrudForm`
   * around the picker and save that record.
   */
  onSubmit: (event: SubmitEvent) => void
  /** Validates, creates, selects the new option and closes; a failure stays in the dialog. */
  submit: () => Promise<void>
  onCancel: () => void
}

export function createInlineCreateHandlers(input: InlineCreateHandlersInput): InlineCreateHandlers {
  const { fields, state, dispatch } = input
  const submit = async (): Promise<void> => {
    if (state.pending) return
    const errors = inlineCreateErrors(fields, state.values, input.requiredMessage)
    if (Object.keys(errors).length > 0) {
      dispatch({ type: 'invalid', errors })
      return
    }
    dispatch({ type: 'submitting' })
    let option: PickerOption
    try {
      option = await input.onCreate(inlineCreatePayload(fields, state.values))
    } catch (error: unknown) {
      dispatch({ type: 'failed', problem: input.describeError(error) })
      return
    }
    input.onCreated(option)
    input.onOpenChange(false)
  }
  return {
    onFieldChange: (event) => {
      dispatch({ type: 'change', id: event.target.name, value: event.target.value })
    },
    onSubmit: (event) => {
      event.preventDefault()
      event.stopPropagation()
      void submit()
    },
    submit,
    onCancel: () => {
      input.onOpenChange(false)
    },
  }
}

/** Ids of the dialog's elements: each field, its error and the form problem. */
export function inlineCreateIds(baseId: string) {
  return {
    field: (id: string) => `${baseId}-${id}`,
    error: (id: string) => `${baseId}-${id}-error`,
    problem: `${baseId}-problem`,
  }
}

type FocusableRef = { readonly current: { focus: () => void } | null } | undefined

/**
 * The dialog's close handler for `onCloseAutoFocus`: focus goes back to the picker's control (not to the hint's
 * button, which may be gone once the picker has an option).
 */
export function returnFocusTo(ref: FocusableRef) {
  return (event: { preventDefault: () => void }): void => {
    const element = ref?.current
    if (!element) return
    event.preventDefault()
    element.focus()
  }
}
