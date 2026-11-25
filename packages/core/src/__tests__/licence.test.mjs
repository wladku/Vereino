// ENT-TEST-01, core part (enterprise package spec DD-E04, DD-E06, DD-E07; #649): parsing and verifying `vereino-lic.v1`
// keys, and the `on` → `read_only` state of a feature per instance and tenant. Keys are signed here with a throwaway
// Ed25519 pair; the verifier callback stands in for `foundation/lib/licence-verify.ts`.
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, verify } from 'node:crypto'
import { describe, test } from 'node:test'
import {
  LICENCE_KEY_PREFIX,
  decodeBase64Url,
  encodeBase64Url,
  licenceFromPayload,
  parseLicenceKey,
} from '../licence/parse-licence-key.ts'
import { featureState, featureStatus, graceEndOf, licenceApplies } from '../licence/feature-state.ts'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const TENANT_A = '3f0c1f9e-6a43-4f0f-9a5b-2a7d3c1b0e11'
const TENANT_B = '8d2a7c55-1b9e-4c3d-8f60-5e4b3a2c1d22'

const PAYLOAD = {
  v: 1,
  kid: 'k1',
  lid: 'lic-001',
  instance: 'cloud-eu-1',
  tenantId: TENANT_A,
  features: ['enterprise_demo'],
  issuedAt: '2026-01-01T00:00:00Z',
  expiresAt: '2027-01-01T00:00:00Z',
  graceDays: 14,
}

const text = (value) => encodeBase64Url(new TextEncoder().encode(value))

function signKey(payload, payloadPart = text(JSON.stringify(payload))) {
  const signature = sign(null, Buffer.from(`${LICENCE_KEY_PREFIX}${payloadPart}`, 'ascii'), privateKey)
  return `${LICENCE_KEY_PREFIX}${payloadPart}.${encodeBase64Url(signature)}`
}

const verifier = (message, signature, kid) => {
  if (kid !== 'k1') return 'unknown_kid'
  return verify(null, Buffer.from(message, 'ascii'), publicKey, signature) ? 'valid' : 'invalid'
}

describe('base64url', () => {
  test('round-trips bytes without padding', () => {
    for (const length of [1, 2, 3, 4, 31, 64]) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 251) % 256)
      const encoded = encodeBase64Url(bytes)
      assert.doesNotMatch(encoded, /[+/=]/)
      assert.deepEqual(decodeBase64Url(encoded), bytes)
    }
  })

  test('refuses another alphabet and an impossible length', () => {
    assert.equal(decodeBase64Url('ab+c'), null)
    assert.equal(decodeBase64Url('abcde'), null)
    assert.equal(decodeBase64Url(''), null)
  })
})

describe('parseLicenceKey', () => {
  test('accepts a valid key and normalizes the tenant and the features', () => {
    const parsed = parseLicenceKey(
      ` ${signKey({ ...PAYLOAD, tenantId: TENANT_A.toUpperCase(), features: ['enterprise_demo', 'enterprise_demo'], extra: 1 })}\n`,
      verifier,
    )
    assert.deepEqual(parsed, { ok: true, licence: { ...PAYLOAD, features: ['enterprise_demo'] } })
  })

  test('refuses a wrong prefix and a malformed key', () => {
    assert.deepEqual(parseLicenceKey('vereino-lic.v2.a.b', verifier), { ok: false, reason: 'wrong_prefix' })
    assert.deepEqual(parseLicenceKey(`${LICENCE_KEY_PREFIX}abc`, verifier), { ok: false, reason: 'malformed' })
    assert.deepEqual(parseLicenceKey(`${LICENCE_KEY_PREFIX}a.b.c`, verifier), { ok: false, reason: 'malformed' })
    const good = signKey(PAYLOAD)
    const [payloadPart] = good.slice(LICENCE_KEY_PREFIX.length).split('.')
    assert.deepEqual(parseLicenceKey(`${LICENCE_KEY_PREFIX}${payloadPart}.a+b`, verifier), {
      ok: false,
      reason: 'malformed',
    })
    assert.deepEqual(parseLicenceKey(`${LICENCE_KEY_PREFIX}@@@.${good.split('.').at(-1)}`, verifier), {
      ok: false,
      reason: 'malformed',
    })
    for (const body of ['not json', '[1]', 'null']) {
      assert.deepEqual(parseLicenceKey(signKey(null, text(body)), verifier), { ok: false, reason: 'malformed' })
    }
    // Bytes that are not UTF-8.
    const invalidUtf8 = encodeBase64Url(Uint8Array.from([0xff, 0xfe, 0x7b]))
    assert.deepEqual(parseLicenceKey(signKey(null, invalidUtf8), verifier), { ok: false, reason: 'malformed' })
  })

  test('refuses a tampered payload and a tampered signature', () => {
    const good = signKey(PAYLOAD)
    const [, signaturePart] = good.slice(LICENCE_KEY_PREFIX.length).split('.')
    const forged = `${LICENCE_KEY_PREFIX}${text(JSON.stringify({ ...PAYLOAD, tenantId: TENANT_B }))}.${signaturePart}`
    assert.deepEqual(parseLicenceKey(forged, verifier), { ok: false, reason: 'bad_signature', lid: 'lic-001' })
    const flipped = good.slice(0, -2) + (good.at(-2) === 'A' ? 'B' : 'A') + good.at(-1)
    assert.equal(parseLicenceKey(flipped, verifier).reason, 'bad_signature')
  })

  test('refuses an unknown kid and a payload without a readable kid', () => {
    assert.deepEqual(parseLicenceKey(signKey({ ...PAYLOAD, kid: 'k9' }), verifier), {
      ok: false,
      reason: 'unknown_kid',
      lid: 'lic-001',
    })
    assert.deepEqual(parseLicenceKey(signKey({ ...PAYLOAD, kid: 'bad kid' }), verifier), {
      ok: false,
      reason: 'invalid_payload',
      lid: 'lic-001',
    })
    // An unreadable lid is never echoed.
    assert.deepEqual(parseLicenceKey(signKey({ ...PAYLOAD, kid: 1, lid: 'a\nb' }), verifier), {
      ok: false,
      reason: 'invalid_payload',
    })
  })

  test('refuses a signed payload out of shape', () => {
    const cases = [
      { v: 2 },
      { lid: '' },
      { instance: 'cloud eu' },
      { instance: 7 },
      { tenantId: 'not-a-uuid' },
      { tenantId: 7 },
      { features: [] },
      { features: 'enterprise_demo' },
      { features: ['Enterprise-Demo'] },
      { features: [1] },
      { issuedAt: 'yesterday' },
      { issuedAt: 20260101 },
      { expiresAt: '2026-13-45T00:00:00Z' },
      { expiresAt: '2025-12-31T00:00:00Z' },
      { expiresAt: PAYLOAD.issuedAt },
      { graceDays: 1.5 },
      { graceDays: -1 },
      { graceDays: 366 },
    ]
    for (const change of cases) {
      assert.deepEqual(
        parseLicenceKey(signKey({ ...PAYLOAD, ...change }), verifier),
        change.lid === undefined
          ? { ok: false, reason: 'invalid_payload', lid: 'lic-001' }
          : { ok: false, reason: 'invalid_payload' },
        JSON.stringify(change),
      )
    }
  })

  test('accepts date-only instants and offsets', () => {
    const licence = licenceFromPayload({
      ...PAYLOAD,
      issuedAt: '2026-01-01',
      expiresAt: '2026-06-01T12:00:00.000+02:00',
      graceDays: 0,
    })
    assert.equal(licence?.expiresAt, '2026-06-01T12:00:00.000+02:00')
  })
})

