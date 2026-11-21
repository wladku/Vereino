'use client'
// `/backend/facilities/requests` — "Requests awaiting approval" (facilities spec B-25, J-007 step 4, REQ-024; E08-S05
// #125): the confirmed online requests whose 48-hour hold is still running, the soonest expiry first. Since #280
// (facilities parity spec phase 6, REQ-R08, DD-R16 — a recorded exception to `DataTable`) each request is a card, an
// `article` headed by the renter and the place: the expiry badge with the time left; the slot, the units and the renter
// category; the contact, the purpose and the indicative amount with its payee; the collisions by name (or "no
// conflict"), the ban check, "rules accepted online" and "e-mail confirmed" as text badges; Approve and Reject; "Load
// more". The three fact columns stack under 768 px and the buttons go full width under 640 px (the design-system `sm` step, so under 480 px too). States: loading (card
// skeletons), empty, error with retry, no permission (403), and a request decided or expired meanwhile (409: the dialog
// closes with a message and the card leaves the queue). Needs `facilities.rentals.approve`.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Skeleton } from '@open-mercato/ui/primitives/skeleton'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { ListEmptyState } from './FacilitiesControls'
import { ApproveRequestDialog, RejectRequestDialog } from './RequestDecisionDialogs'
import { errorMessage } from './facilities-client'
import { payeeLabel } from './rentals-client'
import {
  REQUESTS_KEY,
  expiresAtLabel,
  expiryLabel,
  moneyLabel,
  queueSlotLabel,
  queueTimeRange,
  useRequestQueuePages,
  type RequestQueueItem,
} from './requests-client'
import { StatusTag } from '@vereino/ui'

const PAGE_SIZE = 25

type Decision = { kind: 'approve' | 'reject'; item: RequestQueueItem } | null

function isForbidden(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 403
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  )
}

