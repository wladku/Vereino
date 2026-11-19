import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_ONLINE_METHODS,
  ONLINE_CONNECTIONS,
  ONLINE_METHODS,
  offeredOnlineMethods,
  onlineConnectionOf,
  onlineMethodsInvalid,
} from '../online-payment'

describe('online payment vocabularies', () => {
  it('lists the methods and connection states', () => {
    expect(ONLINE_METHODS).toEqual(['card', 'blik', 'p24'])
    expect(DEFAULT_ONLINE_METHODS).toEqual(['card'])
    expect(ONLINE_CONNECTIONS).toEqual(['connected_test', 'connected_live', 'not_connected', 'unknown'])
  })
})

describe('onlineMethodsInvalid', () => {
  it('accepts a non-empty subset without repeats', () => {
    expect(onlineMethodsInvalid(['card'])).toBe(false)
    expect(onlineMethodsInvalid(['blik', 'card', 'p24'])).toBe(false)
  })

  it('refuses an empty selection, an unknown value and a repeat', () => {
    expect(onlineMethodsInvalid([])).toBe(true)
    expect(onlineMethodsInvalid(['card', 'paypal'])).toBe(true)
    expect(onlineMethodsInvalid([1])).toBe(true)
    expect(onlineMethodsInvalid(['card', 'card'])).toBe(true)
  })
})

describe('offeredOnlineMethods', () => {
  it('keeps the known stored methods in display order', () => {
    expect(offeredOnlineMethods(['p24', 'card', 'blik'])).toEqual(['card', 'blik', 'p24'])
    expect(offeredOnlineMethods(['blik', 'paypal'])).toEqual(['blik'])
  })

  it('falls back to the default when nothing known is stored', () => {
    expect(offeredOnlineMethods(null)).toEqual(['card'])
    expect(offeredOnlineMethods(undefined)).toEqual(['card'])
    expect(offeredOnlineMethods([])).toEqual(['card'])
    expect(offeredOnlineMethods(['paypal'])).toEqual(['card'])
  })
})

describe('onlineConnectionOf', () => {
  it('reads the mode from the publishable key prefix of an enabled integration', () => {
    expect(onlineConnectionOf({ enabled: true, credentials: { publishableKey: 'pk_test_abc' } })).toBe('connected_test')
    expect(onlineConnectionOf({ enabled: true, credentials: { publishableKey: 'pk_live_abc' } })).toBe('connected_live')
  })

  it('is not connected when disabled, without credentials or with an unknown key', () => {
    expect(onlineConnectionOf({ enabled: false, credentials: { publishableKey: 'pk_live_abc' } })).toBe('not_connected')
    expect(onlineConnectionOf({ enabled: true, credentials: null })).toBe('not_connected')
    expect(onlineConnectionOf({ enabled: true, credentials: { publishableKey: 42 } })).toBe('not_connected')
    expect(onlineConnectionOf({ enabled: true, credentials: { publishableKey: 'sk_live_abc' } })).toBe('not_connected')
  })
})
