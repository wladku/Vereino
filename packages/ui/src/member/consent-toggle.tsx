// `ConsentToggle` (foundation primitives spec phase A2; built by the event photos spec, #871, owner decision on #857):
// one consent of a member page as a switch row (`MemberSwitchField`) with its state line ("Given on … by …" or "Not
// given"), an optional badge, the lines the page adds below (what the consent allows, links), a reason when the switch is
// locked, and the save state: `saving` disables it and is announced, `error` shows as an alert while the switch keeps the
// stored value. The page owns the state and runs each change through `changeConsent` (confirmation before a
// withdrawal); a 409 is the page's to surface with the platform conflict bar.
import * as React from 'react'
import { MemberSwitchField } from '#tsx/member/member-switch-field'

export type ConsentToggleProps = {
  /** The switch's id; the error and reason ids derive from it. */
  id: string
  label: React.ReactNode
  /** The state line: the grant date and author, or "Not given". */
  status: React.ReactNode
  badge?: React.ReactNode
  /** The stored value (the switch never runs ahead of the server). */
  checked: boolean
  saving?: boolean
  /** Locks the switch; `lockedReason` says why. */
  locked?: boolean
  lockedReason?: React.ReactNode
  /** The last save's error, already translated; null when there is none. */
  error?: React.ReactNode
  /** "Saving…" for screen readers while `saving`. */
  savingLabel?: React.ReactNode
  onChange: (next: boolean) => void
  children?: React.ReactNode
  testId?: string
}

export function ConsentToggle(props: ConsentToggleProps) {
  const { id, saving = false, locked = false, error, lockedReason, savingLabel, children } = props
  return (
    <div className="flex flex-col gap-1" aria-busy={saving} data-testid={props.testId}>
      <MemberSwitchField
        id={id}
        label={props.label}
        description={props.status}
        badge={props.badge}
        checked={props.checked}
        disabled={saving || locked}
        onCheckedChange={props.onChange}
      />
      {locked && lockedReason ? (
        <p id={`${id}-locked`} className="text-muted-foreground max-w-prose text-xs">
          {lockedReason}
        </p>
      ) : null}
      {children}
      <span className="sr-only" aria-live="polite">
        {saving ? savingLabel : null}
      </span>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive max-w-prose text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
