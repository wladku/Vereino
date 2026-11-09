'use client'
// "Request a booking" on a bookable slot of the public month (facilities spec P-04, J-007, REQ-024; E08-S05 #125): a
// design-system dialog with the organisation or person, the contact (name, phone, e-mail), one of the two public renter
// categories, the start inside the bookable stretch (its start or a later full or half hour), 1 up to the units that
// fit until the stretch ends (at most 4), the purpose, the rules checkbox (required; the regulations link or text when
// the place has them), the data-processing notice and the hidden honeypot. The indicative amount comes from the month's
// rates and is marked approximate, and "valid only after administrator approval" is shown before anything is sent.
// Sent: "Check your inbox — confirm within 1 hour". A slot taken in the meantime (409) says so and refreshes the month;
// a refused field (422) shows its message next to the field. No session: the request goes through `public-client`.
import * as React from 'react'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { zonedInstant } from '@vereino/core'
import { localMoment } from '../../lib/public-schedule'
import { PUBLIC_RENTER_CATEGORIES } from '../../lib/rates'
import {
  REQUESTER_NAME_MAX_LENGTH,
  REQUESTER_NAME_MIN_LENGTH,
  REQUEST_PURPOSE_MAX_LENGTH,
  REQUEST_UNIT_MINUTES,
  indicativeAmount,
  requestMaxUnits,
  requestNotBefore,
  requestStartMinutes,
  stretchMinutes,
  wallTimeOf,
} from '../../lib/request-form'
import {
  formatAmount,
  formatDayHeading,
  submitPublicRequest,
  timeRange,
  type PublicRequestBody,
  type PublicScheduleView,
  type PublicSlot,
} from './public-client'

type PublicCategory = PublicRequestBody['renterCategory']

/** The fields a guest fills, as the API names them (a 422 names the same). */
type RequestField =
  | 'renterDisplayName'
  | 'contactName'
  | 'contactPhone'
  | 'contactEmail'
  | 'renterCategory'
  | 'startsAt'
  | 'units'
  | 'purpose'
  | 'regulationsAccepted'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type RequestTarget = { date: string; slot: PublicSlot }

type Phase = 'form' | 'sent' | 'taken'

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} className="text-destructive text-xs" role="alert">
      {message}
    </p>
  )
}

