// `InlineCreateDialog` (people life-cycle spec REQ-L14, DD-L13): the in-place create of an empty picker — a dialog
// with the record's minimum fields (at most four, labelled native controls), which creates the record through the
// consumer's `onCreate` and hands the new option to `onCreated`, so the picker selects it. On close the focus goes
// back to the picker's control. The platform `CrudForm` is not used: four plain fields need none of its machinery,
// and importing it would pull the whole form source into this package. State and handlers: the model file.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import {
  createInlineCreateHandlers,
  inlineCreateIds,
  inlineCreateInitialState,
  inlineCreateReducer,
  returnFocusTo,
} from '#src/admin/inline-create-dialog-model'
import type {
  InlineCreateField,
  InlineCreateHandlers,
  InlineCreateHandlersInput,
  InlineCreateState,
  InlineCreateValues,
} from '#src/admin/inline-create-dialog-model'

export type InlineCreateDialogLabels = {
  readonly submit: string
  readonly saving: string
  readonly cancel: string
  readonly close: string
  /** The message of a required field left empty. */
  readonly required: string
}

export type InlineCreateDialogProps = Omit<
  InlineCreateHandlersInput,
  'state' | 'dispatch' | 'requiredMessage' | 'fields'
> & {
  /** Base id of the dialog's elements (`<id>-<field>`, `<id>-problem`). */
  id: string
  open: boolean
  title: string
  description?: string
  fields: readonly InlineCreateField[]
  initialValues?: InlineCreateValues
  labels: InlineCreateDialogLabels
  /** The picker's control, focused again when the dialog closes. */
  returnFocusRef?: React.RefObject<HTMLElement | null>
  testId?: string
}

export type InlineCreateFormViewProps = {
  id: string
  fields: readonly InlineCreateField[]
  labels: InlineCreateDialogLabels
  state: InlineCreateState
  handlers: InlineCreateHandlers
  testId: string
}

const SELECT_CLASS_NAME =
  'border-input bg-background focus-visible:shadow-focus min-h-11 w-full rounded-md border px-3 text-sm outline-none disabled:cursor-not-allowed'

function FieldControl({
  field,
  id,
  value,
  error,
  disabled,
  onChange,
}: {
  field: InlineCreateField
  id: string
  value: string
  error: string | undefined
  disabled: boolean
  onChange: InlineCreateHandlers['onFieldChange']
}) {
  const common = {
    id,
    name: field.id,
    value,
    disabled,
    onChange,
    'aria-required': field.required === true ? true : undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
  if (field.type === 'select') {
    return (
      <select {...common} className={SELECT_CLASS_NAME}>
        <option value="" />
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }
  return <Input {...common} type={field.type} className="min-h-11" maxLength={field.maxLength} />
}

/** The stateless form inside the dialog. */
export function InlineCreateFormView({ id, fields, labels, state, handlers, testId }: InlineCreateFormViewProps) {
  const ids = inlineCreateIds(id)
  return (
    <form className="flex flex-col gap-4" onSubmit={handlers.onSubmit} noValidate data-testid={`${testId}-form`}>
      {fields.map((field) => {
        const error = state.errors[field.id]
        return (
          <div key={field.id} className="flex flex-col gap-1" data-field-id={field.id}>
            <label htmlFor={ids.field(field.id)} className="text-sm font-medium">
              {field.label}
            </label>
            <FieldControl
              field={field}
              id={ids.field(field.id)}
              value={state.values[field.id] ?? ''}
              error={error}
              disabled={state.pending}
              onChange={handlers.onFieldChange}
            />
            {error ? (
              <p id={ids.error(field.id)} className="text-destructive text-xs" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )
      })}
      {state.problem ? (
        <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid={`${testId}-problem`}>
          {state.problem}
        </p>
      ) : null}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={state.pending}
          onClick={handlers.onCancel}
        >
          {labels.cancel}
        </Button>
        <Button type="submit" className="min-h-11" disabled={state.pending} data-testid={`${testId}-submit`}>
          {state.pending ? labels.saving : labels.submit}
        </Button>
      </DialogFooter>
    </form>
  )
}

type InlineCreateFormProps = Omit<InlineCreateDialogProps, 'open' | 'title' | 'description' | 'returnFocusRef'> & {
  testId: string
}

/** Owns the form state; mounted only while the dialog is open, so every opening starts fresh. */
export function InlineCreateForm({ id, fields, initialValues, labels, testId, ...callbacks }: InlineCreateFormProps) {
  const [state, dispatch] = React.useReducer(inlineCreateReducer, inlineCreateInitialState(fields, initialValues))
  const handlers = createInlineCreateHandlers({
    ...callbacks,
    fields,
    state,
    dispatch,
    requiredMessage: labels.required,
  })
  return (
    <InlineCreateFormView id={id} fields={fields} labels={labels} state={state} handlers={handlers} testId={testId} />
  )
}

export function InlineCreateDialog({
  open,
  title,
  description,
  returnFocusRef,
  testId = 'inline-create-dialog',
  ...formProps
}: InlineCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={formProps.onOpenChange}>
      <DialogContent
        closeAriaLabel={formProps.labels.close}
        onCloseAutoFocus={returnFocusTo(returnFocusRef)}
        data-testid={testId}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {open ? <InlineCreateForm {...formProps} testId={testId} /> : null}
      </DialogContent>
    </Dialog>
  )
}
