import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ExternalTeamEditForm } from '../../../../../components/ExternalTeamForm'

export default function GroupsExternalTeamsEditPage({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return (
    <Page>
      <PageBody>
        <ExternalTeamEditForm id={id} />
      </PageBody>
    </Page>
  )
}
