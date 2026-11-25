// Vereino Enterprise licence keys (enterprise package spec DD-E04, REQ-E03; #649). A key is
// `vereino-lic.v1.<payload>.<signature>`, both parts base64url: the payload is the JSON of a `Licence`, the signature
// is Ed25519 over the ASCII bytes of `vereino-lic.v1.<payload>`. This file only parses and validates; the signature
// check is a callback (`verifySignature`) because `node:crypto` must stay out of `@vereino/core`, which client
// components bundle through `@vereino/ui`. The server-side verifier lives in `foundation/lib/licence-verify.ts`.

/** The versioned prefix of every key; a new format gets `v2`, `v1` keys stay valid until they expire. */
export const LICENCE_KEY_PREFIX = 'vereino-lic.v1.'

/** The validated payload of a licence key. `tenantId` is lower-case; `features` hold no duplicates. */
export type Licence = {
  v: 1
  /** The signing key's id; selects the public key. */
  kid: string
  /** The licence id: the only value of a key that logs and the status command may print. */
  lid: string
  /** The deployment the key is bound to (`VEREINO_INSTANCE_ID`). */
  instance: string
  tenantId: string
  /** Feature ids, each equal to the id of an Enterprise module. */
  features: string[]
  issuedAt: string
  expiresAt: string
  /** Days of full use after `expiresAt` before the features become read-only (DD-E07). */
  graceDays: number
}

/** The answer of the signature callback: `unknown_kid` when no trusted public key has that id. */
export type SignatureCheck = 'valid' | 'invalid' | 'unknown_kid'

export type VerifySignature = (message: string, signature: Uint8Array, kid: string) => SignatureCheck

export type LicenceRejection = 'wrong_prefix' | 'malformed' | 'invalid_payload' | 'unknown_kid' | 'bad_signature'

/** `lid` is set on a rejection only when the payload was readable and its `lid` is a safe identifier. */
export type ParsedLicenceKey = { ok: true; licence: Licence } | { ok: false; reason: LicenceRejection; lid?: string }

/** The longest grace period a key may grant. */
export const MAX_LICENCE_GRACE_DAYS = 365

const BASE64URL = /^[A-Za-z0-9_-]+$/
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/
const INSTANCE_ID = /^[A-Za-z0-9._:-]{1,128}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FEATURE_ID = /^[a-z][a-z0-9_]{0,63}$/
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/

/** Decodes unpadded base64url; null for any other alphabet or an impossible length. */
export function decodeBase64Url(text: string): Uint8Array | null {
  if (!BASE64URL.test(text) || text.length % 4 === 1) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

/** Encodes bytes as unpadded base64url (the signing script and the tests build keys with it). */
export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function readJson(part: string): unknown {
  const bytes = decodeBase64Url(part)
  if (!bytes) return undefined
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeId(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : undefined
}

function instant(value: unknown): number | null {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/** The validated licence, or null when any field is missing or out of shape. */
export function licenceFromPayload(payload: Record<string, unknown>): Licence | null {
  const { v, kid, lid, instance, tenantId, features, issuedAt, expiresAt, graceDays } = payload
  if (v !== 1 || !safeId(kid) || !safeId(lid)) return null
  if (typeof instance !== 'string' || !INSTANCE_ID.test(instance)) return null
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) return null
  if (!Array.isArray(features) || features.length === 0) return null
  if (!features.every((feature): feature is string => typeof feature === 'string' && FEATURE_ID.test(feature)))
    return null
  const issued = instant(issuedAt)
  const expires = instant(expiresAt)
  if (issued === null || expires === null || expires <= issued) return null
  if (!Number.isInteger(graceDays) || (graceDays as number) < 0 || (graceDays as number) > MAX_LICENCE_GRACE_DAYS)
    return null
  return {
    v: 1,
    kid: kid as string,
    lid: lid as string,
    instance,
    tenantId: tenantId.toLowerCase(),
    features: [...new Set(features)],
    issuedAt: issuedAt as string,
    expiresAt: expiresAt as string,
    graceDays: graceDays as number,
  }
}

/**
 * Parses and verifies one key. The signature is checked before the payload's shape, so a tampered payload is always
 * `bad_signature`; a payload without a readable `kid` cannot be checked and is `invalid_payload`.
 */
export function parseLicenceKey(key: string, verifySignature: VerifySignature): ParsedLicenceKey {
  const text = key.trim()
  if (!text.startsWith(LICENCE_KEY_PREFIX)) return { ok: false, reason: 'wrong_prefix' }
  const parts = text.slice(LICENCE_KEY_PREFIX.length).split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [payloadPart, signaturePart] = parts as [string, string]
  const payload = readJson(payloadPart)
  const signature = decodeBase64Url(signaturePart)
  if (!isRecord(payload) || !signature) return { ok: false, reason: 'malformed' }
  const lid = safeId(payload.lid)
  const withLid = lid ? { lid } : {}
  const kid = safeId(payload.kid)
  if (!kid) return { ok: false, reason: 'invalid_payload', ...withLid }
  const check = verifySignature(`${LICENCE_KEY_PREFIX}${payloadPart}`, signature, kid)
  if (check === 'unknown_kid') return { ok: false, reason: 'unknown_kid', ...withLid }
  if (check !== 'valid') return { ok: false, reason: 'bad_signature', ...withLid }
  const licence = licenceFromPayload(payload)
  if (!licence) return { ok: false, reason: 'invalid_payload', ...withLid }
  return { ok: true, licence }
}
