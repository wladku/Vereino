// `TableLoadError` (E20-S18, #497): what an admin list shows in place of its rows when they could not be loaded — the
// list's own message, never the server's raw text ("Internal error"), and one way on: "Try again". Pass it as the
// `error` of the platform `DataTable`, which renders it in the table body instead of the loading row.
import { RotateCcw } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'

export type TableLoadErrorProps = {
  /** What could not be loaded, in the user's language ("The sections could not be loaded."). */
  message: string
  /** The retry action's label ("Try again"). */
  retryLabel: string
  /** Loads the rows again (the list query's `refetch`). */
  onRetry: () => void
  testId?: string
}

export function TableLoadError({ message, retryLabel, onRetry, testId = 'table-load-error' }: TableLoadErrorProps) {
  return (
    <div
      role="alert"
      className="sticky left-0 flex w-fit max-w-[calc(100vw-6rem)] flex-col items-start gap-3 py-2 text-left"
      data-testid={testId}
    >
      <p className="text-status-error-text text-sm">{message}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-foreground min-h-11"
        onClick={() => {
          onRetry()
        }}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        {retryLabel}
      </Button>
    </div>
  )
}
