// The public tournament page P-T1 of a club event (club events spec REQ-T09, DD-T11, DD-T12, Q-T07; #381): the event's
// name, dates, status, description and place with its map link, its poster and funder logos, and its days with their
// parts — title, category, type, club-zone times, cancellation, our team and the visiting teams. Our team is a public
// group of a public section by its name and section, else the club (DD-29 keeps a group private unless the club
// publishes it); an open part has no club team. Visiting teams carry only their own and their club's names. Pure: the
// service passes the rows read inside the club's scope; no participant, coach, roster, contact or cancellation reason
// ever enters the view.
import type { PublicClubEvent, PublicClubEventPart, PublicClubEventTeam } from '../../club_core/services/public-blocks'
import { localDateTime } from './activities-rules'
import { sortClubEventFiles } from './club-event-files'
import { partsByDay } from './club-events'
import { shortTime } from './public-schedule'
import { placeMapHref } from './venue'

export type PublicClubEventPartRow = {
  title: string
  categoryLabel: string | null
  type: string
  /** Set for a part with a group: its session holds the day, the times and the status. */
  activityId: string | null
  /** An open part's own span and status. */
  startsAt: Date | null
  endsAt: Date | null
  status: string | null
  visitingTeamIds: readonly string[]
}

export type PublicClubEventSessionRow = { groupId: string; startAt: Date; endAt: Date; status: string }

export type PublicClubEventFileRow = {
  id: string
  kind: string
  funderName: string | null
  position: number
  createdAt: Date
}

export type PublicClubEventInput = {
  event: { name: string; slug: string; status: string; description: string | null }
  place: { name: string; address: string | null; geoLat: number | null; geoLng: number | null } | null
  parts: readonly PublicClubEventPartRow[]
  /** The live session of each part's activity, by activity id. */
  sessions: ReadonlyMap<string, PublicClubEventSessionRow>
  /** The parts' groups: id → name and section. */
  groups: ReadonlyMap<string, { name: string; sectionId: string }>
  /** The club's public groups in public sections. */
  publicGroupIds: ReadonlySet<string>
  /** The club's public sections: id → slug. */
  sectionSlugs: ReadonlyMap<string, string>
  teams: ReadonlyMap<string, { name: string; clubName?: string | null }>
  files: readonly PublicClubEventFileRow[]
  timeZone: string
}

type DatedPart = { part: PublicClubEventPart; startAt: Date; endAt: Date }

/** Our team of a part with a group: the public group and its public section, else the club. */
export function publicOurTeam(
  groupId: string,
  groups: PublicClubEventInput['groups'],
  publicGroupIds: ReadonlySet<string>,
  sectionSlugs: ReadonlyMap<string, string>,
): PublicClubEventTeam {
  const group = groups.get(groupId)
  const sectionSlug = group ? sectionSlugs.get(group.sectionId) : undefined
  if (!group || !publicGroupIds.has(groupId) || sectionSlug === undefined) return { club: true }
  return { groupName: group.name, sectionSlug }
}

function datedPart(part: PublicClubEventPartRow, input: PublicClubEventInput): DatedPart | null {
  const session = part.activityId ? input.sessions.get(part.activityId) : undefined
  const startAt = session?.startAt ?? (part.activityId ? null : part.startsAt)
  const endAt = session?.endAt ?? (part.activityId ? null : part.endsAt)
  if (!startAt || !endAt) return null
  const start = localDateTime(startAt, input.timeZone)
  const end = localDateTime(endAt, input.timeZone)
  return {
    part: {
      title: part.title,
      category: part.categoryLabel,
      type: part.type,
      date: start.date,
      startTime: shortTime(start.time),
      endTime: shortTime(end.time),
      cancelled: (session?.status ?? part.status) === 'cancelled',
      ourTeam: session ? publicOurTeam(session.groupId, input.groups, input.publicGroupIds, input.sectionSlugs) : null,
      visitingTeams: part.visitingTeamIds.flatMap((id) => {
        const team = input.teams.get(id)
        return team ? [{ name: team.name, clubName: team.clubName ?? null }] : []
      }),
    },
    startAt,
    endAt,
  }
}

/**
 * The tournament page of a club event, or null while it has no live part with a time (a part with a group whose
 * session is gone counts as none). Parts in start order, then by title; days in date order.
 */
export function publicClubEventView(input: PublicClubEventInput): PublicClubEvent | null {
  const parts = input.parts
    .flatMap((part) => {
      const dated = datedPart(part, input)
      return dated ? [dated] : []
    })
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.part.title.localeCompare(b.part.title, 'pl'))
  if (parts.length === 0) return null
  const first = parts[0]
  const last = Math.max(...parts.map((part) => part.endAt.getTime()))
  const files = sortClubEventFiles(input.files)
  const poster = files.find((file) => file.kind === 'poster')
  const place = input.place
  return {
    name: input.event.name,
    slug: input.event.slug,
    status: input.event.status === 'cancelled' ? 'cancelled' : 'planned',
    dateFrom: first.part.date,
    dateTo: localDateTime(new Date(last), input.timeZone).date,
    description: input.event.description,
    place: place ? { name: place.name, address: place.address, mapUrl: placeMapHref(place) } : null,
    posterFileId: poster?.id ?? null,
    funders: files
      .filter((file) => file.kind === 'funder_logo')
      .map((file) => ({ name: file.funderName ?? '', fileId: file.id })),
    days: partsByDay(
      parts.map((dated) => dated.part),
      (part) => part.date,
    ),
  }
}
