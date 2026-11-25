'use client'
// The read view of an outline (training outlines spec M-O6: "read view with parts and exercises"; REQ-O08; #683): the
// header facts (age category, duration against the planned minutes, players, goal, specific goals, equipment), then
// the three parts with their exercises — name, minutes, organisation, coaching points and the image. Used on the
// session page widget and on the outline page.
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { outlineImageUrl } from '../../lib/images'
import { OUTLINE_PARTS, type OutlineExercise } from '../../lib/outline'
import type { Outline } from './club-client'

function Exercise({ outlineId, exercise, index }: { outlineId: string; exercise: OutlineExercise; index: number }) {
  const t = useT()
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3" data-testid="training-outline-exercise">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {index + 1}. {exercise.name}
        </span>
        <span className="text-muted-foreground text-sm">
          {t('training.outline.minutesShort', { minutes: exercise.minutes })}
        </span>
      </div>
      {exercise.organisation ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{t('training.outline.fields.organisation')}</span>
          <p className="text-sm whitespace-pre-line">{exercise.organisation}</p>
        </div>
      ) : null}
      {exercise.coachingPoints ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{t('training.outline.fields.coachingPoints')}</span>
          <p className="text-sm whitespace-pre-line">{exercise.coachingPoints}</p>
        </div>
      ) : null}
      {exercise.image ? (
        // An authenticated route of this module; the platform image optimizer cannot forward the session.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={outlineImageUrl(outlineId, exercise.image.attachmentId)}
          alt={t('training.outline.imageAlt', { name: exercise.name })}
          className="max-h-64 w-full rounded-md border object-contain"
          loading="lazy"
          data-testid="training-outline-image"
        />
      ) : null}
    </li>
  )
}

export function OutlineReadView({ outline }: { outline: Outline }) {
  const t = useT()
  const facts: Array<[string, React.ReactNode]> = [
    [t('training.outline.fields.ageCategory'), outline.ageCategory],
    [
      t('training.outline.fields.duration'),
      t('training.outline.durationPlanned', {
        duration: outline.durationMinutes,
        planned: outline.minutes.total,
      }),
    ],
  ]
  if (outline.playersCount) facts.push([t('training.outline.fields.players'), String(outline.playersCount)])
  if (outline.goal) facts.push([t('training.outline.fields.goal'), outline.goal])
  if (outline.specificGoals) facts.push([t('training.outline.fields.specificGoals'), outline.specificGoals])
  if (outline.equipment) facts.push([t('training.outline.fields.equipment'), outline.equipment])
  return (
    <div className="flex flex-col gap-4" data-testid="training-outline-read">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm break-words whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
      {OUTLINE_PARTS.map((part) => (
        <section key={part} className="flex flex-col gap-2" aria-labelledby={`outline-${outline.id}-${part}`}>
          <h3 id={`outline-${outline.id}-${part}`} className="flex items-baseline justify-between gap-2 font-semibold">
            <span>{t(`training.outline.parts.${part}`)}</span>
            <span className="text-muted-foreground text-sm font-normal">
              {t('training.outline.minutesShort', { minutes: outline.minutes[part] })}
            </span>
          </h3>
          {outline.parts[part].length > 0 ? (
            <ol className="flex flex-col gap-2">
              {outline.parts[part].map((exercise, index) => (
                <Exercise key={`${part}-${String(index)}`} outlineId={outline.id} exercise={exercise} index={index} />
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">{t('training.outline.partEmpty')}</p>
          )}
        </section>
      ))}
    </div>
  )
}
