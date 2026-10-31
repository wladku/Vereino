import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { PolicyEditForm } from '../../../../../components/PolicyForm'

export default function ActivitiesPoliciesEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <PolicyEditForm id={id} />
      </PageBody>
    </Page>
  )
}