describe('featureStatus', () => {
  const licence = { ...PAYLOAD }
  const scopeA = { instance: 'cloud-eu-1', tenantId: TENANT_A }

  test('is on before expiry, on with a notice in the grace period, then read-only for good', () => {
    assert.deepEqual(featureStatus([licence], scopeA, 'enterprise_demo', new Date('2026-06-01T00:00:00Z')), {
      state: 'on',
      lid: 'lic-001',
      expiresAt: PAYLOAD.expiresAt,
      graceEndsAt: '2027-01-15T00:00:00.000Z',
      renewalNotice: false,
    })
    const grace = featureStatus([licence], scopeA, 'enterprise_demo', new Date('2027-01-10T00:00:00Z'))
    assert.equal(grace.state, 'on')
    assert.equal(grace.renewalNotice, true)
    for (const at of ['2027-01-15T00:00:00Z', '2030-01-01T00:00:00Z']) {
      const expired = featureStatus([licence], scopeA, 'enterprise_demo', new Date(at))
      assert.equal(expired.state, 'read_only')
      assert.equal(expired.renewalNotice, false)
    }
    assert.equal(graceEndOf(licence).toISOString(), '2027-01-15T00:00:00.000Z')
  })

  test('is off for another tenant, another instance, another feature, and without scope', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    assert.equal(featureState([licence], { ...scopeA, tenantId: TENANT_B }, 'enterprise_demo', now), 'off')
    assert.equal(featureState([licence], { ...scopeA, instance: 'dedicated-1' }, 'enterprise_demo', now), 'off')
    assert.equal(featureState([licence], scopeA, 'municipality_view', now), 'off')
    assert.equal(featureState([licence], { ...scopeA, instance: undefined }, 'enterprise_demo', now), 'off')
    assert.equal(featureState([licence], { ...scopeA, tenantId: null }, 'enterprise_demo', now), 'off')
    assert.equal(featureState([], scopeA, 'enterprise_demo', now), 'off')
    assert.equal(licenceApplies(licence, { ...scopeA, tenantId: TENANT_A.toUpperCase() }), true)
  })

  test('the key whose grace period ends last wins, in any order', () => {
    const renewal = { ...PAYLOAD, lid: 'lic-002', expiresAt: '2028-01-01T00:00:00Z' }
    const now = new Date('2027-06-01T00:00:00Z')
    assert.equal(featureStatus([licence, renewal], scopeA, 'enterprise_demo', now).lid, 'lic-002')
    assert.equal(featureStatus([renewal, licence], scopeA, 'enterprise_demo', now).lid, 'lic-002')
    assert.equal(featureState([renewal, licence], scopeA, 'enterprise_demo', now), 'on')
  })
})
