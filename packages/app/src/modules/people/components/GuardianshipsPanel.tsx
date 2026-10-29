'use client'
// The "Guardianship and consents" tab of the person record (club spec UI table, J-001 step 2): the person's wards and
// guardians with the relation, the primary payer, the period and — only when the API returns them (the club
// administrator, a guardian of the ward) — the consents. The club administrator links a guardian and a ward, edits
// the relation, payer flag, end day and consents, and ends a guardianship (never deletes it).
import * as React from 'react'
import Link from 'next/link'
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
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  CONSENT_KINDS,
  GUARDIAN_RELATIONS,
  PERSONS_HREF,
  errorMessage,
  localToday,
  periodLabel,
  periodStatus,
  personName,
  type ConsentKind,
  type GuardianshipRow,
  type PersonListRow,
  type Translate,
} from './client-helpers'

type ConsentFlags = Record<ConsentKind, boolean>

const NO_CONSENTS: ConsentFlags = { regulations: false, image: false, trips: false }

function consentFlags(row: GuardianshipRow): ConsentFlags {
  return {
    regulations: row.consents?.regulations.granted ?? false,
    image: row.consents?.image.granted ?? false,
    trips: row.consents?.trips.granted ?? false,
  }
}

function RelationSelect({
  id,
  value,
  onChange,
  disabled,
  t,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  t: Translate
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GUARDIAN_RELATIONS.map((relation) => (
          <SelectItem key={relation} value={relation}>
            {t(`people.guardianships.relation.${relation}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ConsentCheckboxes({
  idPrefix,
  value,
  onChange,
  disabled,
  t,
}: {
  idPrefix: string
  value: ConsentFlags
  onChange: (value: ConsentFlags) => void
  disabled: boolean
  t: Translate
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t('people.guardianships.consents.title')}</legend>
      {CONSENT_KINDS.map((kind) => (
        <div key={kind} className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-${kind}`}
            checked={value[kind]}
            disabled={disabled}
            onCheckedChange={(checked) => {
              onChange({ ...value, [kind]: checked === true })
            }}
          />
          <Label htmlFor={`${idPrefix}-${kind}`}>{t(`people.guardianships.consents.${kind}`)}</Label>
        </div>
      ))}
    </fieldset>
  )
}

function ConsentBadges({ row, t }: { row: GuardianshipRow; t: Translate }) {
  if (!row.consents) {
    return <p className="text-muted-foreground text-xs">{t('people.guardianships.consents.hidden')}</p>
  }
  const consents = row.consents
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('people.guardianships.consents.title')}>
      {CONSENT_KINDS.map((kind) => {
        const entry = consents[kind]
        const date = entry.at ? entry.at.slice(0, 10) : ''
        const state = entry.granted
          ? t('people.guardianships.consents.granted', { date })
          : entry.at
            ? t('people.guardianships.consents.withdrawn', { date })
            : t('people.guardianships.consents.notGranted')
        return (
          <li key={kind}>
            <StatusBadge variant={entry.granted ? 'success' : 'neutral'}>
              {`${t(`people.guardianships.consents.${kind}`)}: ${state}`}
            </StatusBadge>
          </li>
        )
      })}
    </ul>
  )
}

type EditorState = { relation: string; isPrimaryPayer: boolean; validTo: string; consents: ConsentFlags }

