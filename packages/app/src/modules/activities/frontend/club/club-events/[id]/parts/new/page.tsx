import { ClubEventPartFormPage } from '../../../../../../components/club/ClubEventPartFormPage'

export default function ClubEventPartNewRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ClubEventPartFormPage eventId={id} />
}
