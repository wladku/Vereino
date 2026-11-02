// `AudiencePicker` (foundation III P-32, REQ-M05, DD-M16): a controlled two-step admin field — the audience kind (only
// the kinds the consumer passes, already filtered to the author's grants), then for every kind except `club` one target
// from a debounced search — with a live line of recipient counts from the consumer's preview route. The consumer mounts
// it as a `CrudForm` custom field. Native controls only (keyboard-operable, every input labelled); all logic lives in
// `audience-picker-model.ts`, so this file only renders state and hands the model's callbacks to React.
import * as React from 'react'
import type { AudienceCounts, AudienceKind } from '@vereino/core'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import {
  AUDIENCE_PICKER_INITIAL_STATE,
  audiencePickerDescribedBy,
  audiencePickerIds,
  audiencePickerReducer,
  createAudiencePickerHandlers,
  audiencePreviewEffect,
  audiencePreviewEffectDeps,
  audiencePreviewLine,
  audiencePreviewView,
  audienceTargetsEffect,
  audienceTargetsEffectDeps,
  audienceTargetsMessage,
  audienceTargetsView,
} from '#src/admin/audience-picker-model'
import type {
  AudiencePickerHandlers,
  AudiencePickerLabels,
  AudiencePickerSpec,
  AudiencePickerState,
  AudiencePickerValue,
  AudienceTarget,
} from '#src/admin/audience-picker-model'

export type AudiencePickerProps = {
  /** Base id of the field's elements (`<id>-kind`, `<id>-search`, `<id>-count`, …). */
  id: string
  value: AudiencePickerValue
  onChange: (value: AudiencePickerValue) => void
  /** The kinds the author may address, with their labels, already filtered to the author's grants. */
  kinds: ReadonlyArray<{ kind: AudienceKind; label: string }>
  loadTargets: (kind: AudienceKind, query: string) => Promise<AudienceTarget[]>
  preview: (spec: AudiencePickerSpec) => Promise<AudienceCounts>
  /** The count line, e.g. "38 recipients · 2 without an e-mail address · 0 unreachable". */
  formatCounts: (counts: AudienceCounts) => string
  labels: AudiencePickerLabels
  disabled?: boolean
  /** The form's validation message, shown under the field and referenced by its controls. */
  error?: string | null
  /** Debounce of the target search and the preview in milliseconds (default 300). */
  debounceMs?: number
}

export type AudiencePickerViewProps = Pick<
  AudiencePickerProps,
  'id' | 'value' | 'kinds' | 'formatCounts' | 'labels' | 'disabled' | 'error'
> & {
  state: AudiencePickerState
  handlers: AudiencePickerHandlers
}

const CONTROL_CLASS_NAME =
  'border-input bg-background focus-visible:shadow-focus min-h-11 w-full rounded-md border px-3 text-sm outline-none disabled:cursor-not-allowed'

/** The stateless view: renders one state of the field; `AudiencePicker` owns the state and the requests. */
export function AudiencePickerView({
  id,
  value,
  kinds,
  formatCounts,
  labels,
  disabled = false,
  error = null,
  state,
  handlers,
}: AudiencePickerViewProps) {
  const ids = audiencePickerIds(id)
  const describedBy = audiencePickerDescribedBy(id, error)
  const targets = audienceTargetsView(value, state)
  const preview = audiencePreviewView(value, state)
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="audience-picker">
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.kind} className="text-sm font-medium">
          {labels.kind}
        </label>
        <select
          id={ids.kind}
          className={CONTROL_CLASS_NAME}
          value={value.kind ?? ''}
          onChange={handlers.onKindChange}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          data-testid="audience-picker-kind"
        >
          <option value="" disabled>
            {labels.kindPlaceholder}
          </option>
          {kinds.map((option) => (
            <option key={option.kind} value={option.kind}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {targets.status === 'hidden' ? null : (
        <fieldset
          className="flex min-w-0 flex-col gap-2"
          disabled={disabled}
          aria-describedby={describedBy}
          data-testid="audience-picker-targets"
        >
          <legend className="text-sm font-medium">{labels.target}</legend>
          <label htmlFor={ids.search} className="text-muted-foreground text-sm">
            {labels.targetSearch}
          </label>
          <Input
            id={ids.search}
            type="search"
            autoComplete="off"
            className="min-h-11"
            value={state.query}
            onChange={handlers.onQueryChange}
            placeholder={labels.targetPlaceholder}
          />
          <div aria-live="polite" className="flex flex-wrap items-center gap-2">
            {targets.status === 'loaded' ? null : (
              <p className="text-muted-foreground text-sm">{audienceTargetsMessage(targets, labels)}</p>
            )}
            {targets.status === 'error' ? (
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={handlers.onRetryTargets}>
                {labels.retry}
              </Button>
            ) : null}
          </div>
          {targets.options.length > 0 ? (
            <ul id={ids.targets} className="flex max-h-72 flex-col overflow-y-auto rounded-md border">
              {targets.options.map((target, index) => (
                <li key={target.id} className="flex min-h-11 items-center gap-3 border-b px-3 last:border-b-0">
                  <input
                    type="radio"
                    id={ids.target(index)}
                    name={ids.targets}
                    value={target.id}
                    checked={value.ids.includes(target.id)}
                    onChange={handlers.onTargetChange}
                    className="accent-primary size-4 shrink-0"
                  />
                  <label htmlFor={ids.target(index)} className="flex flex-1 flex-col py-2 text-sm">
                    {target.label}
                    {target.hint ? <span className="text-muted-foreground text-xs">{target.hint}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p
          id={ids.count}
          aria-live="polite"
          className="text-muted-foreground text-sm"
          data-testid="audience-picker-count"
          data-status={preview.status}
        >
          {audiencePreviewLine(preview, labels, formatCounts)}
        </p>
        {preview.status === 'error' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={disabled}
            onClick={handlers.onRetryPreview}
          >
            {labels.retry}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={ids.error} className="text-destructive text-sm" data-testid="audience-picker-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** The controlled field: owns the search and the requests, renders `AudiencePickerView`. */
export function AudiencePicker({ loadTargets, preview, onChange, debounceMs, ...viewProps }: AudiencePickerProps) {
  const [state, dispatch] = React.useReducer(audiencePickerReducer, AUDIENCE_PICKER_INITIAL_STATE)
  const { value } = viewProps
  React.useEffect(
    audienceTargetsEffect({ kind: value.kind, query: state.query, loadTargets, dispatch, debounceMs }),
    audienceTargetsEffectDeps(value, state),
  )
  React.useEffect(
    audiencePreviewEffect({ value, preview, dispatch, debounceMs }),
    audiencePreviewEffectDeps(value, state),
  )
  const handlers = createAudiencePickerHandlers({ value, onChange, dispatch })
  return <AudiencePickerView {...viewProps} state={state} handlers={handlers} />
}
