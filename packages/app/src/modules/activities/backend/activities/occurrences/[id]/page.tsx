import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OccurrenceRecord } from '../../../../components/OccurrenceRecord'

export default function ActivitiesOccurrenceRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <OccurrenceRecord id={id} />
      </PageBody>
    </Page>
  )
}
