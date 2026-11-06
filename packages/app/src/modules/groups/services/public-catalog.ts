// `groups.publicCatalog` (club spec DD-28, DD-29, REQ-025; #91): the public groups of a section for its public page,
// registered as an optional DI provider `club_core` reads with `hasRegistration` (`club_core/services/public-blocks.ts`).
// `club_core` calls it only for a public section of a club that publishes `description_schedule`, inside the tenant
// and organization its slug lookup found; every query here carries that scope. Only live, active groups marked
// `is_public` appear; requirements need the `conditions` block, instructors the `coaches` block, and an instructor's
// name that person's `publish_name_consent_at` (read through `people.personDirectory`). No roster, no participant.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { PublicBlockProvider, PublicSectionBlockContext } from '../../club_core/services/public-blocks'
import { Group } from '../data/entities'
import { publicCatalogBlock, type PublicCatalogBlock } from '../lib/public-catalog'
import { clubToday } from './club-clock'
import { publicNames } from './directory'
import { rosterSummaries } from './groups-read'

export const GROUPS_PUBLIC_CATALOG = 'groups.publicCatalog' as const

/** The response key of the block on the section page. */
export const PUBLIC_CATALOG_KEY = 'groups'

export function createPublicCatalog(container: AwilixContainer): PublicBlockProvider {
  return {
    block: 'description_schedule',
    key: PUBLIC_CATALOG_KEY,
    async sectionBlock(ctx: PublicSectionBlockContext): Promise<PublicCatalogBlock | null> {
      const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
      const em = container.resolve<EntityManager>('em').fork()
      const rows = await em.find(
        Group,
        { ...scope, sectionId: ctx.sectionId, isPublic: true, isActive: true, deletedAt: null },
        {
          fields: ['id', 'name', 'kind', 'publicDescription', 'publicConditions', 'ageFrom', 'ageTo', 'levelLabel'],
          orderBy: { name: 'asc', id: 'asc' },
        },
      )
      if (rows.length === 0) return null
      const coaches = ctx.publishedBlocks.includes('coaches')
      const coachIds = new Map<string, string[]>()
      let names = new Map<string, string>()
      if (coaches) {
        const today = await clubToday(container, scope)
        const rosters = await rosterSummaries(
          container,
          scope,
          rows.map((row) => row.id),
          today,
        )
        for (const [groupId, roster] of rosters) coachIds.set(groupId, roster.coachIds)
        names = await publicNames(container, scope, [...coachIds.values()].flat())
      }
      return publicCatalogBlock(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          publicDescription: row.publicDescription ?? null,
          publicConditions: row.publicConditions ?? null,
          ageFrom: row.ageFrom ?? null,
          ageTo: row.ageTo ?? null,
          levelLabel: row.levelLabel ?? null,
        })),
        { conditions: ctx.publishedBlocks.includes('conditions'), coaches },
        coachIds,
        names,
      )
    },
  }
}
