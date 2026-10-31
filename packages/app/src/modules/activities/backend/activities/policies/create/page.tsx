import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { PolicyCreateForm } from '../../../../components/PolicyForm'

export default function ActivitiesPoliciesCreatePage() {
  return (
    <Page>
      <PageBody>
        <PolicyCreateForm />
      </PageBody>
    </Page>
  )
}
