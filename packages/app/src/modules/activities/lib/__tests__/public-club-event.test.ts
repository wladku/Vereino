import { describe, expect, it } from '@jest/globals'
import {
  publicClubEventView,
  publicOurTeam,
  type PublicClubEventInput,
  type PublicClubEventPartRow,
} from '../public-club-event'

const ZONE = 'Europe/Warsaw'

// `HH:mm` in Warsaw (CET, UTC+1) on `date`.
const at = (date: string, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number) as [number, number]
  return new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hours - 1, minutes),
  )
}

const groups = new Map([
  ['g-public', { name: 'Orlik młodszy', sectionId: 's-academy' }],
  ['g-private', { name: 'Rezerwy', sectionId: 's-academy' }],
  ['g-hidden-section', { name: 'Seniorzy', sectionId: 's-private' }],
])
const publicGroupIds = new Set(['g-public', 'g-hidden-section'])
const sectionSlugs = new Map([['s-academy', 'akademia']])

const groupPart = (activityId: string, title: string, overrides: Partial<PublicClubEventPartRow> = {}) => ({
  title,
  categoryLabel: 'U-9',
  type: 'tournament',
  activityId,
  startsAt: null,
  endsAt: null,
  status: null,
  visitingTeamIds: [],
  ...overrides,
})

const input = (overrides: Partial<PublicClubEventInput> = {}): PublicClubEventInput => ({
  event: { name: 'PRZYKŁAD CUP 2026', slug: 'przyklad-cup-2026', status: 'planned', description: 'Halowy turniej' },
  place: { name: 'Hala w Zielonym Lesie', address: 'ul. Szkolna 50, Zielony Las', geoLat: null, geoLng: null },
  parts: [],
  sessions: new Map(),
  groups,
  publicGroupIds,
  sectionSlugs,
  teams: new Map([
    ['t1', { name: 'Wisła Brzezie', clubName: 'LKS Wisła' }],
    ['t2', { name: 'UKS Sąsiedni' }],
  ]),
  files: [],
  timeZone: ZONE,
  ...overrides,
})

describe('publicOurTeam', () => {
  it('names a public group of a public section, else the club', () => {
    expect(publicOurTeam('g-public', groups, publicGroupIds, sectionSlugs)).toEqual({
      groupName: 'Orlik młodszy',
      sectionSlug: 'akademia',
    })
    expect(publicOurTeam('g-private', groups, publicGroupIds, sectionSlugs)).toEqual({ club: true })
    expect(publicOurTeam('g-hidden-section', groups, publicGroupIds, sectionSlugs)).toEqual({ club: true })
    expect(publicOurTeam('g-unknown', groups, new Set(['g-unknown']), sectionSlugs)).toEqual({ club: true })
  })
})

