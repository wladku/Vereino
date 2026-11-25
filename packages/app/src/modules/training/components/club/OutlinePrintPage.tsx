'use client'
// `/club/training/outlines/[id]/print` — the outline in the PZPN layout on A4 (training outlines spec M-O7, DD-O08,
// Q-O07: the browser's "Print → Save as PDF" makes the file; REQ-O09; #683): a header table (club, team, age category,
// date, place, coach, number of players, duration, topic, goal, specific goals, equipment), then the three part tables
// with the columns *Ćwiczenie / organizacja*, *Czas*, *Uwagi metodyczne*, each exercise's image below it. The labels
// follow the outline's language (both catalogs' `training.print.*` texts come from the server page), not the reader's;
// the toolbar ("Print / Save as PDF", back) and everything outside the sheet are hidden in print media. The document
// title is the PDF's file name, which browsers offer as the name of the saved file. The page renders at 375 px too.
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { outlineImageUrl } from '../../lib/images'
import { OUTLINE_PARTS, type OutlineLanguage } from '../../lib/outline'
import { outlineHref, useOutline, type Outline } from './club-client'

/** The `training.print.*` texts of each outline language, read on the server from the catalogs. */
export type PrintLabels = Record<OutlineLanguage, Record<string, string>>

/** Everything but the sheet is hidden in print media; the sheet fills an A4 page. */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
@media print {
  body * { visibility: hidden; }
  [data-print-sheet], [data-print-sheet] * { visibility: visible; }
  [data-print-sheet] { position: absolute; inset: 0 auto auto 0; width: 100%; }
  [data-print-sheet] tr, [data-print-sheet] img { break-inside: avoid; }
}
`

function formatDate(value: string, language: OutlineLanguage): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString(language === 'pl' ? 'pl-PL' : 'en-GB')
}

function formatTime(value: string, language: OutlineLanguage): string {
  return new Date(value).toLocaleTimeString(language === 'pl' ? 'pl-PL' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Sheet({ outline, clubName, labels }: { outline: Outline; clubName: string; labels: Record<string, string> }) {
  const label = (key: string) => labels[key] ?? key
  const session = outline.session
  const when = session
    ? `${formatDate(session.occurrenceDate, outline.language)} ${formatTime(session.startAt, outline.language)}–${formatTime(session.endAt, outline.language)}`
    : ''
  const header: Array<[string, string]> = [
    [label('club'), clubName],
    [label('team'), outline.groupName ?? ''],
    [label('ageCategory'), outline.ageCategory],
    [label('date'), when],
    [label('place'), session?.placeLabel ?? ''],
    [label('coach'), session?.coachName ?? outline.authorName ?? ''],
    [label('players'), outline.playersCount ? String(outline.playersCount) : ''],
    [label('duration'), `${String(outline.durationMinutes)} ${label('minutes')}`],
    [label('topic'), outline.topic],
    [label('goal'), outline.goal],
    [label('specificGoals'), outline.specificGoals],
    [label('equipment'), outline.equipment],
  ]
  const cell = 'border-border border p-2 align-top'
  return (
    <article
      data-print-sheet
      lang={outline.language}
      className="bg-background text-foreground flex flex-col gap-4 text-sm"
      data-testid="training-print-sheet"
    >
      <h1 className="text-center text-lg font-bold uppercase">{label('title')}</h1>
      <table className="w-full border-collapse" data-testid="training-print-header">
        <tbody>
          {header.map(([name, value]) => (
            <tr key={name}>
              <th scope="row" className={`${cell} w-1/3 text-left font-semibold`}>
                {name}
              </th>
              <td className={`${cell} whitespace-pre-line`}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {OUTLINE_PARTS.map((part) => (
        <table key={part} className="w-full border-collapse" data-testid={`training-print-part-${part}`}>
          <caption className="pb-1 text-left font-bold">
            {label(`part.${part}`)} ({String(outline.minutes[part])} {label('minutes')})
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${cell} text-left`}>
                {label('column.exercise')}
              </th>
              <th scope="col" className={`${cell} w-16 text-left`}>
                {label('column.time')}
              </th>
              <th scope="col" className={`${cell} text-left`}>
                {label('column.coachingPoints')}
              </th>
            </tr>
          </thead>
          <tbody>
            {outline.parts[part].length === 0 ? (
              <tr>
                <td className={cell} colSpan={3}>
                  —
                </td>
              </tr>
            ) : (
              outline.parts[part].map((exercise, index) => (
                <tr key={`${part}-${String(index)}`}>
                  <td className={cell}>
                    <p className="font-semibold">
                      {index + 1}. {exercise.name}
                    </p>
                    {exercise.organisation ? <p className="whitespace-pre-line">{exercise.organisation}</p> : null}
                    {exercise.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={outlineImageUrl(outline.id, exercise.image.attachmentId)}
                        alt={exercise.name}
                        className="mt-2 max-h-56 max-w-full object-contain"
                      />
                    ) : null}
                  </td>
                  <td className={cell}>
                    {exercise.minutes} {label('minutes')}
                  </td>
                  <td className={`${cell} whitespace-pre-line`}>{exercise.coachingPoints}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ))}
    </article>
  )
}

export function OutlinePrintPage({ id, labels }: { id: string; labels: PrintLabels }) {
  const t = useT()
  const query = useOutline(id)
  const outline = query.data?.status === 'ok' ? query.data.outline : null
  React.useEffect(() => {
    if (!outline) return
    const previous = document.title
    document.title = outline.fileName
    return () => {
      document.title = previous
    }
  }, [outline])

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('training.print.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('training.editor.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('training.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (!outline) {
    body = (
      <Alert style="light" status="warning" data-testid="training-outline-missing">
        <p className="max-w-prose">
          {t(query.data.status === 'forbidden' ? 'training.editor.forbidden' : 'training.editor.notFound')}
        </p>
      </Alert>
    )
  } else {
    body = <Sheet outline={outline} clubName={outline.clubName ?? ''} labels={labels[outline.language]} />
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      <style>{PRINT_CSS}</style>
      <div
        className="flex flex-wrap items-center justify-between gap-2 print:hidden"
        data-testid="training-print-toolbar"
      >
        <Link href={outlineHref(id)} className="text-primary inline-flex min-h-11 items-center text-sm underline">
          {t('training.print.back')}
        </Link>
        <Button
          type="button"
          className="min-h-11"
          disabled={!outline}
          onClick={() => {
            window.print()
          }}
          data-testid="training-print-button"
        >
          {t('training.print.print')}
        </Button>
      </div>
      {outline ? <p className="text-muted-foreground text-sm print:hidden">{t('training.print.hint')}</p> : null}
      {body}
    </main>
  )
}
