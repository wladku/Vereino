'use client'
// The "Roles" tab of the person record (club spec UI table; DD-33): the person's staff role assignments in the
// caller's scope with the section name and the period; with `people.roles.manage` the club administrator assigns a
// role (a coordinator with the section picker) and ends an assignment through the existing role-assignment routes.
// A second assignment of the same role and section in an overlapping period is refused by the server (409).
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import {
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, localToday, periodLabel, periodStatus, type RoleAssignmentRow } from './client-helpers'

const ROLES = ['club_admin', 'coordinator', 'coach'] as const

type SectionItem = { id: string; name: string | null }

export function RolesPanel({ personId, canManage }: { personId: string; canManage: boolean }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const [role, setRole] = React.useState<string>('coordinator')
  const [sectionId, setSectionId] = React.useState<string | null>(null)
  const [validFrom, setValidFrom] = React.useState(localToday)

  const query = useQuery({
    queryKey: ['people-role-assignments', personId],
    queryFn: async () => {
      const data = await readApiResultOrThrow<{ items?: RoleAssignmentRow[] }>(
        `/api/people/role-assignments?personId=${encodeURIComponent(personId)}&pageSize=100&sortField=validFrom&sortDir=desc`,
      )
      const rows = data.items ?? []
      const sectionIds = [...new Set(rows.map((row) => row.sectionId).filter((id): id is string => Boolean(id)))]
      // Section names come from `club_core`; a reader without access to the section list sees no name.
      const sections =
        sectionIds.length > 0
          ? await readApiResultOrThrow<{ items?: SectionItem[] }>(
              `/api/club_core/sections?ids=${encodeURIComponent(sectionIds.join(','))}&pageSize=100`,
            )
              .then((result) => result.items ?? [])
              .catch(() => [])
          : []
      return { rows, sections: new Map(sections.map((section) => [section.id, section.name])) }
    },
  })

  const fetchSections = React.useCallback(async (search: string): Promise<LookupSelectItem[]> => {
    const params = new URLSearchParams({ pageSize: '50', sortField: 'name', sortDir: 'asc' })
    if (search.trim()) params.set('search', search.trim())
    const data = await readApiResultOrThrow<{ items?: SectionItem[] }>(`/api/club_core/sections?${params.toString()}`)
    return (data.items ?? []).map((section) => ({ id: section.id, title: section.name ?? section.id }))
  }, [])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['people-role-assignments', personId] })
  }

  const assign = async () => {
    setBusy(true)
    try {
      await apiCallOrThrow(
        '/api/people/role-assignments',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            personId,
            role,
            ...(role === 'coordinator' ? { sectionId } : {}),
            validFrom,
          }),
        },
        { errorMessage: t('people.roles.errors.assign') },
      )
      flash(t('people.roles.flash.assigned'), 'success')
      setSectionId(null)
    } catch (error: unknown) {
      flash(errorMessage(error, t('people.roles.errors.assign')), 'error')
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const end = async (row: RoleAssignmentRow) => {
    const confirmed = await confirm({ title: t('people.roles.confirm.end'), variant: 'destructive' })
    if (!confirmed) return
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        apiCallOrThrow(
          `/api/people/role-assignments/${row.id}/end`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
          { errorMessage: t('people.roles.errors.end') },
        ),
      )
      flash(t('people.roles.flash.ended'), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorMessage(error, t('people.roles.errors.end')), 'error')
      }
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const rows = query.data?.rows ?? []
  const today = localToday()
  const needsSection = role === 'coordinator'

  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('people.roles.title')}>
      <SectionHeader title={t('people.roles.title')} count={rows.length} />
      {query.isLoading ? <LoadingMessage label={t('people.common.loading')} /> : null}
      {query.error ? <ErrorMessage label={errorMessage(query.error, t('people.roles.errors.load'))} /> : null}
      {query.isSuccess && rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('people.roles.empty')}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {rows.map((row) => {
            const status = periodStatus(row.validFrom, row.validTo, today)
            const sectionName = row.sectionId ? query.data?.sections.get(row.sectionId) : null
            return (
              <li key={row.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex flex-col">
                  <span className="font-medium">
                    {t(`people.roles.role.${row.role}`)}
                    {sectionName ? ` — ${sectionName}` : ''}
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <span>{periodLabel(t, row.validFrom, row.validTo)}</span>
                    <StatusBadge variant={status === 'active' ? 'success' : 'neutral'}>
                      {t(`people.common.${status}`)}
                    </StatusBadge>
                  </span>
                </span>
                {canManage && status !== 'ended' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void end(row)
                    }}
                  >
                    {t('people.roles.actions.end')}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {canManage ? (
        <form
          className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end"
          aria-label={t('people.roles.actions.assign')}
          onSubmit={(event) => {
            event.preventDefault()
            void assign()
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="people-role">{t('people.roles.fields.role')}</Label>
            <Select value={role} onValueChange={setRole} disabled={busy}>
              <SelectTrigger id="people-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`people.roles.role.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsSection ? (
            <div className="flex flex-1 flex-col gap-1">
              <Label>{t('people.roles.fields.section')}</Label>
              <LookupSelect
                value={sectionId}
                onChange={setSectionId}
                fetchItems={fetchSections}
                minQuery={0}
                placeholder={t('people.roles.fields.section.placeholder')}
                searchPlaceholder={t('people.roles.fields.section.search')}
                emptyLabel={t('people.roles.fields.section.empty')}
                loadingLabel={t('people.common.loading')}
                clearLabel={t('people.common.clear')}
                selectLabel={t('people.common.select')}
                selectedLabel={t('people.common.selected')}
                disabled={busy}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="people-role-from">{t('people.roles.fields.validFrom')}</Label>
            <Input
              id="people-role-from"
              type="date"
              value={validFrom}
              disabled={busy}
              onChange={(event) => {
                setValidFrom(event.target.value)
              }}
            />
          </div>
          <Button type="submit" disabled={busy || !validFrom || (needsSection && !sectionId)}>
            {t('people.roles.actions.assign')}
          </Button>
        </form>
      ) : null}
      {ConfirmDialogElement}
    </section>
  )
}
