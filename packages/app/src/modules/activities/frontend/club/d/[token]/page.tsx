import { DeclarationLinkView } from '../../../../components/public/DeclarationLinkView'

/**
 * `/club/d/[token]` — the declaration from a personal link (club spec REQ-017; foundation P-19; UX concept M-14).
 * Sessionless; the data comes from `GET /api/activities/declaration-links/{token}`.
 */
export default function DeclarationLinkRoute({ params }: { params?: { token?: string } }) {
  return <DeclarationLinkView token={params?.token ?? ''} />
}