export function PublicRequestDialog({
  page,
  target,
  open,
  onOpenChange,
  onSlotTaken,
}: {
  page: PublicScheduleView
  target: RequestTarget
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The month is read again after a 409 (or a place that stopped taking requests). */
  onSlotTaken: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const ids = React.useId()
  const stretch = stretchMinutes(target.slot)
  // The moment the dialog opened decides which starts it offers; the server checks again on sending.
  const [starts] = React.useState(() =>
    requestStartMinutes(stretch, requestNotBefore(target.date, localMoment(new Date(), page.timeZone))),
  )
  const [start, setStart] = React.useState<number | null>(starts.at(0) ?? null)
  const [units, setUnits] = React.useState(1)
  const [name, setName] = React.useState('')
  const [contactName, setContactName] = React.useState('')
  const [contactPhone, setContactPhone] = React.useState('')
  const [contactEmail, setContactEmail] = React.useState('')
  const [category, setCategory] = React.useState<PublicCategory | ''>('')
  const [purpose, setPurpose] = React.useState('')
  const [accepted, setAccepted] = React.useState(false)
  const [website, setWebsite] = React.useState('')
  const [errors, setErrors] = React.useState<Partial<Record<RequestField, string>>>({})
  const [problem, setProblem] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [phase, setPhase] = React.useState<Phase>('form')

  const maxUnits = start === null ? 0 : requestMaxUnits(start, stretch.to)
  const unitChoices = Array.from({ length: maxUnits }, (_, index) => index + 1)
  const amount = category ? indicativeAmount(page.rates, category, target.date, units) : null
  const { regulationsUrl, regulationsText } = page.place

  const edited = (field: RequestField) => {
    setErrors((current) => {
      if (!current[field]) return current
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== field))
    })
    setProblem(null)
  }

  const close = () => {
    onOpenChange(false)
  }

  const validate = (): boolean => {
    const next: Partial<Record<RequestField, string>> = {}
    const trimmedName = name.trim()
    if (trimmedName.length < REQUESTER_NAME_MIN_LENGTH || trimmedName.length > REQUESTER_NAME_MAX_LENGTH) {
      next.renterDisplayName = t('facilities.public.request.errors.name')
    }
    if (contactName.trim().length < 2) next.contactName = t('facilities.public.request.errors.contactName')
    if (contactPhone.trim().length < 5) next.contactPhone = t('facilities.public.request.errors.contactPhone')
    if (!EMAIL_PATTERN.test(contactEmail.trim())) next.contactEmail = t('facilities.public.request.errors.contactEmail')
    if (!category) next.renterCategory = t('facilities.public.request.errors.category')
    if (start === null) next.startsAt = t('facilities.public.request.errors.start')
    if (!accepted) next.regulationsAccepted = t('facilities.errors.request_regulations_required')
    setErrors(next)
    const valid = Object.keys(next).length === 0
    setProblem(valid ? null : t('facilities.public.request.errors.check'))
    return valid
  }

  const submit = async () => {
    if (pending || phase !== 'form' || !validate() || start === null || !category) return
    setPending(true)
    setProblem(null)
    try {
      const outcome = await submitPublicRequest(page.club.slug, page.place.slug, {
        startsAt: zonedInstant(target.date, wallTimeOf(start), page.timeZone).toISOString(),
        units,
        renterDisplayName: name.trim(),
        renterCategory: category,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
        purpose: purpose.trim() ? purpose.trim() : null,
        regulationsAccepted: accepted,
        locale,
        website,
      })
      if (outcome.status === 'sent') {
        setPhase('sent')
      } else if (outcome.status === 'taken') {
        setPhase('taken')
        onSlotTaken()
      } else if (outcome.status === 'not_accepted') {
        setProblem(t('facilities.errors.requests_not_accepted'))
        onSlotTaken()
      } else if (outcome.status === 'invalid') {
        const message = outcome.code
          ? t(`facilities.errors.${outcome.code}`, t('facilities.public.request.errors.check'))
          : t('facilities.public.request.errors.check')
        const field = outcome.field as RequestField | null
        if (field && field in FIELD_IDS) setErrors((current) => ({ ...current, [field]: message }))
        setProblem(message)
      } else if (outcome.status === 'too_many') {
        setProblem(t('facilities.public.request.errors.tooMany'))
      } else {
        setProblem(t('facilities.public.request.errors.failed'))
      }
    } catch {
      setProblem(t('facilities.public.request.errors.failed'))
    } finally {
      setPending(false)
    }
  }

  const fieldId = (field: RequestField) => `${ids}-${FIELD_IDS[field]}`
  const errorId = (field: RequestField) => `${fieldId(field)}-error`
  const invalid = (field: RequestField) =>
    errors[field] ? { 'aria-invalid': true as const, 'aria-describedby': errorId(field) } : {}
  const slotText = `${formatDayHeading(target.date, locale)}, ${timeRange(target.slot)}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.public.request.close')}
        data-testid="public-request-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.public.request.title')}</DialogTitle>
          <DialogDescription>
            {t('facilities.public.request.slot', { place: page.place.name, slot: slotText })}
          </DialogDescription>
        </DialogHeader>

        {phase === 'sent' ? (
          <Alert status="success" data-testid="public-request-sent">
            <AlertTitle>{t('facilities.public.request.sent.title')}</AlertTitle>
            <AlertDescription>
              {t('facilities.public.request.sent.text', { email: contactEmail.trim() })}
            </AlertDescription>
          </Alert>
        ) : null}

        {phase === 'taken' ? (
          <Alert status="warning" data-testid="public-request-taken">
            <AlertTitle>{t('facilities.public.request.taken.title')}</AlertTitle>
            <AlertDescription>{t('facilities.public.request.taken.text')}</AlertDescription>
          </Alert>
        ) : null}

        {phase === 'form' ? (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <Alert status="information" data-testid="public-request-approval-note">
              <AlertTitle>{t('facilities.public.request.approval.title')}</AlertTitle>
              <AlertDescription>{t('facilities.public.request.approval.text')}</AlertDescription>
            </Alert>

            {starts.length === 0 ? (
              <p className="text-sm" role="alert" data-testid="public-request-no-start">
                {t('facilities.public.request.noStart')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={fieldId('startsAt')}>{t('facilities.public.request.fields.start')}</Label>
                  <Select
                    value={start === null ? '' : String(start)}
                    disabled={pending}
                    onValueChange={(next: string) => {
                      const minute = Number(next)
                      setStart(minute)
                      setUnits((current) => Math.min(current, Math.max(1, requestMaxUnits(minute, stretch.to))))
                      edited('startsAt')
                    }}
                  >
                    <SelectTrigger id={fieldId('startsAt')} data-testid="public-request-start" {...invalid('startsAt')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {starts.map((minute) => (
                        <SelectItem key={minute} value={String(minute)}>
                          {wallTimeOf(minute)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id={errorId('startsAt')} message={errors.startsAt} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={fieldId('units')}>{t('facilities.public.request.fields.units')}</Label>
                  <Select
                    value={String(units)}
                    disabled={pending || start === null}
                    onValueChange={(next: string) => {
                      setUnits(Number(next))
                      edited('units')
                    }}
                  >
                    <SelectTrigger id={fieldId('units')} data-testid="public-request-units" {...invalid('units')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {unitChoices.map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {t('facilities.public.request.units.option', {
                            units: count,
                            minutes: count * REQUEST_UNIT_MINUTES,
                            end: wallTimeOf((start ?? 0) + count * REQUEST_UNIT_MINUTES),
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError id={errorId('units')} message={errors.units} />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor={fieldId('renterDisplayName')}>{t('facilities.public.request.fields.name')}</Label>
              <Input
                id={fieldId('renterDisplayName')}
                value={name}
                maxLength={REQUESTER_NAME_MAX_LENGTH}
                autoComplete="organization"
                required
                disabled={pending}
                data-testid="public-request-name"
                {...invalid('renterDisplayName')}
                onChange={(event) => {
                  setName(event.target.value)
                  edited('renterDisplayName')
                }}
              />
              <p className="text-muted-foreground text-xs">{t('facilities.public.request.fields.name.help')}</p>
              <FieldError id={errorId('renterDisplayName')} message={errors.renterDisplayName} />
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium">{t('facilities.public.request.fields.contact')}</legend>
              <div className="flex flex-col gap-1">
                <Label htmlFor={fieldId('contactName')}>{t('facilities.public.request.fields.contactName')}</Label>
                <Input
                  id={fieldId('contactName')}
                  value={contactName}
                  maxLength={200}
                  autoComplete="name"
                  required
                  disabled={pending}
                  data-testid="public-request-contact-name"
                  {...invalid('contactName')}
                  onChange={(event) => {
                    setContactName(event.target.value)
                    edited('contactName')
                  }}
                />
                <FieldError id={errorId('contactName')} message={errors.contactName} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={fieldId('contactPhone')}>{t('facilities.public.request.fields.contactPhone')}</Label>
                  <Input
                    id={fieldId('contactPhone')}
                    type="tel"
                    value={contactPhone}
                    maxLength={50}
                    autoComplete="tel"
                    required
                    disabled={pending}
                    data-testid="public-request-contact-phone"
                    {...invalid('contactPhone')}
                    onChange={(event) => {
                      setContactPhone(event.target.value)
                      edited('contactPhone')
                    }}
                  />
                  <FieldError id={errorId('contactPhone')} message={errors.contactPhone} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={fieldId('contactEmail')}>{t('facilities.public.request.fields.contactEmail')}</Label>
                  <Input
                    id={fieldId('contactEmail')}
                    type="email"
                    value={contactEmail}
                    maxLength={320}
                    autoComplete="email"
                    required
                    disabled={pending}
                    data-testid="public-request-contact-email"
                    {...invalid('contactEmail')}
                    onChange={(event) => {
                      setContactEmail(event.target.value)
                      edited('contactEmail')
                    }}
                  />
                  <FieldError id={errorId('contactEmail')} message={errors.contactEmail} />
                </div>
              </div>
            </fieldset>

            <div className="flex flex-col gap-1">
              <Label htmlFor={fieldId('renterCategory')}>{t('facilities.public.request.fields.category')}</Label>
              <Select
                value={category}
                disabled={pending}
                onValueChange={(next: string) => {
                  setCategory(PUBLIC_CATEGORIES.find((entry) => entry === next) ?? '')
                  edited('renterCategory')
                }}
              >
                <SelectTrigger
                  id={fieldId('renterCategory')}
                  data-testid="public-request-category"
                  {...invalid('renterCategory')}
                >
                  <SelectValue placeholder={t('facilities.public.request.fields.category.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {PUBLIC_CATEGORIES.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {t(`facilities.public.rates.category.${entry}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id={errorId('renterCategory')} message={errors.renterCategory} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={fieldId('purpose')}>{t('facilities.public.request.fields.purpose')}</Label>
              <Textarea
                id={fieldId('purpose')}
                rows={2}
                maxLength={REQUEST_PURPOSE_MAX_LENGTH}
                value={purpose}
                disabled={pending}
                data-testid="public-request-purpose"
                {...invalid('purpose')}
                onChange={(event) => {
                  setPurpose(event.target.value)
                  edited('purpose')
                }}
              />
              <FieldError id={errorId('purpose')} message={errors.purpose} />
            </div>

            <div
              className="bg-muted/50 flex flex-col gap-1 rounded-md border p-3 text-sm"
              aria-live="polite"
              data-testid="public-request-amount"
            >
              <span className="font-medium">{t('facilities.public.request.amount.title')}</span>
              {!category ? (
                <span className="text-muted-foreground">{t('facilities.public.request.amount.chooseCategory')}</span>
              ) : amount === null ? (
                <span className="text-muted-foreground">{t('facilities.public.request.amount.none')}</span>
              ) : (
                <span>
                  {t('facilities.public.request.amount.value', {
                    amount: formatAmount(amount, page.currency, locale),
                  })}
                </span>
              )}
              <span className="text-muted-foreground text-xs">{t('facilities.public.request.amount.note')}</span>
            </div>

            {regulationsText && !regulationsUrl ? (
              <details className="text-sm">
                <summary className="min-h-11 cursor-pointer py-2 sm:min-h-6">
                  {t('facilities.public.request.rules.show')}
                </summary>
                <p className="max-w-prose whitespace-pre-line">{regulationsText}</p>
              </details>
            ) : null}
            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <Checkbox
                  id={fieldId('regulationsAccepted')}
                  checked={accepted}
                  disabled={pending}
                  className="mt-0.5"
                  data-testid="public-request-regulations"
                  {...invalid('regulationsAccepted')}
                  onCheckedChange={(value) => {
                    setAccepted(value === true)
                    edited('regulationsAccepted')
                  }}
                />
                <Label htmlFor={fieldId('regulationsAccepted')} className="leading-snug">
                  {t('facilities.public.request.fields.rules')}
                </Label>
              </div>
              {regulationsUrl ? (
                <a
                  className="inline-flex min-h-11 items-center ps-6 text-sm underline underline-offset-4 sm:min-h-6"
                  href={regulationsUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="public-request-regulations-link"
                >
                  {t('facilities.public.request.rules.link')}
                </a>
              ) : null}
              <FieldError id={errorId('regulationsAccepted')} message={errors.regulationsAccepted} />
            </div>

            <p className="text-muted-foreground text-xs" data-testid="public-request-privacy">
              {t('facilities.public.request.privacy', { club: page.club.name })}
            </p>

            {/* The honeypot: hidden from people and assistive technology; a filled one is refused by the server. */}
            <div aria-hidden="true" className="sr-only">
              <Label htmlFor={`${ids}-website`}>{t('facilities.public.request.honeypot')}</Label>
              <Input
                id={`${ids}-website`}
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => {
                  setWebsite(event.target.value)
                }}
              />
            </div>

            {problem ? (
              <p className="text-destructive text-sm" role="alert" data-testid="public-request-problem">
                {problem}
              </p>
            ) : null}
          </form>
        ) : null}

        <DialogFooter>
          {phase === 'form' ? (
            <>
              <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={close}>
                {t('facilities.public.request.cancel')}
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={pending || starts.length === 0}
                data-testid="public-request-submit"
                onClick={() => {
                  void submit()
                }}
              >
                {pending ? t('facilities.public.request.sending') : t('facilities.public.request.submit')}
              </Button>
            </>
          ) : (
            <Button type="button" className="min-h-11" data-testid="public-request-done" onClick={close}>
              {phase === 'taken' ? t('facilities.public.request.taken.back') : t('facilities.public.request.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const PUBLIC_CATEGORIES = PUBLIC_RENTER_CATEGORIES as readonly PublicCategory[]

/** The DOM id suffix of each field (also the set of fields a 422 may name). */
const FIELD_IDS: Record<RequestField, string> = {
  renterDisplayName: 'name',
  contactName: 'contact-name',
  contactPhone: 'contact-phone',
  contactEmail: 'contact-email',
  renterCategory: 'category',
  startsAt: 'start',
  units: 'units',
  purpose: 'purpose',
  regulationsAccepted: 'regulations',
}
