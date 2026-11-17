// `PickerSelect` (people life-cycle spec REQ-L14, DD-L13): a select whose options load from the consumer, which shows
// the empty-picker hint when there is no option and selects a record created in place or, after a create link opened
// a new tab, reloads its options when the window regains focus. State, effects and handlers live here.
import { requestEffect, type EffectCallback, type Timers } from '#src/admin/request-effect'
import type { PickerOption } from '#src/admin/picker-empty-hint-model'

export type PickerSelectState = {
  readonly status: 'loading' | 'loaded' | 'error'
  readonly options: readonly PickerOption[]
  /** Bumped to load the options again (focus after a create link, retry after an error). */
  readonly reload: number
  readonly dialogOpen: boolean
  /** The term the in-place create was opened with. */
  readonly term: string | null
}

export type PickerSelectAction =
  | { readonly type: 'loaded'; readonly options: readonly PickerOption[] }
  | { readonly type: 'failed' }
  | { readonly type: 'reload' }
  | { readonly type: 'openDialog'; readonly term: string | null }
  | { readonly type: 'closeDialog' }
  | { readonly type: 'created'; readonly option: PickerOption }

export const PICKER_SELECT_INITIAL_STATE: PickerSelectState = {
  status: 'loading',
  options: [],
  reload: 0,
  dialogOpen: false,
  term: null,
}

export function pickerSelectReducer(state: PickerSelectState, action: PickerSelectAction): PickerSelectState {
  switch (action.type) {
    case 'loaded':
      return { ...state, status: 'loaded', options: action.options }
    case 'failed':
      return { ...state, status: 'error' }
    case 'reload':
      return { ...state, reload: state.reload + 1 }
    case 'openDialog':
      return { ...state, dialogOpen: true, term: action.term }
    case 'closeDialog':
      return { ...state, dialogOpen: false }
    case 'created':
      return {
        ...state,
        status: 'loaded',
        dialogOpen: false,
        options: [...state.options.filter((option) => option.value !== action.option.value), action.option],
      }
  }
}

/** The effect that loads the options on mount and after every `reload`; a late answer of an older load is dropped. */
export function pickerSelectLoadEffect(input: {
  load: () => Promise<readonly PickerOption[]>
  dispatch: (action: PickerSelectAction) => void
  timers?: Timers
}): EffectCallback {
  return requestEffect({
    delayMs: 0,
    request: input.load,
    onSuccess: (options) => {
      input.dispatch({ type: 'loaded', options })
    },
    onFailure: () => {
      input.dispatch({ type: 'failed' })
    },
    timers: input.timers,
  })
}

export function pickerSelectLoadDeps(state: PickerSelectState, load: () => unknown): readonly unknown[] {
  return [state.reload, load]
}

type SelectChangeEvent = { readonly target: { readonly value: string } }

export type PickerSelectHandlers = {
  onSelectChange: (event: SelectChangeEvent) => void
  onCreate: (term: string | null) => void
  onDialogOpenChange: (open: boolean) => void
  onCreated: (option: PickerOption) => void
  onReload: () => void
}

export function createPickerSelectHandlers(input: {
  dispatch: (action: PickerSelectAction) => void
  onChange: (value: string) => void
}): PickerSelectHandlers {
  const { dispatch, onChange } = input
  return {
    onSelectChange: (event) => {
      onChange(event.target.value)
    },
    onCreate: (term) => {
      dispatch({ type: 'openDialog', term })
    },
    onDialogOpenChange: (open) => {
      if (!open) dispatch({ type: 'closeDialog' })
    },
    onCreated: (option) => {
      dispatch({ type: 'created', option })
      onChange(option.value)
    },
    onReload: () => {
      dispatch({ type: 'reload' })
    },
  }
}

/** Ids of the field's elements. */
export function pickerSelectIds(id: string) {
  return { select: id, hint: `${id}-hint`, error: `${id}-error`, dialog: `${id}-create` }
}

/** The control's `aria-describedby`: the hint while it shows, then the form's error. */
export function pickerSelectDescribedBy(id: string, hintShown: boolean, error: string | null | undefined) {
  const ids = pickerSelectIds(id)
  const parts = [hintShown ? ids.hint : null, error ? ids.error : null].filter((part) => part !== null)
  return parts.length > 0 ? parts.join(' ') : undefined
}
