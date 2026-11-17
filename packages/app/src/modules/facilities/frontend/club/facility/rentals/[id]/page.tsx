import { ClubRentalPage } from '../../../../../components/club-facility/ClubRentalPage'

export default function ClubFacilityRentalRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ClubRentalPage id={id} />
}
