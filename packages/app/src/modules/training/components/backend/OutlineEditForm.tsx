'use client'
// `/backend/training/outlines/[id]` — one training outline in the back office (training outlines spec *UI
// architecture*, M-O5; #847): the PZPN header in a `CrudForm` (language, topic, goal, specific goals, age category,
// duration, players, equipment) and the three parts with their exercises as the member pages show them; exercises and
// images are edited on the member editor, linked from here with the printout. The save and the delete send the
// version (a 409 shows the platform's conflict); a session outline 72 hours after its end is read-only (409
// `outline_locked`, shown on the form). States: loading, not found, forbidden, error.
import * as React from 'react'
import Link from 'next/link'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { deleteCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { OUTLINE_LANGUAGES, OUTLINE_LIMITS } from '../../lib/outline'
import { OutlineReadView } from '../club/OutlineReadView'
import { outlineHref, outlinePrintHref, useOutline, type Outline } from '../club/club-client'
import { BACKEND_OUTLINES_API, BACKEND_OUTLINES_HREF, outlineCodedMessage, type Translate } from './backend-client'

const ENTITY_ID = 'training:outline'

type OutlineFormValues = Record<string, unknown> & { updatedAt?: string | null }

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function wholeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return null
}

function useOutlineFields(t: Translate, outline: Outline | null) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'language',
        label: t('training.outline.fields.language'),
        type: 'select',
        required: true,
        options: OUTLINE_LANGUAGES.map((language) => ({
          value: language,
          label: t(`training.outline.languages.${language}`),
        })),
      },
      {
        id: 'topic',
        label: t('training.outline.fields.topic'),
        type: 'text',
        required: true,
        maxLength: OUTLINE_LIMITS.topic.max,
      },
      { id: 'goal', label: t('training.outline.fields.goal'), type: 'textarea', maxLength: OUTLINE_LIMITS.goal },
      {
        id: 'specificGoals',
        label: t('training.outline.fields.specificGoals'),
        type: 'textarea',
        maxLength: OUTLINE_LIMITS.specificGoals,
      },
      {
        id: 'ageCategory',
        label: t('training.outline.fields.ageCategory'),
        type: 'text',
        required: true,
        layout: 'half',
        maxLength: OUTLINE_LIMITS.ageCategory,
      },
      {
        id: 'durationMinutes',
        label: t('training.outline.fields.duration'),
        type: 'number',
        required: true,
        layout: 'half',
      },
      { id: 'playersCount', label: t('training.outline.fields.players'), type: 'number', layout: 'half' },
      {
        id: 'equipment',
        label: t('training.outline.fields.equipment'),
        type: 'textarea',
        maxLength: OUTLINE_LIMITS.equipment,
      },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'header',
        title: t('training.backend.groups.header'),
        column: 1,
        fields: [
          'language',
          'topic',
          'goal',
          'specificGoals',
          'ageCategory',
          'durationMinutes',
          'playersCount',
          'equipment',
        ],
      },
      {
        id: 'parts',
        title: t('training.backend.groups.parts'),
        column: 1,
        component: () =>
          outline ? (
            <div className="flex flex-col gap-4" data-testid="training-backend-outline-parts">
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={outlineHref(outline.id)} data-testid="training-backend-outline-exercises">
                    {t('training.backend.actions.exercises')}
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={outlinePrintHref(outline.id)}>{t('training.actions.pdf')}</Link>
                </Button>
              </div>
              <OutlineReadView outline={outline} facts={false} />
            </div>
          ) : null,
      },
    ],
    [t, outline],
  )
  return { fields, groups }
}

function toFormValues(outline: Outline | null, id: string): OutlineFormValues {
  return {
    id,
    language: outline?.language ?? 'pl',
    topic: outline?.topic ?? '',
    goal: outline?.goal ?? '',
    specificGoals: outline?.specificGoals ?? '',
    ageCategory: outline?.ageCategory ?? '',
    durationMinutes: outline?.durationMinutes ?? undefined,
    playersCount: outline?.playersCount ?? undefined,
    equipment: outline?.equipment ?? '',
    updatedAt: outline?.updatedAt ?? null,
  }
}

