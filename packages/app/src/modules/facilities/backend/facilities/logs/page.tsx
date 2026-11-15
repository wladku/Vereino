import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LogsTable } from '../../../components/LogsTable'
import { FacilityRecordsNav } from '../../../components/FacilityRecordsNav'

export default function FacilitiesLogsPage() {
  return (
    <Page>
      <PageBody>
        <FacilityRecordsNav current="logs">
          <LogsTable />
        </FacilityRecordsNav>
      </PageBody>
    </Page>
  )
}
