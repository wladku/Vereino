import { describe, expect, it } from '@jest/globals'
import {
  APPLICATION_STATES,
  CLOSED_STATES,
  DECIDABLE_STATES,
  OPEN_STATES,
  applicationTransitions,
  isClosedState,
  isDecidableState,
  isOpenState,
} from '../states'

describe('application states (sign-up form spec *Domain Vocabulary* → State)', () => {
  it('partitions the states into open and closed', () => {
    expect([...OPEN_STATES, ...CLOSED_STATES].sort()).toEqual([...APPLICATION_STATES].sort())
    expect(DECIDABLE_STATES.every((state) => isOpenState(state))).toBe(true)
  })

  it('allows the moves of the spec and nothing out of a closed state', () => {
    expect(applicationTransitions.canTransition('unconfirmed', 'new')).toBe(true)
    expect(applicationTransitions.canTransition('unconfirmed', 'waiting')).toBe(true)
    expect(applicationTransitions.canTransition('unconfirmed', 'rejected')).toBe(false)
    expect(applicationTransitions.canTransition('waiting', 'waiting')).toBe(true)
    expect(applicationTransitions.canTransition('new', 'new')).toBe(false)
    expect(applicationTransitions.canTransition('trial', 'new')).toBe(true)
    for (const state of CLOSED_STATES) expect(applicationTransitions.isTerminal(state)).toBe(true)
  })

  it('classifies a state', () => {
    expect(isOpenState('unconfirmed')).toBe(true)
    expect(isOpenState('accepted')).toBe(false)
    expect(isDecidableState('unconfirmed')).toBe(false)
    expect(isDecidableState('waiting')).toBe(true)
    expect(isClosedState('withdrawn')).toBe(true)
    expect(isClosedState('new')).toBe(false)
  })
})