/** The update body; the duration and the players are checked against the editor's limits on their fields first. */
function outlineBody(values: OutlineFormValues, t: Translate) {
  const durationMinutes = wholeNumber(values.durationMinutes)
  if (
    durationMinutes === null ||
    durationMinutes < OUTLINE_LIMITS.duration.min ||
    durationMinutes > OUTLINE_LIMITS.duration.max
  ) {
    const message = t('training.editor.problems.duration')
    throw createCrudFormError(message, { durationMinutes: message })
  }
  const blank = values.playersCount === '' || values.playersCount == null
  const players = blank ? null : wholeNumber(values.playersCount)
  if (!blank && (players === null || players < OUTLINE_LIMITS.players.min || players > OUTLINE_LIMITS.players.max)) {
    const message = t('training.backend.problems.players', {
      min: OUTLINE_LIMITS.players.min,
      max: OUTLINE_LIMITS.players.max,
    })
    throw createCrudFormError(message, { playersCount: message })
  }
  const topic = text(values.topic)
  if (topic.length < OUTLINE_LIMITS.topic.min) {
    const message = t('training.editor.problems.topic')
    throw createCrudFormError(message, { topic: message })
  }
  return {
    language: OUTLINE_LANGUAGES.includes(values.language as (typeof OUTLINE_LANGUAGES)[number])
      ? (values.language as (typeof OUTLINE_LANGUAGES)[number])
      : 'pl',
    topic,
    goal: text(values.goal),
    specificGoals: text(values.specificGoals),
    ageCategory: text(values.ageCategory),
    durationMinutes,
    playersCount: players,
    equipment: text(values.equipment),
  }
}

/** A refused save as the form shows it: the module's coded errors as a form message; others pass on unchanged. */
function saveError(error: unknown, t: Translate): unknown {
  const message = outlineCodedMessage(error, t)
  return message ? createCrudFormError(message) : error
}

export function OutlineEditForm({ id }: { id: string }) {
  const t = useT()
  const query = useOutline(id)
  const outline = query.data?.status === 'ok' ? query.data.outline : null
  const { fields, groups } = useOutlineFields(t, outline)
  const initialValues = React.useMemo(() => toFormValues(outline, id), [outline, id])

  if (query.data?.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('training.editor.notFound')}
        backHref={BACKEND_OUTLINES_HREF}
        backLabel={t('training.editor.back')}
      />
    )
  }
  if (query.data?.status === 'forbidden') return <ErrorMessage label={t('training.editor.forbidden')} />
  if (query.error) return <ErrorMessage label={t('training.editor.errors.load')} />

  return (
    <div className="flex flex-col gap-4">
      {outline?.locked ? (
        <p
          className="text-muted-foreground rounded-md border p-3 text-sm"
          role="status"
          data-testid="training-backend-outline-locked"
        >
          {t('training.editor.locked')}
        </p>
      ) : null}
      <CrudForm<OutlineFormValues>
        key={outline ? outline.updatedAt : 'loading'}
        title={outline ? outline.topic : t('training.editor.title')}
        titleHeadingLevel={1}
        backHref={BACKEND_OUTLINES_HREF}
        cancelHref={BACKEND_OUTLINES_HREF}
        entityId={ENTITY_ID}
        fields={fields}
        groups={groups}
        isLoading={query.isLoading}
        loadingMessage={t('training.editor.loading')}
        initialValues={initialValues}
        submitLabel={t('training.editor.save')}
        successRedirect={BACKEND_OUTLINES_HREF}
        deleteRedirect={withFlash(BACKEND_OUTLINES_HREF, t('training.editor.deleted'), 'success')}
        onSubmit={async (values) => {
          const body = outlineBody(values, t)
          try {
            await updateCrud(BACKEND_OUTLINES_API, { id, ...body })
            flash(t('training.editor.saved'), 'success')
          } catch (error: unknown) {
            throw saveError(error, t)
          }
        }}
        onDelete={async () => {
          try {
            await deleteCrud(BACKEND_OUTLINES_API, id)
          } catch (error: unknown) {
            throw saveError(error, t)
          }
        }}
      />
    </div>
  )
}
