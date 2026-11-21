'use client'
// The "Preview" group of the activity form (club spec J-002 step 1, D02; foundation II J-G01): posts the same body as
// the save to `POST /api/activities/activities/preview` (with `activityId` for an edit) and lists the sessions the
// series would have in the 16-week horizon with their place and coach conflicts — before anything is saved. A rule the
// server refuses (422) is shown here with its message; a failing occupancy provider only warns. The result reports
// to the create form whether the current values were previewed without a collision (#268, REQ-A04): "Create" waits for
// it, and focus moves to the announced result heading.
import * as React from 'react'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { conflictNames } from './ConflictList'
import { buildActivityBody, type ActivityFormValues } from './activity-form-values'
import {
  dateLabel,
  errorMessage,
  timeRangeOfInstants,
  type PreviewItem,
  type PreviewResult,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { Notice, StatusTag } from '@vereino/ui'

function buildColumns(t: Translate): TableColumns<PreviewItem> {
  return [
    {
      id: 'date',
      header: t('activities.preview.columns.date'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => dateLabel(t, row.original.date),
    },
    {
      id: 'time',
      header: t('activities.preview.columns.time'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => timeRangeOfInstants(row.original.startAt, row.original.endAt),
    },
    {
      id: 'change',
      header: t('activities.preview.columns.change'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.existingId ? t('activities.preview.change.moved') : t('activities.preview.change.new'),
    },
    {
      id: 'status',
      header: t('activities.preview.columns.status'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) =>
        row.original.conflicts.length > 0 ? (
          <span className="flex flex-col items-start gap-1">
            <StatusTag status="error">{t('activities.preview.status.conflict')}</StatusTag>
            <span className="text-muted-foreground text-xs break-words">
              {conflictNames(t, row.original.conflicts)}
            </span>
          </span>
        ) : (
          <StatusTag status="success">{t('activities.preview.status.free')}</StatusTag>
        ),
    },
  ]
}

/**
 * What the last preview says about the current values: none yet (or the values changed since), collisions, or clear —
 * at least one session and no collision.
 */
export type PreviewGate = 'none' | 'conflicts' | 'clear'

export function PreviewPanel({
  values,
  activityId,
  onGate,
}: {
  values: ActivityFormValues
  activityId?: string
  onGate?: (gate: PreviewGate) => void
}) {
  const t = useT()
  const [pending, setPending] = React.useState(false)
  const [result, setResult] = React.useState<PreviewResult | null>(null)
  const [previewedKey, setPreviewedKey] = React.useState<string | null>(null)
  const [problem, setProblem] = React.useState<string[] | null>(null)
  const columns = React.useMemo(() => buildColumns(t), [t])

  const built = buildActivityBody(values, t)
  const currentKey = built.ok ? JSON.stringify(built.body) : null
  const stale = result !== null && previewedKey !== currentKey
  const headingRef = React.useRef<HTMLParagraphElement>(null)
  const gate: PreviewGate =
    !result || stale ? 'none' : result.conflictCount > 0 || result.total === 0 ? 'conflicts' : 'clear'
  React.useEffect(() => {
    onGate?.(gate)
  }, [gate, onGate])

  const preview = async () => {
    if (!built.ok) {
      setResult(null)
      setProblem([built.message, ...new Set(Object.values(built.fieldErrors))])
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const call = await apiCallOrThrow<PreviewResult>(
        '/api/activities/activities/preview',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...built.body, ...(activityId ? { activityId } : {}) }),
        },
        { errorMessage: t('activities.preview.errors.load') },
      )
      setResult(call.result)
      setPreviewedKey(currentKey)
      // After Preview the focus moves to the announced result heading.
      requestAnimationFrame(() => headingRef.current?.focus())
    } catch (error: unknown) {
      setResult(null)
      setProblem([errorMessage(error, t('activities.preview.errors.load'))])
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t('activities.preview.help')}</p>
      <div>
        <Button
          type="button"
          variant="outline"
          data-testid="activities-preview-button"
          disabled={pending}
          onClick={() => {
            void preview()
          }}
        >
          {pending ? t('activities.preview.loading') : t('activities.preview.action')}
        </Button>
      </div>
      {problem ? (
        <Alert style="light" status="error" data-testid="activities-preview-error">
          <AlertTitle>{t('activities.preview.errors.title')}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {problem.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <div className="flex min-w-0 flex-col gap-3" aria-live="polite">
          <p ref={headingRef} tabIndex={-1} className="text-sm font-medium" data-testid="activities-preview-summary">
            {t('activities.preview.summary', {
              count: result.total,
              until: result.horizonEnd,
              conflicts: result.conflictCount,
            })}
          </p>
          {!stale && result.total > 0 && result.conflictCount === 0 ? (
            <Alert style="light" status="success" data-testid="activities-preview-clear">
              <AlertTitle>{t('activities.preview.clear.title')}</AlertTitle>
              <AlertDescription>{t('activities.preview.clear.text')}</AlertDescription>
            </Alert>
          ) : null}
          {stale ? (
            <Notice>
              <AlertDescription>{t('activities.preview.stale')}</AlertDescription>
            </Notice>
          ) : null}
          {result.providerFailed ? (
            <Alert style="light" status="warning" data-testid="activities-preview-provider-failed">
              <AlertDescription>{t('activities.preview.providerFailed')}</AlertDescription>
            </Alert>
          ) : null}
          <div className="min-w-0" data-testid="activities-preview-table">
            <DataTable<PreviewItem>
              embedded
              title={t('activities.preview.title')}
              columns={columns}
              data={result.items}
              emptyState={<p className="text-muted-foreground text-sm">{t('activities.preview.empty')}</p>}
              exporter={false}
              disableRowClick
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
