// The options of a member's direct thread (foundation III REQ-M12, DD-M18; `GET /api/communication/direct`): for each
// household member the reader may write about (themself, their wards), the groups they take part in today with the
// names of the groups' coaches and of the sections' coordinators. Only staff names leave this read — never another
// family's. The command `communication.threads.start_direct` checks the same facts again in its transaction.
import { contactResolver } from '@/modules/foundation'
import {
  coachIdsOf,
  directOptions,
  directSubjectIds,
  participantGroupIds,
  type DirectOption,
} from '../lib/direct-rules'
import { clubCoreDirectory, groupDirectory, personDirectory, personName } from './directory'
import type { Viewer } from './threads'

export async function directThreadOptions(viewer: Viewer): Promise<{ items: DirectOption[] }> {
  const subjectIds = directSubjectIds(viewer.grants)
  if (subjectIds.length === 0) return { items: [] }
  const { container, scope } = viewer
  const { today } = await contactResolver(container).club({ container, ...scope, scope: viewer.grants })
  const groups = groupDirectory(container)
  const memberships = await groups.membershipsOf(scope, subjectIds, { from: today, to: today })
  const groupIds = [...new Set([...participantGroupIds(subjectIds, memberships).values()].flat())]
  const groupMap = await groups.findGroups(scope, groupIds)
  const sectionIds = [...new Set([...groupMap.values()].map((group) => group.sectionId))]
  const people = personDirectory(container)
  const [sections, rosters, coordinators] = await Promise.all([
    clubCoreDirectory(container).findSections(scope, sectionIds),
    Promise.all(
      [...groupMap.keys()].map(async (id) => [id, coachIdsOf(await groups.rosterOn(scope, id, today))] as const),
    ),
    Promise.all(sectionIds.map(async (id) => [id, await people.sectionCoordinatorIdsOn(scope, id, today)] as const)),
  ])
  const coachIdsByGroup = new Map<string, string[]>(rosters)
  const coordinatorIdsBySection = new Map<string, string[]>(coordinators)
  const personIds = [
    ...subjectIds,
    ...[...coachIdsByGroup.values()].flat(),
    ...[...coordinatorIdsBySection.values()].flat(),
  ]
  const entries = await people.findPersons(scope, personIds)
  const names = new Map<string, string>()
  for (const [id, entry] of entries) {
    const name = personName(entry)
    if (name) names.set(id, name)
  }
  return {
    items: directOptions(
      { subjectIds, memberships, groups: groupMap, sections, coachIdsByGroup, coordinatorIdsBySection, names },
      viewer.personId,
    ),
  }
}
