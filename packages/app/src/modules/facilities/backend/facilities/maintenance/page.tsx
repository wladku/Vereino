import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { MaintenanceTable } from '../../../components/MaintenanceTable'
import { FacilityRecordsNav } from '../../../components/FacilityRecordsNav'

export default function FacilitiesMaintenancePage() {
  return (
    <Page>
      <PageBody>
        <FacilityRecordsNav current="maintenance">
          <MaintenanceTable />
        </FacilityRecordsNav>
      </PageBody>
    </Page>
  )
}
