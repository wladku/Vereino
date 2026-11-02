// The logic of `AudiencePicker` (foundation III P-32, REQ-M05, DD-M16): the field's internal state (search query, the
// loaded targets, the preview counts) as a reducer, the request keys that decide which answer belongs to which value,
// the effect factories that debounce `loadTargets` and `preview` and drop stale answers, the event handlers and the
// texts the view shows. Framework-free so `node --test` covers every branch; `audience-picker.tsx` only renders what
// these return and hands the factories' callbacks to React.
import { isAudienceKind } from '@vereino/core'
import type { AudienceCounts, AudienceKind } from '@vereino/core'
import { noEffect, requestEffect } from '#src/admin/request-effect'
import type { EffectCallback, Timers } from '#src/admin/request-effect'

/** The field's value: the kind and the chosen target ids (`club` has none; other kinds one once a target is picked). */
export type AudiencePickerValue = { kind: AudienceKind | null; ids: string[] }

/** One target of a kind (a section, group, activity, …) as the consumer's `loadTargets` returns it. */
export type AudienceTarget = { id: string; label: string; hint?: string | null }

export type AudiencePickerLabels = {
  kind: string
  kindPlaceholder: string
  target: string
  targetSearch: string
  targetPlaceholder: string
  noTargets: string
  loadingTargets: string
  targetsError: string
  previewLoading: string
  previewError: string
  /** Shown in the count line before a complete audience is chosen. */
  previewEmpty: string
  retry: string
}

/** A complete audience as `preview` receives it (`ids` is empty for `club`). */
export type AudiencePickerSpec = { kind: AudienceKind; ids: string[] }

/** Default debounce of the target search and the preview, in milliseconds. */
export const AUDIENCE_PICKER_DEBOUNCE_MS = 300

export type AudiencePickerState = {
  readonly query: string
  /** The targets answer for `key` (`items: null` = the request failed); `attempt` grows with every retry. */
  readonly targets: {
    readonly key: string | null
    readonly items: readonly AudienceTarget[] | null
    readonly attempt: number
  }
  /** Every target seen so far by id, so the chosen one stays visible when a search no longer returns it. */
  readonly known: Readonly<Record<string, AudienceTarget>>
  /** The preview answer for `key` (`counts: null` = the request failed); `attempt` grows with every retry. */
  readonly preview: { readonly key: string | null; readonly counts: AudienceCounts | null; readonly attempt: number }
}

export type AudiencePickerAction =
  | { readonly type: 'queryChanged'; readonly query: string }
  | { readonly type: 'kindChanged' }
  | { readonly type: 'targetsLoaded'; readonly key: string; readonly items: readonly AudienceTarget[] }
  | { readonly type: 'targetsFailed'; readonly key: string }
  | { readonly type: 'targetsRetried' }
  | { readonly type: 'previewLoaded'; readonly key: string; readonly counts: AudienceCounts }
  | { readonly type: 'previewFailed'; readonly key: string }
  | { readonly type: 'previewRetried' }

export const AUDIENCE_PICKER_INITIAL_STATE: AudiencePickerState = {
  query: '',
  targets: { key: null, items: null, attempt: 0 },
  known: {},
  preview: { key: null, counts: null, attempt: 0 },
}

export function audiencePickerReducer(state: AudiencePickerState, action: AudiencePickerAction): AudiencePickerState {
  switch (action.type) {
    case 'queryChanged':
      return { ...state, query: action.query }
    case 'kindChanged':
      return { ...state, query: '' }
    case 'targetsLoaded': {
      const known = { ...state.known }
      for (const item of action.items) known[item.id] = item
      return { ...state, targets: { ...state.targets, key: action.key, items: action.items }, known }
    }
    case 'targetsFailed':
      return { ...state, targets: { ...state.targets, key: action.key, items: null } }
    case 'targetsRetried':
      return { ...state, targets: { key: null, items: null, attempt: state.targets.attempt + 1 } }
    case 'previewLoaded':
      return { ...state, preview: { ...state.preview, key: action.key, counts: action.counts } }
    case 'previewFailed':
      return { ...state, preview: { ...state.preview, key: action.key, counts: null } }
    case 'previewRetried':
      return { ...state, preview: { key: null, counts: null, attempt: state.preview.attempt + 1 } }
  }
}

