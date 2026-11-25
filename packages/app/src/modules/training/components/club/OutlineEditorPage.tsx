'use client'
// `/club/training/outlines/new` and `/club/training/outlines/[id]` — the outline editor on the phone (training outlines
// spec M-O5, J-O03, J-O04; REQ-O06; #683): a single-column form — header (topic, goal, specific goals, age category,
// duration, players, equipment, language), then the three collapsible parts with their exercises (name, minutes,
// organisation, coaching points, image). The planned minutes are shown against the duration. A new outline may be
// written straight for a session (`?occurrenceId=`) or as a recurring activity's series outline (`?activityId=`).
// Saving sends `updatedAt`; a 409 shows the shared conflict bar ("changed by someone else — reload"). An image is
// added to a saved exercise (the form must hold no unsaved change, as the upload changes the outline's version). An
// outline locked 72 hours after its session's end (BR-O3) shows the read view only. States: loading, error with
// retry, not found, forbidden, saving.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, Notice } from '@vereino/ui'
import { outlineImageUrl } from '../../lib/images'
import {
  OUTLINE_LANGUAGES,
  OUTLINE_LIMITS,
  OUTLINE_PARTS,
  emptyParts,
  outlineMinutes,
  type OutlineExercise,
  type OutlineLanguage,
  type OutlinePart,
  type OutlineParts,
} from '../../lib/outline'
import { OutlineReadView } from './OutlineReadView'
import { PublishPanel } from './PublishPanel'
import { TrainingClubFrame } from './TrainingClubFrame'
import {
  OUTLINES_HREF,
  OUTLINES_QUERY_KEY,
  OUTLINE_QUERY_KEY,
  createOutline,
  deleteOutline,
  errorText,
  outlineHref,
  outlinePrintHref,
  removeImage,
  sessionHref,
  updateOutline,
  uploadImage,
  useOutline,
  type Outline,
  type OutlineInput,
} from './club-client'

type Translate = ReturnType<typeof useT>

type FormState = {
  language: OutlineLanguage
  topic: string
  goal: string
  specificGoals: string
  ageCategory: string
  durationMinutes: string
  playersCount: string
  equipment: string
  parts: OutlineParts
}

function formOf(outline: Outline | null, locale: string): FormState {
  if (!outline) {
    return {
      language: locale === 'en' ? 'en' : 'pl',
      topic: '',
      goal: '',
      specificGoals: '',
      ageCategory: '',
      durationMinutes: '90',
      playersCount: '',
      equipment: '',
      parts: emptyParts(),
    }
  }
  return {
    language: outline.language,
    topic: outline.topic,
    goal: outline.goal,
    specificGoals: outline.specificGoals,
    ageCategory: outline.ageCategory,
    durationMinutes: String(outline.durationMinutes),
    playersCount: outline.playersCount ? String(outline.playersCount) : '',
    equipment: outline.equipment,
    parts: outline.parts,
  }
}

function inputOf(form: FormState): OutlineInput {
  const players = Number.parseInt(form.playersCount, 10)
  return {
    language: form.language,
    topic: form.topic.trim(),
    goal: form.goal.trim(),
    specificGoals: form.specificGoals.trim(),
    ageCategory: form.ageCategory.trim(),
    durationMinutes: Number.parseInt(form.durationMinutes, 10) || 0,
    playersCount: Number.isFinite(players) && players > 0 ? players : null,
    equipment: form.equipment.trim(),
    parts: form.parts,
  }
}

/** The client-side checks the server repeats: what the save button needs before it is worth a request. */
function problemsOf(form: FormState): string[] {
  const problems: string[] = []
  const topic = form.topic.trim().length
  if (topic < OUTLINE_LIMITS.topic.min || topic > OUTLINE_LIMITS.topic.max) problems.push('topic')
  if (!form.ageCategory.trim()) problems.push('ageCategory')
  const duration = Number.parseInt(form.durationMinutes, 10)
  if (!(duration >= OUTLINE_LIMITS.duration.min && duration <= OUTLINE_LIMITS.duration.max)) problems.push('duration')
  for (const part of OUTLINE_PARTS) {
    for (const exercise of form.parts[part]) {
      if (!exercise.name.trim() || exercise.minutes < 1 || exercise.minutes > OUTLINE_LIMITS.exerciseMinutes.max) {
        problems.push(`exercise:${part}`)
      }
    }
  }
  return problems
}

