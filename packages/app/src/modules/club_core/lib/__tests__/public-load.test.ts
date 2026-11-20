import { describe, expect, it } from '@jest/globals'
import { PREVIEW_TEXT_MAX, previewText, publicLoadOf } from '../public-load'

describe('publicLoadOf', () => {
  it('answers the page of a 200 with a body', () => {
    expect(publicLoadOf<{ a: number }>({ ok: true, status: 200, body: { a: 1 } })).toEqual({
      status: 'ok',
      page: { a: 1 },
    })
  })

  it('answers null for a 200 without a body and for any failure other than 404', () => {
    expect(publicLoadOf({ ok: true, status: 200, body: null })).toBeNull()
    expect(publicLoadOf({ ok: false, status: 429, body: { error: 'Too many' } })).toBeNull()
    expect(publicLoadOf({ ok: false, status: 500, body: null })).toBeNull()
  })

  it('tells a club that does not publish the page or its events from a missing page', () => {
    expect(publicLoadOf({ ok: false, status: 404, body: { code: 'public_page_disabled' } })).toEqual({
      status: 'disabled',
    })
    expect(publicLoadOf({ ok: false, status: 404, body: { code: 'public_events_disabled' } })).toEqual({
      status: 'disabled',
    })
    expect(publicLoadOf({ ok: false, status: 404, body: { code: 'public_page_not_found' } })).toEqual({
      status: 'not_found',
    })
    expect(publicLoadOf({ ok: false, status: 404, body: { code: 42 } })).toEqual({ status: 'not_found' })
    expect(publicLoadOf({ ok: false, status: 404, body: 'gone' })).toEqual({ status: 'not_found' })
    expect(publicLoadOf({ ok: false, status: 404, body: null })).toEqual({ status: 'not_found' })
  })
})

describe('previewText', () => {
  it('answers null for an empty or missing text', () => {
    expect(previewText(null)).toBeNull()
    expect(previewText(undefined)).toBeNull()
    expect(previewText('  \n ')).toBeNull()
  })

  it('folds the text into one line and keeps a short one whole', () => {
    expect(previewText('Football\n\nfor  kids ')).toBe('Football for kids')
  })

  it('cuts a long text at the last word boundary with an ellipsis', () => {
    expect(previewText('one two three four', 12)).toBe('one two…')
    const long = `${'word '.repeat(60)}end`
    const preview = previewText(long) ?? ''
    expect(preview.length).toBeLessThanOrEqual(PREVIEW_TEXT_MAX)
    expect(preview.endsWith('word…')).toBe(true)
  })

  it('cuts a text without spaces at the limit', () => {
    expect(previewText('abcdefghij', 5)).toBe('abcd…')
  })
})
