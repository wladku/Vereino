// TEST-G06 (unit part, foundation II P-23, DD-G09): the adapter to the installed schedule family's item.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toScheduleItem } from '../member/to-schedule-item.ts'

const startsAt = new Date('2026-11-03T16:00:00Z')
const endsAt = new Date('2026-11-03T17:30:00Z')
const base = { id: 'occ-1', title: 'Żaki training', startsAt, endsAt, status: 'planned' }

test('planned and done both become confirmed, cancelled stays cancelled, kind is always event', () => {
  assert.equal(toScheduleItem(base).status, 'confirmed')
  assert.equal(toScheduleItem({ ...base, status: 'done' }).status, 'confirmed')
  assert.equal(toScheduleItem({ ...base, status: 'cancelled' }).status, 'cancelled')
  assert.equal(toScheduleItem(base).kind, 'event')
  assert.equal('color' in toScheduleItem(base), false)
})

test('id, title and instants are carried over and the link and metadata come from the item', () => {
  const item = toScheduleItem({
    ...base,
    href: '/backend/activities/occurrences/occ-1',
    group: 'Żaki',
    place: 'Boisko',
    placeAddress: 'ul. Sportowa 1',
    subtitle: 'Jaś',
  })
  assert.deepEqual(item, {
    id: 'occ-1',
    kind: 'event',
    title: 'Żaki training',
    startsAt,
    endsAt,
    status: 'confirmed',
    linkHref: '/backend/activities/occurrences/occ-1',
    metadata: { group: 'Żaki', place: 'Boisko', status: 'planned' },
  })
})

test('a missing or null link, group and place become undefined and null (never the string "null")', () => {
  assert.equal(toScheduleItem(base).linkHref, undefined)
  assert.deepEqual(toScheduleItem(base).metadata, { group: null, place: null, status: 'planned' })
  const nulls = toScheduleItem({ ...base, href: null, group: null, place: null, status: 'cancelled' })
  assert.equal(nulls.linkHref, undefined)
  assert.deepEqual(nulls.metadata, { group: null, place: null, status: 'cancelled' })
})
