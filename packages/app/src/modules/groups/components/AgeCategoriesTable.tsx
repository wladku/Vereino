'use client'
// `/backend/groups/age-categories` — the "Age categories" tab of the groups list (people life-cycle spec REQ-L16,
// B-11 row of *Groups: age categories*, J-L10; #384): the club's categories in the dictionary's order with their PZPN
// "U" ranges and the birth years for a chosen season (default: the season of today). The club administrator
// (`dictionaries.manage`) edits a range in its row, adds a category with its range in one dialog, and reaches the
// platform dictionary page for renaming, reordering and deleting; everyone else reads the tab.
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { ageCategoryRangeInverted, formatBirthYears, parseUInput, type BirthYears } from '../lib/groups-rules'
import { GroupsNav } from './GroupsNav'
import { DICTIONARIES_HREF, errorMessage, seasonOptions, type TableColumns, type Translate } from './client-helpers'
import { useHasFeature } from './useCanManageGroups'

export const AGE_CATEGORIES_URL = '/api/groups/age-categories'

export type AgeCategoryRangeRow = {
  entryId: string
  value: string
  label: string
  uFrom: number | null
  uTo: number | null
  birthYears: BirthYears | null
  updatedAt: string | null
}

export type AgeCategoryRangeList = {
  items: AgeCategoryRangeRow[]
  referenceYear: number
  season: { id: string; name: string; startsOn: string } | null
}

/** `GET /api/groups/age-categories[?seasonId=]`: the categories, their ranges and the season's birth years. */
export function fetchAgeCategoryRanges(seasonId: string | null): Promise<AgeCategoryRangeList> {
  const query = seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : ''
  return readApiResultOrThrow<AgeCategoryRangeList>(`${AGE_CATEGORIES_URL}${query}`)
}

/** The typed range, or the field error to show (`invalid` per field, an inverted pair on "U do"). */
function readRange(
  t: Translate,
  uFromText: string,
  uToText: string,
): { ok: true; uFrom: number; uTo: number | null } | { ok: false; field: 'uFrom' | 'uTo'; message: string } {
  const uFrom = parseUInput(uFromText)
  const uTo = parseUInput(uToText)
  if (uFrom === null || uFrom === 'invalid') {
    return { ok: false, field: 'uFrom', message: t('groups.ageCategories.errors.uYear') }
  }
  if (uTo === 'invalid') return { ok: false, field: 'uTo', message: t('groups.ageCategories.errors.uYear') }
  if (ageCategoryRangeInverted({ uFrom, uTo })) {
    return { ok: false, field: 'uTo', message: t('groups.errors.age_range_inverted') }
  }
  return { ok: true, uFrom, uTo }
}

function RangeText({ row }: { row: AgeCategoryRangeRow }) {
  const t = useT()
  if (row.uFrom === null) return <span className="text-muted-foreground">{t('groups.ageCategories.noRange')}</span>
  return (
    <span>
      {row.uTo === null
        ? t('groups.ageCategories.rangeOpen', { from: row.uFrom })
        : t('groups.ageCategories.range', { from: row.uFrom, to: row.uTo })}
    </span>
  )
}

