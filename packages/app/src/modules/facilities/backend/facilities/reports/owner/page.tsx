import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { OwnerReport } from '../../../../components/OwnerReport'
import { FacilityReportsNav } from '../../../../components/FacilityReportsNav'

export default function FacilitiesOwnerReportPage() {
  return (
    <Page>
      <PageBody>
        <FacilityReportsNav current="owner">
          <OwnerReport />
        </FacilityReportsNav>
      </PageBody>
    </Page>
  )
}
