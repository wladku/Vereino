'use client'
// CrudForm fields that need a native control: a calendar date (`YYYY-MM-DD`) and a club wall time (`HH:mm`,
// 24-hour). Native date and time inputs type and paste like any field, work on a phone keyboard and keep the value in
// the exact format the API takes — the platform date picker only offers a calendar, which is slow for a birth date.
// Each input carries the field label as its accessible name (the platform field wrapper does not associate its
// label) and sits in the `data-crud-field-id` wrapper. Used by `activities` and `people`.
import type * as React from 'react'
import { Input } from '@open-mercato/ui/primitives/input'

// Structural copies of the parts of the platform `CrudCustomField` these fields use: importing the types from
// `@open-mercato/ui/backend/CrudForm` would pull the whole form source into this package's typecheck.
type CrudFieldOptions = {
  readonly placeholder?: string
  readonly description?: React.ReactNode
  readonly required?: boolean
  readonly visibleWhen?: { field: string; equals: string | number | boolean }
  readonly layout?: 'full' | 'half' | 'third'
  readonly disabled?: boolean
  readonly readOnly?: boolean
  readonly defaultValue?: unknown
}

export type NativeFieldRenderProps = {
  value: unknown
  error?: string
  disabled?: boolean
  setValue: (value: unknown) => void
}

/** Assignable to the platform `CrudCustomField`, so it goes straight into a `CrudForm` `fields` list. */
export type NativeCrudField = CrudFieldOptions & {
  id: string
  label: string
  type: 'custom'
  component: (props: NativeFieldRenderProps) => React.ReactNode
}

export type NativeFieldOptions = CrudFieldOptions & {
  /** Earliest accepted value (`YYYY-MM-DD` or `HH:mm`), passed to the input's `min`. */
  readonly min?: string
  /** Latest accepted value (`YYYY-MM-DD` or `HH:mm`), passed to the input's `max`. */
  readonly max?: string
  /**
   * Stored instead of `''` when the browser reports a partly typed or impossible entry (`validity.badInput`), so the
   * form's own check can say so instead of saving an empty value. Without it such an entry stays `''`.
   */
  readonly incompleteValue?: string
}

type NativeInputTarget = { value: string; validity?: { badInput?: boolean } }

function nativeField(type: 'date' | 'time', id: string, label: string, options: NativeFieldOptions): NativeCrudField {
  const { min, max, incompleteValue, ...base } = options
  const read = (target: NativeInputTarget) =>
    incompleteValue !== undefined && target.validity?.badInput ? incompleteValue : target.value
  return {
    ...base,
    id,
    label,
    type: 'custom',
    component: ({ value, setValue, disabled, error }) => (
      <Input
        type={type}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-required={base.required ? true : undefined}
        min={min}
        max={max}
        value={typeof value === 'string' && value !== incompleteValue ? value : ''}
        disabled={disabled || base.disabled}
        readOnly={base.readOnly}
        onChange={(event) => {
          setValue(read(event.target))
        }}
        onBlur={(event) => {
          if (incompleteValue !== undefined && event.target.validity.badInput) setValue(incompleteValue)
        }}
      />
    ),
  }
}

export function dateField(id: string, label: string, options: NativeFieldOptions = {}): NativeCrudField {
  return nativeField('date', id, label, options)
}

export function timeField(id: string, label: string, options: NativeFieldOptions = {}): NativeCrudField {
  return nativeField('time', id, label, options)
}
