// ENT-TEST-01, server part (enterprise package spec DD-E04, DD-E05, DD-E11; #649): the Ed25519 check with the committed
// test key pair, the test-kid rule (trusted only with VEREINO_CI=true, always with a warning), reading the installed
// keys, the instance binding, the boot line and the `licence-status` report — none of which ever holds a key.
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { describe, expect, it } from '@jest/globals'
import { LICENCE_KEY_PREFIX, encodeBase64Url } from '@vereino/core'
import TEST_PAIR from '../../../../../.ai/qa/fixtures/licence-test-key-pair.json'
import { LICENCE_PUBLIC_KEYS, TEST_LICENCE_KID_PREFIX } from '../licence-public-keys'
import {
  CI_TRUST_FILE,
  LICENCE_ENV,
  NO_LICENCE_KEYS_MESSAGE,
  buildLicenceRegistry,
  isTestKid,
  licenceBootLine,
  licenceStatusReport,
  readCiTrust,
  readLicenceKeys,
  signatureVerifier,
  trustedLicenceKeys,
} from '../licence-verify'

const TEST_KEYS = { [TEST_PAIR.kid]: TEST_PAIR.publicKeyPem }
const PRODUCTION = generateKeyPairSync('ed25519')
const PRODUCTION_KEYS = { 'prod-1': PRODUCTION.publicKey.export({ type: 'spki', format: 'pem' }) }

const TENANT_A = '3f0c1f9e-6a43-4f0f-9a5b-2a7d3c1b0e11'
const INSTANCE = 'cloud-eu-1'
const CI_ENV = { [LICENCE_ENV.ci]: 'true', [LICENCE_ENV.instance]: INSTANCE }

function signKey(payload: Record<string, unknown>, privateKey: string | KeyObject): string {
  const payloadPart = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = sign(null, Buffer.from(`${LICENCE_KEY_PREFIX}${payloadPart}`, 'ascii'), privateKey)
  return `${LICENCE_KEY_PREFIX}${payloadPart}.${encodeBase64Url(signature)}`
}

const payload = (change: Record<string, unknown> = {}) => ({
  v: 1,
  kid: TEST_PAIR.kid,
  lid: 'lic-test-1',
  instance: INSTANCE,
  tenantId: TENANT_A,
  features: ['enterprise_demo'],
  issuedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2027-01-01T00:00:00Z',
  graceDays: 14,
  ...change,
})

const noFile = (): string => {
  throw new Error('no file')
}

describe('the compiled key list', () => {
  it('holds no test kid, and the committed fixture is a test kid', () => {
    expect(Object.keys(LICENCE_PUBLIC_KEYS).some(isTestKid)).toBe(false)
    expect(TEST_PAIR.kid.startsWith(TEST_LICENCE_KID_PREFIX)).toBe(true)
    expect(isTestKid('2026-1')).toBe(false)
  })
})

describe('trustedLicenceKeys', () => {
  it('trusts production keys and refuses a test kid in the production list', () => {
    expect([...trustedLicenceKeys(PRODUCTION_KEYS, {}, {}).keys.keys()]).toEqual(['prod-1'])
    expect(() => trustedLicenceKeys(TEST_KEYS, {}, {})).toThrow(/production key list/)
  })

  it('trusts an extra test kid only with VEREINO_CI=true, and warns when it does', () => {
    const refused = trustedLicenceKeys({}, TEST_KEYS, { [LICENCE_ENV.ci]: '1' })
    expect(refused.keys.size).toBe(0)
    expect(refused.warnings).toEqual([`refused test licence kid ${TEST_PAIR.kid}: VEREINO_CI is not true`])
    const trusted = trustedLicenceKeys({}, TEST_KEYS, CI_ENV)
    expect([...trusted.keys.keys()]).toEqual([TEST_PAIR.kid])
    expect(trusted.warnings[0]).toMatch(/^trusting TEST licence kid/)
  })

  it('never trusts an extra kid that is not a test kid', () => {
    const result = trustedLicenceKeys({}, PRODUCTION_KEYS, CI_ENV)
    expect(result.keys.size).toBe(0)
    expect(result.warnings[0]).toMatch(/only test kids/)
  })
})

