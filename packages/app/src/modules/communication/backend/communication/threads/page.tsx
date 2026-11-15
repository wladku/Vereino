import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ThreadsTable } from '../../../components/ThreadsTable'
import { ThreadsNav } from '../../../components/ThreadsNav'

export default function CommunicationThreadsPage() {
  return (
    <Page>
      <PageBody>
        <ThreadsNav current="all">
          <ThreadsTable />
        </ThreadsNav>
      </PageBody>
    </Page>
  )
}
