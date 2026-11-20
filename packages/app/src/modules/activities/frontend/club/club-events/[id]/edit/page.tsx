import { ClubEventFormPage } from '../../../../../components/club/ClubEventFormPage'

export default function ClubEventEditRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ClubEventFormPage id={id} />
}
