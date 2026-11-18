import { RentalCancelView } from '../../../../../../components/public/RentalCancelView'

/**
 * `/p/[clubSlug]/rentals/cancel/[token]` — the renter's cancellation link (facilities parity spec REQ-R17, J-R06,
 * DD-R13; #286). Sessionless; the token goes to `POST /api/facilities/public/rentals/cancel/preview` and `…/cancel`
 * in the body and is never shown. `next.config.ts` serves this path with `Referrer-Policy: no-referrer` and
 * `Cache-Control: no-store`.
 */
export default function RentalCancelRoute({ params }: { params?: { clubSlug?: string; token?: string } }) {
  return <RentalCancelView clubSlug={params?.clubSlug ?? ''} token={params?.token ?? ''} />
}
