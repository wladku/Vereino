import { ClubEventDetailPage } from '../../../../components/club/ClubEventDetailPage'

export default function ClubEventRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ClubEventDetailPage id={id} />
}
