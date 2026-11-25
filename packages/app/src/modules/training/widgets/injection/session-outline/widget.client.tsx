'use client'
// The "Outline" card of `/club/occurrences/[id]` (training outlines spec M-O6, J-O03, J-O04; REQ-O07, REQ-O08; #683):
// on opening, `POST /api/training/outlines/ensure-copy` answers the session's outline — making the session's own copy
// of its activity's series outline when it has none yet (an explicit, idempotent write; never a write inside a GET).
// None → "Add outline": write a new one for the session, or copy one of "my outlines" into it (the library arrives
// with phase 4). Present → the read view with its parts and exercises, "Edit" (unless locked 72 hours after the
// session's end, BR-O3) and "PDF". States: loading, error with retry, none, locked, forbidden (renders nothing).
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { MemberSkeleton, Notice } from '@vereino/ui'
import { OutlineReadView } from '../../../components/club/OutlineReadView'
import {
  OUTLINES_QUERY_KEY,
  attachOutline,
  ensureCopy,
  errorText,
  fetchOutline,
  newOutlineHref,
  outlineHref,
  outlinePrintHref,
  useOutlines,
  type OutlineLoad,
} from '../../../components/club/club-client'

export type SessionOutlineContext = {
  occurrence?: { id: string; activityId?: string; status?: string }
  as?: 'coach' | 'coordinator'
}

const SESSION_OUTLINE_QUERY_KEY = 'training-session-outline'

type SessionOutlineLoad = OutlineLoad | { status: 'none' }

function useSessionOutline(occurrenceId: string) {
  const t = useT()
  return useQuery({
    queryKey: [SESSION_OUTLINE_QUERY_KEY, occurrenceId],
    retry: false,
    queryFn: async (): Promise<SessionOutlineLoad> => {
      try {
        const { id } = await ensureCopy(occurrenceId, t('training.widget.errors.load'))
        return id ? await fetchOutline(id) : { status: 'none' }
      } catch (error: unknown) {
        const status = (error as { status?: number } | null)?.status
        if (status === 403 || status === 404) return { status: 'forbidden' }
        throw error
      }
    },
  })
}

function FromMyOutlines({ occurrenceId, onAttached }: { occurrenceId: string; onAttached: () => Promise<void> }) {
  const t = useT()
  const id = React.useId()
  const mine = useOutlines({ view: 'mine', search: '', ageCategory: '' })
  const [selected, setSelected] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const items = mine.data?.items ?? []
  if (!mine.data) return <MemberSkeleton shape="rows" label={t('training.list.loading')} />
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{t('training.widget.noOwnOutlines')}</p>
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-mine`}>{t('training.widget.pickOwn')}</Label>
      <select
        id={`${id}-mine`}
        className="border-input bg-background focus-visible:ring-ring min-h-11 rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
        value={selected}
        onChange={(event) => {
          setSelected(event.target.value)
        }}
        data-testid="training-widget-own-select"
      >
        <option value="">{t('training.widget.choose')}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.ageCategory ? `${item.topic} (${item.ageCategory})` : item.topic}
          </option>
        ))}
      </select>
      <div>
        <Button
          type="button"
          className="min-h-11"
          disabled={!selected || busy}
          onClick={() => {
            setBusy(true)
            void attachOutline(selected, { occurrenceId }, t('training.widget.errors.attach'))
              .then(async () => {
                flash(t('training.widget.attached'), 'success')
                await onAttached()
              })
              .catch((error: unknown) => {
                flash(errorText(error, t('training.widget.errors.attach')), 'error')
              })
              .finally(() => {
                setBusy(false)
              })
          }}
          data-testid="training-widget-attach"
        >
          {t('training.widget.attach')}
        </Button>
      </div>
    </div>
  )
}

export default function SessionOutlineWidget({
  context,
}: InjectionWidgetComponentProps<SessionOutlineContext, Record<string, unknown>>) {
  const t = useT()
  const queryClient = useQueryClient()
  const occurrenceId = context.occurrence?.id ?? ''
  const query = useSessionOutline(occurrenceId)
  const [picking, setPicking] = React.useState(false)
  if (!occurrenceId) return null

  const refresh = async () => {
    setPicking(false)
    await queryClient.invalidateQueries({ queryKey: [SESSION_OUTLINE_QUERY_KEY, occurrenceId] })
    await queryClient.invalidateQueries({ queryKey: [OUTLINES_QUERY_KEY] })
  }

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('training.widget.loading')} />
  } else if (!query.data) {
    body = (
      <div className="flex flex-col gap-2" role="alert">
        <p className="text-sm">{t('training.widget.errors.load')}</p>
        <div>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('training.club.actions.retry')}
          </Button>
        </div>
      </div>
    )
  } else if (query.data.status === 'forbidden' || query.data.status === 'not_found') {
    return null
  } else if (query.data.status === 'none') {
    body = (
      <div className="flex flex-col gap-3" data-testid="training-widget-none">
        <p className="text-muted-foreground text-sm">{t('training.widget.none')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="min-h-11">
            <Link href={newOutlineHref({ occurrenceId })} data-testid="training-widget-new">
              {t('training.widget.new')}
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={picking}
            onClick={() => {
              setPicking((value) => !value)
            }}
            data-testid="training-widget-from-own"
          >
            {t('training.widget.fromOwn')}
          </Button>
        </div>
        {picking ? <FromMyOutlines occurrenceId={occurrenceId} onAttached={refresh} /> : null}
      </div>
    )
  } else {
    const outline = query.data.outline
    body = (
      <div className="flex flex-col gap-3" data-testid="training-widget-outline">
        <p className="font-semibold" data-testid="training-widget-topic">
          {outline.topic}
        </p>
        {outline.locked ? <Notice>{t('training.editor.locked')}</Notice> : null}
        <OutlineReadView outline={outline} />
        <div className="flex flex-col gap-2 sm:flex-row">
          {outline.locked ? null : (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={outlineHref(outline.id)} data-testid="training-widget-edit">
                {t('training.widget.edit')}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" className="min-h-11">
            <Link href={outlinePrintHref(outline.id)} data-testid="training-widget-pdf">
              {t('training.actions.pdf')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      aria-labelledby="training-widget-heading"
      data-testid="training-session-outline"
    >
      <h2 id="training-widget-heading" className="text-lg font-semibold">
        {t('training.widget.title')}
      </h2>
      {body}
    </section>
  )
}