function GuardianshipItem({
  row,
  counterpart,
  canManage,
  busy,
  onEnd,
  onSave,
  t,
}: {
  row: GuardianshipRow
  counterpart: PersonListRow | undefined
  canManage: boolean
  busy: boolean
  onEnd: (row: GuardianshipRow) => void
  onSave: (row: GuardianshipRow, state: EditorState) => Promise<boolean>
  t: Translate
}) {
  const [editor, setEditor] = React.useState<EditorState | null>(null)
  const status = periodStatus(row.validFrom, row.validTo, localToday())
  const counterpartId = counterpart?.id
  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          {counterpartId ? (
            <Link className="font-medium underline-offset-4 hover:underline" href={`${PERSONS_HREF}/${counterpartId}`}>
              {personName(counterpart) || t('people.common.empty')}
            </Link>
          ) : (
            <span className="font-medium">{t('people.common.empty')}</span>
          )}
          <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>{t(`people.guardianships.relation.${row.relation}`)}</span>
            <span>{periodLabel(t, row.validFrom, row.validTo)}</span>
            <StatusBadge variant={status === 'active' ? 'success' : 'neutral'}>
              {t(`people.common.${status}`)}
            </StatusBadge>
            {row.isPrimaryPayer ? (
              <StatusBadge variant="info">{t('people.guardianships.primaryPayer')}</StatusBadge>
            ) : null}
          </span>
        </div>
        {canManage && !editor ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setEditor({
                  relation: row.relation,
                  isPrimaryPayer: row.isPrimaryPayer,
                  validTo: row.validTo ?? '',
                  consents: consentFlags(row),
                })
              }}
            >
              {t('people.guardianships.actions.edit')}
            </Button>
            {status !== 'ended' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  onEnd(row)
                }}
              >
                {t('people.guardianships.actions.end')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <ConsentBadges row={row} t={t} />
      {editor ? (
        <form
          className="bg-muted/30 flex flex-col gap-3 rounded-md border p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave(row, editor).then((saved) => {
              if (saved) setEditor(null)
            })
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`relation-${row.id}`}>{t('people.guardianships.fields.relation')}</Label>
              <RelationSelect
                id={`relation-${row.id}`}
                value={editor.relation}
                onChange={(relation) => {
                  setEditor({ ...editor, relation })
                }}
                disabled={busy}
                t={t}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`valid-to-${row.id}`}>{t('people.guardianships.fields.validTo')}</Label>
              <Input
                id={`valid-to-${row.id}`}
                type="date"
                value={editor.validTo}
                disabled={busy}
                onChange={(event) => {
                  setEditor({ ...editor, validTo: event.target.value })
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`payer-${row.id}`}
              checked={editor.isPrimaryPayer}
              disabled={busy}
              onCheckedChange={(checked) => {
                setEditor({ ...editor, isPrimaryPayer: checked === true })
              }}
            />
            <Label htmlFor={`payer-${row.id}`}>{t('people.guardianships.primaryPayer')}</Label>
          </div>
          {row.consents ? (
            <ConsentCheckboxes
              idPrefix={`consent-${row.id}`}
              value={editor.consents}
              onChange={(consents) => {
                setEditor({ ...editor, consents })
              }}
              disabled={busy}
              t={t}
            />
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {t('people.common.save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setEditor(null)
              }}
            >
              {t('people.common.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  )
}

function AddGuardianship({
  personId,
  busy,
  onAdd,
  t,
}: {
  personId: string
  busy: boolean
  onAdd: (body: Record<string, unknown>) => Promise<boolean>
  t: Translate
}) {
  const [direction, setDirection] = React.useState<'guardian' | 'ward'>('guardian')
  const [otherId, setOtherId] = React.useState<string | null>(null)
  const [relation, setRelation] = React.useState<string>('parent')
  const [isPrimaryPayer, setIsPrimaryPayer] = React.useState(false)
  const [consents, setConsents] = React.useState<ConsentFlags>(NO_CONSENTS)
  const [validFrom, setValidFrom] = React.useState(localToday)

  const fetchPersons = React.useCallback(
    async (query: string): Promise<LookupSelectItem[]> => {
      const params = new URLSearchParams({ pageSize: '20' })
      if (query.trim()) params.set('lastName', query.trim())
      const data = await readApiResultOrThrow<{ items?: PersonListRow[] }>(`/api/people/persons?${params.toString()}`)
      return (data.items ?? [])
        .filter((person) => person.id !== personId)
        .map((person) => ({ id: person.id, title: personName(person), subtitle: person.birthDate }))
    },
    [personId],
  )

  const submit = async () => {
    if (!otherId) return
    const added = await onAdd({
      guardianPersonId: direction === 'guardian' ? personId : otherId,
      wardPersonId: direction === 'guardian' ? otherId : personId,
      relation,
      isPrimaryPayer,
      consents,
      validFrom,
    })
    if (added) {
      setOtherId(null)
      setIsPrimaryPayer(false)
      setConsents(NO_CONSENTS)
    }
  }

  return (
    <form
      className="flex flex-col gap-3 border-t pt-4"
      aria-label={t('people.guardianships.add.title')}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h3 className="text-sm font-semibold">{t('people.guardianships.add.title')}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="people-guardianship-direction">{t('people.guardianships.add.direction')}</Label>
          <Select
            value={direction}
            onValueChange={(value) => {
              setDirection(value === 'ward' ? 'ward' : 'guardian')
            }}
            disabled={busy}
          >
            <SelectTrigger id="people-guardianship-direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="guardian">{t('people.guardianships.add.direction.guardian')}</SelectItem>
              <SelectItem value="ward">{t('people.guardianships.add.direction.ward')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>{t('people.guardianships.fields.person')}</Label>
          <LookupSelect
            value={otherId}
            onChange={setOtherId}
            fetchItems={fetchPersons}
            minQuery={0}
            placeholder={t('people.guardianships.fields.person.placeholder')}
            searchPlaceholder={t('people.guardianships.fields.person.search')}
            emptyLabel={t('people.guardianships.fields.person.empty')}
            loadingLabel={t('people.common.loading')}
            clearLabel={t('people.common.clear')}
            selectLabel={t('people.common.select')}
            selectedLabel={t('people.common.selected')}
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="people-guardianship-relation">{t('people.guardianships.fields.relation')}</Label>
          <RelationSelect
            id="people-guardianship-relation"
            value={relation}
            onChange={setRelation}
            disabled={busy}
            t={t}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="people-guardianship-from">{t('people.guardianships.fields.validFrom')}</Label>
          <Input
            id="people-guardianship-from"
            type="date"
            value={validFrom}
            disabled={busy}
            onChange={(event) => {
              setValidFrom(event.target.value)
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="people-guardianship-payer"
          checked={isPrimaryPayer}
          disabled={busy}
          onCheckedChange={(checked) => {
            setIsPrimaryPayer(checked === true)
          }}
        />
        <Label htmlFor="people-guardianship-payer">{t('people.guardianships.primaryPayer')}</Label>
      </div>
      <ConsentCheckboxes
        idPrefix="people-guardianship-consent"
        value={consents}
        onChange={setConsents}
        disabled={busy}
        t={t}
      />
      <div>
        <Button type="submit" disabled={busy || !otherId || !validFrom}>
          {t('people.guardianships.actions.add')}
        </Button>
      </div>
    </form>
  )
}

export function GuardianshipsPanel({ personId, canManage }: { personId: string; canManage: boolean }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)

  const query = useQuery({
    queryKey: ['people-guardianships', personId],
    queryFn: async () => {
      const data = await readApiResultOrThrow<{ items?: GuardianshipRow[] }>(
        `/api/people/guardianships?personId=${encodeURIComponent(personId)}&pageSize=100&sortField=validFrom&sortDir=desc`,
      )
      const rows = data.items ?? []
      const otherIds = [
        ...new Set(rows.map((row) => (row.guardianPersonId === personId ? row.wardPersonId : row.guardianPersonId))),
      ]
      const persons =
        otherIds.length > 0
          ? ((
              await readApiResultOrThrow<{ items?: PersonListRow[] }>(
                `/api/people/persons?ids=${encodeURIComponent(otherIds.join(','))}&pageSize=100`,
              )
            ).items ?? [])
          : []
      return { rows, persons: new Map(persons.map((person) => [person.id, person])) }
    },
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['people-guardianships', personId] })
  }

  const add = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    try {
      await apiCallOrThrow(
        '/api/people/guardianships',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
        { errorMessage: t('people.guardianships.errors.add') },
      )
      flash(t('people.guardianships.flash.added'), 'success')
      return true
    } catch (error: unknown) {
      flash(errorMessage(error, t('people.guardianships.errors.add')), 'error')
      return false
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const save = async (row: GuardianshipRow, state: EditorState): Promise<boolean> => {
    setBusy(true)
    try {
      const body = {
        id: row.id,
        relation: state.relation,
        isPrimaryPayer: state.isPrimaryPayer,
        validTo: state.validTo || null,
        ...(row.consents ? { consents: state.consents } : {}),
      }
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        apiCallOrThrow(
          '/api/people/guardianships',
          { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
          { errorMessage: t('people.guardianships.errors.save') },
        ),
      )
      flash(t('people.guardianships.flash.saved'), 'success')
      return true
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorMessage(error, t('people.guardianships.errors.save')), 'error')
      }
      return false
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const end = async (row: GuardianshipRow) => {
    const confirmed = await confirm({ title: t('people.guardianships.confirm.end'), variant: 'destructive' })
    if (!confirmed) return
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        apiCallOrThrow(
          `/api/people/guardianships/${row.id}/end`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
          { errorMessage: t('people.guardianships.errors.end') },
        ),
      )
      flash(t('people.guardianships.flash.ended'), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorMessage(error, t('people.guardianships.errors.end')), 'error')
      }
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const rows = query.data?.rows ?? []
  const wards = rows.filter((row) => row.guardianPersonId === personId)
  const guardians = rows.filter((row) => row.wardPersonId === personId)
  const renderList = (title: string, list: GuardianshipRow[], counterpartOf: (row: GuardianshipRow) => string) =>
    list.length > 0 ? (
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <ul className="flex flex-col divide-y">
          {list.map((row) => (
            <GuardianshipItem
              key={row.id}
              row={row}
              counterpart={query.data?.persons.get(counterpartOf(row))}
              canManage={canManage}
              busy={busy}
              onEnd={(target) => {
                void end(target)
              }}
              onSave={save}
              t={t}
            />
          ))}
        </ul>
      </div>
    ) : null

  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('people.guardianships.title')}>
      <SectionHeader title={t('people.guardianships.title')} count={rows.length} />
      {query.isLoading ? <LoadingMessage label={t('people.common.loading')} /> : null}
      {query.error ? <ErrorMessage label={errorMessage(query.error, t('people.guardianships.errors.load'))} /> : null}
      {query.isSuccess && rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('people.guardianships.empty')}</p>
      ) : null}
      {renderList(t('people.guardianships.wards'), wards, (row) => row.wardPersonId)}
      {renderList(t('people.guardianships.guardians'), guardians, (row) => row.guardianPersonId)}
      {canManage ? <AddGuardianship personId={personId} busy={busy} onAdd={add} t={t} /> : null}
      {ConfirmDialogElement}
    </section>
  )
}
