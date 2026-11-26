// Facebook's signed values (#567; spec TEST-S03 unit part): the `appsecret_proof` of a Graph call, the `/me` URL and
// the verification of the data-deletion callback's `signed_request`.
import { createHmac } from 'node:crypto'
import { describe, expect, it } from '@jest/globals'
import { appSecretProof, graphMeUrl, signedRequestUserId } from '../facebook'

const SECRET = 'fake-app-secret'

function encode(value: unknown): string {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
}

function signed(payload: unknown, secret = SECRET): string {
  const body = encode(payload)
  return `${createHmac('sha256', secret).update(body).digest('base64url')}.${body}`
}

describe('appSecretProof', () => {
  it('is the hex HMAC-SHA256 of the access token keyed with the app secret', () => {
    expect(appSecretProof('token-1', SECRET)).toBe(createHmac('sha256', SECRET).update('token-1').digest('hex'))
    expect(appSecretProof('token-1', SECRET)).not.toBe(appSecretProof('token-1', 'other'))
  })
})

describe('graphMeUrl', () => {
  it('asks for the id and the e-mail with the proof, keeping the endpoint', () => {
    const url = new URL(graphMeUrl('https://graph.facebook.com/v21.0/me', 'token-1', SECRET))
    expect(`${url.origin}${url.pathname}`).toBe('https://graph.facebook.com/v21.0/me')
    expect(url.searchParams.get('fields')).toBe('id,email')
    expect(url.searchParams.get('appsecret_proof')).toBe(appSecretProof('token-1', SECRET))
    expect(url.searchParams.has('access_token')).toBe(false)
  })
})

describe('signedRequestUserId', () => {
  const payload = { algorithm: 'HMAC-SHA256', user_id: '1029384756', issued_at: 1_700_000_000 }

  it('returns the user id of a request signed with the app secret', () => {
    expect(signedRequestUserId(signed(payload), SECRET)).toBe('1029384756')
    expect(signedRequestUserId(signed({ ...payload, algorithm: 'hmac-sha256' }), SECRET)).toBe('1029384756')
  })

  it('refuses a request signed with another secret or with a changed payload', () => {
    expect(signedRequestUserId(signed(payload, 'other'), SECRET)).toBeNull()
    const [signature] = signed(payload).split('.')
    expect(signedRequestUserId(`${signature}.${encode({ ...payload, user_id: '1' })}`, SECRET)).toBeNull()
    expect(signedRequestUserId(`${encode('short')}.${encode(payload)}`, SECRET)).toBeNull()
  })

  it('refuses anything that is not two non-empty parts', () => {
    expect(signedRequestUserId(undefined, SECRET)).toBeNull()
    expect(signedRequestUserId(null, SECRET)).toBeNull()
    expect(signedRequestUserId('', SECRET)).toBeNull()
    expect(signedRequestUserId('abc', SECRET)).toBeNull()
    expect(signedRequestUserId(`.${encode(payload)}`, SECRET)).toBeNull()
    expect(signedRequestUserId('abc.', SECRET)).toBeNull()
    expect(signedRequestUserId(`${signed(payload)}.extra`, SECRET)).toBeNull()
  })

  it('refuses a correctly signed payload that is not JSON, not an object, of another algorithm or without a usable user id', () => {
    expect(signedRequestUserId(signed('not json'), SECRET)).toBeNull()
    expect(signedRequestUserId(signed('"text"'), SECRET)).toBeNull()
    expect(signedRequestUserId(signed('null'), SECRET)).toBeNull()
    expect(signedRequestUserId(signed({ ...payload, algorithm: 'RS256' }), SECRET)).toBeNull()
    expect(signedRequestUserId(signed({ ...payload, algorithm: undefined }), SECRET)).toBeNull()
    expect(signedRequestUserId(signed({ ...payload, user_id: 1029384756 }), SECRET)).toBeNull()
    expect(signedRequestUserId(signed({ ...payload, user_id: '' }), SECRET)).toBeNull()
    expect(signedRequestUserId(signed({ ...payload, user_id: 'x'.repeat(256) }), SECRET)).toBeNull()
  })
})
