import { ClubSessionEditPage } from '../../../../../components/club/ClubSessionEditPage'

export default function ClubSessionEditRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ClubSessionEditPage id={id} />
}
