import { ClubThreadPage } from '../../../../components/club/ClubThreadPage'

export default function ClubThreadRoute({ params }: { params?: { threadId?: string } }) {
  return <ClubThreadPage threadId={params?.threadId ?? ''} />
}
