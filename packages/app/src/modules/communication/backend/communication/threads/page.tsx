import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ThreadsTable } from '../../../components/ThreadsTable'

export default function CommunicationThreadsPage() {
  return (
    <Page>
      <PageBody>
        <ThreadsTable />
      </PageBody>
    </Page>
  )
}
