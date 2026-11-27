// The DI block mechanism of the public pages (club spec DD-28; #29): `club_core` assembles the club and section pages
// from its own blocks and from optional providers other modules register under the tokens below — `groups` (phase 2:
// public groups, age or level, terms, instructors with consent), `activities` (phase 2: regular days and times,
// upcoming sessions with cancellations), `payments` (phase 4: fees) and `facilities` (phase 5: the places calendar).
// `club_core` never imports them: it resolves a token only when `hasRegistration` finds it, calls a provider only when
// the club publishes the provider's block, and leaves a failing provider's block out of the page. A provider module
// implements `PublicBlockProvider` (`import type` from this file) and registers it in its own `di.ts`. The Events page
// P-06 has its own contribution, `PublicEventsProvider` (#263), on the same terms; it also serves the tournament page of
// a published club event (club events spec DD-T11; #381).
import type { PublicationBlock } from '../lib/publication'

/** Optional provider tokens, in page order (DD-28). */
export const PUBLIC_BLOCK_PROVIDER_TOKENS = [
  'groups.publicCatalog',
  'activities.publicSchedule',
  'payments.publicPrices',
  'facilities.publicPlaces',
] as const

export type PublicBlockProviderToken = (typeof PUBLIC_BLOCK_PROVIDER_TOKENS)[number]

/** What a provider learns: the club found from the slug (its scope) and the blocks the club publishes. */
export type PublicBlockContext = {
  tenantId: string
  organizationId: string
  clubSlug: string
  /** Every block the club publishes, so a provider can include a part only with its block (e.g. `coaches`). */
  publishedBlocks: readonly PublicationBlock[]
}

export type PublicSectionBlockContext = PublicBlockContext & { sectionId: string; sectionSlug: string }

/**
 * The club page's context also names the club's public sections (active, `is_public`, with a slug; #91), so a provider
 * lists records of those sections only — `club_core` alone decides what a public section is.
 */
export type PublicClubBlockContext = PublicBlockContext & {
  sections: readonly { id: string; name: string; slug: string }[]
}

export type PublicBlockProvider = {
  /** The publication block that gates the provider: not called while the club does not publish it. */
  readonly block: PublicationBlock
  /** The provider's key in the page's `blocks` (never one of `club_core`'s own keys). */
  readonly key: string
  /** The provider's block on a section page; null leaves it out. Personal data only as DD-29 allows. */
  sectionBlock?(ctx: PublicSectionBlockContext): Promise<unknown>
  /** The provider's block on the club page; null leaves it out. */
  clubBlock?(ctx: PublicClubBlockContext): Promise<unknown>
}

/**
 * The optional contribution of the public Events page P-06 (navigation spec REQ-N13; #263), registered by `activities`.
 * `club_core` resolves it with `hasRegistration`, only for a club that publishes its page and the `events` block, and
 * passes the public sections the page shows (all of them, or the one `?section=` names); without the registration the
 * page lists no events.
 */
export const PUBLIC_EVENTS_PROVIDER_TOKEN = 'activities.publicEvents' as const

/**
 * An entry of P-06 as a guest sees it: a one-off event (`kind: 'event'`), or a published club event folded into one
 * entry (`kind: 'club_event'`, club events spec REQ-T10, DD-T12; #381). `club_core` adds the section's name and logo
 * from `sectionSlug`; a null `sectionSlug` (a whole-club event, or one whose section is not public) takes the club's.
 */
export type PublicEventEntry = {
  kind: 'event' | 'club_event'
  name: string
  /** The activity type (`match`, `sparring`, `tournament`, `camp`, …); `club_event` for a club event. */
  type: string
  /** Club-zone start and end dates and `HH:mm` times (a club event: its first part's start, its last part's end). */
  date: string
  endDate: string
  startTime: string
  endTime: string
  place: string | null
  /** A map link, only for an external venue. */
  mapUrl: string | null
  cancelled: boolean
  /** Ended before today ("Past (last 60 days)"). */
  past: boolean
  sectionSlug: string | null
  /** The club event's public slug (its tournament page); null for a one-off event. */
  clubEventSlug: string | null
  /** The club event's live parts; null for a one-off event. */
  partsCount: number | null
  /** The club event's poster file (served by `club_core` under the event's page); null without one. */
  posterFileId: string | null
}

/**
 * What P-06 passes: the public sections it shows and whether `?section=` narrowed them to one, in which case a
 * whole-club event is listed only when one of its parts is a public group of that section (TEST-T10).
 */
export type PublicEventsContext = PublicClubBlockContext & { filtered?: boolean }

/**
 * Our team of a part on the tournament page (DD-T12, Q-T07): a public group of a public section by its name and the
 * section's slug, else the club (`club_core` writes its name); null for an open part (no club team).
 */
export type PublicClubEventTeam = { groupName: string; sectionSlug: string } | { club: true } | null

export type PublicClubEventPart = {
  title: string
  category: string | null
  /** `tournament`, `match`, `sparring` or `other`. */
  type: string
  /** Club-zone date of the start and `HH:mm` times. */
  date: string
  startTime: string
  endTime: string
  cancelled: boolean
  ourTeam: PublicClubEventTeam
  /** Only the team's and its club's names: never a contact, a note or an institution. */
  visitingTeams: { name: string; clubName: string | null }[]
}

/** The tournament page P-T1 as `activities` reads it (REQ-T09); no person data, no cancellation reason. */
export type PublicClubEvent = {
  name: string
  slug: string
  status: 'planned' | 'cancelled'
  dateFrom: string
  dateTo: string
  description: string | null
  place: { name: string; address: string | null; mapUrl: string | null } | null
  posterFileId: string | null
  /** In upload order; `name` is the logo's alternative text. */
  funders: { name: string; fileId: string }[]
  days: { date: string; parts: PublicClubEventPart[] }[]
  /**
   * The pictures a guest may see now (event photos spec BR-I01, REQ-I05; #872), in their order; `description` is the
   * alternative text. Never a marked person. Absent from a contribution that has no pictures.
   */
  pictures?: { fileId: string; description: string; kind: 'photo' | 'graphic' }[]
}

/** A published file of a club event: the exact attachment owner and assignment `club_core`'s `fileResponse` matches. */
export type PublicClubEventFile = {
  attachmentId: string
  owner: { entityId: string; recordId: string }
  assignment: { type: string; id: string }
  mimeType: string
  /** A picture (event photos spec DD-I11): its bytes are served `private, no-store`, never kept by a shared cache. */
  noStore?: boolean
}

export type PublicEventsProvider = {
  /**
   * "Upcoming" soonest first and "Past" newest first: the one-off activities of the public groups of `ctx.sections`
   * and the club's published club events with a live part (never their parts one by one).
   */
  events(ctx: PublicEventsContext): Promise<{ upcoming: PublicEventEntry[]; past: PublicEventEntry[] }>
  /**
   * The public club event behind `eventSlug` (DD-T11, DD-T13): null unless it is public and has a live part.
   * `ctx.sections` are all the club's public sections.
   */
  clubEvent?(ctx: PublicClubBlockContext, eventSlug: string): Promise<PublicClubEvent | null>
  /** A poster, funder logo or public picture (BR-I01) of the public club event behind `eventSlug`; null otherwise. */
  clubEventFile?(ctx: PublicClubBlockContext, eventSlug: string, fileId: string): Promise<PublicClubEventFile | null>
}
