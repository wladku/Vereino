import { Suspense } from 'react'
import { ClubInvitationsPage } from '../../../components/club/ClubInvitationsPage'

/** `/club/invitations[?groupId=]` (#868): `?groupId=` narrows the list to one group, from the group page's link. */
export default function ClubInvitationsRoute() {
  return (
    <Suspense>
      <ClubInvitationsPage />
    </Suspense>
  )
}
