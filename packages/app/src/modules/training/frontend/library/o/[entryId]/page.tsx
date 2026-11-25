import type { Metadata } from 'next'
import { PublicLibraryEntry } from '../../../../components/PublicLibraryEntry'
import { loadPublicEntry } from '../../../../components/public-library-server'

type Props = { params?: { entryId?: string } }

/**
 * `/library/o/[entryId]` — a public training outline (training outlines spec P-O1, REQ-O13; #685). The server reads it
 * through the public API handler, so the HTML holds the outline without JavaScript; search engines are asked not to
 * index it until the licence and terms are confirmed (Q-O03).
 */
export default async function PublicLibraryEntryRoute({ params }: Props) {
  const entryId = params?.entryId ?? ''
  return <PublicLibraryEntry entryId={entryId} initial={await loadPublicEntry(entryId)} />
}

PublicLibraryEntryRoute.generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const load = await loadPublicEntry(params?.entryId ?? '')
  return {
    ...(load?.status === 'ok' ? { title: load.entry.topic } : {}),
    robots: { index: false, follow: false },
  }
}