describe('signatureVerifier', () => {
  const verifySignature = signatureVerifier(trustedLicenceKeys({}, TEST_KEYS, CI_ENV).keys)
  const message = `${LICENCE_KEY_PREFIX}abc`
  const signature = sign(null, Buffer.from(message, 'ascii'), TEST_PAIR.privateKeyPem)

  it('answers valid, invalid and unknown_kid', () => {
    expect(verifySignature(message, signature, TEST_PAIR.kid)).toBe('valid')
    expect(verifySignature(`${message}d`, signature, TEST_PAIR.kid)).toBe('invalid')
    expect(verifySignature(message, signature, 'other')).toBe('unknown_kid')
  })

  it('answers invalid for a signature of the wrong length instead of throwing', () => {
    expect(verifySignature(message, new Uint8Array(3), TEST_PAIR.kid)).toBe('invalid')
  })
})

describe('readLicenceKeys', () => {
  it('splits the variable and the file on newlines, spaces and commas, without duplicates', () => {
    const files: Record<string, string> = { '/run/keys': 'k2\nk3,\n\n' }
    expect(
      readLicenceKeys(
        { [LICENCE_ENV.keys]: ' k1, k2\n', [LICENCE_ENV.keysFile]: ' /run/keys ' },
        (file) => files[file] ?? '',
      ),
    ).toEqual({ keys: ['k1', 'k2', 'k3'], warnings: [] })
  })

  it('installs nothing from an unreadable file and says so', () => {
    expect(readLicenceKeys({ [LICENCE_ENV.keysFile]: '/missing' }, noFile)).toEqual({
      keys: [],
      warnings: ['cannot read VEREINO_LICENCE_KEYS_FILE; its licence keys are not installed'],
    })
    expect(readLicenceKeys({}, noFile)).toEqual({ keys: [], warnings: [] })
  })
})

describe('readCiTrust', () => {
  const absent = () => false
  const present = () => true
  const reads = (text: string) => () => text

  it('trusts nothing without the file', () => {
    expect(readCiTrust(CI_TRUST_FILE, absent, reads('{}'))).toEqual({ extra: {}, warnings: [] })
  })

  it('returns the kid → public key object the overlay script writes', () => {
    const text = JSON.stringify(TEST_KEYS)
    expect(readCiTrust(CI_TRUST_FILE, present, reads(text))).toEqual({ extra: TEST_KEYS, warnings: [] })
  })

  it('ignores a malformed, non-object or non-string file with a warning', () => {
    const unreadable = () => {
      throw new Error('EACCES')
    }
    for (const read of [reads('not json'), reads('[]'), reads('null'), reads('{"test-x": 1}'), unreadable]) {
      const result = readCiTrust(CI_TRUST_FILE, present, read)
      expect(result.extra).toEqual({})
      expect(result.warnings).toEqual([`ignored ${CI_TRUST_FILE}: it is not a JSON object of kid to public key`])
    }
  })
})

