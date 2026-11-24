import { describe, expect, it } from '@jest/globals'
import { CLUB_DOMAIN_ENV } from '@vereino/core'
import {
  CLUB_NAME_MAX_LENGTH,
  RESERVED_CLUB_SLUGS,
  clubAddress,
  isReservedClubSlug,
  parseCreateClubOptions,
} from '../club-onboarding'

const VALID = {
  slug: ' Orlik-Zielonka ',
  name: ' UKS Orlik Zielonka ',
  'admin-email': ' Ada@Example.org ',
  'admin-first-name': ' Ada ',
  'admin-last-name': ' Admin ',
}

describe('isReservedClubSlug', () => {
  it('reserves the instance host names and the cell labels c1…c9', () => {
    expect(RESERVED_CLUB_SLUGS).toEqual([
      'www',
      'app',
      'api',
      'admin',
      'mail',
      'status',
      'c1',
      'c2',
      'c3',
      'c4',
      'c5',
      'c6',
      'c7',
      'c8',
      'c9',
    ])
    expect(isReservedClubSlug('admin')).toBe(true)
    expect(isReservedClubSlug('c9')).toBe(true)
  })

  it('leaves every other slug free', () => {
    expect(isReservedClubSlug('orlik-zielonka')).toBe(false)
    expect(isReservedClubSlug('c10')).toBe(false)
  })
})

describe('parseCreateClubOptions', () => {
  it('trims and normalizes valid options and applies the default time zone and locale', () => {
    expect(parseCreateClubOptions(VALID)).toEqual({
      ok: true,
      options: {
        slug: 'orlik-zielonka',
        name: 'UKS Orlik Zielonka',
        adminEmail: 'ada@example.org',
        adminFirstName: 'Ada',
        adminLastName: 'Admin',
        timezone: 'Europe/Warsaw',
        locale: 'pl',
        dryRun: false,
        resume: null,
      },
    })
  })

  it('takes an explicit time zone, locale and dry run', () => {
    const result = parseCreateClubOptions({ ...VALID, timezone: 'Europe/Berlin', locale: 'en', 'dry-run': true })
    expect(result).toMatchObject({ ok: true, options: { timezone: 'Europe/Berlin', locale: 'en', dryRun: true } })
  })

  it('takes the tenant and organization of a club to finish', () => {
    const tenant = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const org = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(parseCreateClubOptions({ ...VALID, tenant: ` ${tenant} `, org })).toMatchObject({
      ok: true,
      options: { resume: { tenantId: tenant, organizationId: org } },
    })
  })

  it('wants the tenant and organization together, as uuids', () => {
    const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e'
    expect(parseCreateClubOptions({ ...VALID, tenant: uuid })).toEqual({
      ok: false,
      problems: [{ option: 'org', problem: 'required' }],
    })
    expect(parseCreateClubOptions({ ...VALID, org: uuid })).toEqual({
      ok: false,
      problems: [{ option: 'tenant', problem: 'required' }],
    })
    expect(parseCreateClubOptions({ ...VALID, tenant: 'nope', org: 'nope' })).toEqual({
      ok: false,
      problems: [
        { option: 'tenant', problem: 'invalid' },
        { option: 'org', problem: 'invalid' },
      ],
    })
  })

  it('reports every missing option at once', () => {
    expect(parseCreateClubOptions({})).toEqual({
      ok: false,
      problems: [
        { option: 'slug', problem: 'required' },
        { option: 'name', problem: 'required' },
        { option: 'admin-email', problem: 'required' },
        { option: 'admin-first-name', problem: 'required' },
        { option: 'admin-last-name', problem: 'required' },
      ],
    })
  })

  it('refuses a malformed slug, a reserved one, a bad e-mail, zone and locale, and over-long values', () => {
    expect(parseCreateClubOptions({ ...VALID, slug: 'ks orzeł' })).toEqual({
      ok: false,
      problems: [{ option: 'slug', problem: 'invalid' }],
    })
    expect(parseCreateClubOptions({ ...VALID, slug: 'Admin' })).toEqual({
      ok: false,
      problems: [{ option: 'slug', problem: 'reserved' }],
    })
    expect(
      parseCreateClubOptions({
        ...VALID,
        name: 'x'.repeat(CLUB_NAME_MAX_LENGTH + 1),
        'admin-email': 'not-an-email',
        'admin-first-name': 'y'.repeat(101),
        timezone: 'Mars/Olympus',
        locale: 'Polish',
      }),
    ).toEqual({
      ok: false,
      problems: [
        { option: 'name', problem: 'too_long' },
        { option: 'admin-email', problem: 'invalid' },
        { option: 'admin-first-name', problem: 'too_long' },
        { option: 'timezone', problem: 'invalid' },
        { option: 'locale', problem: 'invalid' },
      ],
    })
    expect(parseCreateClubOptions({ ...VALID, 'admin-email': `${'a'.repeat(320)}@example.org` })).toEqual({
      ok: false,
      problems: [{ option: 'admin-email', problem: 'invalid' }],
    })
  })
})

describe('clubAddress', () => {
  it('is the subdomain of the club domain when it is configured', () => {
    expect(
      clubAddress('orlik', { [CLUB_DOMAIN_ENV]: ' https://vereino.pl/ ', APP_URL: 'https://app.vereino.pl' }),
    ).toBe('https://orlik.vereino.pl')
  })

  it('is the public page under APP_URL without a club domain', () => {
    expect(clubAddress('orlik', { APP_URL: 'https://app.vereino.pl/' })).toBe('https://app.vereino.pl/p/orlik')
  })

  it('is null when neither is configured', () => {
    expect(clubAddress('orlik', { [CLUB_DOMAIN_ENV]: ' ', APP_URL: '' })).toBeNull()
    expect(clubAddress('orlik', {})).toBeNull()
  })
})
