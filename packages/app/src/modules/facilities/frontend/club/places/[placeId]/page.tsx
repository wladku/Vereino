import { ClubPlacePage } from '../../../../components/club-places/ClubPlacePage'

export default function ClubPlaceRoute({ params }: { params?: { placeId?: string } }) {
  const placeId = params?.placeId
  if (!placeId) return null
  return <ClubPlacePage placeId={placeId} />
}
