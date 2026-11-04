// Response enrichers of `groups` (UMES: the optional consumer owns the glue; `groups` requires `club_core`, never the
// other way round). `groups.section-groups` adds to every section of `/api/club_core/sections` the number of its
// active groups (UX parity spec REQ-U02, B-04 column "Groups"), using the seam of `people.section-coordinators`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { EnricherContext, ResponseEnricher } from '@open-mercato/shared/lib/crud/response-enricher'
import { activeGroupCounts } from '../services/section-usage'

/** The section list's enricher entity id (`club_core` `api/shared.ts` `SECTION_ENTITY_ID`). */
export const CLUB_CORE_SECTION_ENTITY_ID = 'club_core:section'

type SectionRecord = Record<string, unknown> & { id: string }

type SectionGroupsEnrichment = { _groups: { activeGroupCount: number } }

async function loadCounts(records: readonly SectionRecord[], context: EnricherContext): Promise<Map<string, number>> {
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  const em = (context.em as EntityManager).fork()
  return activeGroupCounts(
    em,
    scope,
    records.map((record) => record.id),
  )
}

const sectionGroupsEnricher: ResponseEnricher<SectionRecord, SectionGroupsEnrichment> = {
  id: 'groups.section-groups',
  targetEntity: CLUB_CORE_SECTION_ENTITY_ID,
  // A count only, no names: every reader of the section list may see it.
  features: ['club_core.view'],
  priority: 10,
  timeout: 3000,
  // Reads another module's table: never served from the list cache.
  cacheableOnListHit: false,
  async enrichOne(record, context) {
    const counts = await loadCounts([record], context)
    return { ...record, _groups: { activeGroupCount: counts.get(record.id) ?? 0 } }
  },
  async enrichMany(records, context) {
    const counts = await loadCounts(records, context)
    return records.map((record) => ({ ...record, _groups: { activeGroupCount: counts.get(record.id) ?? 0 } }))
  },
}

export const enrichers: ResponseEnricher[] = [sectionGroupsEnricher]
