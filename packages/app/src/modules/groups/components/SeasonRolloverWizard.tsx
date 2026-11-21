'use client'
// `/backend/groups/seasons/rollover` — "Start a new season" (people life-cycle spec REQ-L08, J-L06, B-11 Seasons tab,
// D-031 §8; phase L9, #311): a four-step wizard. 1 the old season and the new one (existing, or created by the plan);
// 2 one action per group of the old season (continue, rename, close; optionally a copy with an empty roster); 3 per
// recurring activity and fee of a continued group: end and copy (with new times or amount), end, or keep; 4 the preview
// per module with the conflicts, the announcement switch and apply. The plan lives in the page; the server previews it
// (`POST /api/groups/seasons/rollover/preview`) and applies it with the preview token in one transaction. A
// coordinator sees the groups of their sections only; fees are the club administrator's.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Notice } from '@vereino/ui'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { SEASONS_HREF, type SeasonRow, type Translate } from './client-helpers'

type LabelMap = Record<string, string | number | null>
type GroupView = { groupId: string; name: string; participants: number; ageCategoryEntryId: string | null }
type Candidate = { module: string; kind: string; recordId: string; groupId: string; label: LabelMap }
type Item = { module: string; kind: string; recordId: string | null; groupId: string; action: string; label: LabelMap }
type ConflictEntry = {
  kind?: string
  startAt?: string
  endAt?: string
  sessions?: Array<{ activityName?: string | null }>
  blocks?: Array<{ reason?: string }>
}
type Conflict = { module: string; recordId: string; label: LabelMap; conflicts: ConflictEntry[] }
type RolloverNotice = { module: string; code: string }
type Preview = {
  fromSeason: { id: string; name: string; startsOn: string; endsOn: string }
  toSeason: { id: string | null; name: string; startsOn: string; endsOn: string; created: boolean }
  lastDay: string
  groups: GroupView[]
  candidates: Candidate[]
  items: Item[]
  conflicts: Conflict[]
  notices: RolloverNotice[]
  previewToken: string
}
type Summary = {
  groups: { continued: number; renamed: number; closed: number; copied: number }
  membershipsEnded: number
  modules: Record<string, number>
  announced: number
}

type GroupAction = 'continue' | 'rename' | 'close' | 'none'
type GroupChoice = { action: GroupAction; name: string; ageCategoryEntryId: string; copyName: string }
type RecordChoice = { action: 'end_and_copy' | 'end' | 'keep'; startTime: string; endTime: string; amount: string }

const STEPS = [1, 2, 3, 4] as const
const NO_CATEGORY = '__none__'
const MODULES = ['groups', 'activities', 'payments'] as const

function addOneDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function addOneYear(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCFullYear(date.getUTCFullYear() + 1)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function money(grosz: number | string | null | undefined, locale: string): string {
  const value = typeof grosz === 'number' ? grosz : Number(grosz ?? 0)
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'PLN' }).format(value / 100)
}

/** Złoty as typed ("130", "130,50") to grosz; null when it is not a positive amount. */
function toGrosz(text: string): number | null {
  const value = Number(text.replace(',', '.').trim())
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function errorCodeOf(result: unknown): string | undefined {
  return (result as { code?: string } | null)?.code
}

function errorText(result: unknown, fallback: string): string {
  return (result as { error?: string } | null)?.error ?? fallback
}

function itemText(t: Translate, item: Item, locale: string): string {
  const label = item.label
  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(label)) params[key] = value ?? '—'
  if (item.module === 'payments') params.amount = money(label.amount, locale)
  const change = item.kind === 'group' && item.action === 'update' ? `.${String(label.change)}` : ''
  return t(`groups.rollover.item.${item.module}.${item.kind}.${item.action}${change}`, params)
}

function conflictText(t: Translate, entry: ConflictEntry): string {
  const names = [
    ...(entry.sessions ?? []).map((session) => session.activityName ?? t('groups.rollover.conflicts.unknown')),
    ...(entry.blocks ?? []).map((block) => block.reason ?? t('groups.rollover.conflicts.unknown')),
  ]
  const when = entry.startAt ? `${entry.startAt.slice(0, 10)} ${entry.startAt.slice(11, 16)}` : ''
  return t('groups.rollover.conflicts.entry', {
    when,
    kind: t(`groups.rollover.conflicts.kind.${entry.kind ?? 'place'}`),
    names: names.join(', ') || '—',
  })
}

