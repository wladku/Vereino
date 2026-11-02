import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ThreadRecord } from '../../../../components/ThreadRecord'

export default function CommunicationThreadRecordPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ThreadRecord id={id} />
      </PageBody>
    </Page>
  )
}
