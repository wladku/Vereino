import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { BansTable } from '../../../components/BansTable'
import { FacilityRecordsNav } from '../../../components/FacilityRecordsNav'

export default function FacilitiesBansPage() {
  return (
    <Page>
      <PageBody>
        <FacilityRecordsNav current="bans">
          <BansTable />
        </FacilityRecordsNav>
      </PageBody>
    </Page>
  )
}