describe('buildLicenceRegistry', () => {
  const valid = signKey(payload(), TEST_PAIR.privateKeyPem)
  const otherInstance = signKey(payload({ lid: 'lic-test-2', instance: 'dedicated-1' }), TEST_PAIR.privateKeyPem)
  const production = signKey(payload({ kid: 'prod-1', lid: 'lic-prod-1' }), PRODUCTION.privateKey)

  it('accepts keys for this instance and rejects the rest by lid or position', () => {
    const registry = buildLicenceRegistry({
      env: { ...CI_ENV, [LICENCE_ENV.keys]: [valid, otherInstance, 'garbage'].join('\n') },
      readFile: noFile,
      production: {},
      extra: TEST_KEYS,
    })
    expect(registry.instance).toBe(INSTANCE)
    expect(registry.licences.map((licence) => licence.lid)).toEqual(['lic-test-1'])
    expect(registry.rejected).toEqual([
      { reason: 'wrong_instance', lid: 'lic-test-2', position: 2 },
      { reason: 'wrong_prefix', lid: null, position: 3 },
    ])
    expect(registry.installed).toBe(3)
    expect(registry.trustedKids).toEqual([TEST_PAIR.kid])
  })

  it('rejects a test-signed key outside CI as unknown_kid (the production build)', () => {
    const registry = buildLicenceRegistry({
      env: { [LICENCE_ENV.instance]: INSTANCE, [LICENCE_ENV.keys]: valid },
      readFile: noFile,
    })
    expect(registry.licences).toEqual([])
    expect(registry.rejected).toEqual([{ reason: 'unknown_kid', lid: 'lic-test-1', position: 1 }])
    expect(registry.trustedKids).toEqual(Object.keys(LICENCE_PUBLIC_KEYS))
  })

  it('verifies production keys and warns when keys are installed but the instance has no id', () => {
    const registry = buildLicenceRegistry({
      env: { [LICENCE_ENV.keys]: production, [LICENCE_ENV.instance]: '  ' },
      readFile: noFile,
      production: PRODUCTION_KEYS,
    })
    expect(registry.instance).toBeNull()
    expect(registry.rejected).toEqual([{ reason: 'wrong_instance', lid: 'lic-prod-1', position: 1 }])
    expect(registry.warnings).toEqual(['VEREINO_INSTANCE_ID is not set: no licence key applies on this instance'])
  })

  it('is empty without keys', () => {
    const registry = buildLicenceRegistry({ env: {}, readFile: noFile })
    expect(registry).toMatchObject({ instance: null, licences: [], rejected: [], installed: 0, warnings: [] })
  })
})

describe('licenceBootLine and licenceStatusReport', () => {
  const expired = signKey(
    payload({
      lid: 'lic-test-old',
      features: ['enterprise_demo', 'municipality_view'],
      expiresAt: '2026-06-01T00:00:00Z',
    }),
    TEST_PAIR.privateKeyPem,
  )
  const current = signKey(payload(), TEST_PAIR.privateKeyPem)
  const registry = buildLicenceRegistry({
    env: { ...CI_ENV, [LICENCE_ENV.keys]: [current, expired, `${LICENCE_KEY_PREFIX}x.y`].join(',') },
    readFile: noFile,
    production: {},
    extra: TEST_KEYS,
  })

  it('logs counts and lids, never a key', () => {
    const line = licenceBootLine(registry)
    expect(line).toBe('[foundation] licence keys: 2 valid of 3 installed; rejected: #3 (malformed)')
    expect(line).not.toContain(LICENCE_KEY_PREFIX)
    expect(licenceBootLine(buildLicenceRegistry({ env: {}, readFile: noFile }))).toBe(
      '[foundation] licence keys: 0 valid of 0 installed',
    )
  })

  it('reports each key with its features, state and expiry', () => {
    const report = licenceStatusReport(registry, new Date('2026-06-10T00:00:00Z'))
    expect(report.message).toBeUndefined()
    expect(report.keys).toEqual([
      {
        lid: 'lic-test-1',
        tenantId: TENANT_A,
        issuedAt: '2026-01-01T00:00:00Z',
        expiresAt: '2027-01-01T00:00:00Z',
        graceEndsAt: '2027-01-15T00:00:00.000Z',
        features: [{ id: 'enterprise_demo', state: 'on', renewalNotice: false }],
      },
      {
        lid: 'lic-test-old',
        tenantId: TENANT_A,
        issuedAt: '2026-01-01T00:00:00Z',
        expiresAt: '2026-06-01T00:00:00Z',
        graceEndsAt: '2026-06-15T00:00:00.000Z',
        features: [
          { id: 'enterprise_demo', state: 'on', renewalNotice: true },
          { id: 'municipality_view', state: 'on', renewalNotice: true },
        ],
      },
    ])
    expect(JSON.stringify(report)).not.toContain(LICENCE_KEY_PREFIX)
    expect(licenceStatusReport(registry, new Date('2026-07-01T00:00:00Z')).keys[1]?.features[0]?.state).toBe(
      'read_only',
    )
  })

  it('says so when no key is installed', () => {
    expect(licenceStatusReport(buildLicenceRegistry({ env: {}, readFile: noFile }), new Date())).toEqual({
      instance: null,
      message: NO_LICENCE_KEYS_MESSAGE,
      keys: [],
      rejected: [],
      warnings: [],
    })
  })
})