function useAgeCategories() {
  return useQuery({
    queryKey: ['training-age-categories'],
    queryFn: async (): Promise<string[]> => {
      const call = await apiCall<{ items?: { label: string }[] }>('/api/groups/options/age-categories')
      return call.ok ? (call.result?.items ?? []).map((item) => item.label) : []
    },
  })
}

function TextField({
  id,
  label,
  value,
  onChange,
  multiline,
  max,
  required,
  invalid,
  hint,
  list,
  type,
  testId,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  max?: number
  required?: boolean
  invalid?: boolean
  hint?: string
  list?: string
  type?: 'text' | 'number'
  testId: string
}) {
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          maxLength={max}
          rows={3}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          data-testid={testId}
        />
      ) : (
        <Input
          id={id}
          type={type ?? 'text'}
          inputMode={type === 'number' ? 'numeric' : undefined}
          className="min-h-11"
          value={value}
          maxLength={max}
          required={required}
          list={list}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          data-testid={testId}
        />
      )}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function ExerciseEditor({
  t,
  idBase,
  part,
  index,
  exercise,
  outlineId,
  imagesEnabled,
  busy,
  onChange,
  onRemove,
  onUpload,
  onRemoveImage,
}: {
  t: Translate
  idBase: string
  part: OutlinePart
  index: number
  exercise: OutlineExercise
  outlineId: string | null
  imagesEnabled: boolean
  busy: boolean
  onChange: (exercise: OutlineExercise) => void
  onRemove: () => void
  onUpload: (file: File) => void
  onRemoveImage: () => void
}) {
  const id = `${idBase}-${part}-${String(index)}`
  const label = `${t(`training.outline.parts.${part}`)} ${String(index + 1)}`
  return (
    <li className="flex flex-col gap-3 rounded-md border p-3" data-testid="training-exercise-editor">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <Button type="button" variant="outline" className="min-h-11" onClick={onRemove} disabled={busy}>
          {t('training.editor.removeExercise')}
          <span className="sr-only"> — {label}</span>
        </Button>
      </div>
      <TextField
        id={`${id}-name`}
        label={t('training.outline.fields.exerciseName')}
        value={exercise.name}
        max={OUTLINE_LIMITS.exerciseName}
        required
        invalid={!exercise.name.trim()}
        onChange={(name) => {
          onChange({ ...exercise, name })
        }}
        testId="training-exercise-name"
      />
      <TextField
        id={`${id}-minutes`}
        label={t('training.outline.fields.minutes')}
        type="number"
        value={String(exercise.minutes || '')}
        required
        invalid={!(exercise.minutes >= 1 && exercise.minutes <= OUTLINE_LIMITS.exerciseMinutes.max)}
        onChange={(value) => {
          onChange({ ...exercise, minutes: Number.parseInt(value, 10) || 0 })
        }}
        testId="training-exercise-minutes"
      />
      <TextField
        id={`${id}-organisation`}
        label={t('training.outline.fields.organisation')}
        multiline
        max={OUTLINE_LIMITS.organisation}
        value={exercise.organisation}
        onChange={(organisation) => {
          onChange({ ...exercise, organisation })
        }}
        testId="training-exercise-organisation"
      />
      <TextField
        id={`${id}-points`}
        label={t('training.outline.fields.coachingPoints')}
        multiline
        max={OUTLINE_LIMITS.coachingPoints}
        value={exercise.coachingPoints}
        onChange={(coachingPoints) => {
          onChange({ ...exercise, coachingPoints })
        }}
        testId="training-exercise-points"
      />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('training.outline.fields.image')}</span>
        {exercise.image && outlineId ? (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={outlineImageUrl(outlineId, exercise.image.attachmentId)}
              alt={t('training.outline.imageAlt', { name: exercise.name })}
              className="max-h-48 w-full rounded-md border object-contain"
              data-testid="training-exercise-image"
            />
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy || !imagesEnabled}
                onClick={onRemoveImage}
              >
                {t('training.editor.removeImage')}
                <span className="sr-only"> — {label}</span>
              </Button>
            </div>
          </div>
        ) : null}
        {imagesEnabled ? (
          <Input
            id={`${id}-image`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="min-h-11"
            aria-label={`${t('training.editor.addImage')} — ${label}`}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onUpload(file)
              event.target.value = ''
            }}
            data-testid="training-exercise-image-input"
          />
        ) : (
          <p className="text-muted-foreground text-xs">
            {t(outlineId ? 'training.editor.imageSaveFirst' : 'training.editor.imageAfterCreate')}
          </p>
        )}
      </div>
    </li>
  )
}

