// Facebook's signed values (social sign-in spec phase 2, REQ-S03; #567). Pure, but kept apart from `identity.ts`
// because `node:crypto` must not reach the client bundles that import that file: the `appsecret_proof` of a Graph
// call and the verification of the `signed_request` Facebook posts to the data-deletion callback.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { MAX_SUBJECT_LENGTH } from './identity'

/**
 * Facebook's `appsecret_proof`: HMAC-SHA256 of the access token keyed with the app secret, hex. With "Require App
 * Secret" on in the app's settings, Graph refuses a call without it, so a leaked access token alone is useless.
 */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(accessToken).digest('hex')
}

/** The Graph `/me` request of the user's app-scoped id and e-mail (`fields=id,email`). */
export function graphMeUrl(userInfoUrl: string, accessToken: string, appSecret: string): string {
  const url = new URL(userInfoUrl)
  url.searchParams.set('fields', 'id,email')
  url.searchParams.set('appsecret_proof', appSecretProof(accessToken, appSecret))
  return url.toString()
}

/**
 * The app-scoped user id of a Facebook `signed_request` (the data-deletion callback, REQ-S03), or null when it is
 * malformed or its signature is not HMAC-SHA256 of the encoded payload with the app secret (compared in constant
 * time).
 */
export function signedRequestUserId(signedRequest: unknown, appSecret: string): string | null {
  if (typeof signedRequest !== 'string') return null
  const parts = signedRequest.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const [encodedSignature, encodedPayload] = parts
  const signature = Buffer.from(encodedSignature, 'base64url')
  const expected = createHmac('sha256', appSecret).update(encodedPayload).digest()
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const data = payload as Record<string, unknown>
  if (typeof data.algorithm !== 'string' || data.algorithm.toUpperCase() !== 'HMAC-SHA256') return null
  const userId = data.user_id
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > MAX_SUBJECT_LENGTH) return null
  return userId
}
