import { describe, expect, it } from '@jest/globals'
import {
  aboveLevel,
  allRaterKeys,
  averageRating,
  bayesianScore,
  buildCredit,
  clubPartsOf,
  compareEntries,
  configuredLibraryIds,
  currentRaterKey,
  hiddenByReports,
  librarySearchSchema,
  librarySnapshot,
  likePattern,
  meanRating,
  originOf,
  parseRaterSecrets,
  partsWithExercises,
  publicReporterKey,
  raterKey,
  readCredit,
  readLevel,
  readLibraryConfig,
  readLibraryParts,
  readOrigin,
  visibilityAllowed,
  withoutAuthorName,
} from '../library'
import type { OutlineContent, OutlineExercise } from '../outline'

const SECRET = 'a'.repeat(32)
const SECRET2 = 'b'.repeat(40)
const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const PERSON = '33333333-3333-4333-8333-333333333333'

describe('visibility', () => {
  it('admits a publication up to the club level only', () => {
    expect(visibilityAllowed('clubs', 'clubs')).toBe(true)
    expect(visibilityAllowed('public', 'clubs')).toBe(false)
    expect(visibilityAllowed('clubs', 'club')).toBe(false)
    expect(visibilityAllowed('public', 'public')).toBe(true)
  })

  it('names entries above a lowered level and ignores unknown values', () => {
    expect(aboveLevel('public', 'clubs')).toBe(true)
    expect(aboveLevel('clubs', 'clubs')).toBe(false)
    expect(aboveLevel('clubs', 'club')).toBe(true)
    expect(aboveLevel('club', 'club')).toBe(false)
  })

  it('reads a stored level defensively', () => {
    expect(readLevel('public')).toBe('public')
    expect(readLevel('everyone')).toBe('clubs')
    expect(readLevel(null)).toBe('clubs')
  })
})

describe('configuration', () => {
  it('parses one secret or versioned secrets, newest first', () => {
    expect(parseRaterSecrets(` ${SECRET} `)).toEqual([{ version: 1, secret: SECRET }])
    expect(parseRaterSecrets(`v1:${SECRET}, v2:${SECRET2}`)).toEqual([
      { version: 2, secret: SECRET2 },
      { version: 1, secret: SECRET },
    ])
  })

  it('refuses a missing, short, malformed or repeated secret', () => {
    expect(parseRaterSecrets(undefined)).toBeNull()
    expect(parseRaterSecrets('  ')).toBeNull()
    expect(parseRaterSecrets('short')).toBeNull()
    expect(parseRaterSecrets(`v1:${SECRET},${SECRET2}`)).toBeNull()
    expect(parseRaterSecrets(`v0:${SECRET}`)).toBeNull()
    expect(parseRaterSecrets(`v1:${SECRET},v1:${SECRET2}`)).toBeNull()
  })

  it('reads the library configuration only when all three values are valid', () => {
    const env = {
      VEREINO_LIBRARY_TENANT_ID: TENANT.toUpperCase(),
      VEREINO_LIBRARY_ORGANIZATION_ID: ` ${ORG} `,
      VEREINO_LIBRARY_RATER_SECRET: SECRET,
    }
    expect(readLibraryConfig(env)).toEqual({
      tenantId: TENANT,
      organizationId: ORG,
      raterSecrets: [{ version: 1, secret: SECRET }],
    })
    expect(readLibraryConfig({ ...env, VEREINO_LIBRARY_TENANT_ID: 'nope' })).toBeNull()
    expect(readLibraryConfig({ ...env, VEREINO_LIBRARY_ORGANIZATION_ID: undefined })).toBeNull()
    expect(readLibraryConfig({ ...env, VEREINO_LIBRARY_RATER_SECRET: undefined })).toBeNull()
    expect(readLibraryConfig({})).toBeNull()
  })

  it('reads the configured ids alone for library-init', () => {
    expect(configuredLibraryIds({ VEREINO_LIBRARY_TENANT_ID: TENANT, VEREINO_LIBRARY_ORGANIZATION_ID: 'x' })).toEqual({
      tenantId: TENANT,
      organizationId: null,
    })
    expect(configuredLibraryIds({})).toEqual({ tenantId: null, organizationId: null })
  })
})

