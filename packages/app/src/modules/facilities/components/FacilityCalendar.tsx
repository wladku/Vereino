'use client'
// `/backend/facilities/calendar` (facilities spec B-23, REQ-029; #121) — for this story: the place selector, the
// weekly availability table of the place (the `availability` rules in force today, with "Remove" per day), the
// "Set booking availability" dialog and the week preview of the zones. Sessions and requests arrive with their
// stories. Read with `facilities.view`; the dialog and "Remove" need `facilities.manage`. With
// `facilities.rentals.manage` (#122) the week shows the place's active rentals and a bookable, paid segment opens the
// "New rental" dialog prefilled with the place and the segment's start.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ISO_WEEKDAYS } from '@vereino/core'
import { AvailabilityDialog, type BulkResult } from './AvailabilityDialog'
import { PlaceSelect } from './FacilitiesControls'
import { RentalDialog, type RentalDialogPreset } from './RentalDialog'
import { WeekZonePreview } from './WeekZonePreview'
import {
  ZONES_HREF,
  ZONE_RULES_BULK_URL,
  ZONE_RULES_KEY,
  codedMessage,
  errorMessage,
  localToday,
  useFacilitiesManage,
  usePlaceOptions,
  usePlaceZoneRules,
  useRentalsManage,
  type ZoneRuleRow,
} from './facilities-client'
import { RENTALS_KEY } from './rentals-client'

type AvailabilityWindow = { id: string; from: string; to: string; validTo: string | null }

