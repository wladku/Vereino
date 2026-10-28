import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { InstitutionEditForm } from '../../../../../components/InstitutionForm'

export default function ClubInstitutionsEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <InstitutionEditForm id={id} />
      </PageBody>
    </Page>
  )
}
