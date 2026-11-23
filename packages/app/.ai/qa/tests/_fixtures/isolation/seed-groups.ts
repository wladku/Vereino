// groups records of the cross-club isolation guard (#628): the PZPN age categories with one category the club added,
// the current and the next season, a team of the current season with an age category, an external team, and a
// participant moved from Orliki to that team from tomorrow (the bulk move's undo token and the moved membership's lock
// token are what the move probes need).
import { expect } from '@playwright/test'
import { birthDateTurning, calendarDate } from '../club'
import { seedAgeCategories } from '../groups'
import type { ModuleSeed } from './seed'

type Item = { id: string; updatedAt?: string; value?: string }

export const seedGroups: ModuleSeed = async ({ seeded, api }) => {
  const { refs } = seeded
  expect(seedAgeCategories(seeded.club), 'the age categories are seeded').toEqual({ created: true })
  const options = await api<{ items?: Item[] }>('GET', '/api/groups/options/age-categories')
  const zak = options.body?.items?.find((item) => item.value === 'zak')
  expect(zak, 'the seeded age categories hold "zak"').toBeTruthy()
  refs.ageCategory = String(zak?.id)
  const added = await api<{ entryId?: string }>('POST', '/api/groups/age-categories', {
    data: { label: 'Żak młodszy', uFrom: 8, uTo: 8 },
    status: 201,
  })
  refs.ageCategoryEntry = String(added.body?.entryId)

  const season = await api<{ id?: string }>('POST', '/api/groups/seasons', {
    data: { name: 'Sezon bieżący', startsOn: calendarDate(-60), endsOn: calendarDate(300) },
    status: 201,
  })
  refs.season = String(season.body?.id)
  const next = await api<{ id?: string }>('POST', '/api/groups/seasons', {
    data: { name: 'Sezon następny', startsOn: calendarDate(301), endsOn: calendarDate(665) },
    status: 201,
  })
  refs.season2 = String(next.body?.id)

  const team = await api<{ id?: string }>('POST', '/api/groups/groups', {
    data: {
      sectionId: refs.section,
      name: 'Żaki sezonowe',
      kind: 'team',
      seasonId: refs.season,
      ageCategoryEntryId: refs.ageCategory,
    },
    status: 201,
  })
  refs.seasonGroup = String(team.body?.id)

  const opponent = await api<{ id?: string }>('POST', '/api/groups/external-teams', {
    data: { name: 'FC Rywal', institutionId: refs.institution },
    status: 201,
  })
  refs.externalTeam = String(opponent.body?.id)
  const opponents = await api<{ items?: Item[] }>('GET', `/api/groups/external-teams?ids=${refs.externalTeam}`)
  refs.externalTeamUpdatedAt = String(opponents.body?.items?.[0]?.updatedAt)

  const person = await api<{ id?: string }>('POST', '/api/people/persons', {
    data: { firstName: 'Ola', lastName: 'Przenoszona', birthDate: birthDateTurning(8) },
    status: 201,
  })
  refs.rosterPerson = String(person.body?.id)
  const membership = await api<{ id?: string }>('POST', '/api/groups/memberships', {
    data: { groupId: refs.group2, personId: refs.rosterPerson, role: 'participant', validFrom: calendarDate(-30) },
    status: 201,
  })
  refs.moveMembership = String(membership.body?.id)
  const move = {
    fromGroupId: refs.group2,
    toGroupId: refs.seasonGroup,
    date: refs.tomorrow,
    membershipIds: [refs.moveMembership],
  }
  const preview = await api<{ previewToken?: string }>('POST', '/api/groups/memberships/move-many', {
    data: { ...move, dryRun: true },
  })
  const applied = await api<{ undoToken?: string | null; moved?: number }>(
    'POST',
    '/api/groups/memberships/move-many',
    {
      data: { ...move, previewToken: preview.body?.previewToken },
    },
  )
  expect(applied.body?.moved, 'the participant is moved').toBe(1)
  refs.moveUndoToken = String(applied.body?.undoToken)

  const moved = await api<{ items?: Item[] }>('GET', `/api/groups/memberships?ids=${refs.moveMembership}`)
  refs.moveMembershipUpdatedAt = String(moved.body?.items?.[0]?.updatedAt)
  const teams = await api<{ items?: Item[] }>('GET', `/api/groups/groups?ids=${refs.seasonGroup}`)
  refs.seasonGroupUpdatedAt = String(teams.body?.items?.[0]?.updatedAt)
}
