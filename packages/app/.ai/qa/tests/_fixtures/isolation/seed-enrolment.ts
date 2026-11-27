// enrolment records of the cross-club isolation guard (#628; sign-up form spec phase 2, #799): the public section of
// the club_core seed takes applications through a public group of its own, and one application to it is sent and
// confirmed through the e-mailed link (so it reaches the coordinator's list). Its id is the `foreign-id` of the member
// routes; its status link token stays in the club (a probe sends club B's application id as a token instead, which is
// no live link). The applicant's address is a marker of the club.
import { expect } from '@playwright/test'
import { uniqueSuffix } from '../club'
import { childApplication, confirmedApplication, listApplications } from '../enrolment'
import { createGroup, getGroup, updateGroup } from '../groups'
import { putSectionPublic } from '../publication'
import type { ModuleSeed } from './seed'

export const seedEnrolment: ModuleSeed = async ({ request, seeded, admin }) => {
  const { refs } = seeded
  const tag = `${seeded.label.toLowerCase()}${uniqueSuffix()}`
  refs.enrolmentGroup = await createGroup(request, admin, {
    sectionId: refs.publicSection,
    name: `Nabór ${tag}`,
    kind: 'class_group',
    ageFrom: 6,
    ageTo: 12,
    isPublic: true,
  })
  const group = await getGroup(request, admin, refs.enrolmentGroup)
  const opened = await updateGroup(
    request,
    admin,
    { id: refs.enrolmentGroup, acceptsApplications: true },
    (group.body as { updatedAt?: string } | null)?.updatedAt,
  )
  expect(opened.status, JSON.stringify(opened.body)).toBe(200)
  const section = await putSectionPublic(request, admin, refs.publicSection, { acceptsApplications: true })
  expect(section.status, JSON.stringify(section.body)).toBe(200)
  const email = `applicant-${tag}@example.test`
  seeded.markers.push(email)
  await confirmedApplication(
    refs.clubSlug,
    refs.sectionSlug,
    childApplication(email, { participantFirstName: `Ola${tag}` }),
  )
  const list = await listApplications(request, admin, { tab: 'new' })
  expect(list.status, JSON.stringify(list.body)).toBe(200)
  seeded.responses.push(list.body)
  const application = list.body?.items.find((item) => item.participantName.startsWith(`Ola${tag}`))
  expect(application, 'the confirmed application is in the new tab').toBeTruthy()
  refs.application = String(application?.id)
  refs.applicationUpdatedAt = String(application?.updatedAt)
}
