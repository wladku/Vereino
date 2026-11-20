import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ClubEventRecord } from '../../../../components/ClubEventRecord'

export default function ActivitiesClubEventRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ClubEventRecord id={id} />
      </PageBody>
    </Page>
  )
}
