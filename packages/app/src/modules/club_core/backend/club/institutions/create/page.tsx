import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { InstitutionCreateForm } from '../../../../components/InstitutionForm'

export default function ClubInstitutionsCreatePage() {
  return (
    <Page>
      <PageBody>
        <InstitutionCreateForm />
      </PageBody>
    </Page>
  )
}
