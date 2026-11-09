'use client'
// `/club/coach/payments` — M-18 "My groups' payments" on a phone (UX concept M-18, flow F-14; payments spec REQ-033,
// DD-31, DD-32; issue #117 E07-S10): "Cash with you" with the receipts, the group chips with the number of people to
// pay, the Everyone / To pay filter, the group card, per child the group fees and kit orders (amount, due date, status,
// never the discount reason) with "Accept cash" (several charges at once), "Send reminder" (overdue) and "Hand over
// kit" (after the delivery; an unpaid kit after a warning), and the group's campaigns with "Remind guardians" and the
// text for the group chat. A child without a payer is shown without cash: a matter for the treasurer.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SwitchField } from '@open-mercato/ui/primitives/switch-field'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  errorMessage,
  formatMoney,
  fromGrosz,
  localToday,
  personName,
  toGrosz,
  type Translate,
} from '../../client-helpers'
import { PaymentsClubFrame } from '../PaymentsClubFrame'
import {
  COACH_PAYMENTS_QUERY_KEY,
  collectCash,
  handOverKit,
  remindCampaign,
  remindPayers,
  useGroupCharges,
  type CoachCampaign,
  type CoachCharge,
  type CoachChild,
  type GroupChargesView,
} from './coach-client'

function statusBadge(charge: CoachCharge, t: Translate) {
  if (charge.overdue) return <StatusBadge variant="error">{t('payments.charges.overdue')}</StatusBadge>
  if (charge.status === 'paid') return <StatusBadge variant="success">{t('payments.charges.status.paid')}</StatusBadge>
  if (charge.status === 'partially_paid') {
    return <StatusBadge variant="warning">{t('payments.charges.status.partially_paid')}</StatusBadge>
  }
  return <StatusBadge variant="neutral">{t('payments.charges.status.open')}</StatusBadge>
}

function useRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [COACH_PAYMENTS_QUERY_KEY] })
}

