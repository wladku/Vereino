'use client'
// The kit order of one campaign (payments spec REQ-032; mockups M-17, M-19; issue #116), shared by the app page and
// the personal-link page: a child switcher, then either the order summary — the lines, the print, the total with what
// was paid, how to pay (online in the app only, transfer with the payer code, cash to the coach) and "Change" /
// "Cancel" until the deadline — or the form — the set with its saving, a size (or "Not ordering") per product, the
// print name and number with the numbers taken in the child's group, contact, notes and a live total. "Orders are
// closed" once the campaign stops taking orders. States: saving, field errors (422), closed meanwhile or changed
// meanwhile (409: the page is read again), forbidden (403).
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { CheckboxField } from '@open-mercato/ui/primitives/checkbox-field'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { unitPrice } from '../../../lib/order-campaigns'
import { NOT_ORDERING, ORDERING, PRINT_NAME_MAX, type ChildOrderState } from '../../../lib/orders'
import { formatMoney } from '../../client-helpers'
import { CLUB_PAYMENTS_HREF } from '../PaymentsClubFrame'
import { MY_CHARGES_QUERY_KEY, TransferDetails } from '../ClubPaymentsPage'
import {
  MY_ORDERS_QUERY_KEY,
  sendOrderWrite,
  type FormChild,
  type FormOrder,
  type FormProductView,
  type OrderDraft,
  type OrderEndpoints,
  type OrderForm,
} from './order-client'

const STATE_VARIANT: Record<ChildOrderState, 'neutral' | 'warning' | 'success' | 'info'> = {
  not_ordered: 'neutral',
  to_pay: 'warning',
  paid: 'success',
  picked_up: 'info',
}

const LOCK_CONFLICT_CODE = 'optimistic_lock_conflict'

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  )
}

function sizesOf(product: FormProductView): string[] {
  return [...product.sizesChild, ...product.sizesAdult]
}

/** The running total of the answers so far: the set at its price, every answered single product at its size's. */
function liveTotal(products: readonly FormProductView[], draft: OrderDraft): number {
  const set = products.find((product) => product.kind === 'set')
  const inSet = new Set(draft.setSelected && set ? set.componentProductIds : [])
  let total = draft.setSelected && set ? set.priceChild : 0
  for (const product of products) {
    if (product.kind === 'set' || inSet.has(product.id)) continue
    const choice = draft.choices[product.id]
    if (!choice || choice === NOT_ORDERING) continue
    const size = sizesOf(product).includes(choice) ? choice : null
    if (size === null && choice !== ORDERING) continue
    total += unitPrice(product, size)
  }
  return total
}

function draftOf(form: OrderForm, child: FormChild, order: FormOrder | null): OrderDraft {
  if (order) {
    return {
      setSelected: order.setSelected,
      choices: { ...order.choices },
      printName: order.printName,
      printNumber: order.printNumber,
      contactEmail: order.contactEmail ?? form.contact.email ?? '',
      contactPhone: order.contactPhone ?? form.contact.phone ?? '',
      notes: order.notes,
    }
  }
  return {
    setSelected: form.products.some((product) => product.kind === 'set'),
    choices: {},
    printName: form.campaign.askPrintName ? child.defaultPrintName : null,
    printNumber: null,
    contactEmail: form.contact.email ?? '',
    contactPhone: form.contact.phone ?? '',
    notes: null,
  }
}

type Problems = { form: string | null; fields: Record<string, string> }

const NO_PROBLEMS: Problems = { form: null, fields: {} }

function FieldProblem({ id, text }: { id: string; text?: string }) {
  if (!text) return null
  return (
    <p id={id} className="text-destructive text-sm" role="alert">
      {text}
    </p>
  )
}

export type OrderFormSectionProps = {
  form: OrderForm
  /** `app`: signed in, may pay online; `link`: a personal link, transfer or cash only. */
  mode: 'app' | 'link'
  endpoints: OrderEndpoints
  /** The query the form was read with; refreshed after every write and every 409. */
  queryKey: QueryKey
  initialChildId?: string | null
}

