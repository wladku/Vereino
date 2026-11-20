'use client'
// `PickerSelect` (people life-cycle spec REQ-L14, DD-L13): the native select of the empty-picker pattern for the
// admin forms. It loads its options from the consumer, shows `PickerEmptyHint` when there is none, creates a record
// in place through `InlineCreateDialog` and selects it, or — with a create link — reloads when the window regains
// focus. `pickerSelectField` mounts it as a `CrudForm` custom field. Rules and handlers: `picker-select-model.ts`.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { InlineCreateDialog } from '#tsx/admin/inline-create-dialog'
import type { InlineCreateDialogProps } from '#tsx/admin/inline-create-dialog'
import type { InlineCreateValues } from '#src/admin/inline-create-dialog-model'
import { PickerEmptyHint } from '#tsx/admin/picker-empty-hint'
import { browserFocusTarget, pickerEmptyState, reloadOnFocusEffect } from '#src/admin/picker-empty-hint-model'
import type { PickerCreate, PickerEmptyHintLabels, PickerOption } from '#src/admin/picker-empty-hint-model'
import {
  PICKER_SELECT_INITIAL_STATE,
  createPickerSelectHandlers,
  pickerSelectDescribedBy,
  pickerSelectIds,
  pickerSelectLoadDeps,
  pickerSelectLoadEffect,
  pickerSelectReducer,
} from '#src/admin/picker-select-model'
import type { PickerSelectHandlers, PickerSelectState } from '#src/admin/picker-select-model'

/** The in-place create of the picker: the dialog's own props, and the prefill from the search term. */
export type PickerSelectInlineCreate = Omit<
  InlineCreateDialogProps,
  'id' | 'open' | 'onOpenChange' | 'onCreated' | 'initialValues' | 'returnFocusRef'
> & {
  initialValues?: (term: string | null) => InlineCreateValues
}

export type PickerSelectLabels = {
  /** The accessible name of the select (the field label). */
  readonly label: string
  /** The option of the empty value, e.g. "No owner"; omitted for a required field without one. */
  readonly emptyOption?: string
  readonly loading: string
  readonly loadError: string
  readonly retry: string
  readonly hint: PickerEmptyHintLabels
}

export type PickerSelectProps = {
  id: string
  value: string
  onChange: (value: string) => void
  /** The options; a fresh function per render loads again, so pass a stable one. */
  loadOptions: () => Promise<readonly PickerOption[]>
  labels: PickerSelectLabels
  /** Whether the session holds the creating feature. */
  canCreate: boolean
  /** In place (needs `inlineCreate`) or a link to the create page; null when the picker offers no create path. */
  create: PickerCreate | null
  inlineCreate?: PickerSelectInlineCreate
  required?: boolean
  disabled?: boolean
  error?: string | null
  testId?: string
}

export type PickerSelectViewProps = Omit<PickerSelectProps, 'onChange' | 'loadOptions'> & {
  state: PickerSelectState
  handlers: PickerSelectHandlers
  selectRef?: React.RefObject<HTMLSelectElement | null>
}

const SELECT_CLASS_NAME =
  'border-input bg-background focus-visible:focus-indicator min-h-11 w-full rounded-md border px-3 text-sm outline-none disabled:cursor-not-allowed'

