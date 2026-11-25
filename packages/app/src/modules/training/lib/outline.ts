// The rules of a training outline (training outlines spec *Data Models* → `training_outlines`, glossary *Outline*,
// *Series outline / session copy*, BR-O2, BR-O3; REQ-O06, REQ-O07, REQ-O09; E24-S03, #683): the PZPN template's
// minimum content — exactly three parts (warm-up, main, cool-down), each with 0–12 exercises of a name, minutes,
// organisation, coaching points and an optional image — the 72-hour lock after a session's end, the copy a session
// gets of a series outline, the images an outline references, and the PDF file name. Framework-free.
import { z } from 'zod'

export const OUTLINE_PARTS = ['warm_up', 'main', 'cool_down'] as const
export type OutlinePart = (typeof OUTLINE_PARTS)[number]

export const OUTLINE_LIMITS = {
  topic: { min: 3, max: 200 },
  goal: 1000,
  specificGoals: 2000,
  ageCategory: 60,
  equipment: 1000,
  duration: { min: 10, max: 240 },
  players: { min: 1, max: 200 },
  exercisesPerPart: 12,
  exerciseName: 200,
  exerciseMinutes: { min: 1, max: 120 },
  organisation: 2000,
  coachingPoints: 2000,
  images: 12,
} as const

/** BR-O3: an outline of a session becomes read-only 72 hours after the session's end (PZPN's lock). */
export const OUTLINE_LOCK_HOURS = 72

/** The languages an outline's print labels follow (`pl` for PZPN, `en`). */
export const OUTLINE_LANGUAGES = ['pl', 'en'] as const
export type OutlineLanguage = (typeof OUTLINE_LANGUAGES)[number]

export type OutlineImageRef = {
  /** The attachment holding the bytes. */
  attachmentId: string
  /** The outline the image was uploaded to (its attachment owner); a session copy shares its series outline's images. */
  ownerOutlineId: string
}

export type OutlineExercise = {
  name: string
  minutes: number
  organisation: string
  coachingPoints: string
  image: OutlineImageRef | null
}

export type OutlineParts = Record<OutlinePart, OutlineExercise[]>

const trimmed = (max: number) => z.string().trim().max(max)

export const outlineImageRefSchema = z.object({ attachmentId: z.uuid(), ownerOutlineId: z.uuid() }).strict()

export const outlineExerciseSchema = z
  .object({
    name: trimmed(OUTLINE_LIMITS.exerciseName).min(1),
    minutes: z.number().int().min(OUTLINE_LIMITS.exerciseMinutes.min).max(OUTLINE_LIMITS.exerciseMinutes.max),
    organisation: trimmed(OUTLINE_LIMITS.organisation).default(''),
    coachingPoints: trimmed(OUTLINE_LIMITS.coachingPoints).default(''),
    image: outlineImageRefSchema.nullable().default(null),
  })
  .strict()

const exercisesSchema = z.array(outlineExerciseSchema).max(OUTLINE_LIMITS.exercisesPerPart).default([])

/** Exactly the three parts, each with 0–12 exercises. */
export const outlinePartsSchema = z
  .object({ warm_up: exercisesSchema, main: exercisesSchema, cool_down: exercisesSchema })
  .strict()

/** Three empty parts: a new outline before its exercises are written. */
export function emptyParts(): OutlineParts {
  return { warm_up: [], main: [], cool_down: [] }
}

/** The parts as stored, read defensively: anything that is not valid becomes three empty parts. */
export function readParts(value: unknown): OutlineParts {
  const parsed = outlinePartsSchema.safeParse(value)
  return parsed.success ? parsed.data : emptyParts()
}

/** The planned minutes of the exercises, per part and in total (shown against the planned duration, M-O5). */
export function outlineMinutes(parts: OutlineParts): Record<OutlinePart, number> & { total: number } {
  const sum = (exercises: readonly OutlineExercise[]) => exercises.reduce((acc, item) => acc + item.minutes, 0)
  const minutes = { warm_up: sum(parts.warm_up), main: sum(parts.main), cool_down: sum(parts.cool_down) }
  return { ...minutes, total: minutes.warm_up + minutes.main + minutes.cool_down }
}

/** Every image the outline references, once each, in the order of the parts. */
export function outlineImages(parts: OutlineParts): OutlineImageRef[] {
  const seen = new Set<string>()
  const images: OutlineImageRef[] = []
  for (const part of OUTLINE_PARTS) {
    for (const exercise of parts[part]) {
      if (exercise.image && !seen.has(exercise.image.attachmentId)) {
        seen.add(exercise.image.attachmentId)
        images.push(exercise.image)
      }
    }
  }
  return images
}

