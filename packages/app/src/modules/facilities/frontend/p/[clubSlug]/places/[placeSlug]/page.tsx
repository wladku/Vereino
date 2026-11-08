import { PublicScheduleRoute } from '../../../../../components/public/PublicScheduleView'

/**
 * `/p/[clubSlug]/places/[placeSlug]?month=YYYY-MM` — one facility's public month (facilities spec P-04, REQ-014;
 * #124). The month lives in the URL, so a QR code or a permalink opens the same month.
 */
export default function PublicPlaceScheduleRoute({ params }: { params?: { clubSlug?: string; placeSlug?: string } }) {
  return <PublicScheduleRoute clubSlug={params?.clubSlug ?? ''} placeSlug={params?.placeSlug ?? ''} />
}
