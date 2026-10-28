'use client'
// The coordinators panel of the section edit page (club spec UI table, J-001 step 1). Coordinators are `people` role
// assignments (`coordinator` + `section_id`): the panel reads them from the section's `people` enrichment and writes
// them through the existing `/api/people/role-assignments` routes — `club_core` imports nothing of `people`.
import * as React from 'react'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import {
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage } from './client-helpers'
import { coordinatorName, type SectionCoordinatorView, type SectionRow } from './sections-shared'

type PersonItem = { id: string; firstName: string | null; lastName: string | null; birthDate: string | null }

/** Today's local calendar date (`YYYY-MM-DD`) as the default start of an assignment. */
function localToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function SectionCoordinators({ section, onChanged }: { section: SectionRow; onChanged: () => Promise<void> }) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [personId, setPersonId] = React.useState<string | null>(null)
  const [validFrom, setValidFrom] = React.useState(localToday)
  const [busy, setBusy] = React.useState(false)
  const enrichment = section._people

  const fetchPersons = React.useCallback(async (query: string): Promise<LookupSelectItem[]> => {
    const params = new URLSearchParams({ pageSize: '20' })
    if (query.trim()) params.set('lastName', query.trim())
    const data = await readApiResultOrThrow<{ items?: PersonItem[] }>(`/api/people/persons?${params.toString()}`)
    return (data.items ?? []).map((person) => ({
      id: person.id,
      title: coordinatorName(person),
      subtitle: person.birthDate,
    }))
  }, [])

  const assign = async () => {
    if (!personId) return
    setBusy(true)
    try {
      await apiCallOrThrow(
        '/api/people/role-assignments',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ personId, role: 'coordinator', sectionId: section.id, validFrom }),
        },
        { errorMessage: t('club_core.coordinators.errors.assign') },
      )
      flash(t('club_core.coordinators.flash.assigned'), 'success')
      setPersonId(null)
      await onChanged()
    } catch (error: unknown) {
      flash(errorMessage(error, t('club_core.coordinators.errors.assign')), 'error')
    } finally {
      setBusy(false)
    }
  }

  const end = async (coordinator: SectionCoordinatorView) => {
    const confirmed = await confirm({
      title: t('club_core.coordinators.confirm.end'),
      text: coordinatorName(coordinator),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(coordinator.updatedAt), () =>
        apiCallOrThrow(
          `/api/people/role-assignments/${coordinator.assignmentId}/end`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
          { errorMessage: t('club_core.coordinators.errors.end') },
        ),
      )
      flash(t('club_core.coordinators.flash.ended'), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t)) flash(errorMessage(error, t('club_core.coordinators.errors.end')), 'error')
    } finally {
      setBusy(false)
      await onChanged()
    }
  }

  return (
    <section
      className="bg-card flex flex-col gap-4 rounded-lg border p-4"
      aria-label={t('club_core.coordinators.title')}
    >
      <SectionHeader title={t('club_core.coordinators.title')} count={enrichment?.coordinators.length} />
      {!enrichment ? (
        <p className="text-muted-foreground text-sm">{t('club_core.coordinators.unavailable')}</p>
      ) : (
        <>
          {enrichment.coordinatorMissing ? (
            <div>
              <StatusBadge variant="warning" dot>
                {t('club_core.sections.noCoordinator')}
              </StatusBadge>
            </div>
          ) : null}
          {enrichment.coordinators.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('club_core.coordinators.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {enrichment.coordinators.map((coordinator) => (
                <li
                  key={coordinator.assignmentId}
                  className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{coordinatorName(coordinator)}</span>
                    <span className="text-muted-foreground text-xs">
                      {coordinator.active
                        ? t('club_core.coordinators.since', { date: coordinator.validFrom })
                        : t('club_core.coordinators.from', { date: coordinator.validFrom })}
                      {coordinator.validTo ? ` – ${coordinator.validTo}` : ''}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void end(coordinator)
                    }}
                  >
                    {t('club_core.coordinators.actions.end')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <Label>{t('club_core.coordinators.fields.person')}</Label>
              <LookupSelect
                value={personId}
                onChange={setPersonId}
                fetchItems={fetchPersons}
                minQuery={0}
                placeholder={t('club_core.coordinators.fields.person.placeholder')}
                searchPlaceholder={t('club_core.coordinators.fields.person.search')}
                emptyLabel={t('club_core.coordinators.fields.person.empty')}
                loadingLabel={t('club_core.common.loading')}
                clearLabel={t('club_core.common.clear')}
                selectLabel={t('club_core.common.select')}
                selectedLabel={t('club_core.common.selected')}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="club-core-coordinator-from">{t('club_core.coordinators.fields.validFrom')}</Label>
              <Input
                id="club-core-coordinator-from"
                type="date"
                value={validFrom}
                onChange={(event) => {
                  setValidFrom(event.target.value)
                }}
                disabled={busy}
              />
            </div>
            <Button
              type="button"
              disabled={busy || !personId || !validFrom}
              onClick={() => {
                void assign()
              }}
            >
              {t('club_core.coordinators.actions.assign')}
            </Button>
          </div>
        </>
      )}
      {ConfirmDialogElement}
    </section>
  )
}
