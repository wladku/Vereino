'use client'
// The roster of a group (club spec UI table: "membership with history"; glossary *Membership*): every membership —
// active, upcoming and ended — with the person, the role ("instructor" for a class group's coach) and the period. With
// `groups.manage` a coordinator of the group's section or the club administrator adds a person (person picker, role,
// first day) and ends a membership (its last day becomes today; the row stays as history). An overlapping membership of
// the same person and role is refused by the server (409) and shown as an error.
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
import { MEMBERSHIP_ROLES, rosterOrder } from '../lib/groups-rules'
import {
  errorMessage,
  localToday,
  periodLabel,
  personName,
  roleLabel,
  rowStatus,
  type MembershipRow,
} from './client-helpers'

type PersonOption = { id: string; firstName: string | null; lastName: string | null; birthDate: string | null }

export function RosterPanel({
  groupId,
  groupKind,
  canManage,
}: {
  groupId: string
  groupKind: string | null
  canManage: boolean
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const [personId, setPersonId] = React.useState<string | null>(null)
  const [role, setRole] = React.useState<string>('participant')
  const [validFrom, setValidFrom] = React.useState(localToday)
  const queryKey = ['groups-roster', groupId]

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await readApiResultOrThrow<{ items?: MembershipRow[] }>(
        `/api/groups/memberships?groupId=${encodeURIComponent(groupId)}&pageSize=100&sortField=validFrom&sortDir=desc`,
      )
      return data.items ?? []
    },
  })

  const fetchPersons = React.useCallback(async (search: string): Promise<LookupSelectItem[]> => {
    const params = new URLSearchParams({ pageSize: '50' })
    if (search.trim()) params.set('lastName', search.trim())
    const data = await readApiResultOrThrow<{ items?: PersonOption[] }>(`/api/people/persons?${params.toString()}`)
    return (data.items ?? []).map((person) => ({
      id: person.id,
      title: personName(person) || person.id,
      subtitle: person.birthDate ?? undefined,
    }))
  }, [])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey })
  }

  const add = async () => {
    if (!personId) return
    setBusy(true)
    try {
      await apiCallOrThrow(
        '/api/groups/memberships',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ groupId, personId, role, validFrom }),
        },
        { errorMessage: t('groups.memberships.errors.add') },
      )
      flash(t('groups.memberships.flash.added'), 'success')
      setPersonId(null)
    } catch (error: unknown) {
      flash(errorMessage(error, t('groups.memberships.errors.add')), 'error')
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const end = async (row: MembershipRow) => {
    const confirmed = await confirm({ title: t('groups.memberships.confirm.end'), variant: 'destructive' })
    if (!confirmed) return
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        apiCallOrThrow(
          `/api/groups/memberships/${row.id}/end`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
          { errorMessage: t('groups.memberships.errors.end') },
        ),
      )
      flash(t('groups.memberships.flash.ended'), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorMessage(error, t('groups.memberships.errors.end')), 'error')
      }
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const today = localToday()
  const rows = rosterOrder(
    (query.data ?? []).map((row) => ({ ...row, validFrom: row.validFrom ?? '', validTo: row.validTo })),
    today,
  )
  const activeCount = rows.filter((row) => rowStatus(row, today) === 'active').length

  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('groups.memberships.title')}>
      <SectionHeader title={t('groups.memberships.title')} count={activeCount} />
      <p className="text-muted-foreground text-sm">{t('groups.memberships.help')}</p>
      {query.isLoading ? <LoadingMessage label={t('groups.common.loading')} /> : null}
      {query.error ? <ErrorMessage label={errorMessage(query.error, t('groups.memberships.errors.load'))} /> : null}
      {query.isSuccess && rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('groups.memberships.empty')}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y" aria-label={t('groups.memberships.list')}>
          {rows.map((row) => {
            const status = rowStatus(row, today)
            return (
              <li key={row.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium break-words">
                    {personName(row.person) || t('groups.memberships.unknownPerson')}
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <span>{roleLabel(t, row.role, groupKind)}</span>
                    <span>{periodLabel(t, row.validFrom, row.validTo)}</span>
                    <StatusBadge variant={status === 'active' ? 'success' : 'neutral'}>
                      {t(`groups.common.status.${status}`)}
                    </StatusBadge>
                  </span>
                </span>
                {canManage && status !== 'ended' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={t('groups.memberships.actions.endFor', { name: personName(row.person) })}
                    onClick={() => {
                      void end(row)
                    }}
                  >
                    {t('groups.memberships.actions.end')}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {canManage ? (
        <form
          className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-end"
          aria-label={t('groups.memberships.actions.add')}
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label>{t('groups.memberships.fields.person')}</Label>
            <LookupSelect
              value={personId}
              onChange={setPersonId}
              fetchItems={fetchPersons}
              minQuery={0}
              placeholder={t('groups.memberships.fields.person.placeholder')}
              searchPlaceholder={t('groups.memberships.fields.person.search')}
              emptyLabel={t('groups.memberships.fields.person.empty')}
              loadingLabel={t('groups.common.loading')}
              clearLabel={t('groups.common.clear')}
              selectLabel={t('groups.common.select')}
              selectedLabel={t('groups.common.selected')}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="groups-membership-role">{t('groups.memberships.fields.role')}</Label>
            <Select value={role} onValueChange={setRole} disabled={busy}>
              <SelectTrigger id="groups-membership-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMBERSHIP_ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {roleLabel(t, value, groupKind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="groups-membership-from">{t('groups.memberships.fields.validFrom')}</Label>
            <Input
              id="groups-membership-from"
              type="date"
              value={validFrom}
              disabled={busy}
              onChange={(event) => {
                setValidFrom(event.target.value)
              }}
            />
          </div>
          <Button type="submit" disabled={busy || !personId || !validFrom}>
            {t('groups.memberships.actions.add')}
          </Button>
        </form>
      ) : null}
      {ConfirmDialogElement}
    </section>
  )
}
