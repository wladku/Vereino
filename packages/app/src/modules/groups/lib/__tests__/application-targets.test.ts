import { describe, expect, it } from '@jest/globals'
import { fitsRule } from '@vereino/core'
import { applicationTarget, type ApplicationTargetGroup } from '../application-targets'

const team: ApplicationTargetGroup = {
  id: 'g-zak',
  name: 'Żaki',
  kind: 'team',
  seasonId: 's-2026',
  ageFrom: 7,
  ageTo: 9,
  placesLimit: 18,
  acceptsApplications: true,
  isPublic: true,
  isActive: true,
  publicConditions: '  Sports shoes and a water bottle.  ',
}

describe('applicationTarget (sign-up form spec DD-J05)', () => {
  it('gives a team with a "U" range the birth-year rule of the season that contains the date', () => {
    const target = applicationTarget(team, {
      date: '2026-09-01',
      referenceSeason: { startsOn: '2026-08-01', endsOn: '2027-06-30' },
      categoryRange: { uFrom: 8, uTo: 9 },
      ageCategoryLabel: 'Żak (U8–U9)',
      occupied: 18,
    })
    expect(target).toEqual({
      groupId: 'g-zak',
      name: 'Żaki',
      kind: 'team',
      seasonId: 's-2026',
      seasonEndsOn: '2027-06-30',
      ageFrom: 7,
      ageTo: 9,
      ageCategoryLabel: 'Żak (U8–U9)',
      fitRule: { kind: 'birth_years', uFrom: 8, uTo: 9, referenceYear: 2026, from: 2018, to: 2019 },
      placesLimit: 18,
      occupied: 18,
      acceptsApplications: true,
      isPublic: true,
      isActive: true,
      publicConditions: 'Sports shoes and a water bottle.',
    })
    expect(fitsRule('2018-12-31', '2026-09-01', target.fitRule)).toBe(true)
    expect(fitsRule('2017-12-31', '2026-09-01', target.fitRule)).toBe(false)
  })

  it("uses the date's year without a season and the age rule without a category range", () => {
    const withoutSeason = applicationTarget(team, {
      date: '2027-03-01',
      referenceSeason: null,
      categoryRange: { uFrom: 8, uTo: 9 },
      ageCategoryLabel: null,
      occupied: 0,
    })
    expect(withoutSeason.fitRule).toMatchObject({ kind: 'birth_years', referenceYear: 2027 })
    expect(withoutSeason.seasonEndsOn).toBeNull()
    const byAge = applicationTarget(team, {
      date: '2026-09-01',
      referenceSeason: null,
      categoryRange: null,
      ageCategoryLabel: null,
      occupied: 3,
    })
    expect(byAge.fitRule).toEqual({ kind: 'age', ageFrom: 7, ageTo: 9 })
  })

  it('ignores a category range on a class group and reads unset columns as null', () => {
    const target = applicationTarget(
      { id: 'g-swim', name: 'Basen', kind: 'class_group', acceptsApplications: false, isPublic: false, isActive: true },
      {
        date: '2026-09-01',
        referenceSeason: null,
        categoryRange: { uFrom: 8, uTo: 9 },
        ageCategoryLabel: null,
        occupied: 2,
      },
    )
    expect(target).toMatchObject({
      seasonId: null,
      ageFrom: null,
      ageTo: null,
      fitRule: null,
      placesLimit: null,
      occupied: 2,
      acceptsApplications: false,
      isPublic: false,
      publicConditions: null,
    })
  })

  it('shows the conditions of a public group only, and a blank text as none (#801)', () => {
    const facts = {
      date: '2026-09-01',
      referenceSeason: null,
      categoryRange: null,
      ageCategoryLabel: null,
      occupied: 0,
    }
    expect(applicationTarget({ ...team, isPublic: false }, facts).publicConditions).toBeNull()
    expect(applicationTarget({ ...team, publicConditions: '   ' }, facts).publicConditions).toBeNull()
    expect(applicationTarget({ ...team, publicConditions: null }, facts).publicConditions).toBeNull()
  })
})
