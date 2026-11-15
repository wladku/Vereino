import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ZonesTable } from '../../../components/ZonesTable'
import { FacilityRulesNav } from '../../../components/FacilityRulesNav'

export default function FacilitiesZonesPage() {
  return (
    <Page>
      <PageBody>
        <FacilityRulesNav current="zones">
          <ZonesTable />
        </FacilityRulesNav>
      </PageBody>
    </Page>
  )
}
