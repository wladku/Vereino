import { ClubWardPage } from '../../../../components/club/ClubWardPage'

export default function ClubWardRoute({ params }: { params?: { personId?: string } }) {
  const personId = params?.personId
  if (!personId) return null
  return <ClubWardPage personId={personId} />
}