/** The availability windows of each weekday in force on `today`, sorted by start. */
export function availabilityByDay(rows: readonly ZoneRuleRow[], today: string): Map<number, AvailabilityWindow[]> {
  const byDay = new Map<number, AvailabilityWindow[]>()
  for (const row of rows) {
    if (row.source !== 'availability' || !row.validFrom) continue
    if (row.validFrom > today || (row.validTo !== null && row.validTo < today)) continue
    for (const day of row.weekdays) {
      const list = byDay.get(day) ?? []
      list.push({ id: row.id, from: row.timeFrom, to: row.timeTo, validTo: row.validTo })
      byDay.set(day, list)
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.from.localeCompare(b.from))
  return byDay
}

function WeeklyAvailability({
  rows,
  manage,
  busyDay,
  onRemove,
}: {
  rows: readonly ZoneRuleRow[]
  manage: boolean
  busyDay: number | null
  onRemove: (day: number) => void
}) {
  const t = useT()
  const headingId = React.useId()
  const today = localToday()
  const byDay = React.useMemo(() => availabilityByDay(rows, today), [rows, today])
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-md border p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('facilities.calendar.availability.title')}
      </h2>
      <p className="text-muted-foreground text-sm">{t('facilities.calendar.availability.help', { date: today })}</p>
      <ul className="flex flex-col divide-y" data-testid="facilities-weekly-availability">
        {ISO_WEEKDAYS.map((day) => {
          const windows = byDay.get(day) ?? []
          return (
            <li
              key={day}
              className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`facilities-weekly-day-${String(day)}`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm font-medium sm:w-32">{t(`facilities.weekdays.long.${String(day)}`)}</span>
                {windows.length === 0 ? (
                  <span className="text-muted-foreground text-sm">{t('facilities.calendar.availability.none')}</span>
                ) : (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {windows.map((window) => (
                      <li key={`${window.id}-${window.from}`} className="tabular-nums">
                        {window.from}–{window.to}
                        {window.validTo ? (
                          <span className="text-muted-foreground">
                            {' '}
                            {t('facilities.calendar.availability.until', { date: window.validTo })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {manage && windows.length > 0 ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyDay !== null}
                    data-testid={`facilities-availability-remove-${String(day)}`}
                    onClick={() => {
                      onRemove(day)
                    }}
                  >
                    {t('facilities.calendar.availability.remove')}
                    <span className="sr-only"> {t(`facilities.weekdays.long.${String(day)}`)}</span>
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SaveSummary({ result }: { result: BulkResult }) {
  const t = useT()
  const { clubOccurrencesInWindows, pendingRequestsOutside } = result.warnings
  return (
    <div className="flex flex-col gap-2" data-testid="facilities-availability-result">
      <Alert status="success">
        <AlertTitle>{t('facilities.availability.saved.title')}</AlertTitle>
        <AlertDescription>
          {t('facilities.availability.saved.counts', { created: result.created, removed: result.removed })}
        </AlertDescription>
      </Alert>
      {clubOccurrencesInWindows > 0 || pendingRequestsOutside > 0 ? (
        <Alert status="warning">
          <AlertTitle>{t('facilities.availability.warnings.title')}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {clubOccurrencesInWindows > 0 ? (
                <li>{t('facilities.availability.warnings.clubSessions', { count: clubOccurrencesInWindows })}</li>
              ) : null}
              {pendingRequestsOutside > 0 ? (
                <li>{t('facilities.availability.warnings.pendingRequests', { count: pendingRequestsOutside })}</li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

export function FacilityCalendar() {
  const t = useT()
  const queryClient = useQueryClient()
  const manage = useFacilitiesManage()
  const places = usePlaceOptions()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [chosenPlace, setChosenPlace] = React.useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  // A new key per opening starts the dialog fresh with the place shown now.
  const [dialogKey, setDialogKey] = React.useState(0)
  const [result, setResult] = React.useState<BulkResult | null>(null)
  const [busyDay, setBusyDay] = React.useState<number | null>(null)
  const rentalsManage = useRentalsManage()
  const [rentalPreset, setRentalPreset] = React.useState<RentalDialogPreset | null>(null)
  const [rentalKey, setRentalKey] = React.useState(0)
  const placeId = chosenPlace ?? places.options.at(0)?.value ?? null
  const rules = usePlaceZoneRules(placeId)
  const rows = rules.data?.items ?? []

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [ZONE_RULES_KEY] })
  }

  const removeDay = async (day: number) => {
    if (!placeId) return
    const dayName = t(`facilities.weekdays.long.${String(day)}`)
    const confirmed = await confirm({
      title: t('facilities.calendar.availability.confirm.title', { day: dayName }),
      text: t('facilities.calendar.availability.confirm.text', { day: dayName, date: localToday() }),
      confirmText: t('facilities.calendar.availability.remove'),
      cancelText: t('facilities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusyDay(day)
    try {
      await apiCallOrThrow<BulkResult>(
        ZONE_RULES_BULK_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            placeIds: [placeId],
            mode: 'replace',
            weekdays: [day],
            windows: [],
            validFrom: localToday(),
          }),
        },
        { errorMessage: t('facilities.availability.errors.save') },
      )
      setResult(null)
      flash(t('facilities.calendar.availability.removed', { day: dayName }), 'success')
    } catch (error: unknown) {
      flash(codedMessage(error, t) ?? errorMessage(error, t('facilities.availability.errors.save')), 'error')
    } finally {
      setBusyDay(null)
      await refresh()
    }
  }

  let body: React.ReactNode
  if (places.isLoading) {
    body = (
      <p className="text-muted-foreground text-sm" role="status">
        {t('facilities.common.loading')}
      </p>
    )
  } else if (!placeId) {
    body = <p className="text-muted-foreground text-sm">{t('facilities.calendar.noPlaces')}</p>
  } else if (rules.error) {
    body = (
      <p className="text-destructive text-sm" role="alert">
        {errorMessage(rules.error, t('facilities.zones.errors.load'))}
      </p>
    )
  } else if (rules.isLoading) {
    body = (
      <p className="text-muted-foreground text-sm" role="status">
        {t('facilities.common.loading')}
      </p>
    )
  } else if (rows.length === 0) {
    body = (
      <section className="flex flex-col gap-3 rounded-md border p-4" data-testid="facilities-calendar-empty">
        <p className="text-sm">{t('facilities.calendar.empty')}</p>
        <div>
          <Button asChild variant="outline">
            <Link href={ZONES_HREF}>{t('facilities.calendar.empty.action')}</Link>
          </Button>
        </div>
      </section>
    )
  } else {
    body = (
      <>
        <WeeklyAvailability
          rows={rows}
          manage={manage}
          busyDay={busyDay}
          onRemove={(day) => {
            void removeDay(day)
          }}
        />
        <WeekZonePreview
          rows={rows}
          placeId={placeId}
          rentalsEnabled={rentalsManage}
          onNewRental={(slot) => {
            setRentalKey((current) => current + 1)
            setRentalPreset({ placeId, date: slot.date, time: slot.time })
          }}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{t('facilities.calendar.title')}</h1>
        {manage ? (
          <Button
            type="button"
            disabled={places.options.length === 0}
            data-testid="facilities-availability-open"
            onClick={() => {
              setDialogKey((current) => current + 1)
              setDialogOpen(true)
            }}
          >
            {t('facilities.availability.open')}
          </Button>
        ) : null}
      </div>
      <PlaceSelect
        options={places.options}
        value={placeId ?? ''}
        onChange={(next) => {
          setChosenPlace(next)
          setResult(null)
        }}
        disabled={places.options.length === 0}
        testId="facilities-calendar-place"
      />
      {result ? <SaveSummary result={result} /> : null}
      {body}
      {manage ? (
        <AvailabilityDialog
          key={dialogKey}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          places={places.options}
          initialPlaceId={placeId}
          onSaved={async (saved) => {
            setResult(saved)
            flash(t('facilities.availability.saved.title'), 'success')
            await refresh()
          }}
        />
      ) : null}
      {rentalsManage && rentalPreset ? (
        <RentalDialog
          key={rentalKey}
          open
          onOpenChange={(open) => {
            if (!open) setRentalPreset(null)
          }}
          places={places.options}
          preset={rentalPreset}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: [RENTALS_KEY] })
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}