export function SeasonRolloverWizard() {
  const t = useT()
  const locale = useLocale()
  const [step, setStep] = React.useState<(typeof STEPS)[number]>(1)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fromSeasonId, setFromSeasonId] = React.useState('')
  const [seasonMode, setSeasonMode] = React.useState<'new' | 'existing'>('new')
  const [newSeason, setNewSeason] = React.useState({ name: '', startsOn: '', endsOn: '' })
  const [existingSeasonId, setExistingSeasonId] = React.useState('')
  const [base, setBase] = React.useState<Preview | null>(null)
  const [groupChoices, setGroupChoices] = React.useState<Record<string, GroupChoice>>({})
  const [recordChoices, setRecordChoices] = React.useState<Record<string, RecordChoice>>({})
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [announce, setAnnounce] = React.useState(false)
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const headingRef = React.useRef<HTMLHeadingElement | null>(null)

  const seasons = useQuery({
    queryKey: ['groups-rollover-seasons'],
    queryFn: () =>
      fetchCrudList<SeasonRow>('groups/seasons', { page: 1, pageSize: 100, sortField: 'startsOn', sortDir: 'desc' }),
  })
  const ageCategories = useQuery({
    queryKey: ['groups-rollover-age-categories'],
    queryFn: () =>
      readApiResultOrThrow<{ items: Array<{ id: string; label: string }> }>('/api/groups/options/age-categories'),
  })
  const seasonRows = React.useMemo(() => seasons.data?.items ?? [], [seasons.data])
  const categoryOptions = ageCategories.data?.items ?? []
  // Until the user picks one, the old season is the newest that has started, and the new one starts the day after it
  // ends and lasts a year.
  const defaultFrom = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return seasonRows.find((row) => (row.startsOn ?? '') <= today) ?? seasonRows.at(0) ?? null
  }, [seasonRows])
  const fromId = fromSeasonId || defaultFrom?.id || ''
  const fromRow = seasonRows.find((row) => row.id === fromId) ?? null
  const defaultStartsOn = fromRow?.endsOn ? addOneDay(fromRow.endsOn) : ''
  const draftSeason = {
    name: newSeason.name,
    startsOn: newSeason.startsOn || defaultStartsOn,
    endsOn: newSeason.endsOn || (defaultStartsOn ? addOneYear(defaultStartsOn) : ''),
  }

  React.useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const seasonInput = seasonMode === 'existing' ? { id: existingSeasonId } : draftSeason

  const planGroups = () => {
    const rows: Array<Record<string, unknown>> = []
    for (const [groupId, choice] of Object.entries(groupChoices)) {
      const category = choice.ageCategoryEntryId === NO_CATEGORY ? undefined : choice.ageCategoryEntryId || undefined
      if (choice.action === 'continue' || choice.action === 'close') rows.push({ groupId, action: choice.action })
      if (choice.action === 'rename') {
        rows.push({
          groupId,
          action: 'rename',
          name: choice.name,
          ...(category ? { ageCategoryEntryId: category } : {}),
        })
      }
      if (choice.copyName.trim()) {
        rows.push({
          groupId,
          action: 'copy',
          name: choice.copyName,
          ...(category ? { ageCategoryEntryId: category } : {}),
        })
      }
    }
    return rows
  }

  const continuedGroups = (base?.groups ?? []).filter((group) =>
    ['continue', 'rename'].includes(groupChoices[group.groupId]?.action ?? 'none'),
  )

  const planRecords = () => {
    const continued = new Set(continuedGroups.map((group) => group.groupId))
    return (base?.candidates ?? [])
      .filter((candidate) => continued.has(candidate.groupId))
      .map((candidate) => {
        const choice = recordChoices[candidate.recordId]
        if (!choice || choice.action !== 'end_and_copy')
          return { recordId: candidate.recordId, action: choice?.action ?? 'keep' }
        const copy: Record<string, string | number> = {}
        if (candidate.module === 'activities') {
          if (choice.startTime !== candidate.label.startTime) copy.startTime = choice.startTime
          if (choice.endTime !== candidate.label.endTime) copy.endTime = choice.endTime
        } else {
          const grosz = toGrosz(choice.amount)
          if (grosz !== null && grosz !== candidate.label.amount) copy.amount = grosz
        }
        return {
          recordId: candidate.recordId,
          action: 'end_and_copy',
          ...(Object.keys(copy).length > 0 ? { copy } : {}),
        }
      })
  }

  const callPreview = async (plan: Record<string, unknown>): Promise<Preview | null> => {
    setBusy(true)
    setError(null)
    try {
      const call = await apiCall<Preview>('/api/groups/seasons/rollover/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(plan),
      })
      if (!call.ok || !call.result) {
        setError(errorText(call.result, t('groups.rollover.errors.preview')))
        return null
      }
      return call.result
    } catch {
      setError(t('groups.rollover.errors.preview'))
      return null
    } finally {
      setBusy(false)
    }
  }

  const loadGroups = async () => {
    const result = await callPreview({ fromSeasonId: fromId, season: seasonInput, groups: [], records: [] })
    if (!result) return
    setBase(result)
    setGroupChoices(
      Object.fromEntries(
        result.groups.map((group) => [
          group.groupId,
          groupChoices[group.groupId] ?? {
            action: 'continue' as const,
            name: group.name,
            ageCategoryEntryId: group.ageCategoryEntryId ?? NO_CATEGORY,
            copyName: '',
          },
        ]),
      ),
    )
    setRecordChoices(
      Object.fromEntries(
        result.candidates.map((candidate) => [
          candidate.recordId,
          recordChoices[candidate.recordId] ?? {
            action: 'end_and_copy' as const,
            startTime: String(candidate.label.startTime ?? ''),
            endTime: String(candidate.label.endTime ?? ''),
            amount: candidate.label.amount != null ? String(Number(candidate.label.amount) / 100) : '',
          },
        ]),
      ),
    )
    setStep(2)
  }

  const plan = () => ({ fromSeasonId: fromId, season: seasonInput, groups: planGroups(), records: planRecords() })

  const loadPreview = async () => {
    const result = await callPreview(plan())
    if (!result) return
    setPreview(result)
    setStep(4)
  }

  const apply = async () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const call = await apiCall<Summary>('/api/groups/seasons/rollover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...plan(), previewToken: preview.previewToken, announce }),
      })
      if (call.ok && call.result) {
        setSummary(call.result)
        flash(t('groups.rollover.flash.applied'), 'success')
        return
      }
      if (call.status === 409 && errorCodeOf(call.result) === 'rollover_plan_stale') {
        flash(t('groups.rollover.flash.stale'), 'warning')
        setBusy(false)
        await loadPreview()
        return
      }
      if (call.status === 409 && errorCodeOf(call.result) === 'rollover_conflicts') {
        const conflicts = (call.result as unknown as { conflicts?: Conflict[] }).conflicts ?? []
        setPreview({ ...preview, conflicts })
      }
      setError(errorText(call.result, t('groups.rollover.errors.apply')))
    } catch {
      setError(t('groups.rollover.errors.apply'))
    } finally {
      setBusy(false)
    }
  }

  const setGroup = (groupId: string, patch: Partial<GroupChoice>) => {
    setGroupChoices((current) => ({ ...current, [groupId]: { ...current[groupId], ...patch } }))
  }
  const setRecord = (recordId: string, patch: Partial<RecordChoice>) => {
    setRecordChoices((current) => ({ ...current, [recordId]: { ...current[recordId], ...patch } }))
  }

  const seasonReady =
    Boolean(fromId) &&
    (seasonMode === 'existing'
      ? Boolean(existingSeasonId)
      : Boolean(draftSeason.name.trim() && draftSeason.startsOn && draftSeason.endsOn))
  const groupsReady = Object.values(groupChoices).every(
    (choice) => choice.action !== 'rename' || choice.name.trim().length > 0,
  )
  const hasChanges = planGroups().length > 0

  if (summary) {
    return (
      <section className="flex flex-col gap-4" data-testid="groups-rollover-done">
        <h1 className="text-xl font-semibold" tabIndex={-1} ref={headingRef}>
          {t('groups.rollover.done.title')}
        </h1>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{t('groups.rollover.done.groups', summary.groups)}</li>
          <li>{t('groups.rollover.done.memberships', { count: summary.membershipsEnded })}</li>
          <li>{t('groups.rollover.done.activities', { count: summary.modules.activities ?? 0 })}</li>
          <li>{t('groups.rollover.done.fees', { count: summary.modules.payments ?? 0 })}</li>
          {announce ? <li>{t('groups.rollover.done.announced', { count: summary.announced })}</li> : null}
        </ul>
        <div>
          <Button asChild>
            <Link href={SEASONS_HREF}>{t('groups.seasons.actions.back')}</Link>
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4" data-testid="groups-rollover">
      <h1 className="text-xl font-semibold" tabIndex={-1} ref={headingRef}>
        {t('groups.rollover.title')}
      </h1>
      <ol className="flex flex-wrap gap-2 text-sm" aria-label={t('groups.rollover.steps.label')}>
        {STEPS.map((index) => (
          <li
            key={index}
            aria-current={index === step ? 'step' : undefined}
            className={`rounded-md border px-2 py-1 ${index === step ? 'border-primary font-semibold' : 'text-muted-foreground'}`}
          >
            {t(`groups.rollover.steps.${String(index)}`)}
          </li>
        ))}
      </ol>
      {error ? (
        <Alert style="light" status="error" data-testid="groups-rollover-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (seasonReady && !busy) void loadGroups()
          }}
        >
          {seasons.isLoading ? <p className="text-muted-foreground text-sm">{t('groups.rollover.loading')}</p> : null}
          {!seasons.isLoading && seasonRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('groups.rollover.noSeasons')}</p>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="groups-rollover-from">{t('groups.rollover.fields.fromSeason')}</Label>
            <Select value={fromId} onValueChange={setFromSeasonId} disabled={busy}>
              <SelectTrigger id="groups-rollover-from">
                <SelectValue placeholder={t('groups.rollover.fields.choose')} />
              </SelectTrigger>
              <SelectContent>
                {seasonRows.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('groups.rollover.fields.toSeason')}</legend>
            <div className="flex flex-wrap gap-2">
              {(['new', 'existing'] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={seasonMode === mode ? 'default' : 'outline'}
                  aria-pressed={seasonMode === mode}
                  onClick={() => {
                    setSeasonMode(mode)
                  }}
                >
                  {t(`groups.rollover.seasonMode.${mode}`)}
                </Button>
              ))}
            </div>
            {seasonMode === 'existing' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="groups-rollover-to">{t('groups.rollover.fields.existingSeason')}</Label>
                <Select value={existingSeasonId} onValueChange={setExistingSeasonId} disabled={busy}>
                  <SelectTrigger id="groups-rollover-to">
                    <SelectValue placeholder={t('groups.rollover.fields.choose')} />
                  </SelectTrigger>
                  <SelectContent>
                    {seasonRows
                      .filter((row) => row.id !== fromId)
                      .map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="groups-rollover-name">{t('groups.seasons.fields.name')}</Label>
                  <Input
                    id="groups-rollover-name"
                    value={newSeason.name}
                    disabled={busy}
                    onChange={(event) => {
                      setNewSeason((current) => ({ ...current, name: event.target.value }))
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="groups-rollover-starts">{t('groups.seasons.fields.startsOn')}</Label>
                  <Input
                    id="groups-rollover-starts"
                    type="date"
                    value={draftSeason.startsOn}
                    disabled={busy}
                    onChange={(event) => {
                      setNewSeason({ ...draftSeason, startsOn: event.target.value })
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="groups-rollover-ends">{t('groups.seasons.fields.endsOn')}</Label>
                  <Input
                    id="groups-rollover-ends"
                    type="date"
                    value={draftSeason.endsOn}
                    disabled={busy}
                    onChange={(event) => {
                      setNewSeason({ ...draftSeason, endsOn: event.target.value })
                    }}
                  />
                </div>
              </div>
            )}
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={!seasonReady || busy} data-testid="groups-rollover-next-1">
              {t('groups.rollover.actions.next')}
            </Button>
            <Button asChild variant="outline">
              <Link href={SEASONS_HREF}>{t('groups.rollover.actions.cancel')}</Link>
            </Button>
          </div>
        </form>
      ) : null}

      {step === 2 && base ? (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            {t('groups.rollover.groups.help', { from: base.fromSeason.name, lastDay: base.lastDay })}
          </p>
          <p className="text-muted-foreground text-sm">{t('groups.rollover.groups.scopeNote')}</p>
          {base.groups.length === 0 ? (
            <p className="text-sm" data-testid="groups-rollover-no-groups">
              {t('groups.rollover.groups.empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {base.groups.map((group) => {
                const choice = groupChoices[group.groupId]
                if (!choice) return null
                return (
                  <li
                    key={group.groupId}
                    className="flex flex-col gap-2 rounded-md border p-3"
                    data-testid="groups-rollover-group"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium break-words">{group.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {t('groups.rollover.groups.participants', { count: group.participants })}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`groups-rollover-action-${group.groupId}`}>
                          {t('groups.rollover.fields.action')}
                        </Label>
                        <Select
                          value={choice.action}
                          onValueChange={(value) => {
                            setGroup(group.groupId, { action: value as GroupAction })
                          }}
                        >
                          <SelectTrigger id={`groups-rollover-action-${group.groupId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['continue', 'rename', 'close', 'none'] as const).map((action) => (
                              <SelectItem key={action} value={action}>
                                {t(`groups.rollover.groupAction.${action}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {choice.action === 'rename' ? (
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`groups-rollover-name-${group.groupId}`}>
                            {t('groups.rollover.fields.newName')}
                          </Label>
                          <Input
                            id={`groups-rollover-name-${group.groupId}`}
                            value={choice.name}
                            onChange={(event) => {
                              setGroup(group.groupId, { name: event.target.value })
                            }}
                          />
                        </div>
                      ) : null}
                      {choice.action === 'rename' || choice.copyName.trim() ? (
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`groups-rollover-category-${group.groupId}`}>
                            {t('groups.rollover.fields.ageCategory')}
                          </Label>
                          <Select
                            value={choice.ageCategoryEntryId || NO_CATEGORY}
                            onValueChange={(value) => {
                              setGroup(group.groupId, { ageCategoryEntryId: value })
                            }}
                          >
                            <SelectTrigger id={`groups-rollover-category-${group.groupId}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_CATEGORY}>
                                {t('groups.rollover.fields.ageCategory.keep')}
                              </SelectItem>
                              {categoryOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                    {choice.action === 'close' ? (
                      <p className="text-muted-foreground text-xs">
                        {t('groups.rollover.groups.closeHelp', { lastDay: base.lastDay })}
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-1 sm:max-w-sm">
                      <Label htmlFor={`groups-rollover-copy-${group.groupId}`}>
                        {t('groups.rollover.fields.copyName')}
                      </Label>
                      <Input
                        id={`groups-rollover-copy-${group.groupId}`}
                        value={choice.copyName}
                        placeholder={t('groups.rollover.fields.copyName.placeholder')}
                        onChange={(event) => {
                          setGroup(group.groupId, { copyName: event.target.value })
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep(1)
              }}
            >
              {t('groups.rollover.actions.back')}
            </Button>
            <Button
              type="button"
              disabled={!groupsReady || !hasChanges}
              data-testid="groups-rollover-next-2"
              onClick={() => {
                setStep(3)
              }}
            >
              {t('groups.rollover.actions.next')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && base ? (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            {t('groups.rollover.records.help', { lastDay: base.lastDay })}
          </p>
          {continuedGroups.every((group) => !base.candidates.some((c) => c.groupId === group.groupId)) ? (
            <p className="text-sm">{t('groups.rollover.records.empty')}</p>
          ) : null}
          {continuedGroups.map((group) => {
            const records = base.candidates.filter((candidate) => candidate.groupId === group.groupId)
            if (records.length === 0) return null
            return (
              <fieldset key={group.groupId} className="flex flex-col gap-2 rounded-md border p-3">
                <legend className="px-1 font-medium">{group.name}</legend>
                {records.map((candidate) => {
                  const choice = recordChoices[candidate.recordId]
                  if (!choice) return null
                  const isFee = candidate.module === 'payments'
                  return (
                    <div
                      key={candidate.recordId}
                      className="flex flex-col gap-2 border-t pt-2 first:border-t-0 first:pt-0"
                    >
                      <span className="text-sm break-words">
                        {isFee
                          ? t('groups.rollover.records.fee', {
                              name: String(candidate.label.name),
                              amount: money(candidate.label.amount, locale),
                            })
                          : t('groups.rollover.records.activity', {
                              name: String(candidate.label.name),
                              time: `${String(candidate.label.startTime)}–${String(candidate.label.endTime)}`,
                              place: String(candidate.label.placeName ?? '—'),
                            })}
                      </span>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`groups-rollover-record-${candidate.recordId}`}>
                            {t('groups.rollover.fields.action')}
                          </Label>
                          <Select
                            value={choice.action}
                            onValueChange={(value) => {
                              setRecord(candidate.recordId, { action: value as RecordChoice['action'] })
                            }}
                          >
                            <SelectTrigger id={`groups-rollover-record-${candidate.recordId}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['end_and_copy', 'end', 'keep'] as const).map((action) => (
                                <SelectItem key={action} value={action}>
                                  {t(`groups.rollover.recordAction.${action}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {choice.action === 'end_and_copy' && !isFee ? (
                          <>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor={`groups-rollover-start-${candidate.recordId}`}>
                                {t('groups.rollover.fields.startTime')}
                              </Label>
                              <Input
                                id={`groups-rollover-start-${candidate.recordId}`}
                                type="time"
                                value={choice.startTime}
                                onChange={(event) => {
                                  setRecord(candidate.recordId, { startTime: event.target.value })
                                }}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor={`groups-rollover-end-${candidate.recordId}`}>
                                {t('groups.rollover.fields.endTime')}
                              </Label>
                              <Input
                                id={`groups-rollover-end-${candidate.recordId}`}
                                type="time"
                                value={choice.endTime}
                                onChange={(event) => {
                                  setRecord(candidate.recordId, { endTime: event.target.value })
                                }}
                              />
                            </div>
                          </>
                        ) : null}
                        {choice.action === 'end_and_copy' && isFee ? (
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`groups-rollover-amount-${candidate.recordId}`}>
                              {t('groups.rollover.fields.amount')}
                            </Label>
                            <Input
                              id={`groups-rollover-amount-${candidate.recordId}`}
                              inputMode="decimal"
                              value={choice.amount}
                              onChange={(event) => {
                                setRecord(candidate.recordId, { amount: event.target.value })
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </fieldset>
            )
          })}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setStep(2)
              }}
            >
              {t('groups.rollover.actions.back')}
            </Button>
            <Button
              type="button"
              disabled={busy}
              data-testid="groups-rollover-next-3"
              onClick={() => {
                void loadPreview()
              }}
            >
              {t('groups.rollover.actions.preview')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 4 && preview ? (
        <div className="flex flex-col gap-4" data-testid="groups-rollover-preview">
          <p className="text-muted-foreground text-sm">
            {t('groups.rollover.preview.help', {
              from: preview.fromSeason.name,
              to: preview.toSeason.name,
              lastDay: preview.lastDay,
            })}
          </p>
          {preview.notices.map((notice) => (
            <Notice key={`${notice.module}:${notice.code}`}>
              <AlertDescription>{t(`groups.rollover.notice.${notice.code}`)}</AlertDescription>
            </Notice>
          ))}
          {preview.conflicts.length > 0 ? (
            <Alert style="light" status="error" data-testid="groups-rollover-conflicts">
              <AlertTitle>{t('groups.rollover.conflicts.title')}</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span>{t('groups.rollover.conflicts.help')}</span>
                <ul className="flex flex-col gap-1">
                  {preview.conflicts.map((conflict) => (
                    <li key={conflict.recordId} className="flex flex-col gap-1">
                      <span className="font-medium break-words">
                        {t('groups.rollover.conflicts.copy', {
                          name: String(conflict.label.name),
                          time: `${String(conflict.label.startTime)}–${String(conflict.label.endTime)}`,
                        })}
                      </span>
                      <ul className="flex flex-col gap-1 pl-4">
                        {conflict.conflicts.map((entry, index) => (
                          <li key={index} className="break-words">
                            {conflictText(t, entry)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {MODULES.map((module) => {
            const items = preview.items.filter((item) => item.module === module)
            if (items.length === 0) return null
            return (
              <section key={module} className="flex flex-col gap-1 rounded-md border p-3">
                <h2 className="text-sm font-semibold">{t(`groups.rollover.preview.module.${module}`)}</h2>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  {items.map((item, index) => (
                    <li key={`${item.kind}:${item.recordId ?? 'new'}:${String(index)}`} className="break-words">
                      {itemText(t, item, locale)}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          <div className="flex items-center gap-2">
            <Checkbox
              id="groups-rollover-announce"
              checked={announce}
              onCheckedChange={(checked) => {
                setAnnounce(checked === true)
              }}
            />
            <Label htmlFor="groups-rollover-announce">{t('groups.rollover.fields.announce')}</Label>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setStep(3)
              }}
            >
              {t('groups.rollover.actions.back')}
            </Button>
            <Button
              type="button"
              disabled={busy || preview.conflicts.length > 0}
              data-testid="groups-rollover-apply"
              onClick={() => {
                void apply()
              }}
            >
              {t('groups.rollover.actions.apply')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
