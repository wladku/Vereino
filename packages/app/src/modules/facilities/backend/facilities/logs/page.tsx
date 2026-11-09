import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LogsTable } from '../../../components/LogsTable'

export default function FacilitiesLogsPage() {
  return (
    <Page>
      <PageBody>
        <LogsTable />
      </PageBody>
    </Page>
  )
}
