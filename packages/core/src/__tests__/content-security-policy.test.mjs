// Engineering standards S8.4 (#498): the style hashes `src/proxy.ts` adds to the platform CSP.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, test } from 'node:test'
import {
  RADIX_SELECT_VIEWPORT_STYLE,
  RADIX_SELECT_VIEWPORT_STYLE_HASH,
  withStyleHashes,
} from '../content-security-policy.ts'

const PRODUCTION =
  "default-src 'self'; script-src 'self' 'nonce-abc'; style-src 'self' 'nonce-abc'; style-src-attr 'unsafe-inline'; connect-src 'self'"

describe('RADIX_SELECT_VIEWPORT_STYLE_HASH', () => {
  test('is the sha256 of the Radix viewport stylesheet', () => {
    const digest = createHash('sha256').update(RADIX_SELECT_VIEWPORT_STYLE, 'utf8').digest('base64')
    assert.equal(RADIX_SELECT_VIEWPORT_STYLE_HASH, `'sha256-${digest}'`)
  })
})

describe('withStyleHashes', () => {
  test('adds the hashes to style-src only, keeping every other directive', () => {
    assert.equal(
      withStyleHashes(PRODUCTION, [RADIX_SELECT_VIEWPORT_STYLE_HASH]),
      `default-src 'self'; script-src 'self' 'nonce-abc'; style-src 'self' 'nonce-abc' ${RADIX_SELECT_VIEWPORT_STYLE_HASH}; style-src-attr 'unsafe-inline'; connect-src 'self'`,
    )
  })

  test('adds a hash once', () => {
    const once = withStyleHashes(PRODUCTION, ["'sha256-x'"])
    assert.equal(withStyleHashes(once, ["'sha256-x'", "'sha256-x'"]), once)
  })

  test("leaves a style-src with 'unsafe-inline' (development) unchanged", () => {
    const development = "default-src 'self'; style-src 'self' 'unsafe-inline'"
    assert.equal(withStyleHashes(development, ["'sha256-x'"]), development)
  })

  test('leaves a policy without style-src unchanged', () => {
    const policy = "default-src 'self'; style-src-attr 'unsafe-inline'"
    assert.equal(withStyleHashes(policy, ["'sha256-x'"]), policy)
  })
})