export function OrderFormSection({ form, mode, endpoints, queryKey, initialChildId }: OrderFormSectionProps) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const ids = React.useId()
  const [childId, setChildId] = React.useState<string | null>(
    () =>
      form.children.find((child) => child.personId === initialChildId)?.personId ?? form.children[0]?.personId ?? null,
  )
  const child = form.children.find((entry) => entry.personId === childId) ?? null
  const order = child ? (form.orders.find((entry) => entry.participantPersonId === child.personId) ?? null) : null
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState<OrderDraft | null>(() => (child ? draftOf(form, child, order) : null))
  const [busy, setBusy] = React.useState(false)
  const [problems, setProblems] = React.useState<Problems>(NO_PROBLEMS)
  const open = form.campaign.ordersOpen

  // A new child, or a stored order that changed, starts the form again from what is stored (adjusted while
  // rendering, not in an effect). A message stays: it explains why the stored order changed under the guardian.
  const sourceKey = `${childId ?? ''}|${order?.updatedAt ?? ''}`
  const [draftKey, setDraftKey] = React.useState(sourceKey)
  if (draftKey !== sourceKey) {
    setDraftKey(sourceKey)
    setDraft(child ? draftOf(form, child, order) : null)
    setEditing(false)
  }

  const set = form.products.find((product) => product.kind === 'set') ?? null
  const items = form.products.filter((product) => product.kind === 'item')
  const saving = set
    ? Math.max(
        set.componentProductIds.reduce(
          (sum, id) => sum + (form.products.find((product) => product.id === id)?.priceChild ?? 0),
          0,
        ) - set.priceChild,
        0,
      )
    : 0

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: MY_ORDERS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: MY_CHARGES_QUERY_KEY }),
    ])
  }

  const failure = async (outcome: Extract<Awaited<ReturnType<typeof sendOrderWrite>>, { ok: false }>) => {
    if (outcome.status === 409 || outcome.status === 410) {
      const message =
        outcome.code === LOCK_CONFLICT_CODE ? t('payments.orders.club.errors.changed') : (outcome.message ?? null)
      setProblems({ form: message ?? t('payments.orders.club.errors.save'), fields: {} })
      await queryClient.invalidateQueries({ queryKey })
      return
    }
    if (outcome.status === 403) {
      setProblems({ form: outcome.message ?? t('payments.orders.club.errors.forbidden'), fields: {} })
      return
    }
    const fields = outcome.fieldErrors
    setProblems({
      form: Object.keys(fields).length > 0 ? null : (outcome.message ?? t('payments.orders.club.errors.save')),
      fields,
    })
  }

  const submit = async (event: React.SyntheticEvent) => {
    event.preventDefault()
    if (!child || !draft || busy) return
    setBusy(true)
    setProblems(NO_PROBLEMS)
    try {
      const body: OrderDraft = {
        ...draft,
        printName: form.campaign.askPrintName ? draft.printName : null,
        printNumber: form.campaign.askPrintNumber ? draft.printNumber : null,
        notes: form.campaign.notesLabel ? draft.notes : null,
      }
      let outcome: Awaited<ReturnType<typeof sendOrderWrite>>
      if (order) {
        const write = endpoints.update(order.id, body)
        outcome = await sendOrderWrite(write.url, write.method, write.body, order.updatedAt)
      } else {
        const write = endpoints.place(child.personId, body)
        outcome = await sendOrderWrite(write.url, 'POST', write.body, null)
      }
      if (!outcome.ok) {
        await failure(outcome)
        return
      }
      flash(t(order ? 'payments.orders.club.saved' : 'payments.orders.club.placed'), 'success')
      setEditing(false)
      await refresh()
    } catch {
      setProblems({ form: t('payments.orders.club.errors.save'), fields: {} })
    } finally {
      setBusy(false)
    }
  }

  const cancelOrder = async () => {
    if (!order || busy) return
    const confirmed = await confirm({
      title: t('payments.orders.club.cancel.title'),
      text: t('payments.orders.club.cancel.text', { child: child?.firstName ?? '' }),
      confirmText: t('payments.orders.club.cancel.confirm'),
      cancelText: t('payments.orders.club.cancel.keep'),
    })
    if (!confirmed) return
    setBusy(true)
    setProblems(NO_PROBLEMS)
    try {
      const outcome = await sendOrderWrite(endpoints.cancel(order.id), 'POST', null, order.updatedAt)
      if (!outcome.ok) {
        await failure(outcome)
        return
      }
      flash(t('payments.orders.club.cancelled'), 'success')
      await refresh()
    } catch {
      setProblems({ form: t('payments.orders.club.errors.save'), fields: {} })
    } finally {
      setBusy(false)
    }
  }

  const choose = (productId: string, value: string): void => {
    setDraft((current) => (current ? { ...current, choices: { ...current.choices, [productId]: value } } : current))
  }
  const update = <K extends keyof OrderDraft>(key: K, value: OrderDraft[K]): void => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const showForm = !!child && !!draft && open && (!order || editing)
  const taken = child?.takenNumbers ?? []
  const numberTaken = draft?.printNumber != null && taken.includes(draft.printNumber)

  return (
    <div className="flex flex-col gap-6" data-testid="order-form-section">
      <section className="flex flex-col gap-2" aria-labelledby={`${ids}-title`}>
        <h1 id={`${ids}-title`} className="text-2xl font-semibold" data-testid="order-campaign-name">
          {form.campaign.name}
        </h1>
        {form.campaign.description ? (
          <p className="text-muted-foreground max-w-prose whitespace-pre-line">{form.campaign.description}</p>
        ) : null}
        <p className="text-sm">
          {open ? t('payments.orders.club.deadline', { date: formatDate(form.campaign.closesOn, locale) }) : null}
        </p>
        {!open ? (
          <Alert status="information" data-testid="order-closed">
            <p className="font-medium">{t('payments.orders.club.closed')}</p>
          </Alert>
        ) : null}
      </section>

      {form.children.length === 0 ? (
        <Alert status="information" data-testid="order-no-children">
          <p className="max-w-prose">{t('payments.orders.club.noChildren')}</p>
        </Alert>
      ) : null}

      {form.children.length > 1 ? (
        <SegmentedControl
          value={childId ?? undefined}
          onValueChange={(value) => {
            setChildId(value)
            setProblems(NO_PROBLEMS)
          }}
          aria-label={t('payments.orders.club.childSwitcher')}
          data-testid="order-child-switcher"
        >
          {form.children.map((entry) => (
            <SegmentedControlItem key={entry.personId} value={entry.personId} className="min-h-11">
              {entry.firstName}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      ) : null}

      {child ? (
        <p className="text-muted-foreground text-sm" data-testid="order-child">
          {t('payments.orders.club.childGroup', { child: child.firstName, group: child.groupName ?? '' })}
        </p>
      ) : null}

      {problems.form ? (
        <Alert status="error" data-testid="order-error">
          <p>{problems.form}</p>
        </Alert>
      ) : null}

      {child && order && !showForm ? (
        <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" data-testid="order-summary">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {t('payments.orders.club.summary.title', { child: child.firstName })}
            </h2>
            <StatusBadge variant={STATE_VARIANT[order.state]}>
              {t(`payments.orders.club.state.${order.state}`)}
            </StatusBadge>
          </div>
          <ul className="flex flex-col gap-1">
            {order.lines.map((line) => (
              <li key={`${line.productId}-${line.size ?? ''}`} className="flex justify-between gap-3">
                <span>
                  {line.productName}
                  {line.size ? ` (${line.size})` : line.sizes ? ` (${line.sizes})` : ''}
                </span>
                <span className="font-medium">{formatMoney(line.unitPrice, locale)}</span>
              </li>
            ))}
          </ul>
          {order.printName || order.printNumber !== null ? (
            <p data-testid="order-summary-print">
              {t('payments.orders.club.summary.print', {
                print: [order.printName, order.printNumber].filter((part) => part !== null).join(' '),
              })}
            </p>
          ) : null}
          <dl className="grid grid-cols-2 gap-1 text-sm sm:max-w-sm">
            <dt className="text-muted-foreground">{t('payments.orders.club.summary.total')}</dt>
            <dd className="font-semibold" data-testid="order-summary-total">
              {formatMoney(order.total, locale)}
            </dd>
            <dt className="text-muted-foreground">{t('payments.orders.club.summary.paid')}</dt>
            <dd>{formatMoney(order.paid, locale)}</dd>
            <dt className="text-muted-foreground">{t('payments.orders.club.summary.remaining')}</dt>
            <dd>{formatMoney(order.remaining, locale)}</dd>
          </dl>
          {order.remaining > 0 ? (
            <div className="flex flex-col gap-3" data-testid="order-pay">
              <h3 className="font-semibold">
                {t('payments.orders.club.pay.title', { date: formatDate(form.campaign.paymentDueOn, locale) })}
              </h3>
              {mode === 'app' ? (
                <div>
                  <Button asChild className="min-h-11">
                    <Link href={CLUB_PAYMENTS_HREF} data-testid="order-pay-online">
                      {t('payments.orders.club.pay.online')}
                    </Link>
                  </Button>
                </div>
              ) : null}
              {form.transfer ? <TransferDetails transfer={form.transfer} /> : null}
              <p className="text-muted-foreground text-sm">{t('payments.orders.club.pay.cash')}</p>
            </div>
          ) : null}
          {open ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => {
                  setEditing(true)
                }}
                data-testid="order-change"
              >
                {t('payments.orders.club.change')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => void cancelOrder()}
                data-testid="order-cancel"
              >
                {t('payments.orders.club.cancel.action')}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {child && !order && !open ? (
        <p className="text-muted-foreground" data-testid="order-none">
          {t('payments.orders.club.noOrder', { child: child.firstName })}
        </p>
      ) : null}

      {showForm && draft && child ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => void submit(event)}
          noValidate
          data-testid="order-form"
        >
          {set ? (
            <CheckboxField
              id={`${ids}-set`}
              checked={draft.setSelected}
              onCheckedChange={(checked) => {
                update('setSelected', checked === true)
              }}
              label={t('payments.orders.club.set', { name: set.name, price: formatMoney(set.priceChild, locale) })}
              description={
                saving > 0 ? t('payments.orders.club.setSaving', { amount: formatMoney(saving, locale) }) : undefined
              }
              data-testid="order-set"
            />
          ) : null}
          <fieldset className="flex flex-col gap-4" aria-describedby={`${ids}-choices-problem`}>
            <legend className="mb-2 font-semibold">{t('payments.orders.club.products')}</legend>
            {items.map((product) => {
              const inSet = draft.setSelected && !!set && set.componentProductIds.includes(product.id)
              const sizes = sizesOf(product)
              if (inSet && sizes.length === 0) {
                return (
                  <p key={product.id} className="text-sm">
                    {t('payments.orders.club.inSetIncluded', { name: product.name })}
                  </p>
                )
              }
              const fieldId = `${ids}-product-${product.id}`
              const options = inSet
                ? sizes.map((size) => ({ value: size, label: size }))
                : [
                    ...(sizes.length > 0
                      ? sizes.map((size) => ({
                          value: size,
                          label: `${size} — ${formatMoney(unitPrice(product, size), locale)}`,
                        }))
                      : [
                          {
                            value: ORDERING,
                            label: t('payments.orders.club.ordering', {
                              price: formatMoney(product.priceChild, locale),
                            }),
                          },
                        ]),
                    { value: NOT_ORDERING, label: t('payments.orders.club.notOrdering') },
                  ]
              const value = draft.choices[product.id]
              const valid = value !== undefined && options.some((option) => option.value === value)
              return (
                <div key={product.id} className="flex flex-col gap-1" data-order-product={product.name}>
                  <Label htmlFor={fieldId}>
                    {inSet ? t('payments.orders.club.inSet', { name: product.name }) : product.name}
                    {product.requiredAnswer || inSet ? ' *' : ''}
                  </Label>
                  <Select
                    value={valid ? value : undefined}
                    onValueChange={(next) => {
                      choose(product.id, next)
                    }}
                  >
                    <SelectTrigger
                      id={fieldId}
                      className="min-h-11 w-full sm:w-80"
                      data-testid={`order-product-${product.id}`}
                    >
                      <SelectValue placeholder={t('payments.orders.club.choose')} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
            <FieldProblem id={`${ids}-choices-problem`} text={problems.fields.choices} />
          </fieldset>

          {form.campaign.askPrintName || form.campaign.askPrintNumber ? (
            <fieldset className="flex flex-col gap-4 sm:flex-row">
              <legend className="mb-2 font-semibold">{t('payments.orders.club.print')}</legend>
              {form.campaign.askPrintName ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-print-name`}>{t('payments.orders.club.printName')}</Label>
                  <Input
                    id={`${ids}-print-name`}
                    className="min-h-11 sm:w-48"
                    maxLength={PRINT_NAME_MAX}
                    value={draft.printName ?? ''}
                    onChange={(event) => {
                      update('printName', event.target.value)
                    }}
                    data-testid="order-print-name"
                  />
                  <p className="text-muted-foreground text-xs">{t('payments.orders.club.printNameHint')}</p>
                </div>
              ) : null}
              {form.campaign.askPrintNumber ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-print-number`}>{t('payments.orders.club.printNumber')}</Label>
                  <Input
                    id={`${ids}-print-number`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    className="min-h-11 sm:w-32"
                    value={draft.printNumber ?? ''}
                    aria-invalid={numberTaken || !!problems.fields.printNumber}
                    aria-describedby={`${ids}-print-number-hint ${ids}-print-number-problem`}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      update('printNumber', Number.isFinite(parsed) ? parsed : null)
                    }}
                    data-testid="order-print-number"
                  />
                  <p
                    id={`${ids}-print-number-hint`}
                    className="text-muted-foreground text-xs"
                    data-testid="order-taken"
                  >
                    {taken.length > 0
                      ? t('payments.orders.club.taken', { group: child.groupName ?? '', numbers: taken.join(', ') })
                      : t('payments.orders.club.noneTaken')}
                  </p>
                  <FieldProblem
                    id={`${ids}-print-number-problem`}
                    text={
                      problems.fields.printNumber ?? (numberTaken ? t('payments.orders.club.takenWarning') : undefined)
                    }
                  />
                </div>
              ) : null}
            </fieldset>
          ) : null}

          <fieldset className="flex flex-col gap-4 sm:flex-row">
            <legend className="mb-2 font-semibold">{t('payments.orders.club.contact')}</legend>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-email`}>{t('payments.orders.club.email')} *</Label>
              <Input
                id={`${ids}-email`}
                type="email"
                autoComplete="email"
                className="min-h-11 sm:w-72"
                value={draft.contactEmail}
                onChange={(event) => {
                  update('contactEmail', event.target.value)
                }}
                data-testid="order-email"
              />
              <FieldProblem id={`${ids}-email-problem`} text={problems.fields.contactEmail} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-phone`}>{t('payments.orders.club.phone')} *</Label>
              <Input
                id={`${ids}-phone`}
                type="tel"
                autoComplete="tel"
                className="min-h-11 sm:w-48"
                value={draft.contactPhone}
                onChange={(event) => {
                  update('contactPhone', event.target.value)
                }}
                data-testid="order-phone"
              />
            </div>
          </fieldset>

          {form.campaign.notesLabel ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-notes`}>{form.campaign.notesLabel}</Label>
              <Textarea
                id={`${ids}-notes`}
                maxLength={500}
                value={draft.notes ?? ''}
                onChange={(event) => {
                  update('notes', event.target.value)
                }}
                data-testid="order-notes"
              />
            </div>
          ) : null}

          <p className="text-lg" aria-live="polite" data-testid="order-total">
            {t('payments.orders.club.total', { amount: formatMoney(liveTotal(form.products, draft), locale) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11" disabled={busy} data-testid="order-submit">
              {order ? t('payments.orders.club.saveChanges') : t('payments.orders.club.place')}
            </Button>
            {order ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => {
                  setDraft(draftOf(form, child, order))
                  setEditing(false)
                  setProblems(NO_PROBLEMS)
                }}
              >
                {t('payments.orders.club.discard')}
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('payments.orders.club.changeUntil', { date: formatDate(form.campaign.closesOn, locale) })}
          </p>
        </form>
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}