function CashWithYou({ cash, t, locale }: { cash: GroupChargesView['cash']; t: Translate; locale: string }) {
  const [open, setOpen] = React.useState(false)
  const listId = React.useId()
  return (
    <section
      className="flex flex-col gap-2 rounded-md border p-4"
      data-testid="coach-cash"
      aria-label={t('payments.coach.cash.title')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {t('payments.coach.cash.summary', {
            amount: formatMoney(cash.total, locale),
            count: cash.paymentCount,
          })}
        </p>
        {cash.items.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => {
              setOpen((value) => !value)
            }}
          >
            {open ? t('payments.coach.cash.hide') : t('payments.coach.cash.show')}
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{t('payments.coach.cash.help')}</p>
      {open ? (
        <ul id={listId} className="flex flex-col gap-1 text-sm">
          {cash.items.map((item) => (
            <li
              key={item.receiptNumber}
              className="flex flex-wrap justify-between gap-2"
              data-testid="coach-cash-receipt"
            >
              <span>
                {item.receiptNumber}
                {item.payer ? ` · ${personName(item.payer)}` : ''}
              </span>
              <span className="font-semibold">{formatMoney(item.amount, locale)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function CashForm({
  child,
  groupId,
  onDone,
  onCancel,
}: {
  child: CoachChild
  groupId: string
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const ids = { amount: React.useId(), date: React.useId(), problem: React.useId(), charges: React.useId() }
  const collectible = child.charges.filter((charge) => charge.collectible)
  const [selected, setSelected] = React.useState<string[]>(() => collectible.map((charge) => charge.id))
  const [typedAmount, setTypedAmount] = React.useState<string | null>(null)
  const [paidOn, setPaidOn] = React.useState(localToday)
  const [notify, setNotify] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const selectedSum = collectible
    .filter((charge) => selected.includes(charge.id))
    .reduce((sum, charge) => sum + charge.remaining, 0)
  const amount = typedAmount ?? (selectedSum > 0 ? fromGrosz(selectedSum) : '')

  const submit = async () => {
    if (selected.length === 0) {
      setProblem(t('payments.cash.chargesRequired'))
      return
    }
    const grosz = toGrosz(amount)
    if (grosz === null || grosz <= 0) {
      setProblem(t('payments.ledger.record.amountInvalid'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const recorded = await collectCash(
        { groupId, participantPersonId: child.personId, chargeIds: selected, amount: grosz, paidOn, notify },
        t('payments.cash.error'),
      )
      flash(
        t('payments.coach.cash.done', {
          amount: formatMoney(recorded.amount, locale),
          child: personName(child),
          receipt: recorded.receiptNumber,
        }),
        'success',
      )
      await onDone()
    } catch (error: unknown) {
      setProblem(errorMessage(error, t('payments.cash.error')))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border p-3"
      data-testid="coach-cash-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('payments.cash.charges')}</legend>
        {collectible.map((charge) => {
          const id = `${ids.charges}-${charge.id}`
          return (
            <div key={charge.id} className="flex min-h-11 items-start gap-3" data-testid="coach-cash-charge">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={selected.includes(charge.id)}
                disabled={pending}
                onCheckedChange={(value) => {
                  setSelected((current) =>
                    value === true ? [...current, charge.id] : current.filter((chargeId) => chargeId !== charge.id),
                  )
                  setTypedAmount(null)
                }}
              />
              <Label htmlFor={id} className="flex flex-1 flex-wrap justify-between gap-2 font-normal">
                <span>{charge.description}</span>
                <span className="font-semibold">{formatMoney(charge.remaining, locale)}</span>
              </Label>
            </div>
          )
        })}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.amount}>{t('payments.ledger.record.amount')}</Label>
          <Input
            id={ids.amount}
            inputMode="decimal"
            data-testid="coach-cash-amount"
            required
            aria-describedby={problem ? ids.problem : undefined}
            value={amount}
            disabled={pending}
            onChange={(event) => {
              setTypedAmount(event.target.value)
            }}
          />
          <span className="text-muted-foreground text-xs">
            {t('payments.cash.amountHelp', { total: formatMoney(selectedSum, locale) })}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.date}>{t('payments.ledger.record.date')}</Label>
          <Input
            id={ids.date}
            type="date"
            required
            max={localToday()}
            value={paidOn}
            disabled={pending}
            onChange={(event) => {
              setPaidOn(event.target.value)
            }}
          />
        </div>
      </div>
      <SwitchField
        id={`${ids.amount}-notify`}
        label={t('payments.coach.cash.notify')}
        checked={notify}
        disabled={pending}
        onCheckedChange={setNotify}
      />
      {problem ? (
        <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid="coach-cash-problem">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={onCancel}>
          {t('payments.common.back')}
        </Button>
        <Button type="submit" className="min-h-11" data-testid="coach-cash-confirm" disabled={pending}>
          {pending ? t('payments.cash.pending') : t('payments.cash.confirm', { amount: amount || '0' })}
        </Button>
      </div>
    </form>
  )
}

function ChargeRow({
  charge,
  groupId,
  t,
  locale,
}: {
  charge: CoachCharge
  groupId: string
  t: Translate
  locale: string
}) {
  const refresh = useRefresh()
  const [warning, setWarning] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const order = charge.order
  const handOver = async (confirmUnpaid: boolean) => {
    if (!order) return
    if (charge.remaining > 0 && !confirmUnpaid) {
      setWarning(true)
      return
    }
    setPending(true)
    try {
      await handOverKit(order.id, { groupId, confirmUnpaid }, t('payments.coach.handOver.error'))
      flash(t('payments.coach.handOver.done'), 'success')
      setWarning(false)
      await refresh()
    } catch (error: unknown) {
      flash(errorMessage(error, t('payments.coach.handOver.error')), 'error')
    } finally {
      setPending(false)
    }
  }
  return (
    <li
      className="flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0"
      data-testid="coach-charge"
      data-kind={charge.kind}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{charge.description}</span>
        <span className="font-semibold">
          {formatMoney(charge.remaining > 0 ? charge.remaining : charge.amountDue, locale)}
        </span>
      </span>
      <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <span>{t('payments.ledger.dueOn', { date: charge.dueDate })}</span>
        {statusBadge(charge, t)}
        {charge.kind === 'fee' && !charge.collectible && charge.remaining > 0 && charge.payerPersonId ? (
          <span data-testid="coach-charge-view-only">{t('payments.coach.viewOnly')}</span>
        ) : null}
      </span>
      {order && order.lines.length > 0 ? (
        <span className="text-muted-foreground text-sm">{order.lines.join(', ')}</span>
      ) : null}
      {order?.handedOverAt ? (
        <span className="text-sm" data-testid="coach-kit-handed-over">
          {t('payments.coach.handOver.handedOver')}
        </span>
      ) : null}
      {order?.canHandOver ? (
        <div className="flex flex-col gap-2">
          {warning ? (
            <Alert status="warning" data-testid="coach-hand-over-warning">
              <div className="flex flex-col gap-2">
                <p>{t('payments.coach.handOver.unpaidWarning', { amount: formatMoney(charge.remaining, locale) })}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={pending}
                    onClick={() => {
                      setWarning(false)
                    }}
                  >
                    {t('payments.common.back')}
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={pending}
                    data-testid="coach-hand-over-confirm"
                    onClick={() => void handOver(true)}
                  >
                    {t('payments.coach.handOver.anyway')}
                  </Button>
                </div>
              </div>
            </Alert>
          ) : (
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={pending}
                data-testid="coach-hand-over"
                onClick={() => void handOver(false)}
              >
                {t('payments.coach.handOver.action')}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </li>
  )
}

function ChildCard({
  child,
  groupId,
  t,
  locale,
}: {
  child: CoachChild
  groupId: string
  t: Translate
  locale: string
}) {
  const refresh = useRefresh()
  const [accepting, setAccepting] = React.useState(false)
  const [reminding, setReminding] = React.useState(false)
  const canCollect = child.charges.some((charge) => charge.collectible)
  const canRemind = child.charges.some((charge) => charge.overdue && charge.payerPersonId && charge.remaining > 0)
  const remind = async () => {
    setReminding(true)
    try {
      const result = await remindPayers(
        { groupId, participantPersonId: child.personId },
        t('payments.coach.remind.error'),
      )
      flash(
        t('payments.coach.remind.done', { count: result.recipients }),
        result.recipients > 0 ? 'success' : 'warning',
      )
    } catch (error: unknown) {
      flash(errorMessage(error, t('payments.coach.remind.error')), 'error')
    } finally {
      setReminding(false)
    }
  }
  return (
    <li className="flex flex-col gap-3 rounded-md border p-4" data-testid="coach-child" data-person-id={child.personId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{personName(child)}</h3>
        <span className="flex items-center gap-2">
          {child.due > 0 ? (
            <span className="font-semibold">{formatMoney(child.due, locale)}</span>
          ) : (
            <StatusBadge variant="success">{t('payments.coach.paid')}</StatusBadge>
          )}
          {child.overdue ? <StatusBadge variant="error">{t('payments.charges.overdue')}</StatusBadge> : null}
        </span>
      </div>
      {child.payerMissing ? (
        <p className="text-muted-foreground text-sm" data-testid="coach-payer-missing">
          {t('payments.coach.payerMissing')}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {child.charges.map((charge) => (
          <ChargeRow key={charge.id} charge={charge} groupId={groupId} t={t} locale={locale} />
        ))}
      </ul>
      {accepting ? (
        <CashForm
          child={child}
          groupId={groupId}
          onCancel={() => {
            setAccepting(false)
          }}
          onDone={async () => {
            setAccepting(false)
            await refresh()
          }}
        />
      ) : canCollect || canRemind ? (
        <div className="flex flex-wrap gap-2">
          {canCollect ? (
            <Button
              type="button"
              className="min-h-11"
              data-testid="coach-accept-cash"
              onClick={() => {
                setAccepting(true)
              }}
            >
              {t('payments.coach.acceptCash')}
            </Button>
          ) : null}
          {canRemind ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={reminding}
              data-testid="coach-remind"
              onClick={() => void remind()}
            >
              {t('payments.coach.remind.action')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function CampaignCard({ campaign, groupId, t }: { campaign: CoachCampaign; groupId: string; t: Translate }) {
  const [showText, setShowText] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const textId = React.useId()
  const remind = async () => {
    setPending(true)
    try {
      const result = await remindCampaign(campaign.id, groupId, t('payments.coach.campaigns.remindError'))
      flash(t('payments.coach.campaigns.reminded', { count: result.recipients }), 'success')
    } catch (error: unknown) {
      flash(errorMessage(error, t('payments.coach.campaigns.remindError')), 'error')
    } finally {
      setPending(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(campaign.shareText)
      flash(t('payments.orders.share.copied'), 'success')
    } catch {
      flash(t('payments.orders.share.copyFailed'), 'error')
    }
  }
  const collecting = campaign.status === 'open'
  return (
    <li className="flex flex-col gap-2 rounded-md border p-4" data-testid="coach-campaign">
      <div className="flex flex-col">
        <span className="font-medium">{campaign.name}</span>
        <span className="text-muted-foreground text-sm">
          {collecting
            ? t('payments.coach.campaigns.collecting', { date: campaign.closesOn, count: campaign.missing })
            : t(`payments.orders.stage.${campaign.status}`, campaign.status)}
        </span>
      </div>
      {collecting ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending || campaign.missing === 0}
            data-testid="coach-campaign-remind"
            onClick={() => void remind()}
          >
            {t('payments.coach.campaigns.remind')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={showText}
            aria-controls={textId}
            data-testid="coach-campaign-share"
            onClick={() => {
              setShowText((value) => !value)
            }}
          >
            {t('payments.coach.campaigns.shareText')}
          </Button>
        </div>
      ) : null}
      {showText ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={textId} className="sr-only">
            {t('payments.coach.campaigns.shareText')}
          </label>
          <Textarea id={textId} readOnly rows={5} value={campaign.shareText} data-testid="coach-campaign-text" />
          <div>
            <Button type="button" className="min-h-11" onClick={() => void copy()}>
              {t('payments.orders.share.copy')}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function CoachPayments() {
  const t = useT()
  const locale = useLocale()
  const [groupId, setGroupId] = React.useState<string | null>(null)
  const [due, setDue] = React.useState(false)
  const query = useGroupCharges(groupId, due)

  if (!query.data && query.isFetching) return <LoadingMessage label={t('payments.coach.loading')} />
  if (!query.data) {
    return (
      <ErrorMessage
        label={t('payments.coach.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('payments.club.retry')}
          </Button>
        }
      />
    )
  }
  const view = query.data
  const selected = view.groupId
  return (
    <div className="flex flex-col gap-4">
      <CashWithYou cash={view.cash} t={t} locale={locale} />
      {view.groups.length === 0 || !selected ? (
        <p className="text-muted-foreground" data-testid="coach-no-groups">
          {t('payments.coach.noGroups')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('payments.coach.groups')}>
            {view.groups.map((group) => (
              <Button
                key={group.id}
                type="button"
                variant={group.id === selected ? 'default' : 'outline'}
                className="min-h-11"
                aria-pressed={group.id === selected}
                data-testid="coach-group-chip"
                onClick={() => {
                  setGroupId(group.id)
                }}
              >
                {t('payments.coach.groupChip', { name: group.name, count: group.peopleToPay })}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('payments.coach.filter')}>
            {[false, true].map((value) => (
              <Button
                key={String(value)}
                type="button"
                variant={due === value ? 'default' : 'outline'}
                className="min-h-11"
                aria-pressed={due === value}
                data-testid={value ? 'coach-filter-due' : 'coach-filter-all'}
                onClick={() => {
                  setDue(value)
                }}
              >
                {value ? t('payments.coach.filterDue') : t('payments.coach.filterAll')}
              </Button>
            ))}
          </div>
          {view.group ? (
            <section
              className="bg-muted/40 flex flex-wrap gap-x-6 gap-y-1 rounded-md p-4"
              data-testid="coach-group-card"
            >
              <span>
                {t('payments.coach.groupTotal')}{' '}
                <strong data-testid="coach-group-total">{formatMoney(view.group.totalDue, locale)}</strong>
              </span>
              <span>{t('payments.coach.groupOverdue', { count: view.group.peopleOverdue })}</span>
            </section>
          ) : null}
          {view.children.length === 0 ? (
            <p className="text-muted-foreground" data-testid="coach-all-paid">
              {t('payments.coach.allPaid')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label={t('payments.coach.children')}>
              {view.children.map((child) => (
                <ChildCard key={child.personId} child={child} groupId={selected} t={t} locale={locale} />
              ))}
            </ul>
          )}
          {view.campaigns.length > 0 ? (
            <section className="flex flex-col gap-2" aria-labelledby="coach-campaigns-heading">
              <h2 id="coach-campaigns-heading" className="text-lg font-semibold">
                {t('payments.coach.campaigns.title')}
              </h2>
              <ul className="flex flex-col gap-2">
                {view.campaigns.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} groupId={selected} t={t} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

export function CoachPaymentsPage() {
  const t = useT()
  return (
    <PaymentsClubFrame payerOnly={false}>
      {() => (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">{t('payments.coach.title')}</h1>
            <p className="text-muted-foreground text-sm">{t('payments.coach.help')}</p>
          </div>
          <CoachPayments />
        </div>
      )}
    </PaymentsClubFrame>
  )
}
