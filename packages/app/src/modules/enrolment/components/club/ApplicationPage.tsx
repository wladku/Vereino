'use client'
// `/club/applications/[id]` — one application on the phone (sign-up form spec M-J3; #799): the shared application
// content in the member frame, with the decisions in bottom sheets above the bottom navigation. The club has no member
// page of a person, so the possible duplicates are named, not linked.
import { CLUB_APPLICATIONS_HREF } from '../../lib/paths'
import { ApplicationView } from './ApplicationView'
import { EnrolmentClubFrame } from './EnrolmentClubFrame'

export function ApplicationPage({ id }: { id: string }) {
  return (
    <EnrolmentClubFrame skeleton="fields">
      {() => <ApplicationView id={id} listHref={CLUB_APPLICATIONS_HREF} shell="member" />}
    </EnrolmentClubFrame>
  )
}
