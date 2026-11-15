import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { RatesTable } from '../../../components/RatesTable'
import { FacilityRulesNav } from '../../../components/FacilityRulesNav'

export default function FacilitiesRatesPage() {
  return (
    <Page>
      <PageBody>
        <FacilityRulesNav current="rates">
          <RatesTable />
        </FacilityRulesNav>
      </PageBody>
    </Page>
  )
}
