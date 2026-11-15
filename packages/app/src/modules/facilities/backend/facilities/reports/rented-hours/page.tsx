import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { RentedHoursReport } from '../../../../components/RentedHoursReport'
import { FacilityReportsNav } from '../../../../components/FacilityReportsNav'

export default function FacilitiesRentedHoursReportPage() {
  return (
    <Page>
      <PageBody>
        <FacilityReportsNav current="rented-hours">
          <RentedHoursReport />
        </FacilityReportsNav>
      </PageBody>
    </Page>
  )
}
