// Response enrichers of `people` (UMES: the optional consumer owns the glue; club spec *Architecture* → `people`
// requires `club_core`, never the other way round). `people.section-coordinators` adds to every section of
// `/api/club_core/sections` its current and future coordinators — the `coordinator` role assignments with that
// `section_id` that have not ended — with the person's name, and flags an active section without a coordinator
// today (club spec glossary *Section*: a warning, not an error).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { EnricherContext, ResponseEnricher } from '@open-mercato/shared/lib/crud/response-enricher'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Person, RoleAssignment } from './entities'
import { sectionCoordinators, type SectionCoordinator } from '../lib/people-rules'
import { clubToday } from '../services/club-clock'

/** The section list's enricher entity id (`club_core` `api/shared.ts` `SECTION_ENTITY_ID`). */
export const CLUB_CORE_SECTION_ENTITY_ID = 'club_core:section'

type SectionRecord = Record<string, unknown> & { id: string; isActive?: boolean }

type CoordinatorEnrichment = {
  _people: { coordinators: SectionCoordinator[]; coordinatorMissing: boolean }
}

async function loadCoordinators(
  records: readonly SectionRecord[],
  context: EnricherContext,
): Promise<Map<string, CoordinatorEnrichment['_people']>> {
  const scope = { tenantId: context.tenantId, organizationId: context.organizationId }
  const sectionIds = records.map((record) => record.id)
  const em = (context.em as EntityManager).fork()
  const today = await clubToday(context.container as AwilixContainer, scope)
  const assignments =
    sectionIds.length > 0
      ? await em.find(RoleAssignment, {
          ...scope,
          role: 'coordinator',
          sectionId: { $in: sectionIds },
          deletedAt: null,
        })
      : []
  const personIds = [...new Set(assignments.map((row) => row.personId))]
  const persons =
    personIds.length > 0
      ? await findWithDecryption(
          em,
          Person,
          { id: { $in: personIds }, ...scope, deletedAt: null },
          { fields: ['id', 'firstName', 'lastName'] },
          scope,
        )
      : []
  const names = new Map(persons.map((person) => [person.id, person]))
  const result = new Map<string, CoordinatorEnrichment['_people']>()
  for (const record of records) {
    result.set(
      record.id,
      sectionCoordinators(
        { id: record.id, isActive: record.isActive !== false },
        assignments.map((row) => {
          const person = names.get(row.personId)
          return {
            assignmentId: row.id,
            personId: row.personId,
            sectionId: row.sectionId ?? null,
            firstName: person?.firstName ?? null,
            lastName: person?.lastName ?? null,
            validFrom: row.validFrom,
            validTo: row.validTo ?? null,
            updatedAt: row.updatedAt.toISOString(),
          }
        }),
        today,
      ),
    )
  }
  return result
}

const sectionCoordinatorsEnricher: ResponseEnricher<SectionRecord, CoordinatorEnrichment> = {
  id: 'people.section-coordinators',
  targetEntity: CLUB_CORE_SECTION_ENTITY_ID,
  // Names of people: shown to readers of people records (the club administrator and coordinators).
  features: ['people.view'],
  priority: 10,
  timeout: 3000,
  // Reads another module's table and depends on today's date: never served from the list cache.
  cacheableOnListHit: false,
  async enrichOne(record, context) {
    const enrichment = await loadCoordinators([record], context)
    return { ...record, _people: enrichment.get(record.id) ?? { coordinators: [], coordinatorMissing: false } }
  },
  async enrichMany(records, context) {
    const enrichment = await loadCoordinators(records, context)
    return records.map((record) => ({
      ...record,
      _people: enrichment.get(record.id) ?? { coordinators: [], coordinatorMissing: false },
    }))
  },
}

export const enrichers: ResponseEnricher[] = [sectionCoordinatorsEnricher]
