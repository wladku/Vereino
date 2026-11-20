import { ClubEventPartFormPage } from '../../../../../../../components/club/ClubEventPartFormPage'

export default function ClubEventPartEditRoute({ params }: { params?: { id?: string; partId?: string } }) {
  const id = params?.id
  const partId = params?.partId
  if (!id || !partId) return null
  return <ClubEventPartFormPage eventId={id} partId={partId} />
}
