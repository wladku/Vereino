// Shared pieces of the library routes (training outlines spec phase 4, *API*; E24-S05, #685): the viewer of a request,
// the response schemas, the image response and the client address of a public report.
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { scopeContract, trustedScopeOf } from '@/modules/foundation'
import { selfPersonId } from '../commands/shared'
import { LIBRARY_SORTS, PUBLISH_VISIBILITIES } from '../lib/library'
import { OUTLINE_LANGUAGES, OUTLINE_PARTS } from '../lib/outline'
import { TRAINING_LIBRARY, type LibraryImageFile, type LibraryViewer, type TrainingLibrary } from '../services/library'

export { errorSchema } from './shared'

/** Public library routes: per client address, like the other sessionless pages (DD-45). */
export const LIBRARY_PUBLIC_RATE_LIMIT = { points: 120, duration: 60 }
/** Public reports: a few per client address and hour (REQ-O15, *Security* → *Abuse*). */
export const LIBRARY_PUBLIC_REPORT_RATE_LIMIT = { points: 5, duration: 3600 }

export function libraryOf(ctx: { container: CommandRuntimeContext['container'] }): TrainingLibrary {
  return ctx.container.resolve<TrainingLibrary>(TRAINING_LIBRARY)
}

/** The signed-in viewer: the trusted club and, when linked, the caller's own person (for "mine"). */
export async function clubViewer(ctx: CommandRuntimeContext): Promise<LibraryViewer | null> {
  const scope = trustedScopeOf(ctx)
  if (!scope) return null
  const grants = await scopeContract.resolve(ctx).catch(() => null)
  return { kind: 'club', organizationId: scope.organizationId, personId: grants ? selfPersonId(grants) : null }
}

/** An image of an entry: private for a signed-in reader, shared caches for a public one. */
export function imageResponse(file: LibraryImageFile, isPublic: boolean): Response {
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': isPublic ? 'public, max-age=300, s-maxage=300' : 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** The client's address as the platform's rate limiter sees it (behind the configured proxies), or a shared key. */
export async function clientAddress(request: Request): Promise<string> {
  const { getCachedRateLimiterService } = await import('@open-mercato/core/bootstrap')
  const { getClientIp, RATE_LIMIT_FALLBACK_KEY } = await import('@open-mercato/shared/lib/ratelimit/helpers')
  const depth = getCachedRateLimiterService()?.trustProxyDepth ?? 0
  return getClientIp(request, depth) ?? RATE_LIMIT_FALLBACK_KEY
}

const creditSchema = z.object({
  clubName: z.string(),
  authorName: z.string().nullable().describe('“First L.” only with the author’s name consent'),
  adaptedFrom: z
    .object({ entryId: z.string().nullable(), clubName: z.string(), authorName: z.string().nullable() })
    .nullable()
    .describe('The first author this outline was adapted from'),
})

export const libraryCardSchema = z.object({
  id: z.uuid(),
  visibility: z.enum(PUBLISH_VISIBILITIES),
  language: z.string(),
  topic: z.string(),
  ageCategory: z.string(),
  durationMinutes: z.number().int(),
  parts: z.array(z.enum(OUTLINE_PARTS)).describe('The parts that hold at least one exercise'),
  credit: creditSchema,
  averageRating: z.number().nullable(),
  ratingCount: z.number().int(),
  userCount: z.number().int().describe('Distinct coaches who used it'),
  publishedAt: z.string(),
  ownClub: z.boolean().describe('Published by the reader’s own club'),
})

export const libraryListSchema = z.object({
  items: z.array(libraryCardSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

const libraryExerciseSchema = z.object({
  name: z.string(),
  minutes: z.number().int(),
  organisation: z.string(),
  coachingPoints: z.string(),
  image: z.number().int().nullable().describe('Index into `images`'),
})

export const libraryEntrySchema = libraryCardSchema.omit({ parts: true }).extend({
  language: z.enum(OUTLINE_LANGUAGES),
  goal: z.string(),
  specificGoals: z.string(),
  playersCount: z.number().int().nullable(),
  equipment: z.string(),
  parts: z.object({
    warm_up: z.array(libraryExerciseSchema),
    main: z.array(libraryExerciseSchema),
    cool_down: z.array(libraryExerciseSchema),
  }),
  images: z.array(z.string()),
  licence: z.string(),
  licenceUrl: z.string(),
  mine: z.object({ used: z.boolean(), stars: z.number().int().nullable(), reported: z.boolean() }).nullable(),
})

export const librarySortSchema = z.enum(LIBRARY_SORTS)

export const reportBodySchema = z.object({
  reason: z.enum(['copyright', 'wrong_content', 'offensive', 'other']),
  note: z.string().max(500).nullable().optional(),
})
