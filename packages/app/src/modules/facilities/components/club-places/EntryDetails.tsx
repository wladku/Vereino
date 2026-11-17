'use client'
// The details of one entry on the member day page (facilities parity spec M-11, REQ-R12, DD-R18; #278): opened by a
// tap on its block on the axis or on its line in "Wpisy dnia". It names the kind, the time, the place and what the
// entry is; a session adds its group and coach, a rental its status and — only when the calendar returns it, that is
// with `facilities.rentals.manage` on the place (DD-R18) — the contact with a `tel:` link, and "Open the rental" in
// the caller's rental scope. An own or cancellable booking offers "Cancel" (the page asks for a confirmation). Under
// 640 px the dialog is a full-height sheet, so the member bottom bar never covers its buttons.
import * as React from 'react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDayHeading } from '@vereino/ui'
import { dayEntryText } from '../day-axis/DayEntries'
import { KIND_TAGS } from '../day-axis/tags'
import { rentalHref } from '../rentals-client'
import { entryRange, type CalendarEntry } from './places-client'

function Fact({ term, children, testId }: { term: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="text-muted-foreground text-sm sm:w-28 sm:shrink-0">{term}</dt>
      <dd className="text-sm break-words" data-testid={testId}>
        {children}
      </dd>
    </div>
  )
}

export function EntryDetails({
  entry,
  date,
  timeZone,
  placeName,
  redacted,
  onOpenChange,
  onCancel,
}: {
  entry: CalendarEntry
  date: string
  timeZone: string
  /** The shown place: an entry on another place of its family names its own. */
  placeName: string
  redacted: boolean
  onOpenChange: (open: boolean) => void
  onCancel: (entry: CalendarEntry) => void
}) {
  const t = useT()
  const locale = useLocale()
  const cancellable = !redacted && entry.kind === 'booking' && (entry.own || entry.canCancel)
  const status = !redacted && (entry.kind === 'rental' || entry.kind === 'request') ? entry.status : null
  const contact = !redacted && entry.contact ? entry.contact : null
  const phone = contact?.phone?.trim() || null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="max-sm:inset-y-0 max-sm:max-h-dvh max-sm:rounded-none"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="club-place-entry-details"
      >
        <DialogHeader>
          <DialogTitle className="break-words">{dayEntryText(t, entry, redacted)}</DialogTitle>
          <DialogDescription asChild>
            <div>
              <Tag variant={KIND_TAGS[entry.kind]}>{t(`facilities.places.kind.${entry.kind}`)}</Tag>
            </div>
          </DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-3">
          <Fact term={t('facilities.places.details.time')} testId="club-place-entry-details-time">
            {formatDayHeading(date, locale)} · <span className="tabular-nums">{entryRange(entry, timeZone)}</span>
          </Fact>
          <Fact term={t('facilities.places.details.place')} testId="club-place-entry-details-place">
            {entry.placeName ?? placeName}
          </Fact>
          {entry.kind === 'session' && !redacted && entry.groupName ? (
            <Fact term={t('facilities.places.details.group')} testId="club-place-entry-details-group">
              {entry.groupName}
            </Fact>
          ) : null}
          {entry.kind === 'session' && !redacted && entry.coachName ? (
            <Fact term={t('facilities.places.details.coach')} testId="club-place-entry-details-coach">
              {entry.coachName}
            </Fact>
          ) : null}
          {status ? (
            <Fact term={t('facilities.places.details.status')} testId="club-place-entry-details-status">
              {t(`facilities.rentals.status.${status}`)}
            </Fact>
          ) : null}
          {contact && (contact.name || phone) ? (
            <Fact term={t('facilities.places.details.contact')} testId="club-place-entry-details-contact">
              {contact.name}
              {contact.name && phone ? ', ' : null}
              {phone ? (
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="text-primary underline">
                  {phone}
                </a>
              ) : null}
            </Fact>
          ) : null}
          {entry.needsReschedule ? (
            <div>
              <Tag variant="warning">{t('facilities.places.entry.needsReschedule')}</Tag>
            </div>
          ) : null}
        </dl>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('facilities.common.close')}
          </Button>
          {entry.kind === 'rental' && entry.canOpen && !redacted ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={rentalHref(entry.id)} data-testid="club-place-entry-details-open-rental">
                {t('facilities.calendar.actions.openRental')}
              </Link>
            </Button>
          ) : null}
          {cancellable ? (
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                onCancel(entry)
              }}
              data-testid="club-place-entry-details-cancel"
            >
              {t('facilities.places.cancel.action')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
