// The DI block mechanism of the public pages (club spec DD-28; #29): `club_core` assembles the club and section pages
// from its own blocks and from optional providers other modules register under the tokens below — `groups` (phase 2:
// public groups, age or level, terms, instructors with consent), `activities` (phase 2: regular days and times,
// upcoming sessions with cancellations), `payments` (phase 4: fees) and `facilities` (phase 5: the places calendar).
// `club_core` never imports them: it resolves a token only when `hasRegistration` finds it, calls a provider only when
// the club publishes the provider's block, and leaves a failing provider's block out of the page. A provider module
// implements `PublicBlockProvider` (`import type` from this file) and registers it in its own `di.ts`.
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

export type PublicBlockProvider = {
  /** The publication block that gates the provider: not called while the club does not publish it. */
  readonly block: PublicationBlock
  /** The provider's key in the page's `blocks` (never one of `club_core`'s own keys). */
  readonly key: string
  /** The provider's block on a section page; null leaves it out. Personal data only as DD-29 allows. */
  sectionBlock?(ctx: PublicSectionBlockContext): Promise<unknown>
  /** The provider's block on the club page; null leaves it out. */
  clubBlock?(ctx: PublicBlockContext): Promise<unknown>
}