describe('rater keys', () => {
  const config = {
    raterSecrets: [
      { version: 2, secret: SECRET2 },
      { version: 1, secret: SECRET },
    ],
  }

  it('is stable, case-insensitive in its ids and differs per club, person and secret', () => {
    const key = raterKey({ version: 1, secret: SECRET }, ORG, PERSON)
    expect(key.version).toBe(1)
    expect(key.key).toMatch(/^[0-9a-f]{64}$/)
    expect(raterKey({ version: 1, secret: SECRET }, ORG.toUpperCase(), PERSON).key).toBe(key.key)
    expect(raterKey({ version: 1, secret: SECRET }, TENANT, PERSON).key).not.toBe(key.key)
    expect(raterKey({ version: 1, secret: SECRET2 }, ORG, PERSON).key).not.toBe(key.key)
  })

  it('keys new rows with the newest secret and matches every version', () => {
    expect(currentRaterKey(config, ORG, PERSON)).toEqual(raterKey(config.raterSecrets[0], ORG, PERSON))
    expect(allRaterKeys(config, ORG, PERSON)).toEqual([
      raterKey(config.raterSecrets[0], ORG, PERSON).key,
      raterKey(config.raterSecrets[1], ORG, PERSON).key,
    ])
  })

  it('hashes a public reporter address', () => {
    const one = publicReporterKey(config, ' 10.0.0.1 ')
    expect(one).toEqual(publicReporterKey(config, '10.0.0.1'))
    expect(one.version).toBe(2)
    expect(one.key).not.toContain('10.0.0.1')
  })
})

