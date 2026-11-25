// `MedicalStatusTag` and its model (training outlines and medical expiry spec M-O1…M-O3, DD-O02; #682): red → error,
// orange → warning, green → success, the translated word with the formatted day, the filter "not valid" (red only), the
// batched request URLs and the tolerant parse of the answer.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MedicalStatusTag } from '../member/medical-status-tag.tsx'
import {
  MEDICAL_STATUS_BATCH,
  MEDICAL_STATUS_TONE,
  isMedicalNotValid,
  medicalStatusText,
  medicalStatusUrls,
  medicalStatusesById,
  notValidPersonIds,
} from '../member/medical-status-model.ts'

const h = React.createElement
const labels = {
  missing: 'Medical: missing',
  unknown: 'Medical: unknown',
  expired: (date) => `Medical expired ${date}`,
  expiring: (date) => `Medical until ${date} (soon)`,
  valid: (date) => `Medical until ${date}`,
}
const day = (value) => value.split('-').reverse().join('.')

test('each colour maps to its status tone, never brand', () => {
  assert.deepEqual(MEDICAL_STATUS_TONE, { red: 'error', orange: 'warning', green: 'success' })
})

test('only red counts as not valid', () => {
  assert.equal(isMedicalNotValid('red'), true)
  assert.equal(isMedicalNotValid('orange'), false)
  assert.equal(isMedicalNotValid('green'), false)
})

test('the word follows the state and carries the formatted day', () => {
  assert.equal(medicalStatusText({ state: 'missing', validUntil: null }, labels), 'Medical: missing')
  assert.equal(medicalStatusText({ state: 'unknown', validUntil: null }, labels), 'Medical: unknown')
  assert.equal(
    medicalStatusText({ state: 'expired', validUntil: '2026-11-01' }, labels, day),
    'Medical expired 01.11.2026',
  )
  assert.equal(
    medicalStatusText({ state: 'expiring', validUntil: '2026-12-01' }, labels, day),
    'Medical until 01.12.2026 (soon)',
  )
  assert.equal(medicalStatusText({ state: 'valid', validUntil: '2027-06-30' }, labels), 'Medical until 2027-06-30')
  // A dated state without a date cannot be shown as a date.
  assert.equal(medicalStatusText({ state: 'valid', validUntil: null }, labels), 'Medical: unknown')
})

test('the URLs carry unique sorted ids in batches the route accepts', () => {
  assert.deepEqual(medicalStatusUrls([]), [])
  assert.deepEqual(medicalStatusUrls(['b', 'a', 'b', '']), ['/api/people/medical-status?personIds=a%2Cb'])
  const many = Array.from({ length: MEDICAL_STATUS_BATCH + 1 }, (_, index) => `id-${String(index).padStart(3, '0')}`)
  const urls = medicalStatusUrls(many)
  assert.equal(urls.length, 2)
  assert.equal(decodeURIComponent(urls[0].split('=')[1]).split(',').length, MEDICAL_STATUS_BATCH)
  assert.equal(decodeURIComponent(urls[1].split('=')[1]), 'id-200')
})

test('the parse keeps well-formed items and skips the rest', () => {
  const byId = medicalStatusesById([
    {
      items: [
        { personId: 'p1', status: 'red', state: 'missing', validUntil: null },
        { personId: 'p2', status: 'green', state: 'valid', validUntil: '2027-01-01' },
        { personId: 'p3', status: 'purple', state: 'valid', validUntil: null },
        { personId: 'p4', status: 'red', state: 'gone', validUntil: null },
        { personId: 5, status: 'red', state: 'missing' },
        null,
        'x',
      ],
    },
    { items: [{ personId: 'p5', status: 'orange', state: 'expiring', validUntil: 7 }] },
    { items: 'nope' },
    null,
    undefined,
  ])
  assert.deepEqual([...byId.keys()], ['p1', 'p2', 'p5'])
  assert.deepEqual(byId.get('p2'), { personId: 'p2', status: 'green', state: 'valid', validUntil: '2027-01-01' })
  assert.equal(byId.get('p5').validUntil, null)
})

test('the not-valid people keep the given order and skip unknown ids', () => {
  const byId = medicalStatusesById([
    {
      items: [
        { personId: 'a', status: 'red', state: 'expired', validUntil: '2026-01-01' },
        { personId: 'b', status: 'orange', state: 'expiring', validUntil: '2026-12-01' },
        { personId: 'c', status: 'red', state: 'missing', validUntil: null },
      ],
    },
  ])
  assert.deepEqual(notValidPersonIds(['c', 'x', 'b', 'a'], byId), ['c', 'a'])
})

test('the tag renders the tone, the word and the data attributes', () => {
  const html = renderToStaticMarkup(
    h(MedicalStatusTag, {
      item: { status: 'orange', state: 'expiring', validUntil: '2026-12-01' },
      labels,
      formatDate: day,
      className: 'ml-1',
      personId: 'p1',
      'data-testid': 'chip',
    }),
  )
  assert.match(html, /^<span class="inline-flex max-w-full ml-1" data-testid="chip" data-medical-status="orange"/)
  assert.match(html, /data-medical-state="expiring"/)
  assert.match(html, /data-person-id="p1"/)
  assert.match(html, /data-status-tag="warning"/)
  assert.match(html, />Medical until 01\.12\.2026 \(soon\)<\/div><\/span>$/)
})

test('the tag without the optional props shows the raw day', () => {
  const html = renderToStaticMarkup(
    h(MedicalStatusTag, { item: { status: 'red', state: 'expired', validUntil: '2026-11-01' }, labels }),
  )
  assert.match(html, /^<span class="inline-flex max-w-full" data-medical-status="red"/)
  assert.match(html, /data-status-tag="error"/)
  assert.match(html, />Medical expired 2026-11-01</)
})
