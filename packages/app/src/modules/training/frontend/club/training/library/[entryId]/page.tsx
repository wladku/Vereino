import { LibraryEntryPage } from '../../../../../components/club/LibraryEntryPage'

export default function TrainingLibraryEntryRoute({ params }: { params?: { entryId?: string } }) {
  const entryId = params?.entryId
  if (!entryId) return null
  return <LibraryEntryPage entryId={entryId} />
}
