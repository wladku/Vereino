'use client'
// The picture dialogs of a club event (event photos spec REQ-I01, REQ-I03, REQ-I04, DD-I03, DD-I10; #872), shared by
// the phone Pictures block and the panel's Files tab:
// - "Who is in the photo?": the club persons a manager marks (the event's participants first; others by a name
//   search) and the confirmation that every recognisable person is marked and nobody outside the club is recognisable;
//   for a graphic only the confirmation that no person can be recognised. A change of the marks needs the confirmation
//   again before the picture can be public.
// - Edit: the description (2–200, the alternative text; never a child's name) and photo or graphic (a change clears the
//   marks and the confirmation).
// - Without consent: the marked people whose image consent is not in force, by name, for the event's managers only.
import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MAX_PICTURE_MARKS, PICTURE_DESCRIPTION_MAX, pictureDescriptionOf } from '../lib/club-event-files'
import { DialogContent } from '@/components/ui/dialog'
import type { ClubEventPictureItem, ClubEventPictureMark } from './club-events-client'

type PersonOption = { id: string; displayName: string; isParticipant: boolean }

/** The people a manager can mark: the participants, or the matches of `term` (three letters or more). */
function usePeopleOptions(eventId: string, term: string, open: boolean) {
  const [items, setItems] = React.useState<PersonOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    const query = term.trim().length >= 3 ? `?q=${encodeURIComponent(term.trim())}` : ''
    const timer = setTimeout(() => {
      setLoading(true)
      void apiCall<{ items: PersonOption[] }>(
        `/api/activities/club-events/${encodeURIComponent(eventId)}/people-options${query}`,
      ).then((call) => {
        if (cancelled) return
        setFailed(!call.ok)
        setItems(call.ok ? (call.result?.items ?? []) : [])
        setLoading(false)
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [eventId, term, open])
  return { items, loading, failed }
}

export function PicturePeopleDialog({
  eventId,
  picture,
  open,
  busy,
  onOpenChange,
  onSave,
}: {
  eventId: string
  picture: ClubEventPictureItem
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSave: (personIds: string[], confirmed: boolean) => Promise<boolean>
}) {
  const t = useT()
  const id = React.useId()
  const isGraphic = picture.kind === 'graphic'
  const [term, setTerm] = React.useState('')
  const [selected, setSelected] = React.useState<ClubEventPictureMark[]>(picture.marks)
  const [confirmed, setConfirmed] = React.useState(picture.peopleConfirmed)
  const options = usePeopleOptions(eventId, term, open && !isGraphic)
  const selectedIds = new Set(selected.map((mark) => mark.id))
  const changed = selected.length !== picture.marks.length || picture.marks.some((mark) => !selectedIds.has(mark.id))

  const toggle = (option: ClubEventPictureMark, checked: boolean) => {
    setSelected((current) =>
      checked
        ? current.length >= MAX_PICTURE_MARKS || current.some((mark) => mark.id === option.id)
          ? current
          : [...current, { id: option.id, displayName: option.displayName }]
        : current.filter((mark) => mark.id !== option.id),
    )
    // Any change of the marks needs the confirmation again (REQ-I03).
    setConfirmed(false)
  }
  const unmarkedConfirm = !isGraphic && confirmed && selected.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('activities.common.close')} data-testid="club-event-picture-people-dialog">
        <DialogHeader>
          <DialogTitle>
            {t(
              isGraphic
                ? 'activities.clubEvents.pictures.people.titleGraphic'
                : 'activities.clubEvents.pictures.people.title',
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              isGraphic
                ? 'activities.clubEvents.pictures.people.helpGraphic'
                : 'activities.clubEvents.pictures.people.help',
            )}
          </DialogDescription>
        </DialogHeader>
        {isGraphic ? null : (
          <div className="flex flex-col gap-3">
            {selected.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label={t('activities.clubEvents.pictures.people.marked')}>
                {selected.map((mark) => (
                  <li key={mark.id}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-9"
                      aria-label={t('activities.clubEvents.pictures.people.unmark', { name: mark.displayName })}
                      onClick={() => {
                        toggle(mark, false)
                      }}
                    >
                      {mark.displayName} ×
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">{t('activities.clubEvents.pictures.people.none')}</p>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-search`}>{t('activities.clubEvents.pictures.people.search')}</Label>
              <Input
                id={`${id}-search`}
                className="min-h-11"
                value={term}
                onChange={(change) => {
                  setTerm(change.target.value)
                }}
                data-testid="club-event-picture-people-search"
              />
              <p className="text-muted-foreground text-xs">{t('activities.clubEvents.pictures.people.searchHelp')}</p>
            </div>
            <div aria-live="polite" className="max-h-64 overflow-y-auto rounded-md border">
              {options.loading ? (
                <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
                  <Spinner size="sm" />
                  {t('activities.clubEvents.pictures.people.loading')}
                </p>
              ) : options.failed ? (
                <p role="alert" className="text-status-error-text p-3 text-sm">
                  {t('activities.clubEvents.pictures.people.loadFailed')}
                </p>
              ) : options.items.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">{t('activities.clubEvents.pictures.people.empty')}</p>
              ) : (
                <ul className="divide-y" data-testid="club-event-picture-people-options">
                  {options.items.map((option) => (
                    <li key={option.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                        <Checkbox
                          checked={selectedIds.has(option.id)}
                          onCheckedChange={(value) => {
                            toggle(option, value === true)
                          }}
                          data-testid="club-event-picture-person"
                        />
                        <span className="text-sm">{option.displayName}</span>
                        {option.isParticipant ? (
                          <span className="text-muted-foreground ml-auto text-xs">
                            {t('activities.clubEvents.pictures.people.participant')}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <label className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) => {
              setConfirmed(value === true)
            }}
            data-testid="club-event-picture-people-confirm"
          />
          <span className="text-sm">
            {t(
              isGraphic
                ? 'activities.clubEvents.pictures.confirm.graphic'
                : 'activities.clubEvents.pictures.confirm.photo',
            )}
          </span>
        </label>
        {unmarkedConfirm ? (
          <p role="alert" className="text-status-error-text text-sm">
            {t('activities.errors.club_event_photo_unmarked')}
          </p>
        ) : null}
        {changed && !confirmed && !isGraphic ? (
          <p className="text-muted-foreground text-xs">{t('activities.clubEvents.pictures.people.reconfirm')}</p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('activities.common.back')}
          </Button>
          <Button
            type="button"
            data-testid="club-event-picture-people-save"
            disabled={busy || unmarkedConfirm}
            onClick={() => {
              void onSave(isGraphic ? [] : selected.map((mark) => mark.id), confirmed).then((ok) => {
                if (ok) onOpenChange(false)
              })
            }}
          >
            {t('activities.clubEvents.pictures.people.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PictureEditDialog({
  picture,
  open,
  busy,
  onOpenChange,
  onSave,
}: {
  picture: ClubEventPictureItem
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSave: (patch: { description?: string; kind?: 'photo' | 'graphic' }) => Promise<boolean>
}) {
  const t = useT()
  const id = React.useId()
  const [description, setDescription] = React.useState(picture.description)
  const [kind, setKind] = React.useState<'photo' | 'graphic'>(picture.kind)
  const [touched, setTouched] = React.useState(false)
  const valid = pictureDescriptionOf(kind, description).valid
  const invalid = touched && !valid
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('activities.common.close')} data-testid="club-event-picture-edit-dialog">
        <DialogHeader>
          <DialogTitle>{t('activities.clubEvents.pictures.edit.title')}</DialogTitle>
          <DialogDescription>{t('activities.clubEvents.pictures.edit.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-description`}>{t('activities.clubEvents.pictures.edit.description')}</Label>
          <Textarea
            id={`${id}-description`}
            value={description}
            maxLength={PICTURE_DESCRIPTION_MAX}
            aria-invalid={invalid}
            aria-describedby={`${id}-description-help`}
            onChange={(change) => {
              setDescription(change.target.value)
            }}
            onBlur={() => {
              setTouched(true)
            }}
            data-testid="club-event-picture-description"
          />
          <p
            id={`${id}-description-help`}
            className={invalid ? 'text-status-error-text text-xs' : 'text-muted-foreground text-xs'}
          >
            {invalid
              ? t('activities.errors.club_event_picture_description_invalid')
              : t('activities.clubEvents.pictures.edit.descriptionHelp')}
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend id={`${id}-kind`} className="text-sm font-medium">
            {t('activities.clubEvents.pictures.edit.kind')}
          </legend>
          <RadioGroup
            aria-labelledby={`${id}-kind`}
            className="flex flex-col gap-2"
            value={kind}
            onValueChange={(value) => {
              setKind(value === 'graphic' ? 'graphic' : 'photo')
            }}
          >
            {(['photo', 'graphic'] as const).map((option) => (
              <label key={option} className="flex min-h-11 items-start gap-3" htmlFor={`${id}-kind-${option}`}>
                <Radio id={`${id}-kind-${option}`} value={option} data-testid={`club-event-picture-kind-${option}`} />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{t(`activities.clubEvents.pictures.kind.${option}`)}</span>
                  <span className="text-muted-foreground text-xs">
                    {t(`activities.clubEvents.pictures.kind.${option}Help`)}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {kind !== picture.kind ? (
            <p className="text-muted-foreground text-xs">{t('activities.clubEvents.pictures.edit.kindChange')}</p>
          ) : null}
        </fieldset>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('activities.common.back')}
          </Button>
          <Button
            type="button"
            data-testid="club-event-picture-edit-save"
            disabled={busy || !valid}
            onClick={() => {
              const patch = {
                ...(description.trim() !== picture.description ? { description } : {}),
                ...(kind !== picture.kind ? { kind } : {}),
              }
              if (Object.keys(patch).length === 0) {
                onOpenChange(false)
                return
              }
              void onSave(patch).then((ok) => {
                if (ok) onOpenChange(false)
              })
            }}
          >
            {t('activities.clubEvents.pictures.edit.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MissingConsentDialog({
  picture,
  open,
  onOpenChange,
}: {
  picture: ClubEventPictureItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('activities.common.close')} data-testid="club-event-picture-missing-dialog">
        <DialogHeader>
          <DialogTitle>{t('activities.clubEvents.pictures.missing.title')}</DialogTitle>
          <DialogDescription>{t('activities.clubEvents.pictures.missing.help')}</DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="club-event-picture-missing-list">
          {picture.missingConsent.map((mark) => (
            <li key={mark.id}>{mark.displayName}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('activities.common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