/**
 * The parts a client sent, with only the images the stored outline already references: an image is added by its
 * upload route only, so a client cannot point an exercise at any other attachment.
 */
export function keepKnownImages(parts: OutlineParts, known: readonly OutlineImageRef[]): OutlineParts {
  const byId = new Map(known.map((image) => [image.attachmentId, image]))
  const clean = (exercises: OutlineExercise[]) =>
    exercises.map((exercise) => ({
      ...exercise,
      image: exercise.image ? (byId.get(exercise.image.attachmentId) ?? null) : null,
    }))
  return { warm_up: clean(parts.warm_up), main: clean(parts.main), cool_down: clean(parts.cool_down) }
}

/** The images `before` referenced and `after` no longer does. */
export function droppedImages(before: OutlineParts, after: OutlineParts): OutlineImageRef[] {
  const kept = new Set(outlineImages(after).map((image) => image.attachmentId))
  return outlineImages(before).filter((image) => !kept.has(image.attachmentId))
}

/** The parts with `image` set on exercise `index` of `part`; null when that exercise does not exist. */
export function withExerciseImage(
  parts: OutlineParts,
  part: OutlinePart,
  index: number,
  image: OutlineImageRef | null,
): OutlineParts | null {
  if (index < 0 || index >= parts[part].length) return null
  const exercises = parts[part].map((item, position) => (position === index ? { ...item, image } : item))
  return { ...parts, [part]: exercises }
}

/** The parts without the image `attachmentId` on any exercise. */
export function withoutImage(parts: OutlineParts, attachmentId: string): OutlineParts {
  const clean = (exercises: OutlineExercise[]) =>
    exercises.map((exercise) =>
      exercise.image?.attachmentId === attachmentId ? { ...exercise, image: null } : exercise,
    )
  return { warm_up: clean(parts.warm_up), main: clean(parts.main), cool_down: clean(parts.cool_down) }
}

/** BR-O3: whether a session's outline is read-only at `now` (72 hours after its end); an outline of no session never is. */
export function isOutlineLocked(sessionEndAt: Date | string | null | undefined, now: Date): boolean {
  if (!sessionEndAt) return false
  const end = new Date(sessionEndAt).getTime()
  if (Number.isNaN(end)) return false
  return now.getTime() >= end + OUTLINE_LOCK_HOURS * 60 * 60 * 1000
}

/** The content fields of an outline, the part a session copy takes over from its series outline (DD-O07). */
export type OutlineContent = {
  language: OutlineLanguage
  topic: string
  goal: string
  specificGoals: string
  ageCategory: string
  durationMinutes: number
  playersCount?: number | null
  equipment: string
  parts: OutlineParts
}

/** Only the content fields of a row, with a missing player count as null. */
export function outlineContent(row: OutlineContent): OutlineContent {
  return {
    language: row.language,
    topic: row.topic,
    goal: row.goal,
    specificGoals: row.specificGoals,
    ageCategory: row.ageCategory,
    durationMinutes: row.durationMinutes,
    playersCount: row.playersCount ?? null,
    equipment: row.equipment,
    parts: row.parts,
  }
}

/** A copy's two stamps are written by one insert; they may differ by the flush's milliseconds, never by a second. */
export const COPY_STAMP_TOLERANCE_MS = 1000

/**
 * Whether a session copy was never changed since it was made from its source: every write moves `updatedAt`, so an
 * unedited copy still has it within the insert's tolerance of `createdAt`. An unedited copy of a removed session is
 * deleted, an edited one is kept detached (DD-O07). Comparing with the source's content would not do — the series
 * outline may have changed since.
 */
export function isUneditedCopy(copy: { sourceOutlineId?: string | null; createdAt: Date; updatedAt: Date }): boolean {
  if (!copy.sourceOutlineId) return false
  return Math.abs(copy.updatedAt.getTime() - copy.createdAt.getTime()) < COPY_STAMP_TOLERANCE_MS
}

/**
 * The PDF's file name (REQ-O09: named so it can be uploaded to the event in PZPN's system): `konspekt` (or `outline`),
 * the session's date when there is one, and the topic, in ASCII letters, digits and dashes.
 */
export function outlineFileName(input: { language: OutlineLanguage; topic: string; date: string | null }): string {
  const slug = input.topic
    .normalize('NFKD')
    .replace(/[łŁ]/g, 'l')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  const prefix = input.language === 'pl' ? 'konspekt' : 'outline'
  return [prefix, input.date, slug].filter((part) => part).join('-')
}
