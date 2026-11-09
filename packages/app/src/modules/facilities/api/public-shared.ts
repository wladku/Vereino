// Shared pieces of the sessionless `GET /api/facilities/public/…` routes (facilities spec P-03, P-04, TEST-024, DD-45;
// #124): the per-IP rate limit each route declares in its metadata (V-10: enforced by the API dispatcher, disabled
// under integration tests), the shared-cache header without any server-side cache, and the answers of a read with
// nothing to show — one 404 for every unknown or non-public club or place, its own 404 for a club that does not
// publish its places calendar, 400 for a month outside the readable range.
import { z } from 'zod'
import { errorResponse } from '@/modules/foundation'
import { facilitiesErrors } from './errors'
import type { PublicFacilitiesResult } from '../services/public-schedule'

/** 120 requests per minute per client IP (engineering standards S8.6, "public schedule pages and JSON"). */
export const PUBLIC_RATE_LIMIT = { points: 120, duration: 60 }

/** Shared caches may keep a month for 60 s; nothing is cached on the server (DD-45). */
export const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60'

export const publicErrorSchema = z.object({ error: z.string(), code: z.string().optional() })

export const publicClubSchema = z.object({
  name: z.string(),
  slug: z.string(),
  logo: z.object({ url: z.string().nullable(), source: z.enum(['section', 'club', 'initial']), initial: z.string() }),
  contact: z.object({ phone: z.string() }).nullable().describe('The club phone, only with the `contact` block'),
  links: z
    .object({ rules: z.string().nullable(), privacyPolicy: z.string().nullable() })
    .describe("The club's rules and privacy policy in the page footer; null while not set"),
})

export const publicPlaceCardSchema = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  surface: z.string().nullable(),
  address: z.string().nullable(),
  photoUrl: z.string().nullable(),
  acceptsOnlineRequests: z
    .boolean()
    .describe("The place's switch and the club's `online_requests` block (requests open with E08-S05)"),
})

/** The route parameters the API dispatcher passes. */
export type PublicRouteContext = { params: Promise<Record<string, string | string[] | undefined>> }

export async function routeParam(context: PublicRouteContext, name: string): Promise<string> {
  const value = (await context.params)[name]
  return typeof value === 'string' ? value : ''
}

export function jsonResponse(body: unknown): Response {
  return Response.json(body, { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } })
}

/** The answer of a read that is not `ok`; never says which condition failed beyond "disabled". */
export async function notOkResponse(result: Exclude<PublicFacilitiesResult<unknown>, { status: 'ok' }>) {
  const code =
    result.status === 'month_invalid'
      ? 'public_schedule_month_invalid'
      : result.status === 'disabled'
        ? 'public_places_disabled'
        : 'public_place_not_found'
  const error = await facilitiesErrors.create(code)
  return Response.json(error.body, { status: error.status, headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } })
}

/** Runs a public route body; an unexpected failure answers 500 without details. */
export async function publicRoute(label: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (error: unknown) {
    return errorResponse(error, label)
  }
}
