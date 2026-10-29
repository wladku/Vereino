// TEST-G03 (unit part, foundation II): a transition table is checked once and answers the moves it allows.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defineTransitions } from '../transitions.ts'

const sessions = defineTransitions({
  states: ['planned', 'done', 'cancelled'],
  entry: ['planned'],
  transitions: [
    ['planned', 'done'],
    ['planned', 'cancelled'],
    ['cancelled', 'planned'],
    ['done', 'planned'],
  ],
  terminal: [],
})

test('answers the declared moves only', () => {
  assert.equal(sessions.canTransition('planned', 'cancelled'), true)
  assert.equal(sessions.canTransition('cancelled', 'planned'), true)
  assert.equal(sessions.canTransition('done', 'cancelled'), false)
  assert.equal(sessions.canTransition('cancelled', 'cancelled'), false)
  assert.equal(sessions.canTransition('unknown', 'planned'), false)
  assert.equal(sessions.isEntry('planned'), true)
  assert.equal(sessions.isEntry('done'), false)
  assert.equal(sessions.isTerminal('done'), false)
  assert.deepEqual(sessions.table.entry, ['planned'])
})

test('knows terminal states', () => {
  const declarations = defineTransitions({
    states: ['pending_guardian', 'final', 'rejected_by_guardian'],
    entry: ['final', 'pending_guardian'],
    transitions: [
      ['pending_guardian', 'final'],
      ['pending_guardian', 'rejected_by_guardian'],
    ],
    terminal: ['final', 'rejected_by_guardian'],
  })
  assert.equal(declarations.isTerminal('final'), true)
  assert.equal(declarations.isTerminal('pending_guardian'), false)
})

test('refuses a malformed table', () => {
  assert.throws(() => defineTransitions({ states: ['a'], entry: ['a'], transitions: [['a', 'b']], terminal: [] }), {
    name: 'RangeError',
    message: '[internal] transition table names an unknown state: b',
  })
  assert.throws(() => defineTransitions({ states: ['a'], entry: [], transitions: [], terminal: [] }), {
    message: '[internal] transition table needs an entry state',
  })
  assert.throws(
    () => defineTransitions({ states: ['a', 'b'], entry: ['a'], transitions: [['b', 'a']], terminal: ['b'] }),
    { message: '[internal] terminal state b has an outgoing transition' },
  )
})
