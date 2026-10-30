// Shared pieces of the sessionless `GET /api/club_core/public/…` routes (club spec API table, DD-23, DD-35; engineering
// standards S8.6; #29): the rate limit every route declares in its metadata (V-10: enforced by the API dispatcher per
// client IP), the shared cache header of pages without an authentication branch, the one 404 an unknown slug, a
// section that is not public and an unpublished file all answer, and the file response that reads a published logo or
// material through the platform's `attachmentService` — owner, assignment and partition must match exactly, so no
// other attachment of the club can be reached.
import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { errorResponse } from '@/modules/foundation'
import { CLUB_CORE_PUBLIC_SITE } from '../di'
import type { ClubCorePublicSite, PublicFileRef, PublicSiteResult } from '../services/public-site'
import { clubCoreErrors } from './errors'

/** 120 requests per minute per client IP (S8.6 "public schedule pages and JSON"); disabled under integration tests. */
export const PUBLIC_RATE_LIMIT = { points: 120, duration: 60, keyPrefix: 'club_core_public' }

/** Pages without a token or session branch may use shared caching (S8.6). */
export const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60'

const CLUB_CORE_PARTITION = 'privateAttachments'

export const publicErrorSchema = z.object({ error: z.string(), code: z.string().optional() })

export const publicLogoSchema = z.object({
  url: z.string().nullable().describe('The logo image; null shows `initial`'),
  source: z.enum(['section', 'club', 'initial']),
  initial: z.string(),
})

export async function publicSite(): Promise<{
  site: ClubCorePublicSite
  container: Awaited<ReturnType<typeof createRequestContainer>>
}> {
  const container = await createRequestContainer()
  return { site: container.resolve<ClubCorePublicSite>(CLUB_CORE_PUBLIC_SITE), container }
}

/** The 404 of a result that is not `ok`: the same body for every unknown, non-public or unpublished target. */
export async function notOkResponse(result: Exclude<PublicSiteResult<unknown>, { status: 'ok' }>): Promise<Response> {
  const error = await clubCoreErrors.create(
    result.status === 'disabled' ? 'public_page_disabled' : 'public_page_not_found',
  )
  return Response.json(error.body, { status: error.status, headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } })
}

export function jsonResponse(body: unknown): Response {
  return Response.json(body, { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } })
}

/**
 * The bytes of a published file. The platform reads attachments only for a principal of their organization, so the
 * read names the organization the slug lookup found (never one from the request) and the exact owner, assignment and
 * private partition of the file; anything else answers the public 404.
 */
export async function fileResponse(
  container: Awaited<ReturnType<typeof createRequestContainer>>,
  ref: PublicFileRef,
): Promise<Response> {
  if (!container.hasRegistration('attachmentService')) return notOkResponse({ status: 'not_found' })
  const service = container.resolve<AttachmentService>('attachmentService')
  try {
    const file = await service.readScoped({
      attachmentId: ref.attachmentId,
      auth: { sub: 'club_core:public-page', tenantId: ref.tenantId, orgId: ref.organizationId, roles: [] },
      expectedOwner: ref.owner,
      expectedAssignment: ref.assignment,
      expectedPartitionCode: CLUB_CORE_PARTITION,
      requirePrivatePartition: true,
    })
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        // A material keeps the type its bytes were checked as; the platform's disposition stays (download).
        'Content-Type': ref.mimeType ?? file.contentType,
        'Content-Disposition': file.contentDisposition,
        'Content-Length': String(file.buffer.length),
        'Cache-Control': PUBLIC_CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return notOkResponse({ status: 'not_found' })
  }
}

/** The route parameters the API dispatcher passes (`[clubSlug]`, `[sectionSlug]`, `[materialId]`). */
export type PublicRouteContext = { params: Promise<Record<string, string | string[] | undefined>> }

/** A route parameter as text; a missing or repeated one is empty and answers the public 404. */
export async function routeParam(context: PublicRouteContext, name: string): Promise<string> {
  const value = (await context.params)[name]
  return typeof value === 'string' ? value : ''
}

/** Runs a public route body; an unexpected failure answers 500 without details. */
export async function publicRoute(label: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (error: unknown) {
    return errorResponse(error, label)
  }
}
