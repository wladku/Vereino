import { ApplicationPage } from '../../../../components/club/ApplicationPage'

export default function EnrolmentApplicationRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ApplicationPage id={id} />
}