/** The target search a kind needs: none for `club` or no kind, otherwise the kind and the trimmed query. */
export type AudienceTargetsRequest = { readonly key: string; readonly kind: AudienceKind; readonly query: string }

export function audienceTargetsRequest(kind: AudienceKind | null, query: string): AudienceTargetsRequest | null {
  if (kind === null || kind === 'club') return null
  const trimmed = query.trim()
  return { key: `${kind}\n${trimmed}`, kind, query: trimmed }
}

/** The audience `preview` is asked about, or `null` while the value is incomplete (no kind, or no target yet). */
export function audienceSpecOf(value: AudiencePickerValue): AudiencePickerSpec | null {
  if (value.kind === 'club') return { kind: 'club', ids: [] }
  if (value.kind === null || value.ids.length === 0) return null
  return { kind: value.kind, ids: [...value.ids] }
}

function specKey(spec: AudiencePickerSpec): string {
  return `${spec.kind}\n${spec.ids.join(',')}`
}

export function audiencePreviewKey(value: AudiencePickerValue): string | null {
  const spec = audienceSpecOf(value)
  return spec === null ? null : specKey(spec)
}

export type AudienceTargetsEffectInput = {
  readonly kind: AudienceKind | null
  readonly query: string
  readonly loadTargets: (kind: AudienceKind, query: string) => Promise<AudienceTarget[]>
  readonly dispatch: (action: AudiencePickerAction) => void
  readonly debounceMs?: number
  readonly timers?: Timers
}

/** Loads the targets of the kind: at once for an empty query (a new kind), debounced while the author types. */
export function audienceTargetsEffect({
  kind,
  query,
  loadTargets,
  dispatch,
  debounceMs = AUDIENCE_PICKER_DEBOUNCE_MS,
  timers,
}: AudienceTargetsEffectInput): EffectCallback {
  const request = audienceTargetsRequest(kind, query)
  if (request === null) return noEffect
  return requestEffect({
    delayMs: request.query === '' ? 0 : debounceMs,
    timers,
    request: () => loadTargets(request.kind, request.query),
    onSuccess: (items) => {
      dispatch({ type: 'targetsLoaded', key: request.key, items })
    },
    onFailure: () => {
      dispatch({ type: 'targetsFailed', key: request.key })
    },
  })
}

/** The `useEffect` dependencies of `audienceTargetsEffect`: a new search, kind or retry starts a new request. */
export function audienceTargetsEffectDeps(value: AudiencePickerValue, state: AudiencePickerState): unknown[] {
  return [audienceTargetsRequest(value.kind, state.query)?.key ?? null, state.targets.attempt]
}

export type AudiencePreviewEffectInput = {
  readonly value: AudiencePickerValue
  readonly preview: (spec: AudiencePickerSpec) => Promise<AudienceCounts>
  readonly dispatch: (action: AudiencePickerAction) => void
  readonly debounceMs?: number
  readonly timers?: Timers
}

/** Previews a complete audience: `club` at once, a chosen target debounced (arrow keys move through the list). */
export function audiencePreviewEffect({
  value,
  preview,
  dispatch,
  debounceMs = AUDIENCE_PICKER_DEBOUNCE_MS,
  timers,
}: AudiencePreviewEffectInput): EffectCallback {
  const spec = audienceSpecOf(value)
  if (spec === null) return noEffect
  const key = specKey(spec)
  return requestEffect({
    delayMs: spec.kind === 'club' ? 0 : debounceMs,
    timers,
    request: () => preview(spec),
    onSuccess: (counts) => {
      dispatch({ type: 'previewLoaded', key, counts })
    },
    onFailure: () => {
      dispatch({ type: 'previewFailed', key })
    },
  })
}

/** The `useEffect` dependencies of `audiencePreviewEffect`: a new audience or a retry starts a new preview. */
export function audiencePreviewEffectDeps(value: AudiencePickerValue, state: AudiencePickerState): unknown[] {
  return [audiencePreviewKey(value), state.preview.attempt]
}

/** The part of a change event the handlers read (a native `<select>` or `<input>`). */
export type ValueChangeEvent = { readonly target: { readonly value: string } }

export type AudiencePickerHandlers = {
  readonly onKindChange: (event: ValueChangeEvent) => void
  readonly onQueryChange: (event: ValueChangeEvent) => void
  readonly onTargetChange: (event: ValueChangeEvent) => void
  readonly onRetryTargets: () => void
  readonly onRetryPreview: () => void
}