describe('publicClubEventView', () => {
  it('is null without a live part with a time', () => {
    expect(publicClubEventView(input())).toBeNull()
    expect(publicClubEventView(input({ parts: [groupPart('gone', 'Part without session')] }))).toBeNull()
    expect(
      publicClubEventView(input({ parts: [groupPart('', 'Open without times', { activityId: null })] })),
    ).toBeNull()
  })

  it('builds the days with their parts, our team, the visiting teams, the poster and the funders', () => {
    const view = publicClubEventView(
      input({
        parts: [
          groupPart('a2', 'Turniej Żaków', { visitingTeamIds: ['t1', 't2', 'gone'] }),
          groupPart('a1', 'Turniej Orlika', { categoryLabel: null }),
          groupPart('a3', 'Turniej rezerw', { type: 'match' }),
          {
            title: 'Turniej seniorów',
            categoryLabel: 'Open',
            type: 'other',
            activityId: null,
            startsAt: at('2026-11-28', '10:00'),
            endsAt: at('2026-11-28', '18:00'),
            status: 'cancelled',
            visitingTeamIds: [],
          },
          groupPart('a4', 'Turniej Orlika B', {}),
        ],
        sessions: new Map([
          [
            'a1',
            {
              groupId: 'g-public',
              startAt: at('2026-11-21', '09:00'),
              endAt: at('2026-11-21', '14:00'),
              status: 'planned',
            },
          ],
          [
            'a2',
            {
              groupId: 'g-private',
              startAt: at('2026-11-22', '09:00'),
              endAt: at('2026-11-22', '12:00'),
              status: 'cancelled',
            },
          ],
          [
            'a3',
            {
              groupId: 'g-public',
              startAt: at('2026-11-21', '15:00'),
              endAt: at('2026-11-21', '17:00'),
              status: 'done',
            },
          ],
          [
            'a4',
            {
              groupId: 'g-public',
              startAt: at('2026-11-21', '09:00'),
              endAt: at('2026-11-21', '10:00'),
              status: 'planned',
            },
          ],
        ]),
        files: [
          { id: 'logo-2', kind: 'funder_logo', funderName: 'Gmina Zielony Las', position: 1, createdAt: new Date(2) },
          { id: 'poster', kind: 'poster', funderName: null, position: 0, createdAt: new Date(3) },
          { id: 'logo-1', kind: 'funder_logo', funderName: null, position: 0, createdAt: new Date(1) },
        ],
      }),
    )
    expect(view).toEqual({
      name: 'PRZYKŁAD CUP 2026',
      slug: 'przyklad-cup-2026',
      status: 'planned',
      dateFrom: '2026-11-21',
      dateTo: '2026-11-28',
      description: 'Halowy turniej',
      place: {
        name: 'Hala w Zielonym Lesie',
        address: 'ul. Szkolna 50, Zielony Las',
        mapUrl:
          'https://www.openstreetmap.org/search?query=Hala%20w%20Zielonym%20Lesie%2C%20ul.%20Szkolna%2050%2C%20Zielony%20Las',
      },
      posterFileId: 'poster',
      funders: [
        { name: '', fileId: 'logo-1' },
        { name: 'Gmina Zielony Las', fileId: 'logo-2' },
      ],
      days: [
        {
          date: '2026-11-21',
          parts: [
            {
              title: 'Turniej Orlika',
              category: null,
              type: 'tournament',
              date: '2026-11-21',
              startTime: '09:00',
              endTime: '14:00',
              cancelled: false,
              ourTeam: { groupName: 'Orlik młodszy', sectionSlug: 'akademia' },
              visitingTeams: [],
            },
            expect.objectContaining({ title: 'Turniej Orlika B', startTime: '09:00', endTime: '10:00' }),
            expect.objectContaining({ title: 'Turniej rezerw', type: 'match', startTime: '15:00', cancelled: false }),
          ],
        },
        {
          date: '2026-11-22',
          parts: [
            expect.objectContaining({
              title: 'Turniej Żaków',
              cancelled: true,
              ourTeam: { club: true },
              visitingTeams: [
                { name: 'Wisła Brzezie', clubName: 'LKS Wisła' },
                { name: 'UKS Sąsiedni', clubName: null },
              ],
            }),
          ],
        },
        {
          date: '2026-11-28',
          parts: [
            expect.objectContaining({
              title: 'Turniej seniorów',
              category: 'Open',
              startTime: '10:00',
              endTime: '18:00',
              cancelled: true,
              ourTeam: null,
            }),
          ],
        },
      ],
    })
  })

  it('marks a cancelled event and has no place, poster or map link without them', () => {
    const view = publicClubEventView(
      input({
        event: { name: 'Cup', slug: 'cup', status: 'cancelled', description: null },
        place: null,
        parts: [
          {
            title: 'Open',
            categoryLabel: null,
            type: 'other',
            activityId: null,
            startsAt: at('2026-11-28', '10:00'),
            endsAt: at('2026-11-28', '12:00'),
            status: 'planned',
            visitingTeamIds: [],
          },
        ],
      }),
    )
    expect(view).toMatchObject({ status: 'cancelled', place: null, posterFileId: null, funders: [], description: null })
    expect(view?.days[0]?.parts[0]).toMatchObject({ cancelled: false, ourTeam: null })
  })
})
