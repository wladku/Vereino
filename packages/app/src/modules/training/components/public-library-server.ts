// The server side of the public outline page P-O1 (training outlines spec DD-O15; #685): the page reads the entry
// through its own public API handler (`loadPublicRoute`, the single data source, the same rate limit), so a guest or a
// link preview gets the outline without JavaScript. One read per request (`cache`). A read the server could not make
// leaves the page to the browser fetch.
import { cache } from 'react'
import { loadPublicRoute } from '@/modules/foundation'
import * as entryRoute from '../api/public/library/[entryId]/route'
import type { LibraryEntry } from './club/library-client'

export type PublicEntryLoad = { status: 'ok'; entry: LibraryEntry } | { status: 'not_found' }

export const loadPublicEntry = cache(async (entryId: string): Promise<PublicEntryLoad | undefined> => {
  const answer = await loadPublicRoute({
    handler: entryRoute.GET as never,
    path: `/api/training/public/library/${encodeURIComponent(entryId)}`,
    params: { entryId },
    rateLimit: entryRoute.metadata.GET.rateLimit,
  })
  if (!answer) return undefined
  if (answer.ok && answer.body && typeof answer.body === 'object') {
    return { status: 'ok', entry: answer.body as LibraryEntry }
  }
  return answer.status === 404 ? { status: 'not_found' } : undefined
})
