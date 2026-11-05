// `DeclarationControls` (foundation P-19, phase C; club spec REQ-007, REQ-017; UX concept M-14): one person's
// declaration for one session — the name, the status line announced through `aria-live`, and the buttons of the
// session's kind (`declarationActions`). Framework-free and without state: the page owns the request, passes `busy`
// while it saves and the error text when it failed (e.g. 409, the deadline passed). Every target is at least 44 px high.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  declarationActions,
  declarationStatusText,
  type DeclarationControlsLabels,
  type DeclarationKind,
  type DeclaredValue,
} from '#src/member/declaration-controls-model'

export type DeclarationControlsProps = {
  /** A stable id prefix for the name, the status line and the error. */
  id: string
  name: string
  kind: DeclarationKind
  declared: DeclaredValue
  labels: DeclarationControlsLabels
  onDeclare: (value: DeclaredValue) => void
  /** Saving: the buttons are disabled. */
  busy?: boolean
  /** Declarations are closed: the buttons are disabled. */
  disabled?: boolean
  error?: string | null
}

export function DeclarationControls(props: DeclarationControlsProps) {
  const { id, kind, declared, labels } = props
  const actions = declarationActions(kind, declared, labels)
  const inactive = props.busy === true || props.disabled === true
  return (
    <div
      role="group"
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-status`}
      aria-busy={props.busy === true ? true : undefined}
      className="flex flex-col gap-2"
      data-testid="declaration-controls"
      data-declared={declared}
    >
      <p id={`${id}-name`} className="font-medium">
        {props.name}
      </p>
      <p
        id={`${id}-status`}
        aria-live="polite"
        className="text-muted-foreground text-sm"
        data-testid="declaration-status"
      >
        {declarationStatusText(kind, declared, labels)}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.value}
            type="button"
            variant={action.pressed === true ? 'default' : 'outline'}
            aria-pressed={action.pressed === null ? undefined : action.pressed}
            className="min-h-11"
            disabled={inactive}
            onClick={() => {
              props.onDeclare(action.value)
            }}
            data-testid={`declaration-action-${action.value}`}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {props.error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm" data-testid="declaration-error">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}
