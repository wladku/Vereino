import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ApplicationsTable } from '../../../components/backend/ApplicationsTable'

export default function EnrolmentBackendApplicationsPage() {
  return (
    <Page>
      <PageBody>
        <ApplicationsTable />
      </PageBody>
    </Page>
  )
}
