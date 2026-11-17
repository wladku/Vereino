// `PickerEmptyHint` (people life-cycle spec REQ-L14, DD-L13): the line under an empty select or lookup that says what
// is missing and offers one way on — an in-place create, a link to the create page in a new tab, or, for a user
// without the creating feature, who can add the record. Stateless; the rules live in `picker-empty-hint-model.ts`.
import { Button } from '@open-mercato/ui/primitives/button'
import { pickerEmptyHintView, pickerHintClick } from '#src/admin/picker-empty-hint-model'
import type { PickerEmptyHintInput } from '#src/admin/picker-empty-hint-model'

export type PickerEmptyHintProps = PickerEmptyHintInput & {
  /** Id of the hint, for the control's `aria-describedby`. */
  id?: string
  /** Opens the in-place create with the search term (null when the picker had no option at all). */
  onCreate?: (term: string | null) => void
  testId?: string
}

const ACTION_CLASS_NAME = 'min-h-11 w-full sm:w-auto'

export function PickerEmptyHint({ id, onCreate, testId = 'picker-empty-hint', ...input }: PickerEmptyHintProps) {
  const view = pickerEmptyHintView(input)
  return (
    <div
      id={id}
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      data-testid={testId}
      data-state={input.state}
    >
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {view.askAdmin ? `${view.message} ${view.askAdmin}` : view.message}
      </p>
      {view.action?.kind === 'inline' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={ACTION_CLASS_NAME}
          onClick={pickerHintClick(onCreate, view.action.term)}
          data-testid={`${testId}-create`}
        >
          {view.action.label}
        </Button>
      ) : null}
      {view.action?.kind === 'link' ? (
        <Button asChild variant="outline" size="sm" className={ACTION_CLASS_NAME}>
          <a href={view.action.href} target="_blank" rel="noopener noreferrer" data-testid={`${testId}-link`}>
            {view.action.label}
          </a>
        </Button>
      ) : null}
    </div>
  )
}