/** The inline editor of one row: "U od", "U do" (blank = open) and Save; the server answers 422 or 409. */
function RangeEditor({ row, onSaved }: { row: AgeCategoryRangeRow; onSaved: () => Promise<void> }) {
  const t = useT()
  const [uFrom, setUFrom] = React.useState(row.uFrom === null ? '' : String(row.uFrom))
  const [uTo, setUTo] = React.useState(row.uTo === null ? '' : String(row.uTo))
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const dirty =
    uFrom !== (row.uFrom === null ? '' : String(row.uFrom)) || uTo !== (row.uTo === null ? '' : String(row.uTo))
  const errorId = `age-range-error-${row.entryId}`

  const save = async () => {
    const range = readRange(t, uFrom, uTo)
    if (!range.ok) {
      setError(range.message)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await apiCallOrThrow(`${AGE_CATEGORIES_URL}/${encodeURIComponent(row.entryId)}/range`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uFrom: range.uFrom, uTo: range.uTo, updatedAt: row.updatedAt }),
      })
      flash(t('groups.ageCategories.flash.saved', { name: row.label }), 'success')
      await onSaved()
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) setError(errorMessage(err, t('groups.ageCategories.errors.save')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid={`age-range-editor-${row.value}`}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`age-u-from-${row.entryId}`} className="text-xs">
          {t('groups.ageCategories.columns.uFrom')}
        </Label>
        <Input
          id={`age-u-from-${row.entryId}`}
          className="w-16"
          inputMode="numeric"
          value={uFrom}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setUFrom(event.target.value)
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`age-u-to-${row.entryId}`} className="text-xs">
          {t('groups.ageCategories.columns.uTo')}
        </Label>
        <Input
          id={`age-u-to-${row.entryId}`}
          className="w-16"
          inputMode="numeric"
          placeholder={t('groups.ageCategories.open')}
          value={uTo}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setUTo(event.target.value)
          }}
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={!dirty || saving}>
        {saving ? t('groups.ageCategories.saving') : t('groups.common.save')}
      </Button>
      {error ? (
        <p id={errorId} role="alert" className="text-destructive w-full text-xs">
          {error}
        </p>
      ) : null}
    </form>
  )
}

