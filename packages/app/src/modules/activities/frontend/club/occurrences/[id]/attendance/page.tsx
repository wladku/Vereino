import { ClubAttendancePage } from '../../../../../components/club/ClubAttendancePage'

export default function ClubAttendanceRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <ClubAttendancePage id={id} />
}
