import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ZoneRuleEditForm } from '../../../../../components/ZoneRuleForm'

export default function FacilitiesZonesEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ZoneRuleEditForm id={id} />
      </PageBody>
    </Page>
  )
}
