// The public session page (club spec DD-17; foundation III DD-M14, REQ-M08, J-M02 step 2): a guest who opens the link
// of a share text sees the activity name, the date, the time and the status of one session — no names, no roster, no
// counts. The club comes from `club_core`'s one approved slug lookup (`clubCorePublicSite.clubFrame`, DD-35); the
// session is then read by id inside the organization that lookup found, so an id under another club's slug, an
// unknown id and a club without a published page all answer the same `not_found`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { ClubCorePublicSite, PublicClubFrame } from '../../club_core/services/public-site'
import { Activity, Occurrence } from '../data/entities'
import { publicSessionView, type PublicSessionView } from '../lib/share-text'
import { clubTimeZone } from './directory'

const CLUB_CORE_PUBLIC_SITE = 'clubCorePublicSite'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PublicSessionPage = { club: PublicClubFrame['club']; session: PublicSessionView }

export async function publicSessionPage(
  container: AwilixContainer,
  clubSlug: string,
  occurrenceId: string,
): Promise<PublicSessionPage | null> {
  if (!UUID_PATTERN.test(occurrenceId) || !container.hasRegistration(CLUB_CORE_PUBLIC_SITE)) return null
  const frame = await container.resolve<ClubCorePublicSite>(CLUB_CORE_PUBLIC_SITE).clubFrame(clubSlug)
  if (frame.status !== 'ok') return null
  const scope = { tenantId: frame.value.tenantId, organizationId: frame.value.organizationId }
  const em = container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(
    Occurrence,
    { id: occurrenceId, ...scope, deletedAt: null },
    { fields: ['id', 'activityId', 'occurrenceDate', 'startAt', 'endAt', 'status'] },
  )
  if (!occurrence) return null
  const activity = await em.findOne(Activity, { id: occurrence.activityId, ...scope }, { fields: ['id', 'name'] })
  const timeZone = await clubTimeZone(container, scope)
  return {
    club: frame.value.club,
    session: publicSessionView(occurrence, activity?.name ?? '', timeZone),
  }
}
