import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { IncidentsTable } from '../../../components/IncidentsTable'
import { FacilityRecordsNav } from '../../../components/FacilityRecordsNav'

export default function FacilitiesIncidentsPage() {
  return (
    <Page>
      <PageBody>
        <FacilityRecordsNav current="incidents">
          <IncidentsTable />
        </FacilityRecordsNav>
      </PageBody>
    </Page>
  )
}
