'use client'
// The read view of a library entry (training outlines spec M-O8 entry page, P-O1; E24-S05, #685): the credit (the club,
// the author's "First L." only with consent, "adapted from" the first author), the licence, the rating and uses, the
// header facts, then the three parts with their exercises and images. Used on the member entry page and the public
// page; text is rendered as text (React escapes it).
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { OUTLINE_PARTS } from '../lib/outline'
import type { LibraryCredit, LibraryEntry } from './club/library-client'

export function CreditLine({ credit }: { credit: LibraryCredit }) {
  const t = useT()
  const by = credit.authorName
    ? t('training.library.credit.byAuthor', { author: credit.authorName, club: credit.clubName })
    : t('training.library.credit.byClub', { club: credit.clubName })
  const origin = credit.adaptedFrom
  return (
    <span className="text-muted-foreground text-sm" data-testid="training-library-credit">
      {by}
      {origin
        ? ` · ${
            origin.authorName
              ? t('training.library.credit.adaptedFromAuthor', { author: origin.authorName, club: origin.clubName })
              : t('training.library.credit.adaptedFromClub', { club: origin.clubName })
          }`
        : null}
    </span>
  )
}

export function RatingLine({ entry }: { entry: Pick<LibraryEntry, 'averageRating' | 'ratingCount' | 'userCount'> }) {
  const t = useT()
  return (
    <span className="text-muted-foreground text-sm" data-testid="training-library-rating">
      {entry.averageRating === null
        ? t('training.library.rating.none')
        : t('training.library.rating.average', { average: entry.averageRating, count: entry.ratingCount })}
      {' · '}
      {t('training.library.uses', { count: entry.userCount })}
    </span>
  )
}

export function LibraryEntryView({ entry }: { entry: LibraryEntry }) {
  const t = useT()
  const facts: Array<[string, React.ReactNode]> = [
    [t('training.outline.fields.ageCategory'), entry.ageCategory],
    [t('training.outline.fields.duration'), String(entry.durationMinutes)],
  ]
  if (entry.playersCount) facts.push([t('training.outline.fields.players'), String(entry.playersCount)])
  if (entry.goal) facts.push([t('training.outline.fields.goal'), entry.goal])
  if (entry.specificGoals) facts.push([t('training.outline.fields.specificGoals'), entry.specificGoals])
  if (entry.equipment) facts.push([t('training.outline.fields.equipment'), entry.equipment])
  return (
    <div className="flex flex-col gap-4" data-testid="training-library-entry">
      <div className="flex flex-col gap-1">
        <CreditLine credit={entry.credit} />
        <RatingLine entry={entry} />
        <span className="text-muted-foreground text-xs" data-testid="training-library-licence">
          {t('training.library.licence', { licence: 'CC BY-SA 4.0' })}{' '}
          <a
            href={entry.licenceUrl}
            className="text-primary underline"
            rel="license noopener noreferrer"
            target="_blank"
          >
            {t('training.library.licenceLink')}
          </a>
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm break-words whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
      {OUTLINE_PARTS.map((part) => (
        <section key={part} className="flex flex-col gap-2" aria-labelledby={`entry-${entry.id}-${part}`}>
          <h2 id={`entry-${entry.id}-${part}`} className="font-semibold">
            {t(`training.outline.parts.${part}`)}
          </h2>
          {entry.parts[part].length > 0 ? (
            <ol className="flex flex-col gap-2">
              {entry.parts[part].map((exercise, index) => (
                <li
                  key={`${part}-${String(index)}`}
                  className="flex flex-col gap-2 rounded-md border p-3"
                  data-testid="training-library-exercise"
                >
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
                      <span className="text-muted-foreground text-xs">
                        {t('training.outline.fields.coachingPoints')}
                      </span>
                      <p className="text-sm whitespace-pre-line">{exercise.coachingPoints}</p>
                    </div>
                  ) : null}
                  {exercise.image !== null && entry.images[exercise.image] ? (
                    // A route of this module (signed-in or public); the platform image optimizer cannot forward the session.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.images[exercise.image]}
                      alt={t('training.outline.imageAlt', { name: exercise.name })}
                      className="max-h-64 w-full rounded-md border object-contain"
                      loading="lazy"
                      data-testid="training-library-image"
                    />
                  ) : null}
                </li>
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