export type AudiencePickerHandlersInput = {
  readonly value: AudiencePickerValue
  readonly onChange: (value: AudiencePickerValue) => void
  readonly dispatch: (action: AudiencePickerAction) => void
}

/** The view's event handlers: a new kind clears the ids and the search, a target is a single choice. */
export function createAudiencePickerHandlers({
  value,
  onChange,
  dispatch,
}: AudiencePickerHandlersInput): AudiencePickerHandlers {
  return {
    onKindChange: (event) => {
      const kind = isAudienceKind(event.target.value) ? event.target.value : null
      if (kind === value.kind) return
      dispatch({ type: 'kindChanged' })
      onChange({ kind, ids: [] })
    },
    onQueryChange: (event) => {
      dispatch({ type: 'queryChanged', query: event.target.value })
    },
    onTargetChange: (event) => {
      onChange({ kind: value.kind, ids: [event.target.value] })
    },
    onRetryTargets: () => {
      dispatch({ type: 'targetsRetried' })
    },
    onRetryPreview: () => {
      dispatch({ type: 'previewRetried' })
    },
  }
}

/**
 * What step 2 shows: nothing for `club` or no kind; otherwise the request status and the options — the chosen target
 * first when the current answer does not contain it (it stays selectable while a search runs or finds nothing).
 */
export type AudienceTargetsView =
  | { readonly status: 'hidden' }
  | { readonly status: 'loading' | 'error' | 'empty' | 'loaded'; readonly options: readonly AudienceTarget[] }

export function audienceTargetsView(value: AudiencePickerValue, state: AudiencePickerState): AudienceTargetsView {
  const request = audienceTargetsRequest(value.kind, state.query)
  if (request === null) return { status: 'hidden' }
  const current = state.targets.key === request.key
  const items = current && state.targets.items !== null ? state.targets.items : []
  const chosen = value.ids
    .filter((id) => !items.some((item) => item.id === id))
    .map((id) => state.known[id])
    .filter((target) => target !== undefined)
  const options = [...chosen, ...items]
  if (!current) return { status: 'loading', options }
  if (state.targets.items === null) return { status: 'error', options }
  return { status: items.length === 0 ? 'empty' : 'loaded', options }
}

/** The status text of step 2, or `null` when the loaded options speak for themselves. */
export function audienceTargetsMessage(view: AudienceTargetsView, labels: AudiencePickerLabels): string | null {
  switch (view.status) {
    case 'loading':
      return labels.loadingTargets
    case 'error':
      return labels.targetsError
    case 'empty':
      return labels.noTargets
    case 'hidden':
    case 'loaded':
      return null
  }
}

export type AudiencePreviewView =
  { readonly status: 'empty' | 'loading' | 'error' } | { readonly status: 'loaded'; readonly counts: AudienceCounts }

export function audiencePreviewView(value: AudiencePickerValue, state: AudiencePickerState): AudiencePreviewView {
  const key = audiencePreviewKey(value)
  if (key === null) return { status: 'empty' }
  if (state.preview.key !== key) return { status: 'loading' }
  if (state.preview.counts === null) return { status: 'error' }
  return { status: 'loaded', counts: state.preview.counts }
}

/** The live count line: the formatted counts once the preview answered, otherwise the matching status text. */
export function audiencePreviewLine(
  view: AudiencePreviewView,
  labels: AudiencePickerLabels,
  formatCounts: (counts: AudienceCounts) => string,
): string {
  switch (view.status) {
    case 'empty':
      return labels.previewEmpty
    case 'loading':
      return labels.previewLoading
    case 'error':
      return labels.previewError
    case 'loaded':
      return formatCounts(view.counts)
  }
}

/** Element ids derived from the field's base id. */
export function audiencePickerIds(id: string) {
  return {
    kind: `${id}-kind`,
    search: `${id}-search`,
    targets: `${id}-targets`,
    count: `${id}-count`,
    error: `${id}-error`,
    target: (index: number) => `${id}-target-${String(index)}`,
  }
}

/** `aria-describedby` of the controls: the live count line and, when shown, the validation message. */
export function audiencePickerDescribedBy(id: string, error: string | null | undefined): string {
  const ids = audiencePickerIds(id)
  return error ? `${ids.count} ${ids.error}` : ids.count
}
