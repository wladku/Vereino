'use client'
// "Move to another group" for several children (people life-cycle spec REQ-L15, J-L09, *Roster: moving children*;
// #383): the target group (an active group other than this one; the server keeps it within the caller's sections), the
// first day there (default the 1st of the next month, never in the past) and the roster's active participants as a
// checklist, ticked from the table's selection. Once a target is chosen the chip **Fits {group}** ticks the children
// the preview's `fitRule` matches: a team with a ranged age category by birth year in its season (AC-L16, DD-L17),
// any other group by age on that day within its range. The preview (`dryRun`) lists per child whether it moves or is
// skipped and why, the declarations that will be dropped and the fee note; **Move {n}** previews the ticked children
// once more, applies with that preview's token and refreshes with a notice when anything changed in between (409
// `move_preview_stale`). On the phone roster the same form opens as a full-screen sheet with the button at the bottom.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag } from '@vereino/ui'
import { MOVE_MANY_LIMIT, formatBirthYears, moveDateBounds, type FitRule, type MoveOutcome } from '../lib/groups-rules'
import { personName, type GroupRow, type MembershipRow, type Translate } from './client-helpers'
import { FormFrame, buttonClass, type FormSurface } from './MembershipDialogs'

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/
const MOVE_MANY_URL = '/api/groups/memberships/move-many'

type PreviewItem = {
  membershipId: string
  personId: string
  person: { firstName: string; lastName: string } | null
  outcome: MoveOutcome
  futureDeclarations: number
  feeNote: 'month_charged_once' | null
  fitsTarget: boolean | null
}

type Preview = {
  items: PreviewItem[]
  moved: number
  skipped: number
  futureDeclarations: number
  fitRule: FitRule | null
  previewToken: string
}

type Target = { id: string; name: string; ageFrom: number | null; ageTo: number | null; categorized: boolean }

export type MoveChildrenResult = { moved: number; skipped: number; undoToken: string | null }

type ApiBody = { code?: string; error?: string }

function codeOf(result: unknown): string | undefined {
  return (result as ApiBody | null)?.code
}

function errorOf(result: unknown, fallback: string): string {
  return (result as ApiBody | null)?.error ?? fallback
}

/**
 * The chip's label: the team with its birth years, e.g. "Fits Orliki (born 2016–2017)", or the group with its age
 * range, e.g. "Fits Skrzaty (6–7 years)".
 */
function fitsLabel(t: Translate, group: string, rule: FitRule): string {
  if (rule.kind === 'birth_years') {
    return t('groups.memberships.moveMany.fits.birthYears', { group, years: formatBirthYears(rule) })
  }
  if (rule.ageFrom !== null && rule.ageTo !== null) {
    return t('groups.memberships.moveMany.fits.range', { group, from: rule.ageFrom, to: rule.ageTo })
  }
  if (rule.ageFrom !== null) return t('groups.memberships.moveMany.fits.from', { group, from: rule.ageFrom })
  return t('groups.memberships.moveMany.fits.to', { group, to: rule.ageTo ?? 0 })
}

/**
 * The rule the chip shows: the preview's once it is loaded; before that the target's age range, unless the target is a
 * team with an age category (its birth years come with the preview).
 */
function chipRule(target: Target | null, preview: Preview | undefined): FitRule | null {
  if (!target) return null
  if (preview) return preview.fitRule
  if (target.categorized || (target.ageFrom === null && target.ageTo === null)) return null
  return { kind: 'age', ageFrom: target.ageFrom, ageTo: target.ageTo }
}

/** One POST of the bulk move; the parsed body and the status, never a throw for a coded refusal. */
async function postMoveMany(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; result: unknown }> {
  const call = await apiCall<unknown>(MOVE_MANY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { ok: call.ok, status: call.status, result: call.result }
}

/** Sends the undo token of a bulk move to the same route (the success toast's **Undo**). */
export async function undoMoveChildren(undoToken: string): Promise<boolean> {
  const call = await postMoveMany({ undoToken })
  return call.ok
}

export type MoveChildrenDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `dialog` on the panel, `sheet` (full screen) on the phone roster. */
  surface?: FormSurface
  groupId: string
  today: string
  /** The memberships ticked when the dialog opens (the table's selection). */
  initialSelectedIds: readonly string[]
  onMoved: (result: MoveChildrenResult) => void | Promise<void>
}

