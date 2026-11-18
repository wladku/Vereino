import { ClubGroupPage } from '../../../../components/club/ClubGroupPage'

export default function ClubGroupRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ClubGroupPage groupId={id} />
}
