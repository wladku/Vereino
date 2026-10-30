// TEST-G04 (unit part, foundation II): half-open overlaps per resource against the resource's capacity.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findOverlaps, intervalsOverlap } from '../interval.ts'

const at = (time) => new Date(`2026-11-10T${time}:00Z`)
const interval = (id, resourceId, start, end) => ({ id, resourceId, start: at(start), end: at(end) })

test('intervals overlap half-open: touching ends do not overlap', () => {
  assert.equal(intervalsOverlap(interval('a', 'p', '16:00', '17:30'), interval('b', 'p', '17:00', '18:00')), true)
  assert.equal(intervalsOverlap(interval('a', 'p', '16:00', '17:30'), interval('b', 'p', '17:30', '18:00')), false)
  assert.equal(intervalsOverlap(interval('a', 'p', '18:00', '19:00'), interval('b', 'p', '16:00', '17:00')), false)
})

test('a candidate conflicts when the overlapping intervals reach the capacity of its resource', () => {
  const capacity = { pitch: 1, hall: 2, coach: 1 }
  const candidates = [
    interval('c1', 'pitch', '16:00', '17:30'),
    interval('c2', 'hall', '16:00', '17:30'),
    interval('c3', 'hall', '18:00', '19:30'),
    interval('c4', 'coach', '20:00', '21:00'),
    interval('c5', 'pitch', '22:00', '23:00'),
  ]
  const existing = [
    interval('e1', 'pitch', '17:00', '18:00'),
    interval('e2', 'hall', '16:30', '17:00'),
    interval('e3', 'hall', '18:00', '18:30'),
    interval('e4', 'hall', '18:30', '19:00'),
    interval('e5', 'hall', '18:15', '18:45'),
    interval('e6', 'coach', '20:30', '21:30'),
    interval('c5', 'pitch', '22:00', '23:00'),
  ]
  const conflicts = findOverlaps(candidates, existing, (resourceId) => capacity[resourceId] ?? 0)
  assert.deepEqual(conflicts, [
    // One group fits on the pitch, so any overlap conflicts.
    { candidateId: 'c1', resourceId: 'pitch', conflictingIds: ['e1'] },
    // The hall takes two groups: e3 and e4 follow each other, but e5 overlaps both, so three are in use at 18:15.
    { candidateId: 'c3', resourceId: 'hall', conflictingIds: ['e3', 'e4', 'e5'] },
    { candidateId: 'c4', resourceId: 'coach', conflictingIds: ['e6'] },
  ])
})

test('a capacity below one counts as one and touching neighbours never add up', () => {
  const candidates = [interval('c', 'room', '10:00', '12:00')]
  const touching = [interval('a', 'room', '10:00', '11:00'), interval('b', 'room', '11:00', '12:00')]
  assert.deepEqual(
    findOverlaps(candidates, touching, () => 2),
    [],
  )
  assert.deepEqual(
    findOverlaps(candidates, touching, () => 0),
    [{ candidateId: 'c', resourceId: 'room', conflictingIds: ['a', 'b'] }],
  )
})
