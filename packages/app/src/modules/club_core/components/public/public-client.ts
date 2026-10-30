// Client pieces of the public club pages `/p/[clubSlug]` and `/p/[clubSlug]/sections/[sectionSlug]` (club spec UI
// table, DD-23; #29): the response shapes of `GET /api/club_core/public/…`, their queries and the load result, which
// tells a missing page (404 `public_page_not_found`) from a club that does not publish one (404
// `public_page_disabled`) and from a failed request.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type PublicLogo = { url: string | null; source: 'section' | 'club' | 'initial'; initial: string }

export type PublicClubPage = {
  club: {
    name: string
    slug: string
    description: string | null
    logo: PublicLogo
    contact: { phone: string } | null
  }
  sections: { name: string; slug: string; logo: PublicLogo }[]
  blocks: Record<string, unknown>
}

export type PublicMaterial = {
  id: string
  title: string
  fileName: string
  mimeType: string
  fileSize: number
  url: string
}

export type PublicSectionPage = {
  club: { name: string; slug: string; logo: PublicLogo }
  section: { name: string; slug: string; logo: PublicLogo }
  blocks: {
    description?: { text: string }
    conditions?: { text: string }
    materials?: { items: PublicMaterial[] }
    contact?: { name: string | null; email: string | null; phone: string | null }
    [key: string]: unknown
  }
}

export type PublicLoad<T> = { status: 'ok'; page: T } | { status: 'not_found' } | { status: 'disabled' }

export const clubHref = (clubSlug: string): string => `/p/${encodeURIComponent(clubSlug)}`

export const sectionHref = (clubSlug: string, sectionSlug: string): string =>
  `${clubHref(clubSlug)}/sections/${encodeURIComponent(sectionSlug)}`

async function loadPublic<T>(url: string): Promise<PublicLoad<T>> {
  const call = await apiCall<T & { code?: string }>(url)
  if (call.ok && call.result) return { status: 'ok', page: call.result }
  if (call.status === 404)
    return call.result?.code === 'public_page_disabled' ? { status: 'disabled' } : { status: 'not_found' }
  throw new Error(`[internal] public page request failed with ${String(call.status)}`)
}

export function usePublicClub(clubSlug: string) {
  return useQuery({
    queryKey: ['club_core-public-club', clubSlug],
    queryFn: () => loadPublic<PublicClubPage>(`/api/club_core/public/${encodeURIComponent(clubSlug)}`),
    retry: false,
  })
}

export function usePublicSection(clubSlug: string, sectionSlug: string) {
  return useQuery({
    queryKey: ['club_core-public-section', clubSlug, sectionSlug],
    queryFn: () =>
      loadPublic<PublicSectionPage>(
        `/api/club_core/public/${encodeURIComponent(clubSlug)}/sections/${encodeURIComponent(sectionSlug)}`,
      ),
    retry: false,
  })
}

/** A file size in the reader's locale (kB below 1 MB, else MB). */
export function formatFileSize(bytes: number, locale: string): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return bytes < 1024 * 1024
    ? `${format.format(Math.max(1, Math.round(bytes / 1024)))} kB`
    : `${format.format(bytes / (1024 * 1024))} MB`
}

/** The short format label of a material (PDF, PNG, JPG, WEBP). */
export function formatLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'image/jpeg') return 'JPG'
  return mimeType.replace(/^image\//, '').toUpperCase()
}