/** The stateless view of one state of the field. */
export function PickerSelectView({
  id,
  value,
  labels,
  canCreate,
  create,
  inlineCreate,
  required = false,
  disabled = false,
  error = null,
  testId = 'picker-select',
  state,
  handlers,
  selectRef,
}: PickerSelectViewProps) {
  const ids = pickerSelectIds(id)
  const empty = state.status === 'loaded' ? pickerEmptyState(state.options.length) : null
  const known = value === '' || state.options.some((option) => option.value === value)
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={testId} data-status={state.status}>
      <select
        ref={selectRef}
        id={ids.select}
        className={SELECT_CLASS_NAME}
        value={value}
        onChange={handlers.onSelectChange}
        disabled={disabled}
        aria-label={labels.label}
        aria-required={required ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={pickerSelectDescribedBy(id, empty !== null, error)}
        aria-busy={state.status === 'loading' ? true : undefined}
      >
        {labels.emptyOption === undefined ? (
          <option value="" disabled />
        ) : (
          <option value="">{labels.emptyOption}</option>
        )}
        {known ? null : <option value={value}>{state.status === 'loading' ? labels.loading : value}</option>}
        {state.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {state.status === 'error' ? (
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <p className="text-destructive text-sm">{labels.loadError}</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={handlers.onReload}>
            {labels.retry}
          </Button>
        </div>
      ) : null}
      {empty ? (
        <PickerEmptyHint
          id={ids.hint}
          state={empty}
          canCreate={canCreate}
          create={create}
          labels={labels.hint}
          onCreate={handlers.onCreate}
          testId={`${testId}-hint`}
        />
      ) : null}
      {error ? (
        <p id={ids.error} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {inlineCreate && create?.kind === 'inline' && canCreate ? (
        <InlineCreateDialog
          {...inlineCreate}
          id={ids.dialog}
          open={state.dialogOpen}
          onOpenChange={handlers.onDialogOpenChange}
          onCreated={handlers.onCreated}
          initialValues={inlineCreate.initialValues?.(state.term)}
          returnFocusRef={selectRef}
          testId={`${testId}-create`}
        />
      ) : null}
    </div>
  )
}

/** The controlled field: loads the options, owns the dialog and the reload on focus. */
export function PickerSelect({ loadOptions, onChange, ...viewProps }: PickerSelectProps) {
  const [state, dispatch] = React.useReducer(pickerSelectReducer, PICKER_SELECT_INITIAL_STATE)
  const selectRef = React.useRef<HTMLSelectElement>(null)
  const handlers = createPickerSelectHandlers({ dispatch, onChange })
  React.useEffect(pickerSelectLoadEffect({ load: loadOptions, dispatch }), pickerSelectLoadDeps(state, loadOptions))
  const linked = viewProps.create?.kind === 'link'
  React.useEffect(reloadOnFocusEffect(linked ? browserFocusTarget() : null, handlers.onReload), [linked])
  return <PickerSelectView {...viewProps} state={state} handlers={handlers} selectRef={selectRef} />
}

/** The render props a `CrudForm` custom field receives (a structural copy, as in `native-fields.tsx`). */
export type PickerFieldRenderProps = {
  value: unknown
  error?: string
  disabled?: boolean
  setValue: (value: unknown) => void
}

export type PickerCrudField = {
  id: string
  label: string
  type: 'custom'
  required?: boolean
  description?: React.ReactNode
  layout?: 'full' | 'half' | 'third'
  visibleWhen?: { field: string; equals: string | number | boolean }
  rendersOwnError: true
  component: (props: PickerFieldRenderProps) => React.ReactNode
}

export type PickerFieldOptions = Omit<
  PickerSelectProps,
  'id' | 'value' | 'onChange' | 'disabled' | 'error' | 'labels' | 'testId'
> & {
  labels: Omit<PickerSelectLabels, 'label'>
  description?: React.ReactNode
  layout?: 'full' | 'half' | 'third'
  visibleWhen?: { field: string; equals: string | number | boolean }
}

/**
 * A `CrudForm` field that renders `PickerSelect`; the stored value is the option's id, `''` for none. Assignable to
 * the platform `CrudCustomField`.
 */
export function pickerSelectField(id: string, label: string, options: PickerFieldOptions): PickerCrudField {
  const { description, layout, visibleWhen, labels, ...picker } = options
  return {
    id,
    label,
    type: 'custom',
    required: picker.required,
    description,
    layout,
    visibleWhen,
    rendersOwnError: true,
    component: ({ value, setValue, disabled, error }) => (
      <PickerSelect
        {...picker}
        id={`picker-${id}`}
        value={typeof value === 'string' ? value : ''}
        onChange={setValue}
        labels={{ ...labels, label }}
        disabled={disabled}
        error={error}
        testId={`picker-${id}`}
      />
    ),
  }
}