/** "Add category": the name and the range in one dialog (`POST /api/groups/age-categories`). */
function AddCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => Promise<void>
}) {
  const t = useT()
  const [label, setLabel] = React.useState('')
  const [uFrom, setUFrom] = React.useState('')
  const [uTo, setUTo] = React.useState('')
  const [errors, setErrors] = React.useState<Partial<Record<'label' | 'uFrom' | 'uTo' | 'form', string>>>({})
  const [saving, setSaving] = React.useState(false)

  const submit = async () => {
    if (label.trim() === '') {
      setErrors({ label: t('groups.ageCategories.errors.labelRequired') })
      return
    }
    const range = readRange(t, uFrom, uTo)
    if (!range.ok) {
      setErrors({ [range.field]: range.message })
      return
    }
    setErrors({})
    setSaving(true)
    try {
      await apiCallOrThrow(AGE_CATEGORIES_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), uFrom: range.uFrom, uTo: range.uTo }),
      })
      flash(t('groups.ageCategories.flash.created', { name: label.trim() }), 'success')
      onOpenChange(false)
      await onCreated()
    } catch (err: unknown) {
      setErrors({ form: errorMessage(err, t('groups.ageCategories.errors.create')) })
    } finally {
      setSaving(false)
    }
  }

  const field = (id: 'label' | 'uFrom' | 'uTo', text: string, value: string, set: (value: string) => void) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`age-category-${id}`}>{text}</Label>
      <Input
        id={`age-category-${id}`}
        value={value}
        inputMode={id === 'label' ? undefined : 'numeric'}
        maxLength={id === 'label' ? 150 : 2}
        placeholder={id === 'uTo' ? t('groups.ageCategories.open') : undefined}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `age-category-${id}-error` : undefined}
        onChange={(event) => {
          set(event.target.value)
        }}
      />
      {errors[id] ? (
        <p id={`age-category-${id}-error`} className="text-destructive text-xs">
          {errors[id]}
        </p>
      ) : null}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={(event: React.KeyboardEvent) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('groups.ageCategories.create.title')}</DialogTitle>
          <DialogDescription>{t('groups.ageCategories.create.help')}</DialogDescription>
        </DialogHeader>
        <form
          id="age-category-create"
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {field('label', t('groups.ageCategories.fields.label'), label, setLabel)}
          <div className="grid grid-cols-2 gap-3">
            {field('uFrom', t('groups.ageCategories.columns.uFrom'), uFrom, setUFrom)}
            {field('uTo', t('groups.ageCategories.columns.uTo'), uTo, setUTo)}
          </div>
          {errors.form ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.form}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('groups.picker.dialog.cancel')}
          </Button>
          <Button type="submit" form="age-category-create" disabled={saving}>
            {saving ? t('groups.ageCategories.saving') : t('groups.ageCategories.actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildColumns(t: Translate, canEdit: boolean, onSaved: () => Promise<void>): TableColumns<AgeCategoryRangeRow> {
  return [
    {
      accessorKey: 'label',
      header: t('groups.ageCategories.columns.name'),
      enableSorting: false,
      meta: { priority: 1 },
    },
    {
      id: 'range',
      header: t('groups.ageCategories.columns.range'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) =>
        canEdit ? (
          <RangeEditor key={row.original.updatedAt ?? 'new'} row={row.original} onSaved={onSaved} />
        ) : (
          <RangeText row={row.original} />
        ),
    },
    {
      id: 'birthYears',
      header: t('groups.ageCategories.columns.birthYears'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) =>
        row.original.birthYears ? (
          <span data-testid={`age-birth-years-${row.original.value}`}>{formatBirthYears(row.original.birthYears)}</span>
        ) : (
          <span className="text-muted-foreground">{t('groups.ageCategories.noRange')}</span>
        ),
    },
  ]
}

export function AgeCategoriesTable() {
  const t = useT()
  const queryClient = useQueryClient()
  const canEdit = useHasFeature('dictionaries.manage')
  const scopeVersion = useOrganizationScopeVersion()
  const [seasonId, setSeasonId] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  // A new key per opening gives the dialog fresh, empty fields.
  const [creatingKey, setCreatingKey] = React.useState(0)

  const seasons = useQuery({
    queryKey: ['groups-age-categories-seasons', scopeVersion],
    queryFn: () => seasonOptions(),
  })
  const { data, isLoading, error } = useQuery({
    queryKey: ['groups-age-categories', seasonId, scopeVersion],
    queryFn: () => fetchAgeCategoryRanges(seasonId || null),
  })

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['groups-age-categories'] })
  }, [queryClient])
  const columns = React.useMemo(() => buildColumns(t, canEdit, refresh), [t, canEdit, refresh])

  const seasonLabel = data?.season
    ? t('groups.ageCategories.referenceSeason', { season: data.season.name, year: data.referenceYear })
    : t('groups.ageCategories.referenceYear', { year: data?.referenceYear ?? '' })

  return (
    <>
      <GroupsNav current="age-categories">
        <DataTable<AgeCategoryRangeRow>
          title={t('groups.ageCategories.title')}
          titleHeadingLevel={1}
          entityId="groups:age_category_range"
          extensionTableId="groups.age_categories"
          actions={
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="age-categories-season" className="text-xs">
                  {t('groups.ageCategories.season')}
                </Label>
                <select
                  id="age-categories-season"
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  value={seasonId}
                  onChange={(event) => {
                    setSeasonId(event.target.value)
                  }}
                >
                  <option value="">{t('groups.ageCategories.seasonCurrent')}</option>
                  {(seasons.data ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {canEdit ? (
                <>
                  <Button asChild variant="outline">
                    <Link href={DICTIONARIES_HREF} data-testid="age-categories-dictionary-link">
                      {t('groups.ageCategories.actions.dictionary')}
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setCreatingKey((key) => key + 1)
                      setCreating(true)
                    }}
                  >
                    {t('groups.ageCategories.actions.create')}
                  </Button>
                </>
              ) : null}
            </div>
          }
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('groups.ageCategories.errors.load')) : null}
          emptyState={
            <p className="text-muted-foreground text-sm">
              {canEdit ? t('groups.ageCategories.emptyAdmin') : t('groups.ageCategories.empty')}
            </p>
          }
        />
        {data ? (
          <p className="text-muted-foreground mt-2 text-sm" data-testid="age-categories-reference">
            {seasonLabel}
          </p>
        ) : null}
      </GroupsNav>
      {canEdit ? (
        <AddCategoryDialog key={creatingKey} open={creating} onOpenChange={setCreating} onCreated={refresh} />
      ) : null}
    </>
  )
}
