import { ClubSessionPage } from '../../../../components/club/ClubSessionPage'

export default function ClubSessionRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ClubSessionPage id={id} />
}
