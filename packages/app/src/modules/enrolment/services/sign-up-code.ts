// The group sign-up QR code (E29-S02, #869; D41, D44): the public address of a section's sign-up form with one group
// chosen, for a coach or coordinator to show on the phone or print. The answer is `open` only when a parent scanning
// it right now would get the form with that group offered — the same `publicForm` read P-J2 makes from the slugs —
// and `closed` otherwise (no public address of the club or the section, the club's page off, the section or the group
// not taking applications, the group not public or not active). The address holds the public slugs and the group's
// id only: no token, nothing personal, nothing stored.
import type { AwilixContainer } from 'awilix'
import { getSecurityEmailBaseUrl } from '@open-mercato/shared/lib/url'
import { clubOrigin } from '@vereino/core'
import { groupApplyPath } from '../lib/paths'
import { enrolmentSettings, findGroup, sectionPublicSlug, type EnrolmentScope } from './directory'
import { publicForm } from './views'

export type GroupSignUpCode =
  | { status: 'not_found' }
  | { status: 'closed'; groupName: string }
  | { status: 'open'; url: string; clubName: string; sectionName: string; groupName: string }

export async function groupSignUpCode(
  container: AwilixContainer,
  scope: EnrolmentScope,
  groupId: string,
  now: Date = new Date(),
): Promise<GroupSignUpCode> {
  const group = await findGroup(container, scope, groupId)
  if (!group) return { status: 'not_found' }
  const [settings, sectionSlug] = await Promise.all([
    enrolmentSettings(container, scope),
    sectionPublicSlug(container, scope, group.sectionId),
  ])
  const clubSlug = settings.publicSlug
  if (!clubSlug || !sectionSlug) return { status: 'closed', groupName: group.name }
  const form = await publicForm(container, clubSlug, sectionSlug, now)
  if (form.status !== 'ok' || !form.value.groups.some((offered) => offered.id === group.id)) {
    return { status: 'closed', groupName: group.name }
  }
  const origin = clubOrigin(clubSlug, process.env) ?? getSecurityEmailBaseUrl(undefined)
  return {
    status: 'open',
    url: `${origin.replace(/\/+$/, '')}${groupApplyPath(clubSlug, sectionSlug, group.id)}`,
    clubName: form.value.club.name,
    sectionName: form.value.section.name,
    groupName: group.name,
  }
}