function Editor({
  outline,
  target,
}: {
  outline: Outline | null
  target: { occurrenceId?: string; activityId?: string }
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const idBase = React.useId()
  const ages = useAgeCategories()
  // The editor remounts when the outline's version changes (`key`), so the form starts from the saved state.
  const [initial] = React.useState<FormState>(() => formOf(outline, locale))
  const [form, setForm] = React.useState<FormState>(initial)
  const [busy, setBusy] = React.useState(false)
  const [attempted, setAttempted] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState('')
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const problems = problemsOf(form)
  const minutes = outlineMinutes(form.parts)
  const duration = Number.parseInt(form.durationMinutes, 10) || 0
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }
  const setExercises = (part: OutlinePart, exercises: OutlineExercise[]) => {
    setForm((current) => ({ ...current, parts: { ...current.parts, [part]: exercises } }))
  }

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [OUTLINE_QUERY_KEY] })
    await queryClient.invalidateQueries({ queryKey: [OUTLINES_QUERY_KEY] })
  }

  const run = async (write: () => Promise<void>, success: string, failure: string) => {
    setBusy(true)
    try {
      await write()
      setAnnouncement(success)
      flash(success, 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t)) flash(errorText(error, failure), 'error')
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setAttempted(true)
    if (problems.length > 0) return
    await run(
      async () => {
        if (outline) {
          await updateOutline(outline.id, inputOf(form), outline.updatedAt, t('training.editor.errors.save'))
          await refresh()
          return
        }
        const created = await createOutline({ ...inputOf(form), ...target }, t('training.editor.errors.save'))
        await refresh()
        router.push(target.occurrenceId ? sessionHref(target.occurrenceId) : outlineHref(created.id))
      },
      t('training.editor.saved'),
      t('training.editor.errors.save'),
    )
  }

  const remove = async () => {
    if (!outline) return
    const confirmed = await confirm({
      title: t('training.editor.confirmDelete'),
      text: t('training.editor.confirmDeleteText'),
      confirmText: t('training.editor.delete'),
      cancelText: t('training.editor.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    await run(
      async () => {
        await deleteOutline(outline.id, outline.updatedAt, t('training.editor.errors.delete'))
        await refresh()
        router.push(outline.occurrenceId ? sessionHref(outline.occurrenceId) : OUTLINES_HREF)
      },
      t('training.editor.deleted'),
      t('training.editor.errors.delete'),
    )
  }

  const upload = (part: OutlinePart, index: number, file: File) => {
    if (!outline) return
    void run(
      async () => {
        await uploadImage(outline.id, { part, index, file }, outline.updatedAt, t('training.editor.errors.image'))
        await refresh()
      },
      t('training.editor.imageAdded'),
      t('training.editor.errors.image'),
    )
  }

  const dropImage = (attachmentId: string) => {
    if (!outline) return
    void run(
      async () => {
        await removeImage(outline.id, attachmentId, outline.updatedAt, t('training.editor.errors.image'))
        await refresh()
      },
      t('training.editor.imageRemoved'),
      t('training.editor.errors.image'),
    )
  }

  const show = (key: string) => attempted && problems.includes(key)
  const listId = `${idBase}-ages`
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      data-testid="training-outline-form"
    >
      {target.occurrenceId ? <Notice>{t('training.editor.forSession')}</Notice> : null}
      {target.activityId ? <Notice>{t('training.editor.forSeries')}</Notice> : null}
      <TextField
        id={`${idBase}-topic`}
        label={t('training.outline.fields.topic')}
        value={form.topic}
        max={OUTLINE_LIMITS.topic.max}
        required
        invalid={show('topic')}
        hint={show('topic') ? t('training.editor.problems.topic') : undefined}
        onChange={(value) => {
          set('topic', value)
        }}
        testId="training-outline-topic"
      />
      <TextField
        id={`${idBase}-goal`}
        label={t('training.outline.fields.goal')}
        multiline
        max={OUTLINE_LIMITS.goal}
        value={form.goal}
        onChange={(value) => {
          set('goal', value)
        }}
        testId="training-outline-goal"
      />
      <TextField
        id={`${idBase}-specific`}
        label={t('training.outline.fields.specificGoals')}
        multiline
        max={OUTLINE_LIMITS.specificGoals}
        value={form.specificGoals}
        onChange={(value) => {
          set('specificGoals', value)
        }}
        testId="training-outline-specific-goals"
      />
      <TextField
        id={`${idBase}-age`}
        label={t('training.outline.fields.ageCategory')}
        value={form.ageCategory}
        max={OUTLINE_LIMITS.ageCategory}
        required
        list={listId}
        invalid={show('ageCategory')}
        hint={show('ageCategory') ? t('training.editor.problems.ageCategory') : undefined}
        onChange={(value) => {
          set('ageCategory', value)
        }}
        testId="training-outline-age"
      />
      <datalist id={listId}>
        {(ages.data ?? []).map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          id={`${idBase}-duration`}
          label={t('training.outline.fields.duration')}
          type="number"
          value={form.durationMinutes}
          required
          invalid={show('duration')}
          hint={show('duration') ? t('training.editor.problems.duration') : undefined}
          onChange={(value) => {
            set('durationMinutes', value)
          }}
          testId="training-outline-duration"
        />
        <TextField
          id={`${idBase}-players`}
          label={t('training.outline.fields.players')}
          type="number"
          value={form.playersCount}
          onChange={(value) => {
            set('playersCount', value)
          }}
          testId="training-outline-players"
        />
      </div>
      <TextField
        id={`${idBase}-equipment`}
        label={t('training.outline.fields.equipment')}
        multiline
        max={OUTLINE_LIMITS.equipment}
        value={form.equipment}
        onChange={(value) => {
          set('equipment', value)
        }}
        testId="training-outline-equipment"
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idBase}-language`}>{t('training.outline.fields.language')}</Label>
        <select
          id={`${idBase}-language`}
          className="border-input bg-background focus-visible:ring-ring min-h-11 rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
          value={form.language}
          onChange={(event) => {
            set('language', event.target.value as OutlineLanguage)
          }}
          data-testid="training-outline-language"
        >
          {OUTLINE_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {t(`training.outline.languages.${language}`)}
            </option>
          ))}
        </select>
      </div>
      <p
        className={duration > 0 && minutes.total > duration ? 'text-sm font-semibold' : 'text-muted-foreground text-sm'}
        aria-live="polite"
        data-testid="training-outline-total"
      >
        {t('training.outline.durationPlanned', { duration, planned: minutes.total })}
      </p>
      {OUTLINE_PARTS.map((part) => (
        <details key={part} open className="rounded-lg border p-3" data-testid={`training-part-${part}`}>
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold">
            <span>{t(`training.outline.parts.${part}`)}</span>
            <span className="text-muted-foreground text-sm font-normal">
              {t('training.outline.minutesShort', { minutes: minutes[part] })}
            </span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {show(`exercise:${part}`) ? (
              <p className="text-destructive text-sm" role="alert">
                {t('training.editor.problems.exercise')}
              </p>
            ) : null}
            <ol className="flex flex-col gap-3">
              {form.parts[part].map((exercise, index) => (
                <ExerciseEditor
                  key={`${part}-${String(index)}`}
                  t={t}
                  idBase={idBase}
                  part={part}
                  index={index}
                  exercise={exercise}
                  outlineId={outline?.id ?? null}
                  imagesEnabled={Boolean(outline) && !dirty}
                  busy={busy}
                  onChange={(next) => {
                    setExercises(
                      part,
                      form.parts[part].map((item, position) => (position === index ? next : item)),
                    )
                  }}
                  onRemove={() => {
                    setExercises(
                      part,
                      form.parts[part].filter((_, position) => position !== index),
                    )
                  }}
                  onUpload={(file) => {
                    upload(part, index, file)
                  }}
                  onRemoveImage={() => {
                    if (exercise.image) dropImage(exercise.image.attachmentId)
                  }}
                />
              ))}
            </ol>
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy || form.parts[part].length >= OUTLINE_LIMITS.exercisesPerPart}
                onClick={() => {
                  setExercises(part, [
                    ...form.parts[part],
                    { name: '', minutes: 10, organisation: '', coachingPoints: '', image: null },
                  ])
                }}
                data-testid={`training-add-exercise-${part}`}
              >
                {t('training.editor.addExercise')}
                <span className="sr-only"> — {t(`training.outline.parts.${part}`)}</span>
              </Button>
            </div>
          </div>
        </details>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="submit"
          className="min-h-11"
          disabled={busy || (Boolean(outline) && !dirty)}
          data-testid="training-outline-save"
        >
          {t('training.editor.save')}
        </Button>
        {outline ? (
          <>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={outlinePrintHref(outline.id)} data-testid="training-outline-pdf">
                {t('training.actions.pdf')}
              </Link>
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void remove()}>
              {t('training.editor.delete')}
            </Button>
          </>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite" data-testid="training-outline-announcement">
        {announcement}
      </p>
      {ConfirmDialogElement}
    </form>
  )
}

function SessionLine({ outline }: { outline: Outline }) {
  const t = useT()
  const locale = useLocale()
  if (!outline.session) return null
  const start = new Date(outline.session.startAt)
  return (
    <p className="text-muted-foreground text-sm" data-testid="training-outline-session">
      <Link href={sessionHref(outline.session.id)} className="text-primary underline">
        {t('training.outline.sessionLine', {
          name: outline.session.activityName ?? t('training.outline.untitledSession'),
          date: start.toLocaleDateString(locale),
          time: start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        })}
      </Link>
    </p>
  )
}

function ExistingOutline({ id }: { id: string }) {
  const t = useT()
  const query = useOutline(id)
  if (!query.data && query.isFetching) return <MemberSkeleton shape="fields" label={t('training.editor.loading')} />
  if (!query.data) {
    return (
      <ErrorMessage
        label={t('training.editor.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('training.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (query.data.status !== 'ok') {
    return (
      <Alert style="light" status="warning" data-testid="training-outline-missing">
        <p className="max-w-prose">
          {t(query.data.status === 'forbidden' ? 'training.editor.forbidden' : 'training.editor.notFound')}
        </p>
      </Alert>
    )
  }
  const outline = query.data.outline
  return (
    <>
      <h1 className="text-xl font-semibold" data-testid="training-outline-title">
        {outline.topic}
      </h1>
      <SessionLine outline={outline} />
      {outline.activityId ? <Notice>{t('training.editor.seriesNote')}</Notice> : null}
      {outline.locked ? (
        <>
          <Notice data-testid="training-outline-locked">
            <p className="max-w-prose">{t('training.editor.locked')}</p>
          </Notice>
          <OutlineReadView outline={outline} />
          <div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={outlinePrintHref(outline.id)} data-testid="training-outline-pdf">
                {t('training.actions.pdf')}
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <Editor key={outline.updatedAt} outline={outline} target={{}} />
      )}
      <PublishPanel outline={outline} />
    </>
  )
}

export function OutlineEditorPage({ id }: { id: string | null }) {
  const t = useT()
  const searchParams = useSearchParams()
  const target = {
    occurrenceId: searchParams.get('occurrenceId') ?? undefined,
    activityId: searchParams.get('activityId') ?? undefined,
  }
  return (
    <TrainingClubFrame skeleton="fields">
      {() => (
        <section className="flex flex-col gap-4" aria-label={t('training.editor.title')}>
          <Link
            href={target.occurrenceId ? sessionHref(target.occurrenceId) : OUTLINES_HREF}
            className="text-primary inline-flex min-h-11 items-center text-sm underline"
          >
            {t(target.occurrenceId ? 'training.editor.backToSession' : 'training.editor.back')}
          </Link>
          {id ? (
            <ExistingOutline id={id} />
          ) : (
            <>
              <h1 className="text-xl font-semibold">{t('training.editor.newTitle')}</h1>
              <Editor outline={null} target={target} />
            </>
          )}
        </section>
      )}
    </TrainingClubFrame>
  )
}