describe('ranking', () => {
  it('computes the mean, the Bayesian score and the shown average', () => {
    expect(meanRating({ ratingSum: 0, ratingCount: 0 })).toBe(0)
    expect(meanRating({ ratingSum: 9, ratingCount: 2 })).toBe(4.5)
    expect(bayesianScore({ ratingSum: 5, ratingCount: 1 }, 4)).toBeCloseTo(25 / 6)
    expect(averageRating({ ratingSum: 0, ratingCount: 0 })).toBeNull()
    expect(averageRating({ ratingSum: 14, ratingCount: 3 })).toBe(4.7)
  })

  const at = (day: number) => new Date(Date.UTC(2026, 10, day))
  const one = { id: 'a', ratingSum: 5, ratingCount: 1, userCount: 1, publishedAt: at(1) }
  const forty = { id: 'b', ratingSum: 184, ratingCount: 40, userCount: 40, publishedAt: at(2) }
  const unrated = { id: 'c', ratingSum: 0, ratingCount: 0, userCount: 3, publishedAt: at(3) }
  const twin = { id: 'd', ratingSum: 0, ratingCount: 0, userCount: 3, publishedAt: at(3) }
  const lonely = { id: 'e', ratingSum: 0, ratingCount: 0, userCount: 0, publishedAt: at(3) }

  it('ranks forty 4.6s above one 5, ties by users, then newest, then id', () => {
    // Over the whole library the mean is 4.0.
    expect([one, forty].sort(compareEntries('ranking', 4)).map((entry) => entry.id)).toEqual(['b', 'a'])
    expect([lonely, twin, unrated].sort(compareEntries('ranking', 0)).map((entry) => entry.id)).toEqual(['c', 'd', 'e'])
    expect([one, unrated].sort(compareEntries('ranking', 0)).map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('sorts by use and by publication date', () => {
    expect([one, forty, unrated].sort(compareEntries('used', 0)).map((entry) => entry.id)).toEqual(['b', 'c', 'a'])
    expect([forty, one, unrated].sort(compareEntries('newest', 0)).map((entry) => entry.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('credit', () => {
  const credit = buildCredit({ clubName: 'KS Orły', authorName: 'Jan K.', origin: null })

  it('reads a stored credit and origin defensively', () => {
    expect(readCredit(credit)).toEqual(credit)
    expect(readCredit({ clubName: 'X', authorName: 7, adaptedFrom: 'bad' })).toEqual({
      clubName: 'X',
      authorName: null,
      adaptedFrom: null,
    })
    expect(
      readCredit({ clubName: 'X', authorName: null, adaptedFrom: { entryId: 3, clubName: 'Y', authorName: 1 } }),
    ).toEqual({ clubName: 'X', authorName: null, adaptedFrom: { entryId: null, clubName: 'Y', authorName: null } })
    expect(readCredit(null)).toBeNull()
    expect(readOrigin({ entryId: 'e1', clubName: 'Y', authorName: 'A B.' })).toEqual({
      entryId: 'e1',
      clubName: 'Y',
      authorName: 'A B.',
    })
    expect(readOrigin({ clubName: 'Y' })).toEqual({ entryId: null, clubName: 'Y', authorName: null })
    expect(readOrigin('nope')).toBeNull()
  })

  it('keeps the first author through copies of copies', () => {
    const origin = originOf('e1', credit)
    expect(origin).toEqual({ entryId: 'e1', clubName: 'KS Orły', authorName: 'Jan K.' })
    const copy = buildCredit({ clubName: 'MKS Sokół', authorName: null, origin })
    expect(originOf('e2', copy)).toEqual(origin)
  })

  it('strips the own name and, when named, the origin’s', () => {
    const copy = buildCredit({
      clubName: 'MKS Sokół',
      authorName: 'Ola N.',
      origin: { entryId: 'e1', clubName: 'KS Orły', authorName: 'Jan K.' },
    })
    expect(withoutAuthorName(copy, { own: true })).toEqual({ ...copy, authorName: null })
    expect(withoutAuthorName(copy, { own: false, adaptedFromEntryIds: new Set(['e1']) })).toEqual({
      ...copy,
      adaptedFrom: { entryId: 'e1', clubName: 'KS Orły', authorName: null },
    })
    expect(withoutAuthorName(copy, { own: false, adaptedFromEntryIds: new Set(['e9']) })).toEqual(copy)
    expect(withoutAuthorName(credit, { own: false, adaptedFromEntryIds: new Set(['e1']) })).toEqual(credit)
  })
})

const exercise = (name: string, image: string | null): OutlineExercise => ({
  name,
  minutes: 10,
  organisation: 'Pole',
  coachingPoints: 'Głowa w górze',
  image: image ? { attachmentId: image, ownerOutlineId: 'owner' } : null,
})

const content: OutlineContent = {
  language: 'pl',
  topic: 'Gra 1×1',
  goal: 'Cel',
  specificGoals: '',
  ageCategory: 'U11',
  durationMinutes: 75,
  equipment: 'Piłki',
  parts: {
    warm_up: [exercise('Rondo', 'img-1')],
    main: [exercise('Gra', 'img-2'), exercise('Gra bez obrazka', null), exercise('Obcy obrazek', 'img-x')],
    cool_down: [],
  },
}

describe('snapshot', () => {
  it('copies only the content and replaces images by their position', () => {
    const images = [
      { attachmentId: 'img-1', ownerOutlineId: 'owner' },
      { attachmentId: 'img-2', ownerOutlineId: 'owner' },
    ]
    const snapshot = librarySnapshot(content, images)
    expect(snapshot.playersCount).toBeNull()
    expect(snapshot.parts.warm_up[0].image).toBe(0)
    expect(snapshot.parts.main.map((item) => item.image)).toEqual([1, null, null])
    expect(JSON.stringify(snapshot)).not.toContain('owner')
    expect(librarySnapshot({ ...content, playersCount: 12 }, []).playersCount).toBe(12)
    expect(partsWithExercises(snapshot.parts)).toEqual(['warm_up', 'main'])
  })

  it('reads stored parts defensively and makes club parts of them', () => {
    const snapshot = librarySnapshot(content, [{ attachmentId: 'img-1', ownerOutlineId: 'owner' }])
    expect(readLibraryParts(snapshot.parts)).toEqual(snapshot.parts)
    expect(readLibraryParts({ warm_up: 'x' })).toEqual({ warm_up: [], main: [], cool_down: [] })
    const parts = clubPartsOf(snapshot.parts, (index) =>
      index === 0 ? { attachmentId: 'copy-1', ownerOutlineId: 'new' } : null,
    )
    expect(parts.warm_up[0].image).toEqual({ attachmentId: 'copy-1', ownerOutlineId: 'new' })
    expect(parts.main.map((item) => item.image)).toEqual([null, null, null])
  })
})

describe('reports and search', () => {
  it('hides a listed entry at three clubs only', () => {
    expect(hiddenByReports('listed', 2)).toBe(false)
    expect(hiddenByReports('listed', 3)).toBe(true)
    expect(hiddenByReports('removed', 5)).toBe(false)
  })

  it('escapes a search text and parses the query', () => {
    expect(likePattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%')
    expect(librarySearchSchema.parse({})).toEqual({ page: 1, pageSize: 20, sort: 'ranking' })
    expect(librarySearchSchema.parse({ page: '2', part: 'main', sort: 'used', q: ' rondo ' })).toMatchObject({
      page: 2,
      part: 'main',
      sort: 'used',
      q: 'rondo',
    })
  })
})
