'use client'
// The pieces the coordinator's list, the application page and the back office share (sign-up form spec M-J2, M-J3,
// B-J1, REQ-J11; #799): the flags as status tags that always carry their word (warning for outside the age range, group
// full and overdue; info for wants a trial and possible duplicate — never the `brand` variant), the state, the age on
// the reference date, the chosen group, the tabs and the filters (section, overdue, name search).
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag, type StatusTagStatus } from '@vereino/ui'
import { APPLICATION_TABS } from '../../lib/applications'
import {
  calendarDateLabel,
  mergeSections,
  type ApplicationFlag,
  type ApplicationListItem,
  type ApplicationTab,
  type Translate,
} from './applications-client'

const FLAG_STATUS: Readonly<Record<ApplicationFlag, StatusTagStatus>> = {
  group_closed: 'error',
  outside_age: 'warning',
  group_full: 'warning',
  overdue: 'warning',
  wants_trial: 'info',
  possible_duplicate: 'info',
}

export function FlagTags({ flags }: { flags: readonly ApplicationFlag[] }) {
  const t = useT()
  if (flags.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('enrolment.flags.label')}>
      {flags.map((flag) => (
        <li key={flag} data-testid={`enrolment-flag-${flag}`}>
          <StatusTag status={FLAG_STATUS[flag]}>{t(`enrolment.flags.${flag}`)}</StatusTag>
        </li>
      ))}
    </ul>
  )
}

const STATE_STATUS: Readonly<Record<string, StatusTagStatus>> = {
  new: 'info',
  trial: 'info',
  waiting: 'warning',
  accepted: 'success',
  rejected: 'canceled',
  withdrawn: 'declined',
  expired: 'closed',
}

export function StateTag({ state }: { state: string }) {
  const t = useT()
  return (
    <span data-testid="enrolment-application-state" data-state={state}>
      <StatusTag status={STATE_STATUS[state] ?? 'neutral'}>{t(`enrolment.states.${state}`)}</StatusTag>
    </span>
  )
}

/** "9 years (on 1 Sep 2026)", or a dash for an anonymised application. */
export function ageLabel(t: Translate, locale: string, age: number | null, referenceDate: string): string {
  if (age === null) return t('enrolment.club.empty')
  return t('enrolment.club.ageOn', { age, date: calendarDateLabel(referenceDate, locale) })
}

export function groupLabel(t: Translate, item: Pick<ApplicationListItem, 'chooseForUs' | 'groupName'>): string {
  if (item.chooseForUs) return t('enrolment.club.chooseForUs')
  return item.groupName ?? t('enrolment.club.empty')
}

export function useAgeLabel() {
  const t = useT()
  const locale = useLocale()
  return (item: Pick<ApplicationListItem, 'age' | 'referenceDate'>) => ageLabel(t, locale, item.age, item.referenceDate)
}

export function TabButtons({ tab, onChange }: { tab: ApplicationTab; onChange: (tab: ApplicationTab) => void }) {
  const t = useT()
  return (
    <div role="group" aria-label={t('enrolment.club.list.tabs')} className="flex flex-wrap gap-2">
      {APPLICATION_TABS.map((value) => (
        <Button
          key={value}
          type="button"
          className="min-h-11"
          variant={tab === value ? 'default' : 'outline'}
          aria-pressed={tab === value}
          data-testid={`enrolment-tab-${value}`}
          onClick={() => {
            onChange(value)
          }}
        >
          {t(`enrolment.club.tabs.${value}`)}
        </Button>
      ))}
    </div>
  )
}

/** The value of "all sections" (a Radix select item cannot have an empty value). */
export const ALL_SECTIONS = 'all'

export function ListFilters({
  tab,
  sections,
  sectionId,
  onSectionChange,
  search,
  onSearchChange,
  overdue,
  onOverdueChange,
}: {
  tab: ApplicationTab
  sections: ReadonlyMap<string, string>
  sectionId: string | null
  onSectionChange: (sectionId: string | null) => void
  search: string
  onSearchChange: (search: string) => void
  /** The back office's overdue filter; omitted on the member page. */
  overdue?: boolean
  onOverdueChange?: (overdue: boolean) => void
}) {
  const t = useT()
  const id = React.useId()
  const showSections = sections.size > 1 || sectionId !== null
  const sorted = [...sections.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tab !== 'closed' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-search`}>{t('enrolment.club.list.search')}</Label>
          <Input
            id={`${id}-search`}
            type="search"
            className="min-h-11"
            value={search}
            onChange={(event) => {
              onSearchChange(event.target.value)
            }}
            data-testid="enrolment-search"
          />
        </div>
      ) : null}
      {showSections ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-section`}>{t('enrolment.club.list.section')}</Label>
          <Select
            value={sectionId ?? ALL_SECTIONS}
            onValueChange={(value) => {
              onSectionChange(value === ALL_SECTIONS ? null : value)
            }}
          >
            <SelectTrigger id={`${id}-section`} className="min-h-11" data-testid="enrolment-section-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SECTIONS}>{t('enrolment.club.list.allSections')}</SelectItem>
              {sorted.map(([value, name]) => (
                <SelectItem key={value} value={value}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {onOverdueChange && tab === 'new' ? (
        <div className="flex items-end">
          <div className="flex min-h-11 items-center gap-2">
            <Checkbox
              id={`${id}-overdue`}
              checked={overdue === true}
              onCheckedChange={(value) => {
                onOverdueChange(value === true)
              }}
              data-testid="enrolment-overdue-filter"
            />
            <Label htmlFor={`${id}-overdue`}>{t('enrolment.club.list.overdueOnly')}</Label>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The search text, applied 300 ms after the last key. */
export function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value.trim())
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])
  return debounced
}

/** The sections seen so far, remembered across tabs and filters. */
export function useKnownSections(items: readonly ApplicationListItem[] | undefined): ReadonlyMap<string, string> {
  const [known, setKnown] = React.useState<ReadonlyMap<string, string>>(() => new Map())
  const [seen, setSeen] = React.useState(items)
  // Adjusted while rendering (no effect): a new page of items adds its sections once.
  if (items && items !== seen) {
    setSeen(items)
    const next = mergeSections(known, items)
    if (next !== known) setKnown(next)
  }
  return known
}

/** The tab named in the address, or New. */
export function tabFromParam(value: string | null | undefined): ApplicationTab {
  return (APPLICATION_TABS as readonly string[]).includes(value ?? '') ? (value as ApplicationTab) : 'new'
}
