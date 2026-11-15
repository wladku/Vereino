import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CasesTable } from '../../../components/CasesTable'
import { ThreadsNav } from '../../../components/ThreadsNav'

export default function CommunicationCasesPage() {
  return (
    <Page>
      <PageBody>
        <ThreadsNav current="cases">
          <CasesTable />
        </ThreadsNav>
      </PageBody>
    </Page>
  )
}
