import { PublicSessionView } from '../../../../../components/public/PublicSessionView'

/**
 * `/p/[clubSlug]/s/[occurrenceId]` — the public session page (club spec DD-17; foundation III DD-M14, #35).
 * Sessionless; the data comes from `GET /api/activities/public/{clubSlug}/sessions/{occurrenceId}`.
 */
export default function PublicSessionRoute({ params }: { params?: { clubSlug?: string; occurrenceId?: string } }) {
  return <PublicSessionView clubSlug={params?.clubSlug ?? ''} occurrenceId={params?.occurrenceId ?? ''} />
}
