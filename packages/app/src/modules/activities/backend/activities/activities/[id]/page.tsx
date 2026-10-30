import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ActivityRecord } from '../../../../components/ActivityRecord'

export default function ActivitiesActivityRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ActivityRecord id={id} />
      </PageBody>
    </Page>
  )
}
