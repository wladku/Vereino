import { Suspense } from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ActivityCreateForm } from '../../../../components/ActivityForm'

export default function ActivitiesActivityCreatePage() {
  return (
    <Page>
      <PageBody>
        {/* The form reads `?groupId=` with `useSearchParams`, which needs a Suspense boundary while the page prerenders. */}
        <Suspense fallback={null}>
          <ActivityCreateForm />
        </Suspense>
      </PageBody>
    </Page>
  )
}
