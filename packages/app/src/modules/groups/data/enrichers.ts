// Response enrichers of `groups` (UMES: the optional consumer owns the glue; `groups` requires `club_core`, never the
// other way round). `groups.section-groups` adds to every section of `/api/club_core/sections` the number of its
// active groups (UX parity spec REQ-U02, B-04 column "Groups"), using the seam of `people.section-coordinators`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { EnricherContext, ResponseEnricher } from '@open-mercato/shared/lib/crud/response-enricher'
import { clubToday } from '../services/club-clock'
import { activeGroupsOfPersons, type PersonGroup } from '../services/person-filter'
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

/** The people list's enricher entity id (`people` `encryption.ts` `PERSON_ENTITY_ID`). */
export const PEOPLE_PERSON_ENTITY_ID = 'people:person'

type PersonRecord = Record<string, unknown> & { id: string }

type PersonGroupsEnrichment = { _groups: { groups: PersonGroup[] } }

async function loadPersonGroups(
  records: readonly PersonRecord[],
  context: EnricherContext,
): Promise<Map<string, PersonGroup[]>> {
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  const em = (context.em as EntityManager).fork()
  const today = await clubToday(context.container as AwilixContainer, scope)
  return activeGroupsOfPersons(
    em,
    scope,
    records.map((record) => record.id),
    today,
  )
}

/**
 * `groups.person-groups` adds to every person of `/api/people/persons` the live groups in which the person has an
 * active membership today, with the membership role (UX parity spec REQ-U01, B-09 column "Groups"). Group names only:
 * no personal data, so every reader of the people list may see them.
 */
const personGroupsEnricher: ResponseEnricher<PersonRecord, PersonGroupsEnrichment> = {
  id: 'groups.person-groups',
  targetEntity: PEOPLE_PERSON_ENTITY_ID,
  features: ['people.view'],
  priority: 10,
  timeout: 3000,
  // Reads another module's table: never served from the list cache.
  cacheableOnListHit: false,
  async enrichOne(record, context) {
    const groups = await loadPersonGroups([record], context)
    return { ...record, _groups: { groups: groups.get(record.id) ?? [] } }
  },
  async enrichMany(records, context) {
    const groups = await loadPersonGroups(records, context)
    return records.map((record) => ({ ...record, _groups: { groups: groups.get(record.id) ?? [] } }))
  },
}

export const enrichers: ResponseEnricher[] = [sectionGroupsEnricher, personGroupsEnricher]
