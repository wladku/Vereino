// `MemberSwitchField` (E20-S12, #491; UX concept R05.1): a switch row for the member pages whose whole row is the touch
// target. The platform `SwitchField` draws a 32 × 20 px switch and only its label text toggles it; here the row is one
// `<label>` at least 44 px high, so a tap anywhere on it (label, description, beside the switch) toggles the switch, and
// the switch button itself is 44 × 44 px around the platform's unchanged track. The accessible name is the label text
// alone (`aria-labelledby`), the description is announced as the description (`aria-describedby`).
import * as React from 'react'
import { Switch } from '@open-mercato/ui/primitives/switch'

export type MemberSwitchFieldProps = {
  /** The switch's id; the label and description ids derive from it. */
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  /** A non-interactive mark beside the label (e.g. a status badge). */
  badge?: React.ReactNode
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}

export function MemberSwitchField(props: MemberSwitchFieldProps) {
  const { id, label, description, badge, checked, disabled = false, onCheckedChange } = props
  const labelId = `${id}-label`
  const descriptionId = `${id}-description`
  const hasDescription = Boolean(description)
  return (
    <label
      htmlFor={id}
      className={`flex min-h-11 items-center gap-3 select-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      data-member-switch-row=""
    >
      <span
        className={disabled ? 'flex min-w-0 flex-1 flex-col gap-1 opacity-60' : 'flex min-w-0 flex-1 flex-col gap-1'}
      >
        <span className="flex flex-wrap items-center gap-1">
          <span id={labelId} className="text-foreground text-sm leading-5 font-medium">
            {label}
          </span>
          {badge ? <span className="inline-flex shrink-0">{badge}</span> : null}
        </span>
        {hasDescription ? (
          <span id={descriptionId} className="text-muted-foreground text-xs leading-4">
            {description}
          </span>
        ) : null}
      </span>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={hasDescription ? descriptionId : undefined}
        className="min-h-11 min-w-11"
        onCheckedChange={onCheckedChange}
      />
    </label>
  )
}
