'use client'
// The building blocks the phone forms of a club event and its parts share (club events spec REQ-T12; E14-S05, #380):
// a labelled field with its help and problem (wired through `aria-describedby`), the problem texts, focusing the first
// field with a problem, the refusal above the sticky bar — with **Try again** after a lost connection, so the form
// keeps its values — and the sticky submit bar above the bottom navigation (as the coach's new-event form).
import * as React from 'react'
import Link from 'next/link'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import type { DraftProblem } from '../../lib/member-club-event'
import type { Translate } from './club-client'

export const PROBLEM_KEYS: Record<DraftProblem, string> = {
  required: 'activities.club.event.problems.required',
  invalid: 'activities.club.event.problems.invalid',
  endBeforeStart: 'activities.club.event.problems.endBeforeStart',
}

/** The ids of a field's control, help and problem under the form's `useId` prefix. */
export function fieldIds(prefix: string, field: string) {
  return { control: `${prefix}-${field}`, help: `${prefix}-${field}-help`, problem: `${prefix}-${field}-problem` }
}

/** The `aria-describedby` of a control: its help and its problem, when shown. */
export function describedBy(prefix: string, field: string, help: boolean, problem: string | undefined) {
  const ids = fieldIds(prefix, field)
  return [help ? ids.help : null, problem ? ids.problem : null].filter(Boolean).join(' ') || undefined
}

/** Focuses the first field (in reading order) that has a problem. */
export function focusFirstProblem(prefix: string, order: readonly string[], problems: Record<string, unknown>) {
  const first = order.find((field) => problems[field])
  if (first) window.setTimeout(() => document.getElementById(fieldIds(prefix, first).control)?.focus(), 0)
}

export function MemberField({
  prefix,
  field,
  label,
  help,
  problem,
  children,
}: {
  prefix: string
  field: string
  label: string
  help?: string
  problem?: string
  children: React.ReactNode
}) {
  const ids = fieldIds(prefix, field)
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={ids.control} id={`${ids.control}-label`}>
        {label}
      </Label>
      {children}
      {help ? (
        <p id={ids.help} className="text-muted-foreground text-sm">
          {help}
        </p>
      ) : null}
      {problem ? (
        <p id={ids.problem} className="text-destructive text-sm" data-testid="club-event-form-problem">
          {problem}
        </p>
      ) : null}
    </div>
  )
}

/** The form's refusal; after a lost connection it offers **Try again** (the values stay in the form). */
export function FormError({
  error,
  offline,
  pending,
  onRetry,
  t,
}: {
  error: string | null
  offline: boolean
  pending: boolean
  onRetry: () => void
  t: Translate
}) {
  if (!error) return null
  return (
    <Alert status="error" data-testid="club-event-form-error">
      <div className="flex flex-col gap-2">
        <p>{error}</p>
        {offline ? (
          <div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              data-testid="club-event-form-retry"
              onClick={onRetry}
            >
              {t('activities.clubEvents.club.form.retry')}
            </Button>
          </div>
        ) : null}
      </div>
    </Alert>
  )
}

/** The submit bar: in view above the fixed bottom navigation on a phone, inline from `sm`. */
export function StickyActions({
  submitLabel,
  savingLabel,
  pending,
  cancelHref,
  t,
}: {
  submitLabel: string
  savingLabel: string
  pending: boolean
  cancelHref: string
  t: Translate
}) {
  return (
    <div
      className="bg-background sticky bottom-24 z-30 -mx-4 flex flex-wrap gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0"
      data-testid="club-event-form-actions"
    >
      <Button
        type="submit"
        className="min-h-11 flex-1 sm:flex-none"
        disabled={pending}
        data-testid="club-event-form-submit"
      >
        {pending ? savingLabel : submitLabel}
      </Button>
      <Button asChild variant="outline" className="min-h-11 flex-1 sm:flex-none">
        <Link href={cancelHref}>{t('activities.common.cancel')}</Link>
      </Button>
    </div>
  )
}
