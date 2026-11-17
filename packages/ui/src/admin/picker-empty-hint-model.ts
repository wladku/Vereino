// The empty-picker pattern (people life-cycle spec REQ-L14, DD-L13): what a picker says when it offers nothing, and
// which way on it offers. Framework-free, so `node --test` covers every rule; `picker-empty-hint.tsx` only renders the
// view these functions return. Texts come from the consumer's catalog: the component knows no record names.
import type { EffectCallback } from '#src/admin/request-effect'
import type { FocusTarget } from '#src/member/member-nav-features'

/** One option of a picker, as a select or a lookup shows it. */
export type PickerOption = { readonly value: string; readonly label: string }

/** `none`: the option source has no option at all; `no-match`: a search found nothing. */
export type PickerEmptyState = 'none' | 'no-match'

/** How the user who may create the record gets one: in place (a dialog) or on its create page in a new tab. */
export type PickerCreate = { readonly kind: 'inline' } | { readonly kind: 'link'; readonly href: string }

export type PickerEmptyHintLabels = {
  /** "No institution yet." */
  readonly none: string
  /** "No institution found." */
  readonly noMatch: string
  /** "Add an institution" */
  readonly add: string
  /** "Add 'Kasia Kowalska'": the in-place action after a search that found nothing. */
  readonly addTerm?: (term: string) => string
  /** "Ask the club administrator to add one.": shown instead of an action to a user who may not create. */
  readonly askAdmin: string
}

export type PickerEmptyHintInput = {
  readonly state: PickerEmptyState
  /** The search that found nothing (`no-match`); prefills the in-place create. */
  readonly term?: string | null
  /** Whether the session holds the creating feature; the server refuses anyway. */
  readonly canCreate: boolean
  /** The create path; null when the record has none from this picker. */
  readonly create: PickerCreate | null
  readonly labels: PickerEmptyHintLabels
}

export type PickerHintAction =
  | { readonly kind: 'inline'; readonly label: string; readonly term: string | null }
  | { readonly kind: 'link'; readonly label: string; readonly href: string }

export type PickerEmptyHintView = {
  readonly message: string
  readonly action: PickerHintAction | null
  /** Who can add the record, for a user without the creating feature. */
  readonly askAdmin: string | null
}

/** The empty state of a picker that shows `count` options for the search `term`; null while it offers any. */
export function pickerEmptyState(count: number, term?: string | null): PickerEmptyState | null {
  if (count > 0) return null
  return term?.trim() ? 'no-match' : 'none'
}

function hintAction(input: PickerEmptyHintInput): PickerHintAction | null {
  const { create, labels } = input
  if (!input.canCreate || !create) return null
  if (create.kind === 'link') return { kind: 'link', label: labels.add, href: create.href }
  const term = input.state === 'no-match' ? input.term?.trim() : undefined
  if (term && labels.addTerm) return { kind: 'inline', label: labels.addTerm(term), term }
  return { kind: 'inline', label: labels.add, term: null }
}

/** The text and the one action of an empty picker. */
export function pickerEmptyHintView(input: PickerEmptyHintInput): PickerEmptyHintView {
  return {
    message: input.state === 'none' ? input.labels.none : input.labels.noMatch,
    action: hintAction(input),
    askAdmin: input.canCreate ? null : input.labels.askAdmin,
  }
}

/** The click handler of an in-place action: hands the search term (or null) to the consumer's dialog opener. */
export function pickerHintClick(onCreate: ((term: string | null) => void) | undefined, term: string | null) {
  return (): void => {
    onCreate?.(term)
  }
}

/** The browser window, or null outside one (server rendering). */
export function browserFocusTarget(): FocusTarget | null {
  return typeof window === 'undefined' ? null : window
}

/**
 * An effect that calls `reload` whenever the window regains focus: a picker whose create path opened a new tab
 * shows the record created there once the user comes back.
 */
export function reloadOnFocusEffect(target: FocusTarget | null, reload: () => void): EffectCallback {
  return () => {
    if (!target) return undefined
    const listener = () => {
      reload()
    }
    target.addEventListener('focus', listener)
    return () => {
      target.removeEventListener('focus', listener)
    }
  }
}
