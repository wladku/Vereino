'use client'
// The birth years of a team's age category (people life-cycle spec REQ-L16, B-12 row of *Groups: age categories*;
// #384): "Rocznik {years} w sezonie {season}" under the category on the team form and on the public tab, read from
// `GET /api/groups/age-categories` for the team's season (or the season of today). A category without a range shows
// nothing.
import { useQuery } from '@tanstack/react-query'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatBirthYears } from '../lib/groups-rules'
import { fetchAgeCategoryRanges, type AgeCategoryRangeList, type AgeCategoryRangeRow } from './AgeCategoriesTable'
import type { Translate } from './client-helpers'

export type AgeCategoryRangeLookup = {
  /** True once the lookup settled (or there is nothing to look up). */
  ready: boolean
  row: AgeCategoryRangeRow | null
  list: AgeCategoryRangeList | null
}

/** The category's row (with its range and birth years) in the reference year of `seasonId`, or of today. */
export function useAgeCategoryRange(entryId: string | null, seasonId: string | null): AgeCategoryRangeLookup {
  const query = useQuery({
    queryKey: ['groups-age-categories', seasonId ?? '', 'lookup'],
    queryFn: () => fetchAgeCategoryRanges(seasonId),
    enabled: entryId !== null,
    staleTime: 60_000,
  })
  if (!entryId) return { ready: true, row: null, list: null }
  if (query.isPending && query.fetchStatus !== 'idle') return { ready: false, row: null, list: null }
  const list = query.data ?? null
  return { ready: true, row: list?.items.find((item) => item.entryId === entryId) ?? null, list }
}

/** "Rocznik 2017 w sezonie 2026/27", or "… w roku 2026" when no season applies; null without a range. */
export function birthYearsText(t: Translate, lookup: AgeCategoryRangeLookup): string | null {
  const years = lookup.row?.birthYears
  if (!years || !lookup.list) return null
  const text = formatBirthYears(years)
  return lookup.list.season
    ? t('groups.ageCategories.birthYearsInSeason', { years: text, season: lookup.list.season.name })
    : t('groups.ageCategories.birthYearsInYear', { years: text, year: lookup.list.referenceYear })
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** The hint under the team form's age category: follows the chosen category and season as they change. */
export function AgeCategoryYearsHint({ values }: { values?: Record<string, unknown> }) {
  const t = useT()
  const lookup = useAgeCategoryRange(text(values?.ageCategoryEntryId), text(values?.seasonId))
  const hint = birthYearsText(t, lookup)
  if (!hint) return null
  return (
    <p className="text-muted-foreground text-sm" data-testid="group-age-category-years">
      {hint}
    </p>
  )
}