function RequestCard({
  item,
  timeZone,
  currency,
  now,
  onDecide,
}: {
  item: RequestQueueItem
  timeZone: string
  currency: string
  now: Date
  onDecide: (decision: NonNullable<Decision>) => void
}) {
  const t = useT()
  const locale = useLocale()
  const headingId = React.useId()
  const empty = t('facilities.common.empty')
  const contact = [item.contactName, item.contactEmail, item.contactPhone].filter((value): value is string =>
    Boolean(value),
  )
  return (
    <article
      aria-labelledby={headingId}
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
      data-testid={`facilities-request-card-${item.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className="text-base font-semibold break-words">
            {t('facilities.requests.card.heading', {
              renter: item.renterDisplayName,
              place: item.placeName || t('facilities.common.unknownPlace'),
            })}
          </h2>
          <p className="text-muted-foreground text-sm">
            {queueSlotLabel(item.startsAt, item.endsAt, timeZone, locale)} ·{' '}
            {t('facilities.rentals.units.label', { units: item.units, minutes: item.units * 90 })} ·{' '}
            {t(`facilities.rates.category.${item.renterCategory}`)}
          </p>
        </div>
        <span className="flex flex-col items-end gap-0.5 text-end" data-testid={`facilities-request-expiry-${item.id}`}>
          <StatusTag status="warning">
            {t('facilities.requests.card.expires', { at: expiresAtLabel(item.holdExpiresAt, timeZone, locale) })}
          </StatusTag>
          <span className="text-muted-foreground text-xs tabular-nums">
            {t('facilities.requests.card.timeLeft', { left: expiryLabel(t, item.holdExpiresAt, now) })}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
        <Fact label={t('facilities.requests.columns.contact')}>
          {contact.length > 0 ? (
            <span className="flex flex-col break-all" data-testid={`facilities-request-contact-${item.id}`}>
              {contact.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          ) : (
            <span>{empty}</span>
          )}
        </Fact>
        <Fact label={t('facilities.requests.columns.purpose')}>
          <span className="break-words">{item.purpose ?? empty}</span>
        </Fact>
        <Fact label={t('facilities.requests.columns.amount')}>
          <span className="font-semibold tabular-nums">
            {item.amount === null ? t('facilities.requests.amount.none') : moneyLabel(item.amount, currency, locale)}
          </span>
          <span className="text-muted-foreground text-xs" data-testid={`facilities-request-payee-${item.id}`}>
            {payeeLabel(t, item.payee)}
          </span>
        </Fact>
      </div>

      {item.conflicts.length > 0 ? (
        <Alert style="light" status="error" data-testid={`facilities-request-conflicts-${item.id}`}>
          <AlertTitle>{t('facilities.requests.card.conflict')}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-4">
              {item.conflicts.map((conflict, index) => (
                <li key={`${conflict.kind}-${conflict.start}-${String(index)}`}>
                  {t('facilities.requests.card.conflictItem', {
                    kind: t(`facilities.requests.conflicts.kind.${conflict.kind}`),
                    label: conflict.label ?? empty,
                    time: queueTimeRange(conflict.start, conflict.end, timeZone, locale),
                  })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <ul className="flex flex-wrap gap-2" aria-label={t('facilities.requests.card.checks')}>
        {item.conflicts.length === 0 ? (
          <li data-testid={`facilities-request-no-conflict-${item.id}`}>
            <StatusTag status="success">{t('facilities.requests.card.noConflict')}</StatusTag>
          </li>
        ) : null}
        <li data-testid={`facilities-request-ban-${item.id}`}>
          {item.entryBanMatch ? (
            <StatusTag status="error">{t('facilities.requests.card.banMatch')}</StatusTag>
          ) : (
            <StatusTag status="success">{t('facilities.requests.card.noBan')}</StatusTag>
          )}
        </li>
        {item.regulationsAcceptedAt ? (
          <li data-testid={`facilities-request-rules-${item.id}`}>
            <StatusTag status="neutral">{t('facilities.requests.card.rulesAccepted')}</StatusTag>
          </li>
        ) : null}
        {item.emailVerifiedAt ? (
          <li data-testid={`facilities-request-email-${item.id}`}>
            <StatusTag status="neutral">{t('facilities.requests.card.emailConfirmed')}</StatusTag>
          </li>
        ) : null}
      </ul>

      <div className="flex flex-wrap gap-2" data-testid={`facilities-request-actions-${item.id}`}>
        <Button
          type="button"
          className="w-full sm:w-auto"
          data-testid={`facilities-request-approve-${item.id}`}
          onClick={() => {
            onDecide({ kind: 'approve', item })
          }}
        >
          {t('facilities.requests.actions.approve')}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="w-full sm:w-auto"
          data-testid={`facilities-request-reject-${item.id}`}
          onClick={() => {
            onDecide({ kind: 'reject', item })
          }}
        >
          {t('facilities.requests.actions.reject')}
        </Button>
      </div>
    </article>
  )
}

export function RequestsQueue() {
  const t = useT()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const [decision, setDecision] = React.useState<Decision>(null)
  const query = useRequestQueuePages(PAGE_SIZE, [scopeVersion])
  const { items, first, isLoading, error } = query
  // The time to expiry is read against the moment the queue was loaded; it reloads after each decision.
  const loadedAt = query.dataUpdatedAt
  const now = React.useMemo(() => (loadedAt ? new Date(loadedAt) : new Date()), [loadedAt])
  const timeZone = first?.timeZone ?? 'UTC'
  const currency = first?.currency ?? 'PLN'

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY] })
  }, [queryClient])

  const title = t('facilities.requests.title')
  if (error && isForbidden(error)) {
    return (
      <section className="flex flex-col gap-4" data-testid="facilities-requests-forbidden">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <AccessDeniedMessage label={t('facilities.requests.errors.forbidden')} />
      </section>
    )
  }
  if (error) {
    return (
      <section className="flex flex-col gap-4" data-testid="facilities-requests-error">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <ErrorMessage
          label={errorMessage(error, t('facilities.requests.errors.load'))}
          action={
            <Button type="button" variant="outline" onClick={() => void query.refetch()}>
              {t('facilities.public.actions.retry')}
            </Button>
          }
        />
      </section>
    )
  }

  if (!isLoading && items.length === 0) {
    return <ListEmptyState title={title} message={t('facilities.requests.empty')} testId="facilities-requests-empty" />
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4" data-testid="facilities-requests-cards" aria-busy={isLoading}>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground text-sm">{t('facilities.requests.subtitle')}</p>
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-4" data-testid="facilities-requests-loading">
            <span className="sr-only">{t('facilities.common.loading')}</span>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          items.map((item) => (
            <RequestCard
              key={item.id}
              item={item}
              timeZone={timeZone}
              currency={currency}
              now={now}
              onDecide={setDecision}
            />
          ))
        )}
        {query.hasNextPage ? (
          <div>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={query.isFetchingNextPage}
              data-testid="facilities-requests-load-more"
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage
                ? t('facilities.common.loading')
                : t('facilities.requests.loadMore', { shown: items.length, total: first?.total ?? items.length })}
            </Button>
          </div>
        ) : null}
      </section>
      {decision?.kind === 'approve' ? (
        <ApproveRequestDialog
          key={`approve-${decision.item.id}`}
          item={decision.item}
          timeZone={timeZone}
          currency={currency}
          open
          onOpenChange={(open) => {
            if (!open) setDecision(null)
          }}
          onDone={refresh}
        />
      ) : null}
      {decision?.kind === 'reject' ? (
        <RejectRequestDialog
          key={`reject-${decision.item.id}`}
          item={decision.item}
          timeZone={timeZone}
          currency={currency}
          open
          onOpenChange={(open) => {
            if (!open) setDecision(null)
          }}
          onDone={refresh}
        />
      ) : null}
    </div>
  )
}