export function MoveChildrenDialog({
  open,
  onOpenChange,
  surface = 'dialog',
  groupId,
  today,
  initialSelectedIds,
  onMoved,
}: MoveChildrenDialogProps) {
  const t = useT()
  const ids = React.useId()
  const bounds = moveDateBounds(today, null)
  const [target, setTarget] = React.useState<Target | null>(null)
  const [date, setDate] = React.useState(bounds.initial)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(initialSelectedIds))
  const [fitsOnly, setFitsOnly] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [staleNotice, setStaleNotice] = React.useState(false)
  const groupsById = React.useRef(new Map<string, GroupRow>())
  const dateValid = CALENDAR_DATE.test(date) && date >= bounds.min

  // The roster's active participants (coaches and assistants move one by one with "Move…", Q-L23).
  const candidates = useQuery({
    queryKey: ['groups-move-many-candidates', groupId],
    enabled: open,
    queryFn: () =>
      fetchCrudList<MembershipRow>('groups/memberships', {
        groupId,
        status: 'active',
        role: 'participant',
        sortField: 'roster',
        page: 1,
        pageSize: MOVE_MANY_LIMIT,
      }),
  })
  const children = React.useMemo(
    () => [...(candidates.data?.items ?? [])].sort((a, b) => personName(a.person).localeCompare(personName(b.person))),
    [candidates.data],
  )
  const candidateIds = React.useMemo(() => children.map((row) => row.id), [children])

  // The preview of every candidate on the chosen target and day: per child the outcome, the declarations and the fit.
  const preview = useQuery({
    queryKey: ['groups-move-many-preview', groupId, target?.id ?? null, date, candidateIds.join(',')],
    enabled: open && Boolean(target) && dateValid && candidateIds.length > 0,
    retry: false,
    queryFn: async () => {
      const call = await postMoveMany({
        fromGroupId: groupId,
        toGroupId: target?.id,
        date,
        membershipIds: candidateIds,
        dryRun: true,
      })
      if (!call.ok || !call.result)
        throw new Error(errorOf(call.result, t('groups.memberships.moveMany.errors.preview')))
      return call.result as Preview
    },
  })
  const byId = React.useMemo(
    () => new Map((preview.data?.items ?? []).map((item) => [item.membershipId, item])),
    [preview.data],
  )
  // **Fits {group}** ticks the movable children who fit the target by the preview's rule, in step with a new day; a
  // tick or an untick afterwards starts from that selection.
  const effective = React.useMemo(
    () =>
      fitsOnly && preview.data
        ? new Set(
            preview.data.items
              .filter((item) => item.fitsTarget === true && item.outcome === 'move')
              .map((item) => item.membershipId),
          )
        : selected,
    [fitsOnly, preview.data, selected],
  )
  const ticked = children.filter((row) => effective.has(row.id))
  const tickedItems = ticked.map((row) => byId.get(row.id)).filter((item): item is PreviewItem => Boolean(item))
  const moving = tickedItems.filter((item) => item.outcome === 'move')
  const skipping = tickedItems.filter((item) => item.outcome !== 'move')
  const declarations = moving.reduce((sum, item) => sum + item.futureDeclarations, 0)
  const rule = chipRule(target, preview.data)
  const previewReady = Boolean(preview.data) && !preview.isFetching

  const fetchGroups = React.useCallback(
    async (search: string): Promise<LookupSelectItem[]> => {
      const params: Record<string, string | number | boolean> = { isActive: true, pageSize: 50, sortField: 'name' }
      if (search.trim().length >= 2) params.search = search.trim()
      const data = await fetchCrudList<GroupRow>('groups/groups', params)
      return data.items
        .filter((group) => group.id !== groupId)
        .map((group) => {
          groupsById.current.set(group.id, group)
          return { id: group.id, title: group.name ?? group.id, subtitle: group.sectionName ?? null }
        })
    },
    [groupId],
  )

  const chooseTarget = (id: string | null) => {
    const row = id ? groupsById.current.get(id) : undefined
    setTarget(
      row
        ? {
            id: row.id,
            name: row.name ?? row.id,
            ageFrom: row.ageFrom ?? null,
            ageTo: row.ageTo ?? null,
            categorized: row.kind === 'team' && Boolean(row.ageCategoryEntryId),
          }
        : null,
    )
    setFitsOnly(false)
    setStaleNotice(false)
    setProblem(null)
  }

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(effective)
    if (checked) next.add(id)
    else next.delete(id)
    setFitsOnly(false)
    setSelected(next)
  }

  const refreshStale = async () => {
    setStaleNotice(true)
    await preview.refetch()
  }

  const submit = async () => {
    if (pending || !target || !dateValid || moving.length === 0) return
    setPending(true)
    setProblem(null)
    setStaleNotice(false)
    try {
      const request = {
        fromGroupId: groupId,
        toGroupId: target.id,
        date,
        membershipIds: tickedItems.map((item) => item.membershipId),
      }
      // The ticked children's own preview: its token confirms exactly what the list shows.
      const confirm = await postMoveMany({ ...request, dryRun: true })
      if (!confirm.ok || !confirm.result) {
        setProblem(errorOf(confirm.result, t('groups.memberships.moveMany.errors.preview')))
        return
      }
      const confirmed = confirm.result as Preview
      const shown = new Map(tickedItems.map((item) => [item.membershipId, item]))
      const changed = confirmed.items.some((item) => {
        const before = shown.get(item.membershipId)
        return !before || before.outcome !== item.outcome || before.futureDeclarations !== item.futureDeclarations
      })
      if (changed) {
        await refreshStale()
        return
      }
      const applied = await postMoveMany({ ...request, previewToken: confirmed.previewToken })
      if (applied.ok && applied.result) {
        onOpenChange(false)
        await onMoved(applied.result as MoveChildrenResult)
        return
      }
      if (applied.status === 409 && codeOf(applied.result) === 'move_preview_stale') {
        await refreshStale()
        return
      }
      setProblem(errorOf(applied.result, t('groups.memberships.moveMany.errors.apply')))
    } catch {
      setProblem(t('groups.memberships.moveMany.errors.apply'))
    } finally {
      setPending(false)
    }
  }

  const outcomeText = (item: PreviewItem | undefined): string | null => {
    if (!item || !target) return null
    if (item.outcome === 'skip_already_member') {
      return t('groups.memberships.moveMany.outcome.skip_already_member', { group: target.name })
    }
    if (item.outcome === 'skip_not_active') return t('groups.memberships.moveMany.outcome.skip_not_active')
    return item.futureDeclarations > 0
      ? t('groups.memberships.moveMany.declarations', { count: item.futureDeclarations })
      : null
  }

  const moveDisabled = pending || !target || !dateValid || !previewReady || moving.length === 0
  const footer = (
    <>
      <Button
        type="button"
        variant="outline"
        className={buttonClass(surface)}
        disabled={pending}
        onClick={() => {
          onOpenChange(false)
        }}
      >
        {t('groups.common.cancel')}
      </Button>
      <Button
        type="button"
        className={buttonClass(surface)}
        disabled={moveDisabled}
        data-testid="groups-move-many-save"
        onClick={() => {
          void submit()
        }}
      >
        {t('groups.memberships.moveMany.submit', { count: moving.length })}
      </Button>
    </>
  )

  return (
    <FormFrame
      surface={surface}
      open={open}
      onOpenChange={onOpenChange}
      testId="groups-move-many-dialog"
      title={t('groups.memberships.moveMany.title')}
      description={t('groups.memberships.moveMany.help')}
      onSubmitShortcut={() => void submit()}
      footer={footer}
      fullScreen
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div
            className="flex min-w-0 flex-1 flex-col gap-1"
            role="group"
            aria-labelledby={`${ids}-group`}
            data-testid="groups-move-many-group"
          >
            <Label id={`${ids}-group`}>{t('groups.memberships.move.group')}</Label>
            <LookupSelect
              value={target?.id ?? null}
              onChange={chooseTarget}
              fetchItems={fetchGroups}
              minQuery={0}
              placeholder={t('groups.memberships.move.group.placeholder')}
              searchPlaceholder={t('groups.memberships.move.group.search')}
              emptyLabel={t('groups.memberships.move.group.empty')}
              loadingLabel={t('groups.common.loading')}
              clearLabel={t('groups.common.clear')}
              selectLabel={t('groups.common.select')}
              selectedLabel={t('groups.common.selected')}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-date`}>{t('groups.memberships.move.date')}</Label>
            <Input
              id={`${ids}-date`}
              type="date"
              className="min-h-11 sm:w-48"
              required
              min={bounds.min}
              value={date}
              disabled={pending}
              aria-invalid={dateValid ? undefined : true}
              data-testid="groups-move-many-date"
              onChange={(event) => {
                setDate(event.target.value)
                setStaleNotice(false)
              }}
            />
            {dateValid ? null : (
              <p className="text-destructive text-sm" role="alert">
                {t('groups.memberships.errors.dates')}
              </p>
            )}
          </div>
        </div>

        {staleNotice ? (
          <Alert style="light" status="warning" data-testid="groups-move-many-stale">
            <AlertDescription>{t('groups.memberships.moveMany.stale')}</AlertDescription>
          </Alert>
        ) : null}

        <fieldset className="flex flex-col gap-2" aria-describedby={`${ids}-hint`}>
          <legend className="text-sm font-medium">
            {t('groups.memberships.moveMany.children', { count: ticked.length, total: children.length })}
          </legend>
          {target && rule ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={fitsOnly ? 'default' : 'outline'}
                className="min-h-11 rounded-full"
                aria-pressed={fitsOnly}
                disabled={pending || !previewReady}
                data-testid="groups-move-many-fits"
                onClick={() => {
                  setSelected(effective)
                  setFitsOnly(!fitsOnly)
                }}
              >
                {fitsLabel(t, target.name, rule)}
              </Button>
            </div>
          ) : null}
          <p id={`${ids}-hint`} className="text-muted-foreground text-sm" data-testid="groups-move-many-hint">
            {ticked.length === 0
              ? t('groups.memberships.moveMany.nothingSelected')
              : !target
                ? t('groups.memberships.move.groupRequired')
                : t('groups.memberships.moveMany.tickHint')}
          </p>
          {candidates.isLoading ? (
            <p className="text-muted-foreground text-sm">{t('groups.common.loading')}</p>
          ) : candidates.error ? (
            <p className="text-destructive text-sm" role="alert">
              {t('groups.memberships.errors.load')}
            </p>
          ) : children.length === 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="groups-move-many-empty">
              {t('groups.memberships.moveMany.noChildren')}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border" data-testid="groups-move-many-children">
              {children.map((row) => {
                const item = byId.get(row.id)
                const note = outcomeText(item)
                const checkboxId = `${ids}-child-${row.id}`
                return (
                  <li
                    key={row.id}
                    className="flex min-h-11 items-center gap-3 px-3 py-2"
                    data-testid={`groups-move-many-child-${row.id}`}
                    data-outcome={item?.outcome ?? ''}
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={effective.has(row.id)}
                      disabled={pending}
                      onCheckedChange={(checked) => {
                        toggle(row.id, checked === true)
                      }}
                    />
                    <Label htmlFor={checkboxId} className="flex min-w-0 flex-1 flex-col gap-0.5 font-normal">
                      <span className="font-medium">
                        {personName(row.person) || t('groups.memberships.unknownPerson')}
                        {typeof row.person?.age === 'number'
                          ? ` · ${t('groups.memberships.moveMany.age', { age: row.person.age })}`
                          : ''}
                      </span>
                      {note ? <span className="text-muted-foreground text-sm">{note}</span> : null}
                    </Label>
                    {item?.fitsTarget === true && target ? (
                      <StatusTag status="success">{t('groups.memberships.moveMany.fitsTag')}</StatusTag>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>

        {target && dateValid && ticked.length > 0 ? (
          <section
            className="flex flex-col gap-2 rounded-md border p-3"
            aria-live="polite"
            data-testid="groups-move-many-preview"
          >
            <h3 className="text-sm font-medium">{t('groups.memberships.moveMany.preview.title')}</h3>
            {preview.isFetching && !preview.data ? (
              <p className="text-muted-foreground text-sm">{t('groups.memberships.moveMany.preview.loading')}</p>
            ) : preview.error ? (
              <p className="text-destructive text-sm" role="alert" data-testid="groups-move-many-preview-error">
                {preview.error instanceof Error
                  ? preview.error.message
                  : t('groups.memberships.moveMany.errors.preview')}
              </p>
            ) : (
              <>
                <p className="text-sm" data-testid="groups-move-many-summary">
                  {t('groups.memberships.moveMany.preview.summary', {
                    moved: moving.length,
                    skipped: skipping.length,
                    group: target.name,
                    date,
                  })}
                </p>
                {declarations > 0 ? (
                  <p className="text-sm">
                    {t('groups.memberships.moveMany.preview.declarations', { count: declarations })}
                  </p>
                ) : null}
                {moving.length > 0 ? (
                  <p className="text-muted-foreground text-sm">{t('groups.memberships.moveMany.preview.fee')}</p>
                ) : null}
                {skipping.length > 0 ? (
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="groups-move-many-skips">
                    {skipping.map((item) => (
                      <li key={item.membershipId}>
                        {t('groups.memberships.moveMany.preview.skip', {
                          name: personName(item.person) || t('groups.memberships.unknownPerson'),
                          reason: outcomeText(item) ?? '',
                        })}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {moving.length === 0 ? (
                  <p className="text-muted-foreground text-sm" data-testid="groups-move-many-nothing">
                    {t('groups.memberships.moveMany.preview.nothingMovable')}
                  </p>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {problem ? (
          <p className="text-destructive text-sm" role="alert" data-testid="groups-move-many-problem">
            {problem}
          </p>
        ) : null}
      </div>
    </FormFrame>
  )
}

/**
 * The success notice of a bulk move with **Undo** (REQ-L15): stays until dismissed or undone. The undo goes through the
 * move route, so a coordinator can undo their own move.
 */
export function MoveChildrenNotice({
  result,
  onDismiss,
  onUndone,
}: {
  result: MoveChildrenResult
  onDismiss: () => void
  onUndone: () => void | Promise<void>
}) {
  const t = useT()
  const [pending, setPending] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const undo = async () => {
    if (!result.undoToken || pending) return
    setPending(true)
    setFailed(false)
    try {
      if (await undoMoveChildren(result.undoToken)) await onUndone()
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <Alert style="light" status={failed ? 'error' : 'success'} data-testid="groups-move-many-notice">
      <AlertDescription>
        <span className="flex flex-wrap items-center gap-2">
          <span role="status">
            {failed
              ? t('groups.memberships.moveMany.undoFailed')
              : t('groups.memberships.moveMany.moved', { moved: result.moved, skipped: result.skipped })}
          </span>
          {result.undoToken ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              data-testid="groups-move-many-undo"
              onClick={() => {
                void undo()
              }}
            >
              {t('groups.memberships.moveMany.undo')}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={onDismiss}>
            {t('groups.common.close')}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  )
}
