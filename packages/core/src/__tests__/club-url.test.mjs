// Many clubs spec phase 3 (DD-M02, REQ-M03; #631): the club address origin from `VEREINO_CLUB_DOMAIN` and the club's
// name as the display name of the instance's sender.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { CLUB_DOMAIN_ENV, clubDomain, clubOrigin, senderAddress, senderWithDisplayName } from '../club-url.ts'

describe('clubDomain', () => {
  test('normalizes the configured domain to host[:port]', () => {
    assert.equal(clubDomain({ [CLUB_DOMAIN_ENV]: ' HTTPS://Vereino.pl/ ' }), 'vereino.pl')
    assert.equal(clubDomain({ [CLUB_DOMAIN_ENV]: 'localhost:3123' }), 'localhost:3123')
  })

  test('is null when unset or blank', () => {
    assert.equal(clubDomain({}), null)
    assert.equal(clubDomain({ [CLUB_DOMAIN_ENV]: '  ' }), null)
  })
})

describe('clubOrigin', () => {
  test('builds the origin from the slug and the domain, with the scheme of APP_URL', () => {
    assert.equal(
      clubOrigin('orlik', { [CLUB_DOMAIN_ENV]: 'vereino.pl', APP_URL: 'https://app.vereino.pl' }),
      'https://orlik.vereino.pl',
    )
    assert.equal(
      clubOrigin('orlik', { [CLUB_DOMAIN_ENV]: 'localhost:3123', APP_URL: 'http://127.0.0.1:3123' }),
      'http://orlik.localhost:3123',
    )
  })

  test('prefers a scheme written in the domain and defaults to https', () => {
    assert.equal(
      clubOrigin('orlik', { [CLUB_DOMAIN_ENV]: 'HTTP://vereino.test', APP_URL: 'https://x' }),
      'http://orlik.vereino.test',
    )
    assert.equal(clubOrigin('orlik', { [CLUB_DOMAIN_ENV]: 'vereino.pl' }), 'https://orlik.vereino.pl')
    assert.equal(
      clubOrigin('orlik', { [CLUB_DOMAIN_ENV]: 'vereino.pl', APP_URL: 'not a url' }),
      'https://orlik.vereino.pl',
    )
  })

  test('is null without a domain or without a slug', () => {
    assert.equal(clubOrigin('orlik', { APP_URL: 'https://app.vereino.pl' }), null)
    assert.equal(clubOrigin(null, { [CLUB_DOMAIN_ENV]: 'vereino.pl' }), null)
    assert.equal(clubOrigin(undefined, { [CLUB_DOMAIN_ENV]: 'vereino.pl' }), null)
    assert.equal(clubOrigin('', { [CLUB_DOMAIN_ENV]: 'vereino.pl' }), null)
  })
})

describe('senderAddress', () => {
  test('takes the address inside angle brackets, or the whole value', () => {
    assert.equal(senderAddress('Vereino QA <no-reply@vereino.test>'), 'no-reply@vereino.test')
    assert.equal(senderAddress(' no-reply@vereino.test '), 'no-reply@vereino.test')
  })

  test('is null for a missing or empty value', () => {
    assert.equal(senderAddress(undefined), null)
    assert.equal(senderAddress(null), null)
    assert.equal(senderAddress('  '), null)
    assert.equal(senderAddress('Name < >'), null)
  })
})

describe('senderWithDisplayName', () => {
  test('puts the quoted display name in front of the configured address', () => {
    assert.equal(
      senderWithDisplayName('KS Orlik via Vereino', 'Vereino <no-reply@vereino.test>'),
      '"KS Orlik via Vereino" <no-reply@vereino.test>',
    )
  })

  test('escapes quotes and backslashes and removes line breaks', () => {
    assert.equal(
      senderWithDisplayName('KS "Orlik"\\\r\nBcc: x@y', 'no-reply@vereino.test'),
      '"KS \\"Orlik\\"\\\\ Bcc: x@y" <no-reply@vereino.test>',
    )
  })

  test('keeps the bare address for an empty name and is null without an address', () => {
    assert.equal(senderWithDisplayName(' \n ', 'no-reply@vereino.test'), 'no-reply@vereino.test')
    assert.equal(senderWithDisplayName('KS Orlik', undefined), null)
  })
})
