'use client'
// `/backend/enrolment/applications/[id]` (sign-up form spec B-J1, M-J3; #799): the M-J3 content in the back-office
// shell — a side sheet for the decisions, the possible duplicates linked to the person record.
import { BACKEND_APPLICATIONS_HREF } from '../../lib/paths'
import { ApplicationView } from '../club/ApplicationView'

function personHref(personId: string): string {
  return `/backend/people/persons/${encodeURIComponent(personId)}`
}

export function BackendApplicationPage({ id }: { id: string }) {
  return <ApplicationView id={id} listHref={BACKEND_APPLICATIONS_HREF} personHref={personHref} shell="backend" />
}
