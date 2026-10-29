'use client'
// CrudForm fields of the `activities` forms that need a native control: a calendar date (`YYYY-MM-DD`) and a club
// wall time (`HH:mm`, 24-hour). Native date and time inputs type and paste like any field, work on a phone keyboard
// and keep the value in the exact format the API takes. Each input carries the field label as its accessible name
// (the platform field wrapper does not associate its label) and sits in the `data-crud-field-id` wrapper.
import { Input } from '@open-mercato/ui/primitives/input'
import type { CrudCustomField, CrudFieldBase } from '@open-mercato/ui/backend/CrudForm'

type NativeFieldOptions = Omit<CrudFieldBase, 'id' | 'label'>

function nativeField(type: 'date' | 'time', id: string, label: string, options: NativeFieldOptions): CrudCustomField {
  return {
    ...options,
    id,
    label,
    type: 'custom',
    component: ({ value, setValue, disabled, error }) => (
      <Input
        type={type}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-required={options.required ? true : undefined}
        value={typeof value === 'string' ? value : ''}
        disabled={disabled || options.disabled}
        readOnly={options.readOnly}
        onChange={(event) => {
          setValue(event.target.value)
        }}
      />
    ),
  }
}

export function dateField(id: string, label: string, options: NativeFieldOptions = {}): CrudCustomField {
  return nativeField('date', id, label, options)
}

export function timeField(id: string, label: string, options: NativeFieldOptions = {}): CrudCustomField {
  return nativeField('time', id, label, options)
}
